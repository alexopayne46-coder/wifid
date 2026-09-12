import { WebBinFunction } from "./WebBinFunction.ts";
import { indexPresets } from "./presets.ts";

export class ArgvPresetsFunction extends WebBinFunction {
  name = "argvPresets";
  execute() {
    return indexPresets();
  }
}
