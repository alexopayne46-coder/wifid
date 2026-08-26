import { readFileSync, writeFileSync } from "node:fs";
import { CONFIG, hl, svc, CAPTIVE_PORTAL_DNS_DOMAINS } from "./config.ts";

function parseDnsOverwriteYaml(filePath) {
  const records = [];
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const domain = line.slice(0, colonIdx).trim();
    const ip = line.slice(colonIdx + 1).trim();
    if (domain && ip) {
      records.push({ domain, ip });
    }
  }
  return records;
}

export function detectBand(src) {
  try {
    const content = readFileSync(src, "utf8");
    const m = content.match(/^hw_mode\s*=\s*([a-z0-9]+)/im);
    if (!m) return "unknown";
    const v = m[1].toLowerCase();
    if (v === "a") return "5 GHz";
    if (v === "g" || v === "b") return "2.4 GHz";
    if (v === "ad") return "60 GHz";
    return v;
  } catch {
    return "unknown";
  }
}

export function appendDnsOverwrites(confPath, yamlPath) {
  const records = parseDnsOverwriteYaml(yamlPath);
  if (records.length === 0) return [];
  let content = readFileSync(confPath, "utf8");
  for (const { domain, ip } of records) {
    const entry = `address=/${domain}/${ip}`;
    if (!content.includes(entry)) {
      content = content.trimEnd() + `\n${entry}\n`;
    }
  }
  writeFileSync(confPath, content);
  svc("dnsmasq").info(
    `applied ${hl(String(records.length))} DNS overwrite(s) from ${hl(yamlPath)}`,
  );
  return records;
}

export function applyCaptivePortalDnsOverwrites(confPath) {
  const gatewayIp = CONFIG.apIp.split("/")[0];
  let content = readFileSync(confPath, "utf8");
  let added = 0;
  for (const domain of CAPTIVE_PORTAL_DNS_DOMAINS) {
    const entry = `address=/${domain}/${gatewayIp}`;
    if (!content.includes(entry)) {
      content = content.trimEnd() + `\n${entry}\n`;
      added++;
    }
  }
  writeFileSync(confPath, content);
  if (added > 0) {
    svc("dnsmasq").info(
      `applied ${hl(String(added))} captive portal DNS overwrite(s) -> ${hl(gatewayIp)}`,
    );
  }
}

export function prepareRuntimeConf(src, out, label, AP_IFACE) {
  let content;
  try {
    content = readFileSync(src, "utf8");
  } catch {
    svc(label).error(`template ${hl(src)} not found!`);
    process.exit(1);
  }
  const ifaceLine = `interface=${AP_IFACE}`;
  content = /^interface=.*$/m.test(content)
    ? content.replace(/^interface=.*$/m, ifaceLine)
    : content.trimEnd() + `\n${ifaceLine}\n`;
   if (label === "hostapd") {
     if (!/^ctrl_interface=.*$/m.test(content)) {
       content = content.trimEnd() + `\nctrl_interface=/var/run/hostapd\n`;
     }
     if (!/^nohwcrypt=.*$/m.test(content)) {
      let supported = false;
      try {
        const help = runQuiet("hostapd", ["-h"]).stdout || "";
        supported = /nohwcrypt/.test(help);
      } catch {
        supported = false;
      }
      if (supported) {
        content = content.trimEnd() + "\nnohwcrypt=1\n";
        svc(label).debug("added nohwcrypt=1 (driver hwcrypt offload disabled)");
      } else {
        svc(label).debug(
          "skipping nohwcrypt=1 (not supported by this hostapd build)",
        );
      }
    }
    if (!/^uapsd=.*$/m.test(content)) {
      let uapsdSupported = false;
      try {
        const help = runQuiet("hostapd", ["-h"]).stdout || "";
        uapsdSupported = /uapsd/.test(help);
      } catch {
        uapsdSupported = false;
      }
      if (uapsdSupported) {
        content = content.trimEnd() + "\nuapsd=0\n";
        svc(label).debug("added uapsd=0 (U-APSD power save disabled)");
      } else {
        svc(label).debug(
          "skipping uapsd=0 (not supported by this hostapd build)",
        );
      }
    }
    if (CONFIG.ssid) {
      const line = `ssid=${CONFIG.ssid}`;
      content = /^ssid=.*$/m.test(content)
        ? content.replace(/^ssid=.*$/m, line)
        : content.trimEnd() + `\n${line}\n`;
      svc(label).debug(`ssid overridden -> ${hl(CONFIG.ssid)}`);
    }
    if (CONFIG.bssid) {
      const line = `bssid=${CONFIG.bssid}`;
      content = /^bssid=.*$/m.test(content)
        ? content.replace(/^bssid=.*$/m, line)
        : content.trimEnd() + `\n${line}\n`;
      svc(label).debug(`bssid overridden -> ${hl(CONFIG.bssid)}`);
    }
    if (CONFIG.open) {
      content = content
        .replace(/^wpa_passphrase=.*$/m, "")
        .replace(/^wpa=.*$/m, "wpa=0")
        .replace(/^wpa_key_mgmt=.*$/m, "")
        .replace(/^wpa_pairwise=.*$/m, "");
      if (!/^auth_algs=.*$/m.test(content)) {
        content = content.trimEnd() + "\nauth_algs=1\n";
      }
      svc(label).debug("open (no password) mode enabled");
    }
    if (CONFIG.password) {
      const line = `wpa_passphrase=${CONFIG.password}`;
      content = /^wpa_passphrase=.*$/m.test(content)
        ? content.replace(/^wpa_passphrase=.*$/m, line)
        : content.trimEnd() + `\n${line}\n`;
      if (!/^wpa=.*$/m.test(content)) {
        content =
          content.trimEnd() +
          "\nwpa=2\nwpa_key_mgmt=WPA-PSK\nwpa_pairwise=CCMP\n";
      }
      svc(label).debug("WPA2 passphrase set");
    }
  }
  if (label === "dnsmasq") {
    const gatewayIp = CONFIG.apIp.split("/")[0];
    const dnsOptLine = `dhcp-option=6,${gatewayIp}`;
    content = /^dhcp-option=6,.*$/m.test(content)
      ? content.replace(/^dhcp-option=6,.*$/m, dnsOptLine)
      : content.trimEnd() + `\n${dnsOptLine}\n`;

    const gwOptLine = `dhcp-option=3,${gatewayIp}`;
    content = /^dhcp-option=3,.*$/m.test(content)
      ? content.replace(/^dhcp-option=3,.*$/m, gwOptLine)
      : content.trimEnd() + `\n${gwOptLine}\n`;

    if (!/^except-interface=lo$/m.test(content)) {
      content = content.trimEnd() + "\nexcept-interface=lo\n";
    }
    if (!/^dhcp-authoritative$/m.test(content)) {
      content = content.trimEnd() + "\ndhcp-authoritative\n";
    }
  }
  writeFileSync(out, content);
  svc(label).debug(
    `runtime config written to ${hl(out)} (interface=${hl(AP_IFACE)})`,
  );
}
