import { WebBinFunction } from "./WebBinFunction.ts";
import { detectAllWirelessInterfaces } from "../wifi.ts";
import { getConnectedClients } from "./shared.ts";
import { readFileSync, existsSync, readlinkSync } from "node:fs";

function extractIfaceNumber(name: string): string {
  const m = name.match(/(\d+)$/);
  return m ? m[1] : "-";
}

function getDriver(iface: string): string {
  try {
    const driverPath = `/sys/class/net/${iface}/device/driver`;
    if (existsSync(driverPath)) {
      const resolved = readlinkSync(driverPath);
      const parts = resolved.split("/");
      return parts[parts.length - 1] || "unknown";
    }
  } catch {}
  return "-";
}

export class InterfacesFunction extends WebBinFunction {
  name = "interfaces";
  execute() {
    const ifaces = detectAllWirelessInterfaces();
    const clients = getConnectedClients();

    const counts = new Map<string, number>();
    const txByIface = new Map<string, number>();
    const rxByIface = new Map<string, number>();
    for (const c of clients) {
      const iface = c.interface || "";
      counts.set(iface, (counts.get(iface) || 0) + 1);
      if (c.txBitrate != null) txByIface.set(iface, (txByIface.get(iface) || 0) + c.txBitrate);
      if (c.rxBitrate != null) rxByIface.set(iface, (rxByIface.get(iface) || 0) + c.rxBitrate);
    }

    return ifaces.map((name) => ({
      name,
      number: extractIfaceNumber(name),
      clients: counts.get(name) || 0,
      tx: txByIface.get(name) || 0,
      rx: rxByIface.get(name) || 0,
      driver: getDriver(name),
    }));
  }
}
