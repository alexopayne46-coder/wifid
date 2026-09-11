import { existsSync, readlinkSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { CONFIG, svc } from "./config.ts";
import { runQuiet, sleep, streamToLog } from "./utils.ts";
import { writeLog } from "./log-buffer.ts";
import { updateClientFromStation } from "./client-tracker.ts";

export interface HostapdState {
  hostapdProc: any;
  cliProc: any;
  hostapdRestarting: boolean;
  sawInterfaceDisabled: boolean;
  probeSendFailStreak: number;
  interface: string;
  configPath: string;
}

export function createHostapdState(
  apIface: string,
  configPath: string,
): HostapdState {
  return {
    hostapdProc: null,
    cliProc: null,
    hostapdRestarting: false,
    sawInterfaceDisabled: false,
    probeSendFailStreak: 0,
    interface: apIface,
    configPath: configPath,
  };
}

export interface MultiHostapdState {
  states: Map<string, HostapdState>;
}

export function createMultiHostapdState(): MultiHostapdState {
  return {
    states: new Map(),
  };
}

const PROBE_FAIL_RESTART_THRESHOLD = 25;

export function prepareInterface(apIface: string) {
  runQuiet("rfkill", ["unblock", "wlan"]);

  try {
    const deviceLink = readlinkSync(`/sys/class/net/${apIface}/device`);
    const resolvedDevice = path.resolve(
      `/sys/class/net/${apIface}`,
      deviceLink,
    );
    let cur = resolvedDevice;
    let touched = 0;
    const seen = new Set<string>();
    while (cur.startsWith("/sys/devices") && cur !== "/sys/devices") {
      if (seen.has(cur)) break;
      seen.add(cur);
      const powerDir = `${cur}/power`;
      const hasControl = existsSync(`${powerDir}/control`);
      const hasDelay = existsSync(`${powerDir}/autosuspend_delay_ms`);
      if (hasControl && hasDelay) {
        runQuiet("sh", ["-c", `echo on > ${powerDir}/control`]);
        runQuiet("sh", ["-c", `echo -1 > ${powerDir}/autosuspend_delay_ms`]);
        if (existsSync(`${powerDir}/autosuspend`)) {
          runQuiet("sh", ["-c", `echo -1 > ${powerDir}/autosuspend`]);
        }
        svc("wifi").debug(`disabled autosuspend for device ${cur}`);
        touched++;
        if (touched >= 2) break;
      }
      cur = path.dirname(cur);
    }
    if (touched > 0) {
      svc("wifi").debug(`disabled USB autosuspend for ${apIface}`);
    } else {
      svc("wifi").debug("no USB power/control found (non-USB interface?)");
    }
  } catch {
    svc("wifi").debug("could not disable USB autosuspend (non-USB interface?)");
  }

  runQuiet("ip", ["link", "set", apIface, "down"]);
  runQuiet("ip", ["addr", "flush", "dev", apIface]);
  runQuiet("iw", ["dev", apIface, "set", "power_save", "off"]);
  runQuiet("ip", ["link", "set", apIface, "up"]);
  svc("wifi").info(`interface ${apIface} is up`);
}

export function watchHostapdLine(
  state: HostapdState,
  line: string,
  apIface: string,
  restartFn: () => void,
) {
  if (!CONFIG.monitorIfaceFailAndRestart) {
    return;
  }

  const staMatch = line.match(/^STA\s+([0-9a-f:]+)/i);
  if (staMatch) {
    const mac = staMatch[1];
    updateClientFromStation({ mac, interface: apIface });
  }

  if (/AP-STA-CONNECTED/.test(line)) {
    const m = line.match(/AP-STA-CONNECTED\s+([0-9a-f:]+)/i);
    if (m) updateClientFromStation({ mac: m[1], interface: apIface });
  }

  if (/INTERFACE-DISABLED/.test(line)) {
    state.sawInterfaceDisabled = true;
    return;
  }
  if (/INTERFACE-ENABLED/.test(line)) {
    if (state.sawInterfaceDisabled) {
      state.sawInterfaceDisabled = false;
      restartFn();
    }
    return;
  }
  if (/handle_probe_req: send failed/.test(line)) {
    state.probeSendFailStreak++;
    if (state.probeSendFailStreak >= PROBE_FAIL_RESTART_THRESHOLD) {
      state.probeSendFailStreak = 0;
      svc("hostapd").warn(
        `${apIface}: ${PROBE_FAIL_RESTART_THRESHOLD} probe send failures — restarting`
      );
      restartFn();
    }
    return;
  }
}

export function applyApAddressing(apIface: string) {
  runQuiet("ip", ["addr", "flush", "dev", apIface]);
  runQuiet("ip", ["addr", "add", CONFIG.apIp, "dev", apIface]);
  const gatewayIp = CONFIG.apIp.split("/")[0];
  if (CONFIG.serverBind && CONFIG.serverBind !== gatewayIp) {
    runQuiet("ip", ["addr", "add", `${CONFIG.serverBind}/24`, "dev", apIface]);
  }
  runQuiet("ip", ["link", "set", apIface, "up"]);
}

export function startHostapd(
  state: HostapdState,
  hostapdConf: string,
  apIface: string,
  cleaningUp: boolean,
  cleanupFn: (code: number) => void,
  restartFn: () => void,
) {
  state.hostapdProc = spawn("hostapd", [hostapdConf], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  streamToLog(state.hostapdProc.stdout, "hostapd", "debug", svc, (line: string) => {
    writeLog("hostapd", "debug", line);
    watchHostapdLine(state, line, apIface, restartFn);
  });
  streamToLog(
    state.hostapdProc.stderr,
    "hostapd",
    "warn",
    svc,
    (line: string) => {
      writeLog("hostapd", "warn", line);
      watchHostapdLine(state, line, apIface, restartFn);
    },
  );
  state.hostapdProc.on("exit", (code: number) => {
    if (!cleaningUp && !state.hostapdRestarting) {
      svc("hostapd").error(`exited unexpectedly (code ${code})`);
      cleanupFn(1);
    }
  });
}

export async function restartHostapd(
  state: HostapdState,
  hostapdConf: string,
  apIface: string,
  cleaningUp: boolean,
  cleanupFn: (code: number) => void,
  restartFn: () => void,
) {
  if (state.hostapdRestarting || cleaningUp) {
    svc("hostapd").warn(`restart skipped for ${apIface}: already restarting or cleaning up`);
    return;
  }
  state.hostapdRestarting = true;
  state.sawInterfaceDisabled = false;
  state.probeSendFailStreak = 0;
  svc("hostapd").warn(
    `interface stuck / probe send-failed loop detected on ${apIface} — restarting radio + hostapd`,
  );
  try {
    if (state.hostapdProc) {
      try {
        state.hostapdProc.kill("SIGKILL");
      } catch {}
    }
    if (state.cliProc) {
      try {
        state.cliProc.kill("SIGKILL");
      } catch {}
    }
    await sleep(500);
    prepareInterface(apIface);
    applyApAddressing(apIface);
    await sleep(500);
    startHostapd(state, hostapdConf, apIface, cleaningUp, cleanupFn, restartFn);
    await sleep(500);
    if (state.hostapdProc.exitCode === null) {
      svc("hostapd").info(`restarted ${apIface}, pid ${state.hostapdProc.pid}`);
    } else {
      svc("hostapd").error(`restart failed for ${apIface} — hostapd exited on startup`);
    }
  } finally {
    state.hostapdRestarting = false;
  }
}
