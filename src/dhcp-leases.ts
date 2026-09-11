import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

type DhcpLease = {
  mac: string;
  ip: string;
  hostname: string;
  lastSeen: number;
};

const LEASES_FILE = ".dhcp-leases.jsonl";
const MAX_LEASES = 500;
const leases: DhcpLease[] = [];

function saveLease(lease: DhcpLease) {
  try {
    appendFileSync(LEASES_FILE, JSON.stringify(lease) + "\n");
  } catch {}
}

function loadLeases(): DhcpLease[] {
  try {
    const content = readFileSync(LEASES_FILE, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const result: DhcpLease[] = [];
    for (const line of lines) {
      try {
        result.push(JSON.parse(line));
      } catch {}
    }
    return result.slice(-MAX_LEASES);
  } catch {
    return [];
  }
}

export function recordDhcpLease(mac: string, ip: string, hostname: string) {
  const lease: DhcpLease = {
    mac: mac.toLowerCase(),
    ip,
    hostname: hostname || "",
    lastSeen: Date.now(),
  };

  const idx = leases.findIndex((l) => l.mac === lease.mac);
  if (idx >= 0) {
    leases[idx] = lease;
  } else {
    leases.push(lease);
    while (leases.length > MAX_LEASES) {
      leases.shift();
    }
  }

  saveLease(lease);
}

export function getLeaseByMac(mac: string): DhcpLease | undefined {
  const all = loadLeases();
  return all.find((l) => l.mac === mac.toLowerCase());
}

export function getAllLeases(): DhcpLease[] {
  return loadLeases();
}
