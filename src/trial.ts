import { CONFIG, svc } from "./config.ts";
import { runQuiet, sleep } from "./utils.ts";

export async function startTrialWatcher(apIface: string, cleaningUp: () => boolean) {
  svc("trial").info(
    `trial mode active: ${CONFIG.trialSeconds}s free internet before captive portal enforcement`,
  );
  const trialGivenMacs = new Set();
  const gatewayIp = CONFIG.apIp.split("/")[0];

  while (!cleaningUp()) {
    try {
      const res = runQuiet("ip", ["neigh", "show", "dev", apIface]);
      const lines = (res.stdout || "").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const ipMatch = trimmed.match(/^([0-9.]+)\s+/);
        const macMatch = trimmed.match(/lladdr\s+([0-9a-fA-F:]+)/);
        if (ipMatch && macMatch) {
          const ip = ipMatch[1];
          const mac = macMatch[1].toLowerCase();
          if (ip.startsWith("192.168.12.") && ip !== gatewayIp) {
            if (!trialGivenMacs.has(mac)) {
              trialGivenMacs.add(mac);
              runQuiet("ipset", [
                "add",
                CONFIG.ipsetName,
                ip,
                "timeout",
                String(CONFIG.trialSeconds),
              ]);
              svc("trial").info(
                `granted ${CONFIG.trialSeconds}s trial access to MAC ${mac} (IP ${ip})`,
              );
            }
          }
        }
      }
    } catch {}
    await sleep(3000);
  }
}
