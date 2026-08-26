import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const PORTAL_REDIRECT = `<html><body><h1>Hello World!</h1></body></html>`;
const CAPTIVE_PORTAL_PATHS = new Set([
  "/generate_204",
  "/library/test/success.html",
  "/connecttest.txt",
  "/form",
]);

export function startRequestLogger(bindIp, ports, logger) {
  const handler = (req, res) => {
    const remote = req.socket.remoteAddress || "unknown";
    logger.info(`request: ${req.method} ${req.url} from ${remote}`);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("logged");
  };

  const servers = ports.map((port) => {
    const server = createServer(handler);
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        const ss = spawnSync("ss", ["-tlnp", `sport = :${port}`], {
          encoding: "utf8",
        });
        logger.error(
          `port ${port} (${bindIp}) is already in use. Occupying process:`,
        );
        const lines = (ss.stdout || "").trim().split("\n").filter(Boolean);
        if (lines.length >= 2) {
          for (const line of lines.slice(1)) {
            logger.error(`  ${line.trim()}`);
          }
        } else {
          logger.error(
            `  (could not identify process — try: sudo ss -tlnp 'sport = :${port}')`,
          );
        }
        logger.error(`to free the port: sudo kill $(lsof -ti :${port}) 2>/dev/null || sudo fuser -k ${port}/tcp`);
        server.close();
        process.exit(1);
      } else {
        logger.error(`server error: ${err.message}`);
        process.exit(1);
      }
    });
    server.listen(port, bindIp, () => {
      logger.info(`request logger listening on http://${bindIp}:${port}`);
    });
    return server;
  });

  return {
    close: () => {
      for (const s of servers) {
        try {
          s.close();
        } catch {}
      }
    },
  };
}

export function startPortalServer(bindIp, port, distDir, logger) {
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  const indexPath = `${distDir}/index.html`;
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, PORTAL_REDIRECT);
    logger.info(`created ${indexPath} with default Hello World page`);
  }

  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };

  function sendPortalResponse(req, res, method, url, bindIp, port, distDir, logger) {
    const pathname = url.split("?")[0];

    if (CAPTIVE_PORTAL_PATHS.has(pathname)) {
      res.writeHead(302, {
        Location: `http://${bindIp}:${port}/`,
        "Content-Type": "text/html",
      });
      res.end(PORTAL_REDIRECT);
      logger.debug(`portal redirect: ${method} ${pathname} -> / (302)`);
      return;
    }

    let filePath = `${distDir}${pathname}`;
    if (pathname === "/") filePath = `${distDir}/index.html`;

    try {
      const content = readFileSync(filePath);
      const ext = pathname === "/" ? ".html" : pathname.slice(pathname.lastIndexOf("."));
      const contentType = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }

  const handler = (req, res) => {
    const remote = req.socket.remoteAddress || "unknown";
    const method = req.method || "GET";
    const url = req.url || "/";
    logger.info(`portal request: ${method} ${url} from ${remote}`);

    if (method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const entry = {
          ts: new Date().toISOString(),
          ip: remote,
          url: url,
          headers: req.headers,
          body: body,
        };
        try {
          appendFileSync("forms.jsonl", JSON.stringify(entry) + "\n");
          logger.info(`form saved: ${url} from ${remote} (${body.length} bytes)`);
        } catch (err) {
          logger.error(`failed to save form: ${err.message}`);
        }
        sendPortalResponse(req, res, method, url, bindIp, port, distDir, logger);
      });
      return;
    }

    sendPortalResponse(req, res, method, url, bindIp, port, distDir, logger);
  };

  const server = createServer(handler);
  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      const ss = spawnSync("ss", ["-tlnp", `sport = :${port}`], {
        encoding: "utf8",
      });
      logger.error(
        `portal port ${port} (${bindIp}) is already in use. Occupying process:`,
      );
      const lines = (ss.stdout || "").trim().split("\n").filter(Boolean);
      if (lines.length >= 2) {
        for (const line of lines.slice(1)) {
          logger.error(`  ${line.trim()}`);
        }
      } else {
        logger.error(
          `  (could not identify process — try: sudo ss -tlnp 'sport = :${port}')`,
        );
      }
      logger.error(`to free the port: sudo kill $(lsof -ti :${port}) 2>/dev/null || sudo fuser -k ${port}/tcp`);
      server.close();
      process.exit(1);
    } else {
      logger.error(`server error: ${err.message}`);
      process.exit(1);
    }
  });
  server.listen(port, bindIp, () => {
    logger.info(`portal server listening on http://${bindIp}:${port} (dist: ${distDir})`);
  });
  return server;
}
