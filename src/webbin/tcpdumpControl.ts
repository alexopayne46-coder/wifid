import { WebBinFunction } from "./WebBinFunction.ts";
import { startTcpdumpSession, stopTcpdumpSession, getTcpdumpOutput, listTcpdumpSessions, cleanupTcpdumpSessions } from "./tcpdump.ts";

export class TcpdumpStartFunction extends WebBinFunction {
  name = "tcpdumpStart";
  execute(argv: Record<string, unknown>) {
    const iface = String(argv.interface || "");
    if (!iface) throw new Error("interface is required");
    const id = `session:${iface}:${Date.now()}`;
    const result = startTcpdumpSession(id, iface);
    if (result.ok) {
      return { ok: true, id, iface };
    }
    return result;
  }
}

export class TcpdumpStopFunction extends WebBinFunction {
  name = "tcpdumpStop";
  execute(argv: Record<string, unknown>) {
    const id = String(argv.id || "");
    if (!id) throw new Error("id is required");
    return stopTcpdumpSession(id);
  }
}

export class TcpdumpOutputFunction extends WebBinFunction {
  name = "tcpdumpOutput";
  execute(argv: Record<string, unknown>) {
    const id = String(argv.id || "");
    if (!id) throw new Error("id is required");
    const since = Number(argv.since || 0) || 0;
    return getTcpdumpOutput(id, since > 0 ? since : undefined);
  }
}

export class TcpdumpListFunction extends WebBinFunction {
  name = "tcpdumpList";
  execute() {
    return listTcpdumpSessions();
  }
}

export class TcpdumpCleanupFunction extends WebBinFunction {
  name = "tcpdumpCleanup";
  execute() {
    cleanupTcpdumpSessions();
    return { ok: true };
  }
}
