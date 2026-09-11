import { WebBinFunction } from "./WebBinFunction.ts";
import { readFileSync, writeFileSync } from "node:fs";

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
    const tokens = content.split(/\s+/);
    const runner = (tokens[0] || "").toLowerCase();
    if (runner !== "bun" && runner !== "node") {
      throw new Error("command must start with 'bun' or 'node'");
    }
    if (!tokens.includes("src/ap.ts")) {
      throw new Error("command must include 'src/ap.ts'");
    }
    writeFileSync(".argv.txt", content + "\n");
    return { ok: true };
  }
}
