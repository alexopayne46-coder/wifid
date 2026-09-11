import { WebBinFunction } from "./WebBinFunction.ts";
import { getConnectedClients } from "./shared.ts";

export class ClientsByInterfaceFunction extends WebBinFunction {
  name = "clientsByInterface";
  execute(argv: Record<string, unknown>) {
    const iface = String(argv.interface || "");
    if (!iface) throw new Error("interface is required");
    const clients = getConnectedClients().filter((c: any) => c.interface === iface);
    return { interface: iface, clients };
  }
}
