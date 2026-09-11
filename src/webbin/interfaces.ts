import { WebBinFunction } from "./WebBinFunction.ts";
import { detectAllWirelessInterfaces } from "../wifi.ts";
import { getConnectedClients } from "./shared.ts";

export class InterfacesFunction extends WebBinFunction {
  name = "interfaces";
  execute() {
    const ifaces = detectAllWirelessInterfaces();
    const clients = getConnectedClients();
    const counts = new Map<string, number>();
    for (const c of clients) {
      counts.set(c.interface, (counts.get(c.interface) || 0) + 1);
    }
    return ifaces.map((name) => ({
      name,
      clients: counts.get(name) || 0,
    }));
  }
}
