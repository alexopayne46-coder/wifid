import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  readFileSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { WEB_CONTROLLER, CONFIG, svc } from "../config.ts";
import { detectBand } from "../config-gen.ts";
import { detectAllWirelessInterfaces } from "../wifi.ts";

const app = express();
let server: any = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = __dirname;

app.use((req, res, next) => {
  if (req.url.endsWith(".js")) {
    res.setHeader("Content-Type", "application/javascript");
  }
  next();
});

function getApInfo() {
  const ssid = (() => {
    if (CONFIG.ssid) return CONFIG.ssid;
    try {
      const content = readFileSync(CONFIG.hostapdConfSrc, "utf8");
      const m = content.match(/^ssid=(.+)$/im);
      return m ? m[1].trim() : "unknown";
    } catch {
      return "unknown";
    }
  })();

  const band = detectBand(CONFIG.hostapdConfSrc);
  const gatewayIp = CONFIG.apIp.split("/")[0];
  const maskedPassword = CONFIG.password
    ? "*".repeat(Math.min(CONFIG.password.length, 20))
    : "(none)";
  const meshIfaces = (() => {
    const raw = String(CONFIG.meshInterfaces || "").trim();
    if (!raw) return [];
    if (raw === "auto") return detectAllWirelessInterfaces();
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  })();

  return {
    ssid,
    password: maskedPassword,
    band,
    bssid: CONFIG.bssid || "(none)",
    gateway: gatewayIp,
    ip: CONFIG.apIp,
    portal: CONFIG.portal,
    open: CONFIG.open,
    mesh: {
      enabled: meshIfaces.length > 0,
      interfaces: meshIfaces,
    },
  };
}

function parseIwStationDump(output: string, iface: string): any[] {
  const clients: any[] = [];
  const lines = output.split("\n");
  let current: any = null;

  for (const line of lines) {
    const stationMatch = line.match(/^Station\s+([0-9a-f:]+)\s+\(on\s+(\S+)\)/i);
    if (stationMatch) {
      if (current) clients.push(current);
      current = { mac: stationMatch[1], interface: stationMatch[2] };
      continue;
    }
    if (!current) continue;

    const signalMatch = line.match(/signal:\s*([-]?\d+)\s*dBm/i);
    if (signalMatch) {
      current.signal = Number(signalMatch[1]);
    }

    const txRateMatch = line.match(/tx bitrate:\s*([\d.]+)\s*MBit\/s/i);
    if (txRateMatch) {
      current.txBitrate = Number(txRateMatch[1]);
    }

    const rxRateMatch = line.match(/rx bitrate:\s*([\d.]+)\s*MBit\/s/i);
    if (rxRateMatch) {
      current.rxBitrate = Number(rxRateMatch[1]);
    }

    const connectedMatch = line.match(/connected time:\s*(\d+)\s*seconds/i);
    if (connectedMatch) {
      current.connectedSeconds = Number(connectedMatch[1]);
    }
  }

  if (current) clients.push(current);
  return clients;
}

function getConnectedClients() {
  const ifaces = detectAllWirelessInterfaces();
  const clients: any[] = [];

  for (const iface of ifaces) {
    try {
      const res = spawnSync("iw", ["dev", iface, "station", "dump"], {
        encoding: "utf8",
        timeout: 5000,
      });
      if (res.status === 0 && res.stdout) {
        clients.push(...parseIwStationDump(res.stdout, iface));
      }
    } catch {}
  }

  return clients;
}

export function startWebController() {
  const controllerAddr =
    typeof WEB_CONTROLLER === "string" ? WEB_CONTROLLER : "0.0.0.0:8125";
  const [host, port] = controllerAddr.split(":");

  app.use(express.static(webDir));

  app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(webDir, "main.html"));
  });

  app.get("/api/status", (req: Request, res: Response) => {
    res.json({ status: "running", uptime: process.uptime() });
  });

  app.get("/api/clients", (req: Request, res: Response) => {
    try {
      const clients = getConnectedClients();
      res.json({ clients });
    } catch (err) {
      res.json({ clients: [], error: String(err) });
    }
  });

  app.get("/api/ap-info", (req: Request, res: Response) => {
    res.json(getApInfo());
  });

  server = app.listen(Number(port), host, () => {
    svc("web").info(`web controller listening on http://${controllerAddr}`);
  });

  return server;
}

export function stopWebController() {
  if (server) {
    server.close();
    server = null;
  }
}
