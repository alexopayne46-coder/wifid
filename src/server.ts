import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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

  const handler = (req, res) => {
    const remote = req.socket.remoteAddress || "unknown";
    logger.info(`portal request: ${req.method} ${req.url} from ${remote}`);
    const method = req.method || "GET";
    const url = req.url || "/";

    if (method === "POST" && (url === "/" || url === "/form")) {
      logger.info(`portal POST: ${url} from ${remote}`);
    }

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
  };

  const server = createServer(handler);
  server.listen(port, bindIp, () => {
    logger.info(`portal server listening on http://${bindIp}:${port} (dist: ${distDir})`);
  });
  return server;
}
