import { WebBinFunction } from "./WebBinFunction.ts";

const PRESETS: Record<string, string> = {
  "open": "bun run src/ap.ts --open --portal --ssid MT_FREE --mesh auto",
  "secure": "bun run src/ap.ts --portal --ssid MyNetwork --password mypass123 --mesh auto",
  "portal-only": "bun run src/ap.ts --portal --ssid Portal",
  "mesh-auto": "bun run src/ap.ts --mesh auto --portal --ssid MeshNet",
};

export class ArgvPresetsFunction extends WebBinFunction {
  name = "argvPresets";
  execute() {
    return Object.entries(PRESETS).map(([name, command]) => ({ name, command }));
  }
}

export function getPresetCommand(name: string): string | undefined {
  return PRESETS[name];
}
