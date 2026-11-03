import fs from "node:fs";
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  startProviderSeams,
  seedSyntheticSession,
} from "./exui-provider-seams.mjs";
import {
  ROUTING_CASES,
  ROUTING_USER,
  ROUTING_UI_PATH,
  routingAnswers,
  routingQuestions,
  routingJurisdictions,
  routingTrigger,
  routingProfile,
} from "./exui-routing-contract.mjs";

// All routing decisions remain in EXUI. This listener records only actual socket arrivals.
export async function startRoutingProviders(
  output,
  { seed = seedSyntheticSession } = {},
) {
  const servers = [];
  const journal = (entry) =>
    fs.appendFileSync(
      `${output}/routing-destinations.jsonl`,
      JSON.stringify(entry) + "\n",
    );
  const reject = (request, response, body) => {
    fs.appendFileSync(
      `${output}/provider-rejections.jsonl`,
      JSON.stringify({
        code: "UNDECLARED_ROUTING_REQUEST",
        port: request.socket.localPort,
        method: request.method,
        path: request.url,
        body,
      }) + "\n",
    );
    response.writeHead(501, { "content-type": "application/json" });
    response.end('{"code":"UNDECLARED_ROUTING_REQUEST"}');
  };
  async function handle(request, response) {
    try {
      let text = "";
      for await (const chunk of request) text += chunk;
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        return reject(request, response, text);
      }
      const port = request.socket.localPort,
        url = new URL(request.url, `http://127.0.0.1:${port}`);
      const record = {
        port,
        method: request.method,
        path: url.pathname,
        query: [...url.searchParams],
        body,
      };
      if (["GET", "OPTIONS"].includes(request.method) && body !== null)
        return reject(request, response, body);
      let value,
        status = 200,
        type = "application/json";
      const isCentral =
        port === 3101 && url.pathname.startsWith("/central-assignment/noc/");
      const isPcs =
        port === 3102 && url.pathname.startsWith("/pcs-assignment/noc/");
      if (isCentral || isPcs) {
        const prefix = isCentral
          ? "/central-assignment/noc/"
          : "/pcs-assignment/noc/";
        const leaf = url.pathname.slice(prefix.length);
        if (
          request.method === "GET" &&
          isCentral &&
          leaf === "noc-questions" &&
          url.searchParams.size === 1 &&
          [ROUTING_CASES.a, ROUTING_CASES.b].includes(
            url.searchParams.get("case_id"),
          )
        ) {
          value = routingQuestions(url.searchParams.get("case_id"));
        } else if (
          request.method === "POST" &&
          ["verify-noc-answers", "noc-requests"].includes(leaf) &&
          !url.search &&
          [ROUTING_CASES.a, ROUTING_CASES.b].some((id) =>
            isDeepStrictEqual(body, routingAnswers(id)),
          )
        ) {
          value =
            leaf === "verify-noc-answers"
              ? true
              : { result: "synthetic-routing-submit" };
        } else return reject(request, response, body);
      } else if (
        port === 3103 &&
        request.method === "GET" &&
        url.pathname === ROUTING_UI_PATH &&
        url.searchParams.size === 1 &&
        url.searchParams.get("expected_sub") === ROUTING_USER
      ) {
        value = "Synthetic PCS routing destination";
        type = "text/plain";
      } else if (
        port === 3101 &&
        request.method === "GET" &&
        url.pathname ===
          `/aggregated/caseworkers/${ROUTING_USER}/jurisdictions` &&
        url.searchParams.size === 1 &&
        ["create", "read"].includes(url.searchParams.get("access"))
      ) {
        value = routingJurisdictions();
      } else if (
        port === 3101 &&
        request.method === "GET" &&
        url.pathname === "/internal/profile" &&
        !url.search
      ) {
        if (
          request.headers.experimental !== "true" ||
          request.headers.accept !==
            "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-user-profile.v2+json;charset=UTF-8"
        )
          return reject(request, response, body);
        value = routingProfile();
      } else if (
        port === 3101 &&
        request.method === "GET" &&
        /^\/internal\/case-types\/(?:PCS|RoutingUnmapped)\/event-triggers\/(?:routing-local|ext(?::|%3A)routing-create)$/.test(
          url.pathname,
        ) &&
        url.searchParams.size === 1 &&
        url.searchParams.get("ignore-warning") === "false"
      ) {
        if (
          request.headers.experimental !== "true" ||
          request.headers.accept !==
            "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-case-trigger.v2+json;charset=UTF-8"
        )
          return reject(request, response, body);
        value = routingTrigger(
          decodeURIComponent(url.pathname.split("/").at(-1)),
        );
      } else if (
        port === 3101 &&
        url.pathname === "/activity/cases/0/activity" &&
        !url.search &&
        ["GET", "OPTIONS"].includes(request.method) &&
        request.headers.origin === "http://127.0.0.1:3100"
      ) {
        response.setHeader(
          "access-control-allow-origin",
          "http://127.0.0.1:3100",
        );
        response.setHeader("access-control-allow-credentials", "true");
        if (request.method === "OPTIONS") {
          const allowed = ["authorization", "content-type", "experimental"];
          const requested = String(
            request.headers["access-control-request-headers"] ?? "",
          )
            .split(",")
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean);
          if (
            request.headers["access-control-request-method"] !== "GET" ||
            requested.some((x) => !allowed.includes(x))
          )
            return reject(request, response, body);
          response.setHeader("access-control-allow-methods", "GET");
          response.setHeader(
            "access-control-allow-headers",
            requested.join(","),
          );
          status = 204;
          value = "";
        } else value = [];
      } else return reject(request, response, body);
      journal(record);
      response.writeHead(status, { "content-type": type });
      response.end(
        status === 204
          ? undefined
          : type === "text/plain"
            ? value
            : JSON.stringify(value),
      );
    } catch (error) {
      fs.appendFileSync(
        `${output}/gateway-errors.jsonl`,
        JSON.stringify({
          code: "ROUTING_PROVIDER_FAILED",
          message: error.message,
        }) + "\n",
      );
      response.writeHead(502);
      response.end();
    }
  }
  // Reuse the existing narrow auth/refdata provider only for its already-declared routes.
  const central = await startProviderSeams(output);
  const original = central.listeners("request")[0];
  central.removeListener("request", original);
  const basePaths = new Set([
    "/o/.well-known/openid-configuration",
    "/lease",
    "/health",
    "/health/liveness",
  ]);
  central.on("request", (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1:3101").pathname;
    if (
      basePaths.has(pathname) ||
      /^\/am\/role-assignments\/actors\/[a-zA-Z0-9-]+$/.test(pathname)
    )
      return original(request, response);
    return handle(request, response);
  });
  servers.push(central);
  const close = () =>
    Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve, rejectClose) =>
            server.close((error) => (error ? rejectClose(error) : resolve())),
          ),
      ),
    );
  try {
    for (const port of [3102, 3103]) {
      const server = http.createServer(handle);
      await new Promise((resolve, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(port, "127.0.0.1", resolve);
      });
      servers.push(server);
    }
  } catch (error) {
    await close();
    throw error;
  }
  const sessions = {};
  try {
    for (const name of ["primary", "fresh"]) {
      const id = `harness-routing-${randomUUID()}`;
      seed(undefined, id);
      const cookie = `s:${id}.${createHmac("sha256", "synthetic-session-value").update(id).digest("base64").replace(/=+$/, "")}`;
      sessions[name] = { id, cookie };
    }
    fs.writeFileSync(
      `${output}/routing-sessions.json`,
      JSON.stringify(sessions),
    );
  } catch (error) {
    await close();
    throw error;
  }
  return {
    cookie: sessions.primary.cookie,
    server: {
      close: (callback) => {
        close().then(() => callback(), callback);
      },
    },
  };
}
