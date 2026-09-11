import { readFileSync, appendFileSync } from "node:fs";

export type LogLine = {
  ts: number;
  service: string;
  level: string;
  line: string;
};

const LOGS_FILE = ".logs.jsonl";
const MAX_LINES = 2000;
let memoryBuffer: LogLine[] = [];

export function writeLog(service: string, level: string, line: string) {
  const entry: LogLine = { ts: Date.now(), service, level, line };
  memoryBuffer.push(entry);
  if (memoryBuffer.length > MAX_LINES) memoryBuffer.shift();
  try {
    appendFileSync(LOGS_FILE, JSON.stringify(entry) + "\n");
  } catch {}
}

export function getLogs(since?: number): LogLine[] {
  try {
    const content = readFileSync(LOGS_FILE, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const result: LogLine[] = [];
    for (const raw of lines) {
      try {
        const entry = JSON.parse(raw) as LogLine;
        if (since == null || entry.ts >= since) result.push(entry);
      } catch {}
    }
    return result;
  } catch {
    return memoryBuffer.slice(-500);
  }
}

export function getRecentLogs(count = 200): LogLine[] {
  const logs = getLogs();
  return logs.slice(-count);
}
