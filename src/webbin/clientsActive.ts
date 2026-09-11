import { WebBinFunction } from "./WebBinFunction.ts";
import { getActiveClients } from "../client-tracker.ts";

export class ClientsActiveFunction extends WebBinFunction {
  name = "clientsActive";
  execute() {
    return getActiveClients();
  }
}
