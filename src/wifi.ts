import { readdirSync } from "node:fs";
import { CONFIG, AP_MODE, netPassthough, hl, svc } from "./config.ts";
import { runQuiet } from "./utils.ts";

export function detectApIface(): string | null {
  let entries: string[] = [];
  try {
    entries = readdirSync("/sys/class/net");
  } catch {
    return null;
  }
  const prefixes = Array.isArray(CONFIG.apIfacePrefix)
    ? CONFIG.apIfacePrefix
    : [CONFIG.apIfacePrefix];
  for (const prefix of prefixes) {
    const pattern = new RegExp(`^${prefix}(\\d+)$`);
    const matches = entries
      .map((name) => ({ name, match: name.match(pattern) }))
      .filter((e) => e.match)
      .sort((a, b) => Number(a.match![1]) - Number(b.match![1]));
    if (matches.length) return matches[0].name;
  }
  return null;
}

export function getApInterface(): string {
  let AP_IFACE: string | null = process.env.AP_IFACE ?? null;
  if (!AP_IFACE) {
    AP_IFACE = detectApIface();
    if (!AP_IFACE) {
      const prefixes = Array.isArray(CONFIG.apIfacePrefix)
        ? CONFIG.apIfacePrefix
        : [CONFIG.apIfacePrefix];
      const attempted = prefixes.map((p) => hl(p + "*")).join(", ");
      svc("wifi").error(
        `no interface matching ${attempted} found — is the adapter plugged in?`,
      );
      process.exit(1);
    }
    svc("wifi").info(`detected AP interface: ${hl(AP_IFACE)}`);
  } else {
    svc("wifi").info(`using AP interface from environment: ${hl(AP_IFACE)}`);
  }
  return AP_IFACE;
}

export function detectAllWirelessInterfaces(): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync("/sys/class/net");
  } catch {
    return [];
  }
  const prefixes = Array.isArray(CONFIG.apIfacePrefix)
    ? CONFIG.apIfacePrefix
    : [CONFIG.apIfacePrefix];
  const allInterfaces: string[] = [];
  for (const prefix of prefixes) {
    const pattern = new RegExp(`^${prefix}(\\d+)$`);
    const matches = entries
      .map((name) => ({ name, match: name.match(pattern) }))
      .filter((e) => e.match)
      .sort((a, b) => Number(a.match![1]) - Number(b.match![1]));
    for (const match of matches) {
      if (!allInterfaces.includes(match.name)) {
        allInterfaces.push(match.name);
      }
    }
  }
  return allInterfaces;
}

export function getMeshInterfaces(): string[] {
  if (!CONFIG.meshInterfaces) return [];

  const meshConfig = String(CONFIG.meshInterfaces).trim();
  if (meshConfig === "auto") {
    return detectAllWirelessInterfaces();
  }

  return meshConfig
    .split(",")
    .map((iface: string) => iface.trim())
    .filter((iface: string) => iface.length > 0);
}

export function detectWanIfaces(AP_IFACE: string): string[] {
  const ifaces = new Set<string>();
  let netEntries: string[] = [];
  try {
    netEntries = readdirSync("/sys/class/net");
  } catch {}

  if (AP_MODE !== "tailscale") {
    const res = runQuiet("ip", ["route", "show", "default"]);
    for (const line of (res.stdout || "").split("\n")) {
      const m = line.match(/\bdev\s+(\S+)/);
      if (m && m[1] !== AP_IFACE) ifaces.add(m[1]);
    }
  }

  try {
    if (AP_MODE !== "wire") {
      if (netEntries.includes("tailscale0")) {
        ifaces.add("tailscale0");
      }
    }
    if (netPassthough && netEntries.includes(String(netPassthough))) {
      ifaces.add(String(netPassthough));
    }
  } catch {}

  const filtered = [...ifaces].filter((iface) => netEntries.includes(iface));
  if (AP_MODE === "tailscale" && !filtered.includes("tailscale0")) {
    svc("wan").warn(
      "AP_MODE is set to 'tailscale', but 'tailscale0' interface was not found!",
    );
  }
  return filtered;
}
