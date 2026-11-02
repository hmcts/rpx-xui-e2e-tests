const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

async function withGateway(t, check, mutation = null, respond = null) {
  const { startCcdGateway } =
    await import("./lib/exui-ccd-browser-runtime.mjs");
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "ccd-route-proof-"));
  const originalFetch = global.fetch;
  const upstream = [];
  const credentials = Object.fromEntries(
    ["allowed", "denied", "observer"].map((name) => [
      name,
      {
        userId: "11111111-1111-4111-8111-111111111111",
        headers: { Authorization: `Bearer synthetic-${name}` },
      },
    ]),
  );
  global.fetch = async (url, options) => {
    upstream.push({ url, options });
    if (respond) return respond(url, options);
    return new Response('{"upstream":"unchanged"}', {
      status: 207,
      headers: { "content-type": "application/vnd.ccd-proof+json" },
    });
  };
  const server = await startCcdGateway(output, credentials, mutation);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    global.fetch = originalFetch;
    fs.rmSync(output, { recursive: true, force: true });
  });
  const request = (method, route, persona = "allowed") =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: 3101,
          path: route,
          method,
          agent: false,
          headers: {
            authorization: `Bearer synthetic-${persona}`,
            accept: "application/json",
            experimental: "true",
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString(),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(method === "POST" ? '{"data":{"retained":"value"}}' : undefined);
    });
  await check({ request, upstream, output });
}

test("current rewritten CCD routes and legacy aliases preserve real upstream transport", async (t) => {
  await withGateway(t, async ({ request, upstream, output }) => {
    const caseworker =
      "/caseworkers/11111111-1111-4111-8111-111111111111/jurisdictions/HARNESS/case-types/HarnessNestedPRL";
    const routes = [
      ["GET", "/internal/profile"],
      ["GET", `${caseworker}/event-triggers/create/token`],
      [
        "GET",
        `${caseworker}/cases/1793646213983629/event-triggers/update/token`,
      ],
      ["POST", `${caseworker}/cases`],
      ["GET", "/internal/case-types/HarnessNestedPRL/event-triggers/create"],
      ["GET", "/internal/cases/1793646213983629"],
      ["POST", "/case-types/HarnessNestedPRL/cases"],
      ["POST", "/case-types/HarnessNestedPRL/validate"],
      ["POST", "/cases/1793646213983629/events"],
    ];
    for (const [method, route] of routes) {
      for (const prefix of ["", "/data"]) {
        const response = await request(
          method,
          `${prefix}${route}?ignore-warning=false`,
        );
        assert.equal(response.status, 207);
        assert.equal(response.body, '{"upstream":"unchanged"}');
        assert.equal(
          response.headers["content-type"],
          "application/vnd.ccd-proof+json",
        );
        const forwarded = upstream.at(-1);
        assert.equal(
          forwarded.url,
          `http://127.0.0.1:4452${route}?ignore-warning=false`,
        );
        assert.equal(forwarded.options.method, method);
        assert.equal(
          forwarded.options.headers.authorization,
          "Bearer synthetic-allowed",
        );
        assert.equal(forwarded.options.headers.experimental, "true");
        assert.equal(
          forwarded.options.body,
          method === "POST" ? '{"data":{"retained":"value"}}' : undefined,
        );
        const logged = JSON.parse(
          fs
            .readFileSync(`${output}/ccd-requests.jsonl`, "utf8")
            .trim()
            .split("\n")
            .at(-1),
        );
        assert.equal(logged.path, `/data${route}`);
        assert.equal(logged.receivedPath, `${prefix}${route}`);
        assert.equal(logged.upstreamPath, route);
      }
    }
    const aggregated = "/aggregated/caseworkers/:uid/jurisdictions";
    assert.equal((await request("GET", aggregated)).status, 207);
    assert.equal(
      upstream.at(-1).url,
      "http://127.0.0.1:4452/caseworkers/11111111-1111-4111-8111-111111111111/jurisdictions",
    );
    assert.equal(fs.existsSync(`${output}/unhandled-provider.jsonl`), false);
  });
});

test("CCD gateway rejects malformed, unrelated and unsupported method aliases without upstream calls", async (t) => {
  await withGateway(t, async ({ request, upstream, output }) => {
    const invalid = [
      ["POST", "/internal/profile"],
      ["GET", "/internal/profile/extra"],
      ["GET", "/internal/cases/not-a-case"],
      ["GET", "/internal/cases/1793646213983629/extra"],
      ["GET", "/internal/case-types/OtherCase/event-triggers/create"],
      ["GET", "/internal/case-types/HarnessNestedPRL/event-triggers/delete"],
      ["POST", "/internal/case-types/HarnessNestedPRL/event-triggers/create"],
      ["DELETE", "/cases/1793646213983629/events"],
      [
        "GET",
        "/caseworkers/not-a-user/jurisdictions/HARNESS/case-types/HarnessNestedPRL/event-triggers/create/token",
      ],
      ["GET", "/internal/%63ases/1793646213983629"],
      ["GET", "/internal//cases/1793646213983629"],
      ["GET", "/internal/admin"],
      ["POST", "/internal/../case-types/HarnessNestedPRL/cases"],
      ["POST", "/internal/%2e%2e/case-types/HarnessNestedPRL/cases"],
    ];
    for (const [method, route] of invalid) {
      for (const prefix of ["", "/data"]) {
        const response = await request(method, prefix + route);
        assert.equal(response.status, 501);
        assert.equal(
          JSON.parse(response.body).code,
          "UNDECLARED_CCD_GATEWAY_REQUEST",
        );
      }
    }
    assert.equal(upstream.length, 0);
    assert.equal(
      fs
        .readFileSync(`${output}/unhandled-provider.jsonl`, "utf8")
        .trim()
        .split("\n").length,
      invalid.length * 2,
    );
  });
});

test("rewritten write-then-deny route records the upstream write and both transport paths", async (t) => {
  await withGateway(
    t,
    async ({ request, upstream, output }) => {
      const route = "/cases/1793646213983629/events";
      const writePath =
        "/caseworkers/11111111-1111-4111-8111-111111111111/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/1793646213983629/events";
      const response = await request("POST", route, "denied");
      assert.equal(response.status, 403);
      assert.equal(upstream.length, 2);
      assert.match(
        upstream[0].url,
        /\/cases\/1793646213983629\/event-triggers\/update\/token$/,
      );
      assert.equal(upstream[1].url, `http://127.0.0.1:4452${writePath}`);
      assert.equal(
        upstream[1].options.headers.Authorization,
        "Bearer synthetic-allowed",
      );
      assert.equal(
        JSON.parse(upstream[1].options.body).event_token,
        "synthetic-token",
      );
      const action = JSON.parse(
        fs.readFileSync(`${output}/fault-actions.jsonl`, "utf8"),
      );
      assert.equal(action.status, 201);
      const logged = JSON.parse(
        fs.readFileSync(`${output}/ccd-requests.jsonl`, "utf8"),
      );
      assert.deepEqual(
        {
          path: logged.path,
          receivedPath: logged.receivedPath,
          upstreamPath: logged.upstreamPath,
          status: logged.status,
          faultWriteStatus: logged.faultWriteStatus,
        },
        {
          path: `/data${route}`,
          receivedPath: route,
          upstreamPath: writePath,
          status: 403,
          faultWriteStatus: 201,
        },
      );
    },
    "ccd-write-then-deny",
    async (_url, options) =>
      new Response(
        options.method === "POST"
          ? '{"id":"1793646213983629"}'
          : '{"token":"synthetic-token"}',
        {
          status: options.method === "POST" ? 201 : 200,
          headers: { "content-type": "application/json" },
        },
      ),
  );
});
test("serialization fault drops only nested email children without mutating its source", async () => {
  const { loseNestedChild } =
    await import("./lib/exui-ccd-browser-runtime.mjs");
  const input = {
    data: {
      protectedValue: "retained",
      sodAdditionalRecipientsList: [
        {
          id: "1",
          value: {
            serveByPostOrEmail: "email",
            emailInformation: {
              emailName: "Synthetic",
              emailAddress: "synthetic@example.com",
            },
            postalInformation: { postalName: "retained" },
          },
        },
      ],
    },
  };
  const result = loseNestedChild(input);
  assert.deepEqual(
    result.data.sodAdditionalRecipientsList[0].value.emailInformation,
    { emailName: "Synthetic" },
  );
  assert.equal(
    input.data.sodAdditionalRecipientsList[0].value.emailInformation.emailName,
    "Synthetic",
  );
  assert.equal(
    input.data.sodAdditionalRecipientsList[0].value.emailInformation
      .emailAddress,
    "synthetic@example.com",
  );
  assert.equal(result.data.protectedValue, "retained");
  assert.deepEqual(
    result.data.sodAdditionalRecipientsList[0].value.postalInformation,
    { postalName: "retained" },
  );
  assert.deepEqual(loseNestedChild({ data: {} }), { data: {} });
});
