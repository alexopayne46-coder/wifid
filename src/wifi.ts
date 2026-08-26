import { readdirSync } from "node:fs";
import { CONFIG, AP_MODE, netPassthough, hl, svc } from "./config.ts";
import { runQuiet } from "./utils.ts";

/**
 * Detect the AP interface: pick the first wlp0s20f0uN that
 * actually exists on the system right now.
 */
export function detectApIface() {
  let entries = [];
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
      .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
    if (matches.length) return matches[0].name;
  }
  return null;
}

export function getApInterface() {
  let AP_IFACE = process.env.AP_IFACE;
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

/**
 * Detect all external (internet-facing) interfaces
 */
export function detectWanIfaces(AP_IFACE) {
  const ifaces = new Set();
  let netEntries = [];
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
    if (netPassthough && netEntries.includes(netPassthough)) {
      ifaces.add(netPassthough);
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
