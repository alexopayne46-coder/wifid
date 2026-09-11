#!/usr/bin/env bun

import { spawn, ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { sleep } from "./utils.ts";

const ARGV_FILE = ".argv.txt";

function tokenizeCommand(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === " " || ch === "\t") {
        if (current) {
          tokens.push(current);
          current = "";
        }
      } else {
        current += ch;
      }
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function validateCommand(tokens: string[]): { valid: boolean; error?: string } {
  if (!tokens.length) {
    return { valid: false, error: "empty command" };
  }

  const allowedRunners = new Set(["bun", "node"]);
  const runner = tokens[0].toLowerCase();

  if (!allowedRunners.has(runner)) {
    return {
      valid: false,
      error: `command runner must be 'bun' or 'node', got '${tokens[0]}'`,
    };
  }

  const hasApScript = tokens.some((t) => t === "src/ap.ts");
  if (!hasApScript) {
    return {
      valid: false,
      error: "command must include 'src/ap.ts' as the target script",
    };
  }

  return { valid: true };
}

function loadCommand(): string[] {
  let content: string;
  try {
    content = readFileSync(ARGV_FILE, "utf8").trim();
  } catch {
    console.error(`[hypervisor] ${ARGV_FILE} not found. Create it with the AP startup command.`);
    process.exit(1);
  }

  const tokens = tokenizeCommand(content);
  const validation = validateCommand(tokens);
  if (!validation.valid) {
    console.error(`[hypervisor] rejected command: ${validation.error}`);
    process.exit(1);
  }

  return tokens;
}

let child: ChildProcess | null = null;

function startChild() {
  const tokens = loadCommand();
  const runner = tokens[0];
  const args = tokens.slice(1);

  console.log(`[hypervisor] starting: ${runner} ${args.join(" ")}`);

  child = spawn(runner, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (data: Buffer) => {
    process.stdout.write(data);
  });

  child.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(data);
  });

  child.on("exit", (code: number | null) => {
    const exited = code !== null;
    console.log(
      `[hypervisor] child exited with code ${code ?? "null"}, restarting in 3s...`
    );
    setTimeout(() => startChild(), 3000);
  });

  child.on("error", (err: Error) => {
    console.error(`[hypervisor] spawn error: ${err.message}`);
    setTimeout(() => startChild(), 3000);
  });
}

process.on("SIGINT", () => {
  console.log("\n[hypervisor] shutting down...");
  if (child) {
    child.kill("SIGTERM");
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[hypervisor] shutting down...");
  if (child) {
    child.kill("SIGTERM");
  }
  process.exit(0);
});

startChild();
