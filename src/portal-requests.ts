import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

type PortalRequest = {
  ts: number;
  method: string;
  url: string;
  ip: string;
  userAgent: string;
};

const REQUESTS_FILE = ".portal-requests.jsonl";
const MAX_REQUESTS = 1000;
const STATIC_EXT = new Set([
  ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".json", ".map", ".woff", ".woff2", ".ttf", ".eot", ".webp",
]);

function isStatic(url: string): boolean {
  const pathname = url.split("?")[0];
  const ext = pathname.slice(pathname.lastIndexOf("."));
  return STATIC_EXT.has(ext.toLowerCase());
}

export function recordPortalRequest(req: { method?: string; url?: string; socket?: { remoteAddress?: string }; headers?: { [key: string]: string | string[] | undefined } }) {
  const url = req.url || "/";
  if (isStatic(url)) return;

  const entry: PortalRequest = {
    ts: Date.now(),
    method: (req.method || "GET").toUpperCase(),
    url,
    ip: req.socket?.remoteAddress || "unknown",
    userAgent: typeof req.headers?.["user-agent"] === "string"
      ? req.headers["user-agent"]
      : "",
  };

  try {
    appendFileSync(REQUESTS_FILE, JSON.stringify(entry) + "\n");
  } catch {}
}

export function getPortalRequests(): PortalRequest[] {
  try {
    const content = readFileSync(REQUESTS_FILE, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const requests: PortalRequest[] = [];
    for (const line of lines) {
      try {
        requests.push(JSON.parse(line));
      } catch {}
    }
    return requests.slice(-MAX_REQUESTS);
  } catch {
    return [];
  }
}

export function prunePortalRequests() {
  try {
    const requests = getPortalRequests();
    if (requests.length > MAX_REQUESTS) {
      const keep = requests.slice(-MAX_REQUESTS);
      writeFileSync(REQUESTS_FILE, keep.map((r) => JSON.stringify(r)).join("\n") + "\n");
    }
  } catch {}
}
