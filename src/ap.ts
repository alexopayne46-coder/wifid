#!/usr/bin/env bun
// ============================================================
//  AP + Captive Portal launcher (hostapd + dnsmasq + iptables)
//  Runs under Bun (or plain Node — no Bun-only APIs are used).
// ============================================================

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { CONFIG, AP_MODE, hl, svc } from "./config.ts";
import { run, runQuiet, streamToLog, sleep } from "./utils.ts";
import { getApInterface, detectWanIfaces } from "./wifi.ts";
import { prepareRuntimeConf, appendDnsOverwrites, detectBand, applyCaptivePortalDnsOverwrites } from "./config-gen.ts";
import { startRequestLogger, startPortalServer } from "./server.ts";

// ------------------------------------------------------------
//  Root check
// ------------------------------------------------------------
if (typeof process.getuid === "function" && process.getuid() !== 0) {
  svc("main").error("please run this script with sudo!");
  process.exit(1);
}

const AP_IFACE = getApInterface();

if (CONFIG.portal) {
  CONFIG.trialSeconds = 0;
  svc("main").warn(
    "portal-only mode: internet is disabled until you explicitly enable captive portal",
  );
}

svc("main").info(`AP mode: ${hl(AP_MODE)}`);
const WAN_IFACES = detectWanIfaces(AP_IFACE);
if (WAN_IFACES.length === 0) {
  svc("wan").warn("no external internet interface detected!");
} else {
  svc("wan").info(`external interface(s): ${hl(WAN_IFACES.join(", "))}`);
}

// ------------------------------------------------------------
//  Build runtime configs
// ------------------------------------------------------------
const RUNTIME_DIR = mkdtempSync(path.join(tmpdir(), "ap-portal-"));
svc("main").info(`runtime config dir: ${hl(RUNTIME_DIR)}`);

const HOSTAPD_CONF = path.join(RUNTIME_DIR, "hostapd.conf");
const DNSMASQ_CONF = path.join(RUNTIME_DIR, "dnsmasq.conf");
prepareRuntimeConf(CONFIG.hostapdConfSrc, HOSTAPD_CONF, "hostapd", AP_IFACE);
prepareRuntimeConf(CONFIG.dnsmasqConfSrc, DNSMASQ_CONF, "dnsmasq", AP_IFACE);
let dnsRecords = [];
if (CONFIG.dnsOverwrite) {
  svc("main").info(`loading DNS overwrites from ${hl(CONFIG.dnsOverwrite)}`);
  dnsRecords = appendDnsOverwrites(DNSMASQ_CONF, CONFIG.dnsOverwrite);
  svc("main").info(
    `DNS overwrites loaded: ${hl(String(dnsRecords.length))} record(s)`,
  );
}
if (CONFIG.portal) {
  applyCaptivePortalDnsOverwrites(DNSMASQ_CONF);
}

// ------------------------------------------------------------
//  Process handles + cleanup
// ------------------------------------------------------------
let hostapdProc = null;
let dnsmasqProc = null;
let cliProc = null;
let serverProc = null;
let portalServer = null;
let cleaningUp = false;
let hostapdRestarting = false;
let mdnsProcs = [];

// hostapd health watchdog counters
let sawInterfaceDisabled = false;
let probeSendFailStreak = 0;
const PROBE_FAIL_RESTART_THRESHOLD = 25;

async function cleanup(exitCode = 0) {
  if (cleaningUp) return;
  cleaningUp = true;
  console.log();
  svc("main").info("shutting down and cleaning up...");

  for (const proc of [cliProc, dnsmasqProc, hostapdProc]) {
    if (proc && proc.exitCode === null) {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
  }
  if (serverProc) {
    try {
      serverProc.close();
    } catch {}
  }
  if (portalServer) {
    try {
      portalServer.close();
    } catch {}
  }

  for (const proc of mdnsProcs) {
    if (proc && proc.exitCode === null) {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
  }

  runQuiet("pkill", ["-f", `dnsmasq -C ${DNSMASQ_CONF}`]);
  runQuiet("pkill", ["-f", `hostapd ${HOSTAPD_CONF}`]);

  svc("iptables").debug(
    "flushing NAT PREROUTING/POSTROUTING and mangle chains",
  );
  runQuiet("iptables", ["-t", "nat", "-F", "PREROUTING"]);
  runQuiet("iptables", ["-t", "nat", "-F", "POSTROUTING"]);
  runQuiet("iptables", ["-t", "mangle", "-F", "FORWARD"]);
  runQuiet("iptables", [
    "-t",
    "mangle",
    "-D",
    "FORWARD",
    "-p",
    "tcp",
    "--tcp-flags",
    "SYN,RST",
    "SYN",
    "-j",
    "TCPMSS",
    "--clamp-mss-to-pmtu",
  ]);
  runQuiet("iptables", ["-D", "FORWARD", "-p", "icmp", "-j", "ACCEPT"]);

  svc("iptables").debug(
    `removing MASQUERADE/FORWARD rules for WAN: ${hl(WAN_IFACES.join(", ") || "none")}`,
  );
  for (const wan of WAN_IFACES) {
    runQuiet("iptables", [
      "-t",
      "nat",
      "-D",
      "POSTROUTING",
      "-o",
      wan,
      "-j",
      "MASQUERADE",
    ]);
    runQuiet("iptables", [
      "-D",
      "FORWARD",
      "-i",
      AP_IFACE,
      "-o",
      wan,
      "-j",
      "ACCEPT",
    ]);
    runQuiet("iptables", [
      "-D",
      "FORWARD",
      "-i",
      wan,
      "-o",
      AP_IFACE,
      "-j",
      "ACCEPT",
    ]);
  }
  runQuiet("iptables", ["-D", "FORWARD", "-i", AP_IFACE, "-j", "ACCEPT"]);
  runQuiet("iptables", [
    "-D",
    "FORWARD",
    "-m",
    "conntrack",
    "--ctstate",
    "RELATED,ESTABLISHED",
    "-j",
    "ACCEPT",
  ]);

  svc("iptables").debug("removing INPUT rules");
  const inputPorts = [
    ["udp", "67"],
    ["udp", "53"],
    ["tcp", "53"],
    ["udp", "5353"],
    ["tcp", "5353"],
    ["tcp", CONFIG.portalPort],
  ];
  const gatewayIp = CONFIG.apIp.split("/")[0];
  if (CONFIG.serverBind && CONFIG.serverBind !== gatewayIp) {
    inputPorts.push(["tcp", "80"], ["tcp", "443"]);
  }
  for (const [proto, port] of inputPorts) {
    runQuiet("iptables", [
      "-D",
      "INPUT",
      "-i",
      AP_IFACE,
      "-p",
      proto,
      "--dport",
      port,
      "-j",
      "ACCEPT",
    ]);
  }

  runQuiet("ipset", ["destroy", CONFIG.ipsetName]);
  svc("wifi").debug(`resetting interface ${hl(AP_IFACE)}`);
  runQuiet("ip", ["addr", "flush", "dev", AP_IFACE]);
  runQuiet("ip", ["link", "set", AP_IFACE, "down"]);

  svc("main").debug(`removing runtime config dir ${hl(RUNTIME_DIR)}`);
  try {
    rmSync(RUNTIME_DIR, { recursive: true, force: true });
  } catch {}

  svc("main").info("all processes and rules have been stopped.");
  process.exit(exitCode);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
process.on("uncaughtException", (err) => {
  svc("main").error(`uncaught error: ${err.message}`);
  cleanup(1);
});

// ------------------------------------------------------------
//  Interface + hostapd lifecycle
// ------------------------------------------------------------

/** Bring the AP radio up and make sure it can't autosuspend. */
function prepareInterface() {
  runQuiet("rfkill", ["unblock", "wlan"]);

  try {
    const deviceLink = readlinkSync(`/sys/class/net/${AP_IFACE}/device`);
    const resolvedDevice = path.resolve(
      `/sys/class/net/${AP_IFACE}`,
      deviceLink,
    );
    // Walk up the sysfs device tree and disable autosuspend on every
    // real USB device we find, starting from the adapter itself and
    // including its parent hub (so the hub can't cut power to it).
    let cur = resolvedDevice;
    let touched = 0;
    const seen = new Set<string>();
    while (cur.startsWith("/sys/devices") && cur !== "/sys/devices") {
      if (seen.has(cur)) break;
      seen.add(cur);
      const powerDir = `${cur}/power`;
      const hasControl = existsSync(`${powerDir}/control`);
      const hasDelay = existsSync(`${powerDir}/autosuspend_delay_ms`);
      if (hasControl && hasDelay) {
        runQuiet("sh", ["-c", `echo on > ${powerDir}/control`]);
        runQuiet("sh", ["-c", `echo -1 > ${powerDir}/autosuspend_delay_ms`]);
        if (existsSync(`${powerDir}/autosuspend`)) {
          runQuiet("sh", ["-c", `echo -1 > ${powerDir}/autosuspend`]);
        }
        svc("wifi").debug(`disabled autosuspend for device ${hl(cur)}`);
        touched++;
        // device + immediate parent hub is enough; don't touch the
        // PCI host controller further up.
        if (touched >= 2) break;
      }
      cur = path.dirname(cur);
    }
    if (touched > 0) {
      svc("wifi").debug(`disabled USB autosuspend for ${hl(AP_IFACE)}`);
    } else {
      svc("wifi").debug(
        "no USB power/control found (non-USB interface?)",
      );
    }
  } catch {
    svc("wifi").debug(
      "could not disable USB autosuspend (non-USB interface?)",
    );
  }

  runQuiet("ip", ["link", "set", AP_IFACE, "down"]);
  runQuiet("ip", ["addr", "flush", "dev", AP_IFACE]);
  runQuiet("iw", ["dev", AP_IFACE, "set", "power_save", "off"]);
  runQuiet("ip", ["link", "set", AP_IFACE, "up"]);
  svc("wifi").info(`interface ${hl(AP_IFACE)} is up`);
}

/** Parse hostapd stderr and restart the AP stack when it gets stuck. */
function watchHostapdLine(line) {
  if (/INTERFACE-DISABLED/.test(line)) {
    sawInterfaceDisabled = true;
    probeSendFailStreak = 0;
    return;
  }
  if (/INTERFACE-ENABLED/.test(line)) {
    // A disable->enable bounce means the radio dropped and came back;
    // if it was disabled due to the broken state, force a restart.
    if (sawInterfaceDisabled) {
      sawInterfaceDisabled = false;
      restartHostapd();
    }
    return;
  }
  if (/handle_probe_req: send failed/.test(line)) {
    probeSendFailStreak++;
    if (probeSendFailStreak >= PROBE_FAIL_RESTART_THRESHOLD) {
      probeSendFailStreak = 0;
      restartHostapd();
    }
    return;
  }
  probeSendFailStreak = 0;
}

/** (Re)apply the AP IP addressing to the interface. */
function applyApAddressing() {
  runQuiet("ip", ["addr", "flush", "dev", AP_IFACE]);
  runQuiet("ip", ["addr", "add", CONFIG.apIp, "dev", AP_IFACE]);
  const gatewayIp = CONFIG.apIp.split("/")[0];
  if (CONFIG.serverBind && CONFIG.serverBind !== gatewayIp) {
    runQuiet("ip", ["addr", "add", `${CONFIG.serverBind}/24`, "dev", AP_IFACE]);
  }
  runQuiet("ip", ["link", "set", AP_IFACE, "up"]);
}

/** Spawn hostapd and attach logging + the health watchdog. */
function startHostapd() {
  hostapdProc = spawn("hostapd", [HOSTAPD_CONF], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  streamToLog(hostapdProc.stdout, "hostapd", "debug", svc);
  streamToLog(hostapdProc.stderr, "hostapd", "warn", svc, watchHostapdLine);
  hostapdProc.on("exit", (code) => {
    if (!cleaningUp && !hostapdRestarting) {
      svc("hostapd").error(`exited unexpectedly (code ${code})`);
      cleanup(1);
    }
  });
}

/** Restart only the radio + hostapd (keeps dnsmasq/iptables intact). */
async function restartHostapd() {
  if (hostapdRestarting || cleaningUp) return;
  hostapdRestarting = true;
  sawInterfaceDisabled = false;
  probeSendFailStreak = 0;
  svc("hostapd").warn(
    "interface stuck / probe send-failed loop detected — restarting radio + hostapd",
  );
  try {
    if (hostapdProc) {
      try { hostapdProc.kill("SIGKILL"); } catch {}
    }
    if (cliProc) {
      try { cliProc.kill("SIGKILL"); } catch {}
    }
    await sleep(500);
    prepareInterface();
    applyApAddressing();
    await sleep(500);
    startHostapd();
    await sleep(500);
    if (hostapdProc.exitCode === null) {
      svc("hostapd").info(`restarted, pid ${hl(hostapdProc.pid)}`);
    } else {
      svc("hostapd").error("restart failed — hostapd exited on startup");
    }
  } finally {
    hostapdRestarting = false;
  }
}

// ------------------------------------------------------------
//  Main sequence
// ------------------------------------------------------------
async function main() {
  svc("main").info("starting AP stack with captive portal");

  // 1. Force-clean old processes and NAT/filter/mangle table rules
  svc("main").info("[0/6] cleaning up old processes and NAT rules...");
  runQuiet("pkill", ["-9", "hostapd"]);
  runQuiet("pkill", ["-9", "dnsmasq"]);
  runQuiet("pkill", ["-9", "hostapd_cli"]);
  runQuiet("fuser", ["-k", "-9", "53/tcp"]);
  runQuiet("fuser", ["-k", "-9", "53/udp"]);
  runQuiet("ipset", ["destroy", CONFIG.ipsetName]);
  runQuiet("iptables", ["-t", "nat", "-F", "PREROUTING"]);
  runQuiet("iptables", ["-t", "nat", "-F", "POSTROUTING"]);
  runQuiet("iptables", ["-t", "mangle", "-F", "FORWARD"]);

  for (let i = 0; i < 10; i++) {
    const res = runQuiet("iptables", [
      "-D",
      "FORWARD",
      "-i",
      AP_IFACE,
      "-j",
      "ACCEPT",
    ]);
    if (res.status !== 0) break;
  }
  for (let i = 0; i < 10; i++) {
    const res = runQuiet("iptables", [
      "-D",
      "INPUT",
      "-i",
      AP_IFACE,
      "-j",
      "ACCEPT",
    ]);
    if (res.status !== 0) break;
  }
  for (const wan of WAN_IFACES) {
    for (let i = 0; i < 10; i++) {
      const res = runQuiet("iptables", [
        "-t",
        "nat",
        "-D",
        "POSTROUTING",
        "-o",
        wan,
        "-j",
        "MASQUERADE",
      ]);
      if (res.status !== 0) break;
    }
    for (let i = 0; i < 10; i++) {
      const res = runQuiet("iptables", [
        "-D",
        "FORWARD",
        "-i",
        AP_IFACE,
        "-o",
        wan,
        "-j",
        "ACCEPT",
      ]);
      if (res.status !== 0) break;
    }
    for (let i = 0; i < 10; i++) {
      const res = runQuiet("iptables", [
        "-D",
        "FORWARD",
        "-i",
        wan,
        "-o",
        AP_IFACE,
        "-j",
        "ACCEPT",
      ]);
      if (res.status !== 0) break;
    }
  }

  runQuiet("ip", ["addr", "flush", "dev", AP_IFACE]);
  runQuiet("ip", ["link", "set", AP_IFACE, "down"]);
   run("mkdir", ["-p", CONFIG.ctrlDir]);
   runQuiet("chmod", ["755", CONFIG.ctrlDir]);
  await sleep(1000);

  // 2. Initialize ipset
  svc("ipset").info("[1/6] preparing ipset and kernel modules...");
  runQuiet("modprobe", ["ip_set"]);
  runQuiet("modprobe", ["ip_set_hash_ip"]);
  runQuiet("ipset", ["destroy", CONFIG.ipsetName]);
  const ipsetRes = runQuiet("ipset", [
    "create",
    CONFIG.ipsetName,
    "hash:ip",
    "timeout",
    "86400",
  ]);
   if (ipsetRes.status !== 0) {
     svc("ipset").error(
       `failed to create ipset '${hl(CONFIG.ipsetName)}' — ${ipsetRes.stderr?.trim() || "unknown error"}`,
     );
     svc("ipset").error("fix: run 'sudo bash scripts/setup-machine.sh' to install dependencies and load kernel modules");
     process.exit(1);
   }
  svc("ipset").info(`set ${hl(CONFIG.ipsetName)} ready`);

  // 3. Prepare radio interface
  svc("wifi").info(`[2/6] preparing Wi-Fi interface ${hl(AP_IFACE)}...`);
  prepareInterface();

  // 4. Start hostapd
  svc("hostapd").info("[3/6] starting hostapd...");
  startHostapd();
  await sleep(3000);
  if (hostapdProc.exitCode !== null) {
    svc("hostapd").error("crashed on startup!");
    process.exit(1);
  }
  svc("hostapd").info(`running, pid ${hl(hostapdProc.pid)}`);

  // 5. Configure IP and interception rules
  svc("iptables").info(
    `[4/6] configuring IP ${hl(CONFIG.apIp)} and interception rules...`,
  );
  applyApAddressing();
  run("sysctl", ["-w", "net.ipv4.ip_forward=1"]);
  runQuiet("sysctl", ["-w", "net.ipv4.conf.all.forwarding=1"]);

  // Insert at the TOP (-I 1) to override any existing DROP/REJECT rules
  const gatewayIp = CONFIG.apIp.split("/")[0];
  const inputPorts = [
    ["udp", "67"],
    ["udp", "53"],
    ["tcp", "53"],
    ["udp", "5353"],
    ["tcp", "5353"],
    ["tcp", CONFIG.portalPort],
    ["tcp", CONFIG.serverPort],
  ];
  if (CONFIG.serverBind && CONFIG.serverBind !== gatewayIp) {
    inputPorts.push(["tcp", "80"], ["tcp", "443"]);
  }
  for (const [proto, port] of inputPorts) {
    run("iptables", [
      "-I",
      "INPUT",
      "1",
      "-i",
      AP_IFACE,
      "-p",
      proto,
      "--dport",
      port,
      "-j",
      "ACCEPT",
    ]);
  }

  // NAT PREROUTING: redirect only DNS (53) and HTTP (80)
  run("iptables", [
    "-t",
    "nat",
    "-I",
    "PREROUTING",
    "1",
    "-i",
    AP_IFACE,
    "-p",
    "udp",
    "--dport",
    "53",
    "-j",
    "REDIRECT",
    "--to-ports",
    "53",
  ]);
  run("iptables", [
    "-t",
    "nat",
    "-I",
    "PREROUTING",
    "1",
    "-i",
    AP_IFACE,
    "-p",
    "tcp",
    "--dport",
    "53",
    "-j",
    "REDIRECT",
    "--to-ports",
    "53",
  ]);
  run("iptables", [
    "-t",
    "nat",
    "-I",
    "PREROUTING",
    "1",
    "-i",
    AP_IFACE,
    "-p",
    "tcp",
    "--dport",
    "80",
    "-m",
    "set",
    "!",
    "--match-set",
    CONFIG.ipsetName,
    "src",
    "-j",
    "REDIRECT",
    "--to-ports",
    CONFIG.portalPort,
  ]);

  // FORWARD & MASQUERADE
  run("iptables", [
    "-I",
    "FORWARD",
    "1",
    "-m",
    "conntrack",
    "--ctstate",
    "RELATED,ESTABLISHED",
    "-j",
    "ACCEPT",
  ]);
  run("iptables", ["-I", "FORWARD", "1", "-i", AP_IFACE, "-j", "ACCEPT"]);
  run("iptables", ["-I", "FORWARD", "1", "-p", "icmp", "-j", "ACCEPT"]);
  runQuiet("iptables", [
    "-t",
    "mangle",
    "-I",
    "FORWARD",
    "1",
    "-p",
    "tcp",
    "--tcp-flags",
    "SYN,RST",
    "SYN",
    "-j",
    "TCPMSS",
    "--clamp-mss-to-pmtu",
  ]);
  runQuiet("sysctl", ["-w", "net.ipv4.conf.default.rp_filter=0"]);
  runQuiet("sysctl", ["-w", "net.ipv4.conf.all.rp_filter=0"]);
  runQuiet("sysctl", ["-w", `net.ipv4.conf.${AP_IFACE}.rp_filter=0`]);

  if (!CONFIG.portal) {
    for (const wan of WAN_IFACES) {
      run("iptables", [
        "-t",
        "nat",
        "-I",
        "POSTROUTING",
        "1",
        "-o",
        wan,
        "-j",
        "MASQUERADE",
      ]);
      run("iptables", [
        "-I",
        "FORWARD",
        "1",
        "-i",
        AP_IFACE,
        "-o",
        wan,
        "-j",
        "ACCEPT",
      ]);
      run("iptables", [
        "-I",
        "FORWARD",
        "1",
        "-i",
        wan,
        "-o",
        AP_IFACE,
        "-j",
        "ACCEPT",
      ]);
      runQuiet("sysctl", ["-w", `net.ipv4.conf.${wan}.forwarding=1`]);
      runQuiet("sysctl", ["-w", `net.ipv4.conf.${wan}.rp_filter=0`]);
      svc("iptables").debug(`MASQUERADE and FORWARD enabled for WAN: ${hl(wan)}`);
    }
  } else {
    svc("iptables").debug("portal-only mode: WAN forwarding disabled");
  }
  runQuiet("sysctl", ["-w", `net.ipv4.conf.${AP_IFACE}.forwarding=1`]);
  svc("iptables").info("firewall/NAT rules configured");

  // 6. Start DHCP / DNS
  svc("dnsmasq").info("[5/6] starting dnsmasq...");
  dnsmasqProc = spawn("dnsmasq", ["-C", DNSMASQ_CONF, "-d"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  streamToLog(dnsmasqProc.stdout, "dnsmasq", "debug", svc);
  streamToLog(dnsmasqProc.stderr, "dnsmasq", "debug", svc);
  dnsmasqProc.on("exit", (code) => {
    if (!cleaningUp) {
      svc("dnsmasq").error(`exited unexpectedly (code ${code})`);
      cleanup(1);
    }
  });
  await sleep(1000);
  svc("dnsmasq").info(`running, pid ${hl(dnsmasqProc.pid)}`);

  const ports = [Number(CONFIG.serverPort)];
  if (CONFIG.serverBind && CONFIG.serverBind !== gatewayIp) {
    ports.push(80, 443);
  }
  svc("server").info(
    `starting request logger on ${hl(CONFIG.serverBind + ":" + ports.join(","))}...`,
  );
  serverProc = startRequestLogger(CONFIG.serverBind, ports, svc("server"));

  if (CONFIG.portal) {
    portalServer = startPortalServer(
      CONFIG.serverBind,
      Number(CONFIG.portalPort),
      CONFIG.portalDistDir,
      svc("portal"),
    );
  }

  if (CONFIG.serverBind && CONFIG.serverBind !== gatewayIp) {
    for (const record of dnsRecords) {
      if (record.ip === CONFIG.serverBind) {
        const mdnsProc = spawn(
          "avahi-publish",
          ["-a", record.domain, record.ip, "-R"],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        streamToLog(mdnsProc.stdout, "mdns", "debug", svc);
        streamToLog(mdnsProc.stderr, "mdns", "warn", svc);
        mdnsProcs.push(mdnsProc);
        svc("mdns").info(
          `publishing mDNS record: ${record.domain} -> ${record.ip}`,
        );
      }
    }
  }

  // 7. Start notify hook
  svc("hostapd_cli").info("[7/7] starting hostapd_cli...");
  const notifyOk =
    run("test", ["-x", CONFIG.notifyScript], { ignoreError: true }).status ===
    0;
  if (notifyOk) {
    await sleep(1000);
    cliProc = spawn(
      "hostapd_cli",
      ["-i", AP_IFACE, "-p", CONFIG.ctrlDir, "-a", CONFIG.notifyScript],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    streamToLog(cliProc.stdout, "hostapd_cli", "debug", svc);
    streamToLog(cliProc.stderr, "hostapd_cli", "warn", svc);
    svc("hostapd_cli").info(`running, pid ${hl(cliProc.pid)}`);
  } else {
     svc("hostapd_cli").warn(
       `${hl(CONFIG.notifyScript)} not found or missing +x permission`,
     );
     svc("hostapd_cli").warn(
       `fix: sudo cp scripts/hostapd-notify.sh ${hl(CONFIG.notifyScript)} && sudo chmod +x ${hl(CONFIG.notifyScript)}`,
     );
  }

  console.log();
  svc("main").info("access point with captive portal is up and running");
  console.log();

  const ssid = CONFIG.ssid || (() => {
    try {
      const content = readFileSync(CONFIG.hostapdConfSrc, "utf8");
      const m = content.match(/^ssid=(.+)$/im);
      return m ? m[1].trim() : "unknown";
    } catch {
      return "unknown";
    }
  })();
  const band = detectBand(CONFIG.hostapdConfSrc);
  const maskedPassword = CONFIG.password ? "*".repeat(Math.min(CONFIG.password.length, 20)) : "(none)";

  console.log("(((•)))  SSID:        " + ssid);
  console.log("         Password:    " + maskedPassword);
  console.log("         Band:        " + band);
  console.log("         Gateway:     " + gatewayIp);
  if (CONFIG.portal) {
    console.log("         Portal:      CAPTIVE PORTAL ACTIVE");
    console.log("         Redirect:    ALL HTTP/HTTPS -> " + gatewayIp + ":" + CONFIG.portalPort);
  }
  console.log();

  svc("main").info(
    `start your web server (Bun/Node) on port ${hl(CONFIG.portalPort)}`,
  );
  svc("main").info("press Ctrl+C to stop all services");
  console.log();

  if (CONFIG.trialSeconds > 0) {
    startTrialWatcher(AP_IFACE);
  }
}

async function startTrialWatcher(apIface) {
  svc("trial").info(
    `trial mode active: ${hl(CONFIG.trialSeconds + "s")} free internet before captive portal enforcement`,
  );
  const trialGivenMacs = new Set();
  const gatewayIp = CONFIG.apIp.split("/")[0];

  while (!cleaningUp) {
    try {
      const res = runQuiet("ip", ["neigh", "show", "dev", apIface]);
      const lines = (res.stdout || "").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const ipMatch = trimmed.match(/^([0-9.]+)\s+/);
        const macMatch = trimmed.match(/lladdr\s+([0-9a-fA-F:]+)/);
        if (ipMatch && macMatch) {
          const ip = ipMatch[1];
          const mac = macMatch[1].toLowerCase();
          if (ip.startsWith("192.168.12.") && ip !== gatewayIp) {
            if (!trialGivenMacs.has(mac)) {
              trialGivenMacs.add(mac);
              runQuiet("ipset", [
                "add",
                CONFIG.ipsetName,
                ip,
                "timeout",
                String(CONFIG.trialSeconds),
              ]);
              svc("trial").info(
                `granted ${hl(CONFIG.trialSeconds + "s")} trial access to MAC ${hl(mac)} (IP ${hl(ip)})`,
              );
            }
          }
        }
      }
    } catch {}
    await sleep(3000);
  }
}

main().catch((err) => {
  svc("main").error(err.message || String(err));
  cleanup(1);
});
