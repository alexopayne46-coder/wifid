import pino from "pino";
import { parseArgs } from "node:util";

const LEVEL_NAMES: Record<number, string> = {
  10: "Trace",
  20: "Debug",
  30: "Information",
  40: "Warn",
  50: "Error",
  60: "Fatal",
};

const LEVEL_COLORS: Record<number, string> = {
  10: "\x1b[90m",
  20: "\x1b[36m",
  30: "\x1b[32m",
  40: "\x1b[33m",
  50: "\x1b[31m",
  60: "\x1b[35m",
};
const LEVEL_COLOR_RESET = "\x1b[0m";
const TIME_COLOR = "\x1b[90m";
const SERVICE_COLOR = "\x1b[36m";
const SERVICE_COLOR_RESET = "\x1b[0m";

function formatPinoMessage(str) {
  try {
    const log = JSON.parse(str);
    const ms = typeof log.time === "number" ? log.time : Date.now();
    const date = new Date(ms);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const frac = ms % 1000;
    const microsec = String(Math.floor(frac * 1000)).padStart(6, "0");

    const time = `${hours}:${minutes}:${seconds}.${microsec}`;
    const levelName = LEVEL_NAMES[log.level] ?? String(log.level);
    const levelColor = LEVEL_COLORS[log.level] ?? "";
    const levelStr = `<${levelName}>`;

    let msg = typeof log.msg === "string" ? log.msg : "";

    if (log.service === "dnsmasq") {
      msg = msg
        .replace(/^dnsmasq-dhcp:\s*/, "")
        .replace(/^dnsmasq-dns:\s*/, "")
        .replace(/dnsmasq-dhcp:\s*/g, "")
        .replace(/dnsmasq-dns:\s*/g, "")
        .replace(/\(wlp[^)]+\)/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (/^DHCP(DISCOVER|OFFER|REQUEST|ACK|NAK|RELEASE|INFORM)\b/.test(msg)) {
        msg = msg.replace(/\s+/g, " ").trim();
      }
    }

    if (log.service && msg && !msg.startsWith(`${log.service}:`)) {
      msg = `${log.service}: ${msg}`;
    }

    const coloredTime = `${TIME_COLOR}${time}${LEVEL_COLOR_RESET}`;
    const coloredLevel = levelColor ? `${levelColor}${levelStr}${LEVEL_COLOR_RESET}` : levelStr;

    let coloredMsg = msg;
    if (log.service && msg.startsWith(`${log.service}:`)) {
      const rest = msg.slice(log.service.length + 2);
      coloredMsg = `${SERVICE_COLOR}${log.service}${SERVICE_COLOR_RESET}: ${rest}`;
    }

    return `${coloredTime} ${coloredLevel} ${coloredMsg}\n`;
  } catch {
    return str;
  }
}

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    mode: {
      type: "string",
      short: "m",
    },
    trial: {
      type: "string",
      short: "t",
    },
    passthrough: {
      type: "string",
      short: "p",
    },
    dnsOverwrite: {
      type: "string",
      short: "D",
    },
    serverBind: {
      type: "string",
      short: "S",
    },
    ssid: {
      type: "string",
      short: "n",
    },
    bssid: {
      type: "string",
      short: "b",
    },
    password: {
      type: "string",
      short: "w",
    },
    open: {
      type: "boolean",
      short: "o",
    },
    portal: {
      type: "boolean",
      short: "P",
    },
    debug: {
      type: "boolean",
      short: "d",
    },
    help: {
      type: "boolean",
      short: "h",
    },
  },
  strict: false,
});

if (args.help) {
  console.log(`
AP + Captive Portal Launcher

Usage:
  sudo bun run src/ap.ts [options]

Options:
  -m, --mode <auto|tailscale|wire>    AP routing mode (default: auto)
  -t, --trial <seconds>               Trial period in seconds before captive portal enforcement (default: 60, 0 to disable)
  -p, --passthrough <interface>       Local network interface for passthrough/NAT (default: lan)
  -D, --dns-overwrite <file>          YAML file with DNS overwrites (domain: IP)
  -S, --server-bind <ip>              Bind the request-logging server to this IP (default: 192.168.12.1)
  -n, --ssid <name>                   Override the Wi-Fi SSID (default: from hostapd template)
  -b, --bssid <mac>                   Override the BSSID (MAC) of the AP
  -w, --password <pass>               WPA2 passphrase (default: changeme123)
  -o, --open                          Create an open (no password) AP
  -P, --portal                        Enable captive portal only (no internet, trial disabled)
  -d, --debug                         Enable debug logging
  -h, --help                          Show this help message

Environment Variables (fallbacks):
  AP_MODE, TAILSCALE_ONLY, AP_TRIAL_SECONDS, NET_PASSTHROUGH, AP_DNS_OVERWRITE, AP_SERVER_BIND, AP_SSID, AP_BSSID, AP_PASSWORD, AP_OPEN, AP_PORTAL, DEBUG
`);
  process.exit(0);
}

export const netPassthough =
  args.passthrough || process.env.NET_PASSTHROUGH || "lan";
export const AP_MODE =
  args.mode ||
  process.env.AP_MODE ||
  (process.env.TAILSCALE_ONLY === "1" ? "tailscale" : "auto");
export const DEBUG = args.debug ?? process.env.DEBUG === "1";
export const DNS_OVERWRITE =
  args.dnsOverwrite || process.env.AP_DNS_OVERWRITE || "";
export const SERVER_BIND =
  args.serverBind || process.env.AP_SERVER_BIND || "192.168.12.1";
export const AP_SSID = args.ssid || process.env.AP_SSID || "";
export const AP_BSSID = args.bssid || process.env.AP_BSSID || "";
export const AP_PASSWORD = args.open ? "" : args.password || process.env.AP_PASSWORD || "changeme123";
export const AP_OPEN = args.open ?? process.env.AP_OPEN === "1";
export const AP_PORTAL = args.portal ?? process.env.AP_PORTAL === "1";

export const CONFIG = {
  // Prefix shared by the USB Wi-Fi adapter's interface names; the trailing
  // number can change between plug-ins (wlp0s20f0u1, ...u2, ...u3, ...),
  // so we auto-detect whichever one currently exists.
  apIfacePrefix: "wlp0s20f0u",
  apIp: "192.168.12.1/24",
  ssid: AP_SSID,
  bssid: AP_BSSID,
  password: AP_PASSWORD,
  open: AP_OPEN,
  portal: AP_PORTAL,
  hostapdConfSrc: "/etc/hostapd/hostapd.conf",
  dnsmasqConfSrc: "/etc/dnsmasq-ap.conf",
  notifyScript: "/usr/local/bin/hostapd-notify.sh",
  portalPort: "80",
  serverPort: "3000",
  serverBind: SERVER_BIND,
  ipsetName: "authenticated_users",
  ctrlDir: "/var/run/hostapd",
  trialSeconds: Number(args.trial ?? process.env.AP_TRIAL_SECONDS ?? 60),
  dnsOverwrite: DNS_OVERWRITE,
  portalDistDir: "./dist",
};

export const CAPTIVE_PORTAL_DNS_DOMAINS = [
  "connectivitycheck.gstatic.com",
  "clients3.google.com",
  "captcha.apple.com",
  "apple.com",
  "msftconnecttest.com",
  "www.msftconnecttest.com",
  "detectportal.firefox.com",
];

export const logger = pino({
  level: DEBUG ? "debug" : "info",
  hooks: {
    streamWrite: formatPinoMessage,
  },
});

export const KEY = "\x1b[1;36m"; // cyan, used only for highlighted values
export const RESET = "\x1b[0m";
export const hl = (v) => `${KEY}${v}${RESET}`;
export const svc = (name) => logger.child({ service: name });
