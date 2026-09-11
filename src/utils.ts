import { spawnSync } from "node:child_process";

export function run(
  cmd: string,
  args: string[] = [],
  { ignoreError = false }: { ignoreError?: boolean } = {},
) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  if (res.status !== 0 && !ignoreError) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed: ${res.stderr?.trim() || res.error}`,
    );
  }
  return res;
}

export const runQuiet = (cmd: string, args: string[]) =>
  run(cmd, args, { ignoreError: true });

export function streamToLog(
  stream: NodeJS.ReadableStream,
  service: string,
  level: string,
  svcFn: (service: string) => any,
  onLine?: (line: string) => void,
) {
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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
