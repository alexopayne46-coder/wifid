import { WebBinFunction } from "./WebBinFunction.ts";

export class StatusFunction extends WebBinFunction {
  name = "status";
  execute() {
    return { status: "running", uptime: process.uptime() };
  }
}
