import { readFileSync, existsSync } from "node:fs";

export type SystemInfo = {
  board: string;
  cpu: string;
  cpuFreqMhz: string;
  cpuTempC: string;
  ramUsedMb: string;
  ramTotalMb: string;
  ramPercent: string;
  uptime: string;
};

export function getSystemInfo(): SystemInfo {
  let board = "unknown";
  try {
    if (existsSync("/sys/firmware/devicetree/base/model")) {
      board = readFileSync("/sys/firmware/devicetree/base/model", "utf8").trim().replace(/\0/g, "");
    } else if (existsSync("/proc/device-tree/model")) {
      board = readFileSync("/proc/device-tree/model", "utf8").trim().replace(/\0/g, "");
    }
  } catch {}
  if (!board || board === "unknown") {
    try {
      const cpuinfo = readFileSync("/proc/cpuinfo", "utf8");
      const m = cpuinfo.match(/^model name\s*:\s*(.+)$/im);
      if (m) board = m[1].trim();
    } catch {}
  }

  let cpuFreq = "N/A";
  try {
    const freq = readFileSync("/proc/cpuinfo", "utf8").match(/cpu MHz\s*:\s*([\d.]+)/im);
    if (freq) cpuFreq = Math.round(parseFloat(freq[1])) + " MHz";
  } catch {}
  try {
    const scaling = readFileSync("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq", "utf8").trim();
    if (scaling) cpuFreq = Math.round(parseInt(scaling) / 1000) + " MHz";
  } catch {}

  let cpuTemp = "N/A";
  try {
    const temps = [
      "/sys/class/thermal/thermal_zone0/temp",
      "/sys/class/thermal/thermal_zone1/temp",
    ];
    for (const t of temps) {
      try {
        const raw = readFileSync(t, "utf8").trim();
        if (raw) {
          cpuTemp = (parseInt(raw) / 1000).toFixed(1) + " C";
          break;
        }
      } catch {}
    }
  } catch {}

  let ramTotal = 0;
  let ramAvailable = 0;
  try {
    const meminfo = readFileSync("/proc/meminfo", "utf8");
    const totalMatch = meminfo.match(/^MemTotal:\s+(\d+)/im);
    const availMatch = meminfo.match(/^MemAvailable:\s+(\d+)/im);
    if (totalMatch) ramTotal = parseInt(totalMatch[1]);
    if (availMatch) ramAvailable = parseInt(availMatch[1]);
  } catch {}

  const ramUsed = ramTotal - ramAvailable;
  const ramUsedMb = (ramUsed / 1024).toFixed(0);
  const ramTotalMb = (ramTotal / 1024).toFixed(0);
  const ramPercent = ramTotal > 0 ? ((ramUsed / ramTotal) * 100).toFixed(0) : "0";

  let uptime = "N/A";
  try {
    const uptimeRaw = readFileSync("/proc/uptime", "utf8").split(" ")[0];
    const seconds = Math.floor(parseFloat(uptimeRaw));
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(d + "d");
    if (h > 0) parts.push(h + "h");
    parts.push(m + "m");
    uptime = parts.join(" ");
  } catch {}

  return {
    board,
    cpu: board,
    cpuFreqMhz: cpuFreq,
    cpuTempC: cpuTemp,
    ramUsedMb: ramUsedMb + " MB",
    ramTotalMb: ramTotalMb + " MB",
    ramPercent: ramPercent + "%",
    uptime,
  };
}
