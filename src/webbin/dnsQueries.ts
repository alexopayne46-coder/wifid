import { WebBinFunction } from "./WebBinFunction.ts";
import { getDnsQueries } from "../dns-queries.ts";

export class DnsQueriesFunction extends WebBinFunction {
  name = "dnsQueries";
  execute() {
    return getDnsQueries();
  }
}
