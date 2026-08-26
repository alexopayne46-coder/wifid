import { spawnSync } from "node:child_process";

/** Run a command synchronously. Throws unless ignoreError is set. */
export function run(cmd, args = [], { ignoreError = false } = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  if (res.status !== 0 && !ignoreError) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed: ${res.stderr?.trim() || res.error}`,
    );
  }
  return res;
}

/** iptables/ip helper that never throws — mirrors bash's `|| true`. */
export const runQuiet = (cmd, args) => run(cmd, args, { ignoreError: true });

/** Pipe a child process's stream into the logger, line by line.
 *  onLine, if provided, is called for every parsed line. */
export function streamToLog(stream, service, level, svcFn, onLine) {
  if (!stream) return;
  stream.setEncoding("utf8");
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trimEnd();
      buffer = buffer.slice(idx + 1);
      if (line) {
        svcFn(service)[level](line);
        if (onLine) onLine(line);
      }
    }
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
