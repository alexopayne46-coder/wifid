import { CONFIG, svc } from "./config.ts";
import { run, runQuiet } from "./utils.ts";

export function setupInputRules(apIface: string | string[]) {
  const gatewayIp = CONFIG.apIp.split("/")[0];
  const inputPorts: [string, string][] = [
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
  const ifaces = Array.isArray(apIface) ? apIface : [apIface];
  for (const iface of ifaces) {
    for (const [proto, port] of inputPorts) {
      run("iptables", [
        "-I",
        "INPUT",
        "1",
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
}

export function setupNatRules(apIface: string | string[]) {
  const ifaces = Array.isArray(apIface) ? apIface : [apIface];
  for (const iface of ifaces) {
    // NAT PREROUTING: redirect only DNS (53) and HTTP (80)
    run("iptables", [
      "-t",
      "nat",
      "-I",
      "PREROUTING",
      "1",
      "-i",
      iface,
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
      iface,
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
      iface,
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
  }
}

export function setupForwardRules(apIface: string | string[]) {
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
  const ifaces = Array.isArray(apIface) ? apIface : [apIface];
  for (const iface of ifaces) {
    run("iptables", ["-I", "FORWARD", "1", "-i", iface, "-j", "ACCEPT"]);
  }
}

export function setupWanRules(wanIfaces: string[], apIface: string | string[]) {
  const ifaces = Array.isArray(apIface) ? apIface : [apIface];
  for (const wan of wanIfaces) {
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
    for (const iface of ifaces) {
      run("iptables", [
        "-I",
        "FORWARD",
        "1",
        "-i",
        iface,
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
        iface,
        "-j",
        "ACCEPT",
      ]);
    }
    runQuiet("sysctl", ["-w", `net.ipv4.conf.${wan}.forwarding=1`]);
    runQuiet("sysctl", ["-w", `net.ipv4.conf.${wan}.rp_filter=0`]);
    svc("iptables").debug(`MASQUERADE and FORWARD enabled for WAN: ${wan}`);
  }
}

export function setupSysctl(apIface: string | string[]) {
  run("sysctl", ["-w", "net.ipv4.ip_forward=1"]);
  runQuiet("sysctl", ["-w", "net.ipv4.conf.all.forwarding=1"]);
  runQuiet("sysctl", ["-w", "net.ipv4.conf.default.rp_filter=0"]);
  runQuiet("sysctl", ["-w", "net.ipv4.conf.all.rp_filter=0"]);
  const ifaces = Array.isArray(apIface) ? apIface : [apIface];
  for (const iface of ifaces) {
    runQuiet("sysctl", ["-w", `net.ipv4.conf.${iface}.rp_filter=0`]);
    runQuiet("sysctl", ["-w", `net.ipv4.conf.${iface}.forwarding=1`]);
  }
}

export function cleanupOldRules(
  apIface: string | string[],
  wanIfaces: string[],
) {
  runQuiet("iptables", ["-t", "nat", "-F", "PREROUTING"]);
  runQuiet("iptables", ["-t", "nat", "-F", "POSTROUTING"]);
  runQuiet("iptables", ["-t", "mangle", "-F", "FORWARD"]);

  const ifaces = Array.isArray(apIface) ? apIface : [apIface];
  for (const iface of ifaces) {
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
  for (const wan of wanIfaces) {
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
    for (const iface of ifaces) {
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
}
