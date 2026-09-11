type ClientInfo = {
  mac: string;
  interface?: string;
  hostname?: string;
  ip?: string;
  signal?: number;
  txBitrate?: number;
  rxBitrate?: number;
  connectedSeconds?: number;
  lastSeen: number;
};

const clients = new Map<string, ClientInfo>();
const MAX_AGE_MS = 60 * 60 * 1000;

export function updateClientFromStation(data: Partial<ClientInfo> & { mac: string }) {
  const mac = data.mac.toLowerCase();
  const existing = clients.get(mac);
  const entry: ClientInfo = {
    ...existing,
    ...data,
    mac,
    lastSeen: Date.now(),
  };
  clients.set(mac, entry);
}

export function updateClientHostname(mac: string, hostname: string) {
  const key = mac.toLowerCase();
  const existing = clients.get(key);
  if (existing) {
    existing.hostname = hostname;
    existing.lastSeen = Date.now();
  } else {
    clients.set(key, { mac: key, hostname, lastSeen: Date.now() });
  }
}

export function getActiveClients(): ClientInfo[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  const active: ClientInfo[] = [];
  for (const [mac, client] of clients.entries()) {
    if (client.lastSeen >= cutoff) {
      active.push(client);
    } else {
      clients.delete(mac);
    }
  }
  return active;
}

export function getClientByMac(mac: string): ClientInfo | undefined {
  return clients.get(mac.toLowerCase());
}
