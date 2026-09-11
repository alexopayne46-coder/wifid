import { WebBinFunction } from "./WebBinFunction.ts";

export class StopFunction extends WebBinFunction {
  name = "stop";
  execute() {
    setTimeout(() => process.exit(0), 100);
    return { ok: true };
  }
}
