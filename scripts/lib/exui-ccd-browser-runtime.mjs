import fs from "node:fs";
import http from "node:http";
import { createHmac } from "node:crypto";

export function seedCcdSession(persona, credential) {
  const id = `harness-ccd-${persona}`;
  const token = credential.headers.Authorization.replace(/^Bearer /, "");
  fs.mkdirSync("/tmp/.sessions", { recursive: true });
  fs.writeFileSync(
    `/tmp/.sessions/${id}.json`,
    JSON.stringify({
      cookie: {
        originalMaxAge: null,
        expires: null,
        httpOnly: true,
        path: "/",
        secure: false,
      },
      passport: {
        user: {
          userinfo: {
            id: credential.userId,
            uid: credential.userId,
            email: credential.email,
            forename: "Synthetic",
            surname: persona,
            roles: [
              "caseworker",
              "caseworker-harness",
              `caseworker-harness-${persona}`,
            ],
            roleCategory: "LEGAL_OPERATIONS",
            roleCategories: ["LEGAL_OPERATIONS"],
          },
          tokenset: { accessToken: token, refreshToken: token },
        },
      },
      roleAssignmentResponse: [],
      __lastAccess: Date.now(),
    }),
    { mode: 0o600 },
  );
  return `s:${id}.${createHmac("sha256", "synthetic-session-value").update(id).digest("base64").replace(/=+$/, "")}`;
}

export async function realCcdRequest(route, credential, options = {}) {
  if (!route.startsWith("/") || route.startsWith("//"))
    throw new Error("INVALID_CCD_ROUTE");
  const response = await fetch(`http://127.0.0.1:4452${route}`, {
    ...options,
    headers: { ...credential.headers, ...options.headers },
    redirect: "error",
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

export function loseNestedChild(body) {
  const changed = structuredClone(body);
  const data = changed.data ?? changed.case_data;
  for (const item of data?.sodAdditionalRecipientsList ?? []) {
    if (item.value.emailInformation)
      delete item.value.emailInformation.emailAddress;
  }
  return changed;
}

// This gateway implements path/auth transport only. CCD owns every baseline case/event response.
export async function startCcdGateway(output, credentials, mutation = null) {
  const server = http.createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      let body = Buffer.concat(chunks).toString();
      const url = new URL(request.url, "http://127.0.0.1:3101");
      const actor = Object.values(credentials).find(
        (credential) =>
          credential.headers.Authorization === request.headers.authorization,
      );
      const transportedPath = actor
        ? url.pathname.replace(
            "/caseworkers/:uid/",
            `/caseworkers/${actor.userId}/`,
          )
        : url.pathname;
      const headers = {};
      for (const key of [
        "authorization",
        "serviceauthorization",
        "accept",
        "content-type",
        "experimental",
        "client-context",
      ]) {
        if (request.headers[key]) headers[key] = request.headers[key];
      }
      let target;
      if (url.pathname.startsWith("/data/"))
        target = `http://127.0.0.1:4452${transportedPath.slice(5)}${url.search}`;
      else if (url.pathname.startsWith("/aggregated/"))
        target = `http://127.0.0.1:4452${transportedPath.slice(11)}${url.search}`;
      else if (url.pathname === "/lease") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end(credentials.allowed.headers.ServiceAuthorization);
        return;
      } else if (url.pathname.startsWith("/am/role-assignments/actors/")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"roleAssignmentResponse":[]}');
        return;
      } else if (
        url.pathname.startsWith("/o/") ||
        ["/details", "/userinfo"].includes(url.pathname)
      ) {
        target = `http://127.0.0.1:5000${url.pathname}${url.search}`;
      } else if (
        url.pathname === "/health" ||
        url.pathname === "/health/liveness"
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"status":"UP"}');
        return;
      } else {
        fs.appendFileSync(
          `${output}/unhandled-provider.jsonl`,
          JSON.stringify({ method: request.method, path: url.pathname }) + "\n",
        );
        response.writeHead(501, { "content-type": "application/json" });
        response.end('{"code":"UNDECLARED_CCD_GATEWAY_REQUEST"}');
        return;
      }
      const denied =
        headers.authorization === credentials.denied.headers.Authorization;
      const isWrite =
        request.method === "POST" && /\/(?:cases|events)$/.test(url.pathname);
      if (mutation === "ccd-drop-child" && isWrite && body)
        body = JSON.stringify(loseNestedChild(JSON.parse(body)));
      if (
        mutation === "ccd-broaden-access" &&
        denied &&
        request.method === "GET" &&
        /\/cases\/\d+$/.test(url.pathname)
      )
        headers.authorization = credentials.allowed.headers.Authorization;
      if (mutation === "ccd-write-then-deny" && denied && isWrite) {
        const caseId = url.pathname.match(/\/cases\/(\d+)\/events$/)?.[1];
        if (!caseId) throw new Error("FAULT_REQUIRES_CASE_EVENT");
        const trigger = await realCcdRequest(
          `/caseworkers/${credentials.allowed.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}/event-triggers/update/token`,
          credentials.allowed,
        );
        if (trigger.status !== 200) throw new Error("FAULT_EVENT_START_FAILED");
        const payload = JSON.parse(body);
        payload.event_token = trigger.body.token;
        const written = await realCcdRequest(
          `/caseworkers/${credentials.allowed.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${caseId}/events`,
          credentials.allowed,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        fs.appendFileSync(
          `${output}/fault-actions.jsonl`,
          JSON.stringify({ mutation, caseId, status: written.status }) + "\n",
        );
        if (written.status !== 201) throw new Error("FAULT_WRITE_FAILED");
        fs.appendFileSync(
          `${output}/ccd-requests.jsonl`,
          JSON.stringify({
            method: request.method,
            path: url.pathname,
            status: 403,
            mutation,
            faultWriteStatus: written.status,
          }) + "\n",
        );
        response.writeHead(403, { "content-type": "application/json" });
        response.end('{"status":403,"message":"Forbidden"}');
        return;
      }
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        ...(body ? { body } : {}),
        redirect: "error",
      });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      fs.appendFileSync(
        `${output}/ccd-requests.jsonl`,
        JSON.stringify({
          method: request.method,
          path: url.pathname,
          status: upstream.status,
          mutation,
        }) + "\n",
      );
      response.writeHead(upstream.status, {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      });
      response.end(bytes);
    } catch (error) {
      fs.appendFileSync(
        `${output}/gateway-errors.jsonl`,
        JSON.stringify({ error: error.message }) + "\n",
      );
      response.writeHead(502, { "content-type": "application/json" });
      response.end('{"code":"CCD_GATEWAY_FAILED"}');
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });
  return server;
}
