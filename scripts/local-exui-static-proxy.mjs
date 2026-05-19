import { createReadStream, readFileSync } from "node:fs";
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
const sourceTruthPath = path.join(repoRoot, "src", "data", "exui-central-assurance-source.json");
const localXuiConfigPath = path.join(workspaceRoot, "rpx-xui-webapp", "config", "local-ccd-srt.json");
const localAssuranceConfigRoutesEnabled = process.env.EXUI_LOCAL_ASSURANCE_CONFIG_ROUTES !== "0";

const serviceLabels = {
  CIVIL: "Civil",
  CMC: "Civil Money Claims",
  DIVORCE: "Divorce",
  EMPLOYMENT: "Employment",
  FR: "Financial Remedy",
  HRS: "Hearing Recording Storage",
  IA: "Immigration and Asylum",
  PRIVATELAW: "Private Law",
  PROBATE: "Probate",
  PUBLICLAW: "Public Law",
  SSCS: "Social Security and Child Support",
  ST_CIC: "Special Tribunals"
};

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

function readSourceTruthDefaults() {
  const sourceTruth = JSON.parse(readFileSync(sourceTruthPath, "utf8"));
  return sourceTruth.rpxXuiWebapp["config/default.json"];
}

function readLocalXuiConfig() {
  try {
    return JSON.parse(readFileSync(localXuiConfigPath, "utf8"));
  } catch {
    return {};
  }
}

function buildLocalUiConfig() {
  const config = readLocalXuiConfig();
  const services = config.services ?? {};
  const features = config.feature ?? {};
  return {
    accessManagementEnabled: features.accessManagementEnabled ?? true,
    ccdGatewayUrl: services.ccd?.componentApi ?? "http://localhost:3453",
    clientId: services.idam?.idamClientID ?? "xuiwebapp",
    headerConfig: config.headerConfig ?? "preview",
    hearingJurisdictionConfig: services.hearings ?? {},
    idamWeb: services.idam?.idamLoginUrl ?? "http://localhost:8091",
    judicialBookingApi: services.judicialBookingApi ?? "http://localhost:8091",
    launchDarklyClientId: config.secrets?.rpx?.["launch-darkly-client-id"] ?? "local-ccd-srt",
    oAuthCallback: services.idam?.oauthCallbackUrl ?? "/oauth2/callback",
    oidcEnabled: features.oidcEnabled ?? true,
    paymentReturnUrl: services.payment_return_url ?? "http://localhost:8091",
    protocol: config.protocol ?? "http",
    substantiveEnabled: features.substantiveRoleEnabled ?? true,
    waWorkflowApi: services.waWorkflowApi ?? "http://localhost:8091"
  };
}

function buildLocalUserDetails(req) {
  const cookieHeader = req.headers.cookie ?? "";
  const emailMatch = /(?:^|;\s*)__auth__=([^;]+)/.exec(cookieHeader);
  const fallbackEmail = "exui.local.srt@hmcts.net";
  let email = fallbackEmail;
  if (emailMatch?.[1]) {
    try {
      const [, payload] = decodeURIComponent(emailMatch[1]).split(".");
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      email = parsed.email || parsed.sub || fallbackEmail;
    } catch {
      email = fallbackEmail;
    }
  }

  return {
    canShareCases: true,
    userInfo: {
      email,
      family_name: "Assurance",
      given_name: "Central",
      roles: ["caseworker", "caseworker-privatelaw", "caseworker-publiclaw", "caseworker-civil"],
      uid: "exui-central-assurance-user"
    }
  };
}

function buildLocalAssuranceResponse(req, requestUrl) {
  if (!localAssuranceConfigRoutesEnabled) {
    return undefined;
  }

  const urlPath = requestUrl.pathname;
  const defaults = readSourceTruthDefaults();
  if (urlPath === "/external/config/ui" || urlPath === "/external/configuration") {
    return buildLocalUiConfig();
  }
  if (urlPath === "/api/configuration") {
    const config = readLocalXuiConfig();
    const key = requestUrl.searchParams.get("configurationKey");
    if (key) {
      return config.feature?.[key] ?? config[key] ?? false;
    }
    return {
      feature: config.feature ?? {},
      services: config.services ?? {}
    };
  }
  if (urlPath === "/api/user/details") {
    return buildLocalUserDetails(req);
  }
  if (urlPath === "/auth/isAuthenticated") {
    const cookieHeader = req.headers.cookie ?? "";
    return cookieHeader.includes("Idam.Session") || cookieHeader.includes("__auth__");
  }
  if (urlPath === "/api/monitoring-tools") {
    return [];
  }
  if (urlPath === "/api/globalSearch/services") {
    return defaults.globalSearchServices.map((serviceId) => ({
      serviceId,
      serviceName: serviceLabels[serviceId] ?? serviceId
    }));
  }
  if (urlPath === "/api/wa-supported-jurisdiction/get") {
    return defaults.waSupportedJurisdictions;
  }
  if (urlPath === "/api/staff-supported-jurisdiction/get") {
    return defaults.staffSupportedJurisdictions;
  }
  return undefined;
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

function sendJson(res, body) {
  res.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
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

  if (req.method === "GET") {
    const localAssuranceResponse = buildLocalAssuranceResponse(req, requestUrl);
    if (localAssuranceResponse !== undefined) {
      sendJson(res, localAssuranceResponse);
      return;
    }
  }

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
