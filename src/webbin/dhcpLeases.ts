import { WebBinFunction } from "./WebBinFunction.ts";
import { getAllLeases } from "../dhcp-leases.ts";

export class DhcpLeasesFunction extends WebBinFunction {
  name = "dhcpLeases";
  execute() {
    return getAllLeases();
  }
}
