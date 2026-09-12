import { WebBinFunction } from "./WebBinFunction.ts";
import { StatusFunction } from "./status.ts";
import { ApInfoFunction } from "./apInfo.ts";
import { SystemInfoFunction } from "./systemInfo.ts";
import { ClientsFunction } from "./clients.ts";
import { ClientsActiveFunction } from "./clientsActive.ts";
import { DnsQueriesFunction } from "./dnsQueries.ts";
import { PortalRequestsFunction } from "./portalRequests.ts";
import { LogsFunction } from "./logs.ts";
import { DhcpLeasesFunction } from "./dhcpLeases.ts";
import { ArgvGetFunction, ArgvSetFunction } from "./argv.ts";
import { ArgvPresetsFunction } from "./presets.ts";
import { StopFunction } from "./stop.ts";
import { InterfacesFunction } from "./interfaces.ts";
import { ClientsByInterfaceFunction } from "./clientsByInterface.ts";

const registry = new Map<string, new () => WebBinFunction>([
  ["status", StatusFunction],
  ["apInfo", ApInfoFunction],
  ["systemInfo", SystemInfoFunction],
  ["clients", ClientsFunction],
  ["clientsActive", ClientsActiveFunction],
  ["dnsQueries", DnsQueriesFunction],
  ["portalRequests", PortalRequestsFunction],
  ["logs", LogsFunction],
  ["dhcpLeases", DhcpLeasesFunction],
  ["argvGet", ArgvGetFunction],
  ["argvSet", ArgvSetFunction],
  ["argvPresets", ArgvPresetsFunction],
  ["stop", StopFunction],
  ["interfaces", InterfacesFunction],
  ["clientsByInterface", ClientsByInterfaceFunction],
]);

export function getFunction(name: string): WebBinFunction | undefined {
  const cls = registry.get(name);
  return cls ? new cls() : undefined;
}

export function listFunctions(): string[] {
  return Array.from(registry.keys());
}
