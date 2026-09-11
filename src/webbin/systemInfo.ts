import { WebBinFunction } from "./WebBinFunction.ts";
import { getSystemInfo } from "../system-info.ts";

export class SystemInfoFunction extends WebBinFunction {
  name = "systemInfo";
  execute() {
    return getSystemInfo();
  }
}
