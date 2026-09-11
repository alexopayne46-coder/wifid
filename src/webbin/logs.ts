import { WebBinFunction } from "./WebBinFunction.ts";
import { getRecentLogs } from "../log-buffer.ts";

export class LogsFunction extends WebBinFunction {
  name = "logs";
  execute(argv: Record<string, unknown>) {
    const since = Number(argv.since || 0) || 0;
    const count = Number(argv.count || 300) || 300;
    return getRecentLogs(count).filter((l) => l.ts >= since);
  }
}
