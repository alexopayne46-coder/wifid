import { rmSync } from "node:fs";
import path from "node:path";

import { CONFIG, svc } from "./config.ts";
import { runQuiet } from "./utils.ts";

export interface CleanupState {
  hostapdProc: any;
  hostapdProcs: any[];
  dnsmasqProc: any;
  cliProc: any;
  cliProcs: any[];
  serverProc: any;
  portalServer: any;
  mdnsProcs: any[];
  webServer: any;
  cleaningUp: boolean;
}

export function createCleanupState(): CleanupState {
  return {
    hostapdProc: null,
    hostapdProcs: [],
    dnsmasqProc: null,
    cliProc: null,
    cliProcs: [],
    serverProc: null,
    portalServer: null,
    mdnsProcs: [],
    webServer: null,
    cleaningUp: false,
  };
}

export async function cleanup(
  state: CleanupState,
  runtimeDir: string,
  hostapdConfs: string | Record<string, string>,
  dnsmasqConf: string,
  apIfaces: string | string[],
  wanIfaces: string[],
  exitCode = 0,
) {
  if (state.cleaningUp) return;
  state.cleaningUp = true;
  console.log();
  svc("main").info("shutting down and cleaning up...");

  // Handle single or multiple hostapd processes
  const hostapdProcs =
    state.hostapdProcs.length > 0 ? state.hostapdProcs : [state.hostapdProc];
  const cliProcs = state.cliProcs.length > 0 ? state.cliProcs : [state.cliProc];

  for (const proc of [...cliProcs, state.dnsmasqProc, ...hostapdProcs]) {
    if (proc && proc.exitCode === null) {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
  }
  if (state.serverProc) {
    try {
      state.serverProc.close();
    } catch {}
  }
  if (state.portalServer) {
    try {
      state.portalServer.close();
    } catch {}
  }

  for (const proc of state.mdnsProcs) {
    if (proc && proc.exitCode === null) {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
  }
  if (state.webServer) {
    try {
      state.webServer.close();
    } catch {}
  }

  runQuiet("pkill", ["-f", `dnsmasq -C ${dnsmasqConf}`]);

  // Kill all hostapd instances
  const confPaths =
    typeof hostapdConfs === "string"
      ? [hostapdConfs]
      : Object.values(hostapdConfs);
  for (const conf of confPaths) {
    runQuiet("pkill", ["-f", `hostapd ${conf}`]);
  }

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

  const ifaces = Array.isArray(apIfaces) ? apIfaces : [apIfaces];

  svc("iptables").debug(
    `removing MASQUERADE/FORWARD rules for WAN: ${wanIfaces.join(", ") || "none"}`,
  );
  for (const wan of wanIfaces) {
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
    for (const iface of ifaces) {
      runQuiet("iptables", [
        "-D",
        "FORWARD",
        "-i",
        iface,
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
        iface,
        "-j",
        "ACCEPT",
      ]);
    }
  }
  for (const iface of ifaces) {
    runQuiet("iptables", ["-D", "FORWARD", "-i", iface, "-j", "ACCEPT"]);
  }
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
  for (const iface of ifaces) {
    for (const [proto, port] of inputPorts) {
      runQuiet("iptables", [
        "-D",
        "INPUT",
        "-i",
        iface,
        "-p",
        proto,
        "--dport",
        port,
        "-j",
        "ACCEPT",
      ]);
    }
  }

  runQuiet("ipset", ["destroy", CONFIG.ipsetName]);
  for (const iface of ifaces) {
    svc("wifi").debug(`resetting interface ${iface}`);
    runQuiet("ip", ["addr", "flush", "dev", iface]);
    runQuiet("ip", ["link", "set", iface, "down"]);
  }

  svc("main").debug(`removing runtime config dir ${runtimeDir}`);
  try {
    rmSync(runtimeDir, { recursive: true, force: true });
  } catch {}

  svc("main").info("all processes and rules have been stopped.");
  process.exit(exitCode);
}
