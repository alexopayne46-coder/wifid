#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { CONFIG, AP_MODE, hl, svc } from "./config.ts";
import { run, runQuiet, sleep, streamToLog } from "./utils.ts";
import { getApInterface, detectWanIfaces, getMeshInterfaces } from "./wifi.ts";
import {
  prepareRuntimeConf,
  appendDnsOverwrites,
  detectBand,
  applyCaptivePortalDnsOverwrites,
} from "./config-gen.ts";
import { startRequestLogger, startPortalServer } from "./server.ts";
import { createCleanupState, cleanup as cleanupFn } from "./cleanup.ts";
import {
  createHostapdState,
  createMultiHostapdState,
  prepareInterface,
  applyApAddressing,
  startHostapd,
  restartHostapd,
} from "./hostapd.ts";
import {
  setupInputRules,
  setupNatRules,
  setupForwardRules,
  setupWanRules,
  setupSysctl,
  cleanupOldRules,
} from "./iptables.ts";
import { startTrialWatcher as startTrialWatcherModule } from "./trial.ts";
import { startWebController, stopWebController } from "./web/web-server.ts";

if (typeof process.getuid === "function" && process.getuid() !== 0) {
  svc("main").error("please run this script with sudo!");
  process.exit(1);
}

// Determine if we're in mesh mode
const MESH_IFACES = getMeshInterfaces();
const IS_MESH_MODE = MESH_IFACES.length > 0;

let AP_IFACES: string[];
if (IS_MESH_MODE) {
  AP_IFACES = MESH_IFACES;
  svc("main").info(
    `mesh mode enabled with interfaces: ${hl(AP_IFACES.join(", "))}`,
  );
} else {
  AP_IFACES = [getApInterface()];
}

if (CONFIG.portal) {
  CONFIG.trialSeconds = 0;
  svc("main").warn(
    "portal-only mode: internet is disabled until you explicitly enable captive portal",
  );
}

svc("main").info(`AP mode: ${hl(AP_MODE)}`);
const WAN_IFACES = detectWanIfaces(AP_IFACES[0]);
if (WAN_IFACES.length === 0) {
  svc("wan").warn("no external internet interface detected!");
} else {
  svc("wan").info(`external interface(s): ${hl(WAN_IFACES.join(", "))}`);
}

const RUNTIME_DIR = mkdtempSync(path.join(tmpdir(), "ap-portal-"));
svc("main").info(`runtime config dir: ${hl(RUNTIME_DIR)}`);

// Prepare configs for each interface in mesh mode
const HOSTAPD_CONFS: Record<string, string> = {};
const DNSMASQ_CONF = path.join(RUNTIME_DIR, "dnsmasq.conf");

for (let i = 0; i < AP_IFACES.length; i++) {
  const iface = AP_IFACES[i];
  const hostapdConf = path.join(RUNTIME_DIR, `hostapd-${iface}.conf`);
  HOSTAPD_CONFS[iface] = hostapdConf;

  // Use different channels for mesh mode (1, 6, 11 for 2.4GHz)
  const channel = IS_MESH_MODE ? [1, 6, 11][i % 3] : undefined;
  prepareRuntimeConf(
    CONFIG.hostapdConfSrc,
    hostapdConf,
    "hostapd",
    iface,
    channel,
  );
}

prepareRuntimeConf(
  CONFIG.dnsmasqConfSrc,
  DNSMASQ_CONF,
  "dnsmasq",
  AP_IFACES[0],
);
let dnsRecords: any[] = [];
if (CONFIG.dnsOverwrite) {
  svc("main").info(
    `loading DNS overwrites from ${hl(String(CONFIG.dnsOverwrite))}`,
  );
  dnsRecords = appendDnsOverwrites(DNSMASQ_CONF, String(CONFIG.dnsOverwrite));
  svc("main").info(
    `DNS overwrites loaded: ${hl(String(dnsRecords.length))} record(s)`,
  );
}
if (CONFIG.portal) {
  applyCaptivePortalDnsOverwrites(DNSMASQ_CONF);
}

const cleanupState = createCleanupState();
const multiHostapdState = IS_MESH_MODE ? createMultiHostapdState() : null;
const hostapdState = IS_MESH_MODE
  ? null
  : createHostapdState(AP_IFACES[0], HOSTAPD_CONFS[AP_IFACES[0]]);
let serverProc: { close: () => void } | null = null;
let portalServer: { close: () => void } | null = null;
let mdnsProcs: any[] = [];
let dnsmasqProc: any = null;
let webServer: any = null;

async function cleanup(exitCode = 0) {
  cleanupState.serverProc = serverProc;
  cleanupState.portalServer = portalServer;
  cleanupState.mdnsProcs = mdnsProcs;
  cleanupState.dnsmasqProc = dnsmasqProc;
  cleanupState.webServer = webServer;

  // Handle single interface mode
  if (!IS_MESH_MODE && hostapdState) {
    cleanupState.hostapdProc = hostapdState.hostapdProc;
    cleanupState.cliProc = hostapdState.cliProc;
  }

  // Handle mesh mode - collect all hostapd processes
  if (IS_MESH_MODE && multiHostapdState) {
    const allHostapdProcs: any[] = [];
    const allCliProcs: any[] = [];
    for (const state of multiHostapdState.states.values()) {
      if (state.hostapdProc) allHostapdProcs.push(state.hostapdProc);
      if (state.cliProc) allCliProcs.push(state.cliProc);
    }
    cleanupState.hostapdProcs = allHostapdProcs;
    cleanupState.cliProcs = allCliProcs;
  }

  await cleanupFn(
    cleanupState,
    RUNTIME_DIR,
    HOSTAPD_CONFS,
    DNSMASQ_CONF,
    AP_IFACES,
    WAN_IFACES,
    exitCode,
  );
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
process.on("uncaughtException", (err) => {
  svc("main").error(`uncaught error: ${err.message}`);
  cleanup(1);
});

function triggerRestart() {
  if (IS_MESH_MODE) {
    // In mesh mode, restart all hostapd instances
    if (multiHostapdState) {
      for (const [iface, state] of multiHostapdState.states.entries()) {
        restartHostapd(
          state,
          HOSTAPD_CONFS[iface],
          iface,
          cleanupState.cleaningUp,
          cleanup,
          triggerRestart,
        );
      }
    }
  } else if (hostapdState) {
    restartHostapd(
      hostapdState,
      HOSTAPD_CONFS[AP_IFACES[0]],
      AP_IFACES[0],
      cleanupState.cleaningUp,
      cleanup,
      triggerRestart,
    );
  }
}

async function main() {
  svc("main").info("starting AP stack with captive portal");

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

  for (const iface of AP_IFACES) {
    for (let i = 0; i < 10; i++) {
      const res = runQuiet("iptables", [
        "-D",
        "FORWARD",
        "-i",
        iface,
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
        iface,
        "-j",
        "ACCEPT",
      ]);
      if (res.status !== 0) break;
    }
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
    for (const iface of AP_IFACES) {
      for (let i = 0; i < 10; i++) {
        const res = runQuiet("iptables", [
          "-D",
          "FORWARD",
          "-i",
          iface,
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
          iface,
          "-j",
          "ACCEPT",
        ]);
        if (res.status !== 0) break;
      }
    }
  }

  for (const iface of AP_IFACES) {
    runQuiet("ip", ["addr", "flush", "dev", iface]);
    runQuiet("ip", ["link", "set", iface, "down"]);
  }
  run("mkdir", ["-p", CONFIG.ctrlDir]);
  runQuiet("chmod", ["755", CONFIG.ctrlDir]);
  await sleep(1000);

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
    svc("ipset").error(
      "fix: run 'sudo bash scripts/setup-machine.sh' to install dependencies and load kernel modules",
    );
    process.exit(1);
  }
  svc("ipset").info(`set ${hl(CONFIG.ipsetName)} ready`);

  svc("wifi").info(`[2/6] preparing Wi-Fi interface(s)...`);
  for (const iface of AP_IFACES) {
    prepareInterface(iface);
  }

  svc("hostapd").info("[3/6] starting hostapd...");
  if (IS_MESH_MODE && multiHostapdState) {
    // Start hostapd for each interface in mesh mode
    for (const iface of AP_IFACES) {
      const state = createHostapdState(iface, HOSTAPD_CONFS[iface]);
      multiHostapdState.states.set(iface, state);
      startHostapd(
        state,
        HOSTAPD_CONFS[iface],
        iface,
        cleanupState.cleaningUp,
        cleanup,
        triggerRestart,
      );
    }
    await sleep(3000);
    for (const [iface, state] of multiHostapdState.states.entries()) {
      if (state.hostapdProc.exitCode !== null) {
        svc("hostapd").error(`interface ${iface} crashed on startup!`);
        process.exit(1);
      }
      svc("hostapd").info(
        `interface ${iface} running, pid ${hl(state.hostapdProc.pid)}`,
      );
    }
  } else if (hostapdState) {
    // Single interface mode
    startHostapd(
      hostapdState,
      HOSTAPD_CONFS[AP_IFACES[0]],
      AP_IFACES[0],
      cleanupState.cleaningUp,
      cleanup,
      triggerRestart,
    );
    await sleep(3000);
    if (hostapdState.hostapdProc.exitCode !== null) {
      svc("hostapd").error("crashed on startup!");
      process.exit(1);
    }
    svc("hostapd").info(`running, pid ${hl(hostapdState.hostapdProc.pid)}`);
  }

  svc("iptables").info(
    `[4/6] configuring IP ${hl(CONFIG.apIp)} and interception rules...`,
  );
  for (const iface of AP_IFACES) {
    applyApAddressing(iface);
  }
  run("sysctl", ["-w", "net.ipv4.ip_forward=1"]);
  runQuiet("sysctl", ["-w", "net.ipv4.conf.all.forwarding=1"]);

  const gatewayIp = CONFIG.apIp.split("/")[0];
  setupInputRules(AP_IFACES);
  setupNatRules(AP_IFACES);
  setupForwardRules(AP_IFACES);
  setupSysctl(AP_IFACES);

  if (!CONFIG.portal) {
    setupWanRules(WAN_IFACES as string[], AP_IFACES);
  } else {
    svc("iptables").debug("portal-only mode: WAN forwarding disabled");
  }
  svc("iptables").info("firewall/NAT rules configured");

  svc("dnsmasq").info("[5/6] starting dnsmasq...");
  dnsmasqProc = spawn("dnsmasq", ["-C", DNSMASQ_CONF, "-d"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  streamToLog(dnsmasqProc.stdout, "dnsmasq", "debug", svc);
  streamToLog(dnsmasqProc.stderr, "dnsmasq", "debug", svc);
  dnsmasqProc.on("exit", (code: number) => {
    if (!cleanupState.cleaningUp) {
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
    `starting request logger on ${hl(String(CONFIG.serverBind) + ":" + ports.join(","))}...`,
  );
  serverProc = startRequestLogger(
    String(CONFIG.serverBind),
    ports,
    svc("server"),
  );

  if (CONFIG.portal) {
    portalServer = startPortalServer(
      String(CONFIG.serverBind),
      Number(CONFIG.portalPort),
      CONFIG.portalDistDir,
      svc("portal"),
    );
  }

  if (CONFIG.serverBind && CONFIG.serverBind !== gatewayIp) {
    for (const record of dnsRecords) {
      if (record.ip === String(CONFIG.serverBind)) {
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

  svc("hostapd_cli").info("[7/7] starting hostapd_cli...");
  const notifyOk =
    run("test", ["-x", CONFIG.notifyScript], { ignoreError: true }).status ===
    0;
  if (notifyOk) {
    await sleep(1000);

    // Start hostapd_cli for each interface in mesh mode, or single interface
    if (IS_MESH_MODE && multiHostapdState) {
      for (const [iface, state] of multiHostapdState.states.entries()) {
        state.cliProc = spawn(
          "hostapd_cli",
          ["-i", iface, "-p", CONFIG.ctrlDir, "-a", CONFIG.notifyScript],
          {
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        streamToLog(state.cliProc.stdout, "hostapd_cli", "debug", svc);
        streamToLog(state.cliProc.stderr, "hostapd_cli", "warn", svc);
        svc("hostapd_cli").info(
          `interface ${iface} running, pid ${hl(state.cliProc.pid)}`,
        );
      }
    } else if (hostapdState) {
      hostapdState.cliProc = spawn(
        "hostapd_cli",
        ["-i", AP_IFACES[0], "-p", CONFIG.ctrlDir, "-a", CONFIG.notifyScript],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      streamToLog(hostapdState.cliProc.stdout, "hostapd_cli", "debug", svc);
      streamToLog(hostapdState.cliProc.stderr, "hostapd_cli", "warn", svc);
      svc("hostapd_cli").info(`running, pid ${hl(hostapdState.cliProc.pid)}`);
    }
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

  const ssid =
    CONFIG.ssid ||
    (() => {
      try {
        const content = readFileSync(CONFIG.hostapdConfSrc, "utf8");
        const m = content.match(/^ssid=(.+)$/im);
        return m ? m[1].trim() : "unknown";
      } catch {
        return "unknown";
      }
    })();
  const band = detectBand(CONFIG.hostapdConfSrc);
  const maskedPassword = CONFIG.password
    ? "*".repeat(Math.min(CONFIG.password.length, 20))
    : "(none)";

  console.log("(((•)))  SSID:        " + ssid);
  console.log("         Password:    " + maskedPassword);
  console.log("         Band:        " + band);
  console.log("         Gateway:     " + gatewayIp);
  if (CONFIG.portal) {
    console.log("         Portal:      CAPTIVE PORTAL ACTIVE");
    console.log(
      "         Redirect:    ALL HTTP/HTTPS -> " +
        gatewayIp +
        ":" +
        CONFIG.portalPort,
    );
  }
  console.log();

  svc("main").info(
    `start your web server (Bun/Node) on port ${hl(CONFIG.portalPort)}`,
  );
  svc("main").info("press Ctrl+C to stop all services");
  console.log();

  if (CONFIG.trialSeconds > 0) {
    startTrialWatcherModule(AP_IFACES[0], () => cleanupState.cleaningUp);
  }

  if (CONFIG.webController) {
    webServer = startWebController();
  }
}

main().catch((err) => {
  svc("main").error(err.message || String(err));
  cleanup(1);
});
