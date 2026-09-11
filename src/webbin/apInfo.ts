import { WebBinFunction } from "./WebBinFunction.ts";
import { getApInfo } from "./shared.ts";

export class ApInfoFunction extends WebBinFunction {
  name = "apInfo";
  execute() {
    return getApInfo();
  }
}
