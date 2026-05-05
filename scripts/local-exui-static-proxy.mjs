import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const workspaceRoot = path.resolve(repoRoot, "..");

const port = Number(process.env.PORT || 3455);
const upstream = new URL(process.env.EXUI_API_URL || "http://localhost:3001");
const root = process.env.EXUI_DIST || path.join(workspaceRoot, "rpx-xui-webapp", "dist", "rpx-exui", "browser");

const proxyPrefixes = [
  "/activity/",
  "/aggregated/",
  "/api/",
  "/api2/",
  "/auth/",
  "/data/",
  "/doc-assembly/",
  "/documents/",
  "/documentsv2/",
  "/em-anno/",
  "/external/",
  "/hearing-recordings/",
  "/health",
  "/icp/",
  "/oauth2/",
  "/print/",
  "/refdata/",
  "/workallocation/"
];

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function shouldProxy(urlPath) {
  return proxyPrefixes.some((prefix) => urlPath === prefix.slice(0, -1) || urlPath.startsWith(prefix));
}

function normaliseStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const cleanPath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return path.join(root, cleanPath === "/" ? "index.html" : cleanPath);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentTypes.get(ext) || "application/octet-stream"
  });
  createReadStream(filePath).pipe(res);
}

function proxy(req, res) {
  const target = new URL(req.url || "/", upstream);
  const localOrigin = `http://localhost:${port}`;
  const headers = { ...req.headers, host: upstream.host };
  const proxyReq = http.request(
    {
      headers,
      hostname: target.hostname,
      method: req.method,
      path: `${target.pathname}${target.search}`,
      port: target.port,
      protocol: target.protocol
    },
    (proxyRes) => {
      const responseHeaders = { ...proxyRes.headers };
      const location = responseHeaders.location;

      if (typeof location === "string") {
        responseHeaders.location = location
          .replaceAll(upstream.origin, localOrigin)
          .replaceAll(encodeURIComponent(upstream.origin), encodeURIComponent(localOrigin));
      }

      res.writeHead(proxyRes.statusCode || 502, responseHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Proxy error: ${error.message}`);
  });

  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://localhost:${port}`);

  if (shouldProxy(requestUrl.pathname)) {
    proxy(req, res);
    return;
  }

  const filePath = normaliseStaticPath(requestUrl.pathname);

  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) {
      sendFile(res, filePath);
      return;
    }
  } catch {
    const hasExtension = Boolean(path.extname(requestUrl.pathname));
    if (hasExtension) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
  }

  sendFile(res, path.join(root, "index.html"));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`EXUI static/proxy runner listening on http://localhost:${port}`);
  console.log(`serving ${root}`);
  console.log(`proxying API calls to ${upstream.origin}`);
});
