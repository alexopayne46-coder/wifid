import { WebBinFunction } from "./WebBinFunction.ts";
import { getConnectedClients } from "./shared.ts";

export class ClientsFunction extends WebBinFunction {
  name = "clients";
  execute() {
    return getConnectedClients();
  }
}
