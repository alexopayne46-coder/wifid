import { WebBinFunction } from "./WebBinFunction.ts";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ALLOWED_FLAGS = new Set([
  "-m",
  "--mode",
  "-t",
  "--trial",
  "-p",
  "--passthrough",
  "-D",
  "--dns-overwrite",
  "-S",
  "--server-bind",
  "-n",
  "--ssid",
  "-b",
  "--bssid",
  "-w",
  "--password",
  "-o",
  "--open",
  "-P",
  "--portal",
  "-d",
  "--debug",
  "-W",
  "--webController",
  "--webControllerAddr",
  "--mesh",
  "--monitor-iface-fail-and-restart",
]);

const ALLOWED_MODES = new Set(["auto", "tailscale", "wire"]);

function validateIpLike(value: string): boolean {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d{1,2})?$/.test(value)) return false;
  return value.split(".").every((o) => {
    const n = Number(o);
    return n >= 0 && n <= 255;
  });
}

function validateMac(value: string): boolean {
  return /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(value);
}

function validatePort(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 65535;
}

function validateHostPort(value: string): boolean {
  const m = value.match(/^(.+):(\d+)$/);
  if (!m) return false;
  return validatePort(m[2]);
}

export class ArgvGetFunction extends WebBinFunction {
  name = "argvGet";
  execute() {
    try {
      const content = readFileSync(".argv.txt", "utf8").trim();
      return { content };
    } catch {
      return { content: "" };
    }
  }
}

export class ArgvSetFunction extends WebBinFunction {
  name = "argvSet";
  execute(argv: Record<string, unknown>) {
    const content = String(argv.content || "").trim();
    if (!content) throw new Error("content is required");

    const tokens: string[] = [];
    let current = "";
    let inQuote: string | null = null;
    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
        else current += ch;
      } else {
        if (ch === '"' || ch === "'") inQuote = ch;
        else if (ch === " " || ch === "\t") {
          if (current) tokens.push(current);
          current = "";
        } else current += ch;
      }
    }
    if (current) tokens.push(current);

    const runner = (tokens[0] || "").toLowerCase();
    if (runner !== "bun" && runner !== "node") {
      throw new Error("command must start with 'bun' or 'node'");
    }

    if (!tokens.includes("src/ap.ts")) {
      throw new Error("command must include 'src/ap.ts'");
    }

    for (let i = 2; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.startsWith("-")) {
        if (!ALLOWED_FLAGS.has(t)) {
          throw new Error(`disallowed flag: ${t}`);
        }
        const next = tokens[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          switch (t) {
            case "--mode":
            case "-m":
              if (!ALLOWED_MODES.has(String(next).toLowerCase())) {
                throw new Error(`invalid mode: ${next}`);
              }
              break;
            case "--trial":
            case "-t":
              if (!/^\d+$/.test(String(next)) || Number(next) < 0) {
                throw new Error(`invalid trial seconds: ${next}`);
              }
              break;
            case "--server-bind":
            case "-S":
              if (!validateIpLike(String(next))) {
                throw new Error(`invalid server bind: ${next}`);
              }
              break;
            case "--bssid":
            case "-b":
              if (!validateMac(String(next))) {
                throw new Error(`invalid bssid: ${next}`);
              }
              break;
            case "--webControllerAddr":
              if (!validateHostPort(String(next))) {
                throw new Error(`invalid webControllerAddr: ${next}`);
              }
              break;
            case "--mesh":
              for (const iface of String(next).split(",")) {
                const trimmed = iface.trim();
                if (trimmed !== "auto" && !/^[a-z0-9]+$/i.test(trimmed)) {
                  throw new Error(`invalid mesh interface: ${trimmed}`);
                }
              }
              break;
            default:
              break;
          }
          i++;
        }
      }
    }

    writeFileSync(".argv.txt", content + "\n");
    return { ok: true };
  }
}
