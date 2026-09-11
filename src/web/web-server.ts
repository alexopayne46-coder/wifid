import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, writeFileSync } from "node:fs";
import { WEB_CONTROLLER, CONFIG, svc } from "../config.ts";
import { getFunction, listFunctions } from "../webbin/index.ts";

const app = express();
let server: any = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = __dirname;

app.use(express.json());

app.use((req, res, next) => {
  if (req.url.endsWith(".js")) {
    res.setHeader("Content-Type", "application/javascript");
  }
  next();
});

export function startWebController() {
  const controllerAddr =
    typeof WEB_CONTROLLER === "string" ? WEB_CONTROLLER : "0.0.0.0:8125";
  const [host, port] = controllerAddr.split(":");

  app.use(express.static(webDir));

  app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(webDir, "main.html"));
  });

  app.post("/api/bin", async (req: Request, res: Response) => {
    const fn = getFunction(req.body.function);
    if (!fn) {
      res.status(400).json({ ok: false, error: `unknown function: ${req.body.function}` });
      return;
    }
    const result = await fn.handle(req.body.argv || {});
    res.json(result);
  });

  app.get("/api/functions", (req: Request, res: Response) => {
    res.json({ functions: listFunctions() });
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
