import { readFileSync, appendFileSync } from "node:fs";

type DnsQuery = {
  time: number;
  domain: string;
  type: string;
  client: string;
};

const QUERIES_FILE = ".dns-queries.jsonl";
const MAX_QUERIES = 1000;

export function recordDnsQuery(domain: string, type: string, client: string) {
  const entry = JSON.stringify({ time: Date.now(), domain, type, client });
  try {
    appendFileSync(QUERIES_FILE, entry + "\n");
  } catch {}
}

export function getDnsQueries(): DnsQuery[] {
  try {
    const content = readFileSync(QUERIES_FILE, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const queries: DnsQuery[] = [];
    for (const line of lines) {
      try {
        queries.push(JSON.parse(line));
      } catch {}
    }
    return queries.slice(-MAX_QUERIES);
  } catch {
    return [];
  }
}
