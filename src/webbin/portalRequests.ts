import { WebBinFunction } from "./WebBinFunction.ts";
import { getPortalRequests } from "../portal-requests.ts";

export class PortalRequestsFunction extends WebBinFunction {
  name = "portalRequests";
  execute() {
    return getPortalRequests();
  }
}
