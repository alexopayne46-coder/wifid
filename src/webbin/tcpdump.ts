import { spawn } from "node:child_process";

type TcpdumpSession = {
  proc: ReturnType<typeof spawn> | null;
  lines: string[];
  maxLines: number;
  startTime: number;
};

const sessions = new Map<string, TcpdumpSession>();
const MAX_LINES = 500;

export function startTcpdumpSession(id: string, iface: string) {
  if (sessions.has(id)) {
    stopTcpdumpSession(id);
  }

  const session: TcpdumpSession = {
    proc: null,
    lines: [],
    maxLines: MAX_LINES,
    startTime: Date.now(),
  };

  try {
    const proc = spawn(
      "tcpdump",
      ["-i", iface, "-l", "-n", "-q", "-tttt", "-v"],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    session.proc = proc;

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf8");
      const newLines = text.split("\n").filter(Boolean);
      for (const line of newLines) {
        session.lines.push(line);
        if (session.lines.length > session.maxLines) {
          session.lines.shift();
        }
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString("utf8");
      const newLines = text.split("\n").filter(Boolean);
      for (const line of newLines) {
        session.lines.push("[stderr] " + line);
        if (session.lines.length > session.maxLines) {
          session.lines.shift();
        }
      }
    });

    proc.on("exit", () => {
      session.proc = null;
    });

    proc.on("error", () => {
      session.proc = null;
    });

    sessions.set(id, session);
    return { ok: true };
  } catch {
    return { ok: false, error: "failed to start tcpdump" };
  }
}

export function stopTcpdumpSession(id: string) {
  const session = sessions.get(id);
  if (!session) return { ok: true };

  try {
    if (session.proc) {
      session.proc.kill("SIGTERM");
    }
  } catch {}
  sessions.delete(id);
  return { ok: true };
}

export function getTcpdumpOutput(id: string, since?: number) {
  const session = sessions.get(id);
  if (!session) return { lines: [] };

  let lines = session.lines;
  if (since && since > session.startTime) {
    lines = lines.filter((line) => {
      const tsMatch = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)/,
      );
      if (!tsMatch) return true;
      const ts = new Date(tsMatch[1]).getTime();
      return ts >= since;
    });
  }

  return { lines, startTime: session.startTime };
}

export function listTcpdumpSessions() {
  const result: {
    id: string;
    iface: string;
    startTime: number;
    lineCount: number;
  }[] = [];
  for (const [id, session] of sessions.entries()) {
    result.push({
      id,
      iface: id.split(":")[1] || id,
      startTime: session.startTime,
      lineCount: session.lines.length,
    });
  }
  return result;
}

export function cleanupTcpdumpSessions() {
  for (const [id, session] of sessions.entries()) {
    try {
      if (session.proc) session.proc.kill("SIGTERM");
    } catch {}
    sessions.delete(id);
  }
}
