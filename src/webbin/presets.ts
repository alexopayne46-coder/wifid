import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PRESETS_DIR = path.join(process.cwd(), "data", "finetuned", "presets");

export function indexPresets() {
  const presets: { name: string; command: string }[] = [];
  try {
    if (!readdirSync(PRESETS_DIR)) return presets;
    const files = readdirSync(PRESETS_DIR).filter((f) => f.endsWith(".sh"));
    for (const file of files) {
      const fullPath = path.join(PRESETS_DIR, file);
      try {
        const content = readFileSync(fullPath, "utf8").trim();
        const firstLine = content.split("\n")[0].trim();
        presets.push({
          name: file.slice(0, -3),
          command: firstLine,
        });
      } catch {}
    }
  } catch {}
  return presets;
}

export function getPresetCommand(name: string): string | undefined {
  const presets = indexPresets();
  const preset = presets.find((p) => p.name === name);
  return preset?.command;
}
