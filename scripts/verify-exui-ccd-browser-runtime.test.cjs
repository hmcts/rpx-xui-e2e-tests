const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

async function withGateway(t, check, mutation = null, respond = null, transitioning = null, scope = "exui-ccd-pilot", options = {}) {
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
  if (transitioning) credentials.transitioning = transitioning;
  if (scope === "exui-ccd-event-capability-pilot") {
    delete credentials.denied;
    for (const [name, digit] of [["courtadmin", "2"], ["judge", "3"]])
      credentials[name] = {
        userId: `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`,
        roles: ["caseworker", "caseworker-harness", `caseworker-privatelaw-${name}`],
        headers: { Authorization: `Bearer synthetic-${name}` },
      };
  }
  global.fetch = async (url, options) => {
    upstream.push({ url, options });
    if (respond) return respond(url, options);
    return new Response('{"upstream":"unchanged"}', {
      status: 207,
      headers: { "content-type": "application/vnd.ccd-proof+json" },
    });
  };
  const server = await startCcdGateway(output, credentials, mutation, scope, options);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    global.fetch = originalFetch;
    fs.rmSync(output, { recursive: true, force: true });
  });
  const request = (
    method,
    route,
    persona = "allowed",
    payload = { data: { retained: "value" } },
  ) =>
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
      req.end(method === "POST" ? JSON.stringify(payload) : undefined);
    });
  await check({ request, upstream, output });
}

test("workbasket navigation is derived from the imported CCD case type", async (t) => {
  const observed = { id: "HarnessResultsPRL", name: "Harness result columns", jurisdiction: { id: "HARNESS", name: "Disposable Harness" }, states: [{ id: "Created", name: "Created" }] };
  await withGateway(t, async ({ request, upstream }) => {
    const response = await request("GET", "/aggregated/caseworkers/11111111-1111-4111-8111-111111111111/jurisdictions");
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), [{ id: "HARNESS", name: "Disposable Harness", caseTypes: [{ id: "HarnessResultsPRL", name: "Harness result columns", states: observed.states }] }]);
    assert.equal(upstream.length, 1);
    assert.equal(upstream[0].url, "http://127.0.0.1:4451/api/data/case-type/HarnessResultsPRL");
    assert.equal((await request("GET", "/refdata/external/v1/organisations")).status, 200);
    const search = await request("POST", "/internal/searchCases?ctid=HarnessResultsPRL&use_case=WORKBASKET&view=WORKBASKET&page=1");
    assert.equal(search.status, 200);
    assert.deepEqual(JSON.parse(search.body), { headers: [{ fields: [] }], total: 0, cases: [] });
    assert.equal(upstream.length, 1);
  }, null, (url) => new Response(JSON.stringify(observed), { status: 200, headers: { "content-type": "application/json" } }), null, "exui-ccd-pilot", { workbasket: true });
});

test("workbasket fault removes one real CCD input before the candidate consumes it", async (t) => {
  const observed = { id: "HarnessResultsPRL", name: "Harness result columns", jurisdiction: { id: "HARNESS", name: "Disposable Harness" }, states: [{ id: "Created", name: "Created" }] };
  const inputs = { workbasketInputs: [{ field: { id: "dfjArea" } }, { field: { id: "applicantCaseName" } }] };
  await withGateway(t, async ({ request, upstream, output }) => {
    const response = await request("GET", "/data/internal/case-types/HarnessResultsPRL/work-basket-inputs");
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { workbasketInputs: [inputs.workbasketInputs[0]] });
    assert.deepEqual(inputs.workbasketInputs.map(item => item.field.id), ["dfjArea", "applicantCaseName"]);
    assert.equal(upstream.at(-1).url, "http://127.0.0.1:4452/internal/case-types/HarnessResultsPRL/work-basket-inputs");
    assert.equal(JSON.parse(fs.readFileSync(`${output}/fault-actions.jsonl`, "utf8")).removedField, "applicantCaseName");
  }, "ccd-drop-workbasket-field", (url) => new Response(JSON.stringify(url.includes("4451") ? observed : inputs), { status: 200, headers: { "content-type": "application/json" } }), null, "exui-ccd-pilot", { workbasket: true });
});

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
      ["GET", "/internal/case-types/HarnessResultsPRL/work-basket-inputs"],
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
      ["GET", "/internal/case-types/OtherCase/work-basket-inputs"],
      ["POST", "/internal/case-types/HarnessResultsPRL/work-basket-inputs"],
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

test("postal fault removes only optional AddressLine2 on the second recipient and preserves the caller payload", async () => {
  const { losePostalOptionalChild } =
    await import("./lib/exui-ccd-browser-runtime.mjs");
  const body = {
    data: {
      sodAdditionalRecipientsList: [
        {
          id: "first",
          value: {
            serveByPostOrEmail: "post",
            postalInformation: {
              postalAddress: {
                AddressLine1: "first",
                AddressLine2: "keep",
                PostCode: "AB1 2CD",
              },
            },
          },
        },
        {
          id: "second",
          value: {
            serveByPostOrEmail: "post",
            postalInformation: {
              postalAddress: {
                AddressLine1: "second",
                AddressLine2: "lose",
                PostCode: "EF3 4GH",
              },
            },
          },
        },
      ],
      protectedValue: "unchanged",
    },
  };
  const changed = losePostalOptionalChild(body);
  assert.equal(
    body.data.sodAdditionalRecipientsList[1].value.postalInformation
      .postalAddress.AddressLine2,
    "lose",
  );
  assert.equal(
    changed.data.sodAdditionalRecipientsList[0].value.postalInformation
      .postalAddress.AddressLine2,
    "keep",
  );
  assert.equal(
    changed.data.sodAdditionalRecipientsList[1].value.postalInformation
      .postalAddress.AddressLine2,
    undefined,
  );
  assert.equal(
    changed.data.sodAdditionalRecipientsList[1].value.postalInformation
      .postalAddress.AddressLine1,
    "second",
  );
  assert.equal(changed.data.protectedValue, "unchanged");
  const expected = structuredClone(body);
  delete expected.data.sodAdditionalRecipientsList[1].value.postalInformation
    .postalAddress.AddressLine2;
  assert.deepEqual(changed, expected);
  for (const other of [
    { data: {} },
    {
      data: {
        sodAdditionalRecipientsList: [body.data.sodAdditionalRecipientsList[0]],
      },
    },
    {
      data: {
        sodAdditionalRecipientsList: [
          {},
          {
            value: {
              serveByPostOrEmail: "email",
              postalInformation: {
                postalAddress: { AddressLine2: "retained" },
              },
            },
          },
        ],
      },
    },
  ])
    assert.deepEqual(losePostalOptionalChild(other), other);
});

test("support only: postal fault forwards real submission once with one optional child removed, preserving validation, reads and upstream status", async (t) => {
  await withGateway(
    t,
    async ({ request, upstream, output }) => {
      const body = {
        event: { id: "create" },
        event_token: "synthetic-token",
        data: {
          protectedValue: "retained",
          sodAdditionalRecipientsList: [
            {
              id: "first",
              value: {
                serveByPostOrEmail: "post",
                postalInformation: {
                  postalName: "first",
                  postalAddress: {
                    AddressLine1: "first street",
                    AddressLine2: "first suite",
                    PostCode: "SW1A 1AA",
                  },
                },
              },
            },
            {
              id: "second",
              value: {
                serveByPostOrEmail: "post",
                postalInformation: {
                  postalName: "second",
                  postalAddress: {
                    AddressLine1: "second street",
                    AddressLine2: "second suite",
                    PostCode: "M1 1AA",
                  },
                },
              },
            },
          ],
        },
      };
      const validation = await request(
        "POST",
        "/case-types/HarnessNestedPRL/validate",
        "allowed",
        body,
      );
      assert.equal(validation.status, 201);
      assert.deepEqual(JSON.parse(upstream.at(-1).options.body), body);
      const response = await request(
        "POST",
        "/case-types/HarnessNestedPRL/cases",
        "allowed",
        body,
      );
      assert.equal(response.status, 201);
      assert.equal(response.body, '{"id":"1793646213983629"}');
      const expected = structuredClone(body);
      delete expected.data.sodAdditionalRecipientsList[1].value
        .postalInformation.postalAddress.AddressLine2;
      assert.deepEqual(JSON.parse(upstream.at(-1).options.body), expected);
      assert.equal(
        upstream.at(-1).options.headers.authorization,
        "Bearer synthetic-allowed",
      );
      assert.equal(upstream.length, 2);
      await request("GET", "/internal/cases/1793646213983629");
      assert.equal(upstream.at(-1).options.body, undefined);
      const journal = fs
        .readFileSync(path.join(output, "ccd-requests.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.deepEqual(
        journal.map((x) => x.status),
        [201, 201, 201],
      );
      assert.equal(journal[1].mutation, "ccd-drop-postal-optional-child");
      assert.equal(
        body.data.sodAdditionalRecipientsList[1].value.postalInformation
          .postalAddress.AddressLine2,
        "second suite",
      );
    },
    "ccd-drop-postal-optional-child",
    async () =>
      new Response('{"id":"1793646213983629"}', {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
  );
});

test('stale grant fault substitutes only the same revoked actor exact-case read and preserves writes and other actors', async (t) => {
  const { roleTransitionRecord } = await import('./lib/exui-ccd-role-transition.mjs');
  const initial = { userId: '11111111-1111-4111-8111-111111111111', email: 'transitioning-11111111-1111-4111-8111-111111111111@harness.example.com', roles: ['caseworker', 'caseworker-harness', 'caseworker-harness-allowed'], headers: { Authorization: 'Bearer synthetic-transitioning', ServiceAuthorization: 'synthetic-service' } };
  const renewed = { ...initial, roles: ['caseworker', 'caseworker-harness'], headers: { ...initial.headers, Authorization: 'Bearer synthetic-renewed' } };
  await withGateway(t, async ({ request, upstream, output }) => {
    fs.writeFileSync(`${output}/role-transition.json`, JSON.stringify(roleTransitionRecord(initial, renewed, '1793646213983629')), { mode: 0o600 });
    for (const [method, route, persona, expected] of [
      ['GET', '/internal/cases/1793646213983629', 'renewed', 'transitioning'],
      ['GET', '/data/internal/cases/1793646213983629', 'renewed', 'transitioning'],
      ['GET', '/internal/cases/1793646213983630', 'renewed', 'renewed'],
      ['GET', '/internal/cases/1793646213983629', 'allowed', 'allowed'],
      ['POST', '/cases/1793646213983629/events', 'renewed', 'renewed'],
      ['GET', '/internal/profile', 'renewed', 'renewed'],
    ]) {
      assert.equal((await request(method, route, persona)).status, 207);
      assert.equal(upstream.at(-1).options.headers.authorization, `Bearer synthetic-${expected}`);
    }
    const callsBeforeUnknown = upstream.length;
    assert.equal((await request('GET', '/internal/cases/1793646213983629', 'unknown')).status, 502);
    assert.equal(upstream.length, callsBeforeUnknown);
    const faults = fs.readFileSync(`${output}/fault-actions.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(faults.length, 2);
    assert.ok(faults.every(value => value.caseId === '1793646213983629' && value.status === 207 && value.actorId === initial.userId));
    assert.ok(!JSON.stringify(faults).includes('Bearer'));
  }, 'ccd-stale-revoked-bearer', null, initial);
});

test('malformed or wrong-actor transition handoff blocks before any CCD request', async (t) => {
  const { roleTransitionRecord } = await import('./lib/exui-ccd-role-transition.mjs');
  const initial = { userId: '11111111-1111-4111-8111-111111111111', email: 'transitioning-11111111-1111-4111-8111-111111111111@harness.example.com', roles: ['caseworker', 'caseworker-harness', 'caseworker-harness-allowed'], headers: { Authorization: 'Bearer synthetic-transitioning', ServiceAuthorization: 'synthetic-service' } };
  const renewed = { ...initial, roles: ['caseworker', 'caseworker-harness'], headers: { ...initial.headers, Authorization: 'Bearer synthetic-renewed' } };
  await withGateway(t, async ({ request, upstream, output }) => {
    for (const record of [{}, { ...roleTransitionRecord(initial, renewed, '1793646213983629'), credential: { ...renewed, userId: '22222222-2222-4222-8222-222222222222' } }]) {
      fs.writeFileSync(`${output}/role-transition.json`, JSON.stringify(record), { mode: 0o600 });
      assert.equal((await request('GET', '/internal/cases/1793646213983629', 'renewed')).status, 502);
      assert.equal(upstream.length, 0);
    }
  }, 'ccd-stale-revoked-bearer', null, initial);
});


test("event capability routes forward exact source event and actor without a gateway mutation", async t => {
  await withGateway(t, async ({ request, upstream, output }) => {
    // This separate scope must ignore the old revocation protocol entirely.
    fs.writeFileSync(path.join(output, "role-transition.json"), "not a transition record");
    const id = "33333333-3333-4333-8333-333333333333";
    const routes = [
      `/internal/cases/1793646213983629/event-triggers/serviceOfDocuments`,
      `/caseworkers/${id}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/1793646213983629/event-triggers/serviceOfDocuments/token`,
    ];
    for (const route of routes) for (const prefix of ["", "/data"]) {
      const response = await request("GET", `${prefix}${route}?ignore-warning=false`, "judge");
      assert.equal(response.status, 207);
      assert.equal(response.body, '{"upstream":"unchanged"}');
      assert.equal(upstream.at(-1).url, `http://127.0.0.1:4452${route}?ignore-warning=false`);
      assert.equal(upstream.at(-1).options.headers.authorization, "Bearer synthetic-judge");
    }
    const body = { data: { sodAdditionalRecipients: ["additionalRecipients"] }, event: { id: "serviceOfDocuments" } };
    assert.equal((await request("POST", "/data/cases/1793646213983629/events", "judge", body)).status, 207);
    assert.equal(upstream.at(-1).options.body, JSON.stringify(body));
    assert.equal(upstream.at(-1).options.headers.authorization, "Bearer synthetic-judge");
    const count = upstream.length;
    for (const route of [routes[0] + "/extra", routes[0].replace("serviceOfDocuments", "update"), routes[1].replace("serviceOfDocuments", "update"), routes[1].replace("serviceOfDocuments", "serviceOfDocumentsExtra")])
      assert.equal((await request("GET", route, "judge")).status, 501);
    assert.equal((await request("POST", routes[0], "judge")).status, 501);
    assert.equal(upstream.length, count);
    assert.equal(fs.existsSync(path.join(output, "fault-actions.jsonl")), false);
    const forwarded = fs.readFileSync(path.join(output, "ccd-requests.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert(forwarded.every(entry => entry.mutation === null));
    assert(forwarded.every(entry => entry.actorId === id));
    assert(!JSON.stringify(forwarded).includes("Bearer"));
    assert(!JSON.stringify(forwarded).includes("synthetic-judge"));
  }, null, null, null, "exui-ccd-event-capability-pilot");
});

test("old CCD gateway does not admit source serviceOfDocuments routes", async t => {
  await withGateway(t, async ({ request, upstream }) => {
    for (const route of [
      "/internal/cases/1793646213983629/event-triggers/serviceOfDocuments",
      "/caseworkers/11111111-1111-4111-8111-111111111111/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/1793646213983629/event-triggers/serviceOfDocuments/token",
    ]) for (const prefix of ["", "/data"]) assert.equal((await request("GET", prefix + route)).status, 501);
    assert.equal(upstream.length, 0);
  });
});

test("source actor sessions require exact observed roles and definition faults cannot run in the gateway", async t => {
  const { seedCcdSession, startCcdGateway } = await import("./lib/exui-ccd-browser-runtime.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-actor-session-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const credential = { userId: "33333333-3333-4333-8333-333333333333", email: "judge@harness.example.com", headers: { Authorization: "Bearer synthetic-judge" } };
  assert.throws(() => seedCcdSession("judge", credential, root), /CCD_SOURCE_ACTOR_ROLES_REQUIRED/);
  for (const roles of [["caseworker", "caseworker-harness"], ["caseworker", "caseworker-harness", "caseworker-harness-allowed"], ["caseworker", "caseworker-harness", "caseworker-privatelaw-courtadmin"]])
    assert.throws(() => seedCcdSession("judge", { ...credential, roles }, root), /CCD_SOURCE_ACTOR_ROLES_REQUIRED/);
  const roles = ["caseworker", "caseworker-harness", "caseworker-privatelaw-judge"];
  seedCcdSession("judge", { ...credential, roles }, root);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "harness-ccd-judge.json"))).passport.user.userinfo.roles, roles);
  const readonlyRoles = ["caseworker", "caseworker-harness", "caseworker-privatelaw-readonly"];
  assert.throws(() => seedCcdSession("readonly", credential, root), /CCD_SOURCE_ACTOR_ROLES_REQUIRED/);
  assert.throws(() => seedCcdSession("readonly", { ...credential, roles }, root), /CCD_SOURCE_ACTOR_ROLES_REQUIRED/);
  assert.throws(() => seedCcdSession("readonly", { ...credential, roles: [...readonlyRoles, "caseworker-harness-allowed"] }, root), /CCD_SOURCE_ACTOR_ROLES_REQUIRED/);
  seedCcdSession("readonly", { ...credential, roles: readonlyRoles }, root);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "harness-ccd-readonly.json"))).passport.user.userinfo.roles, readonlyRoles);
  assert.equal(fs.existsSync(path.join(root, "harness-ccd-observer.json")), false);
  for (const [mutation, scope, message] of [
    ["ccd-enable-judge-event", "exui-ccd-event-capability-pilot", /CCD_DEFINITION_FAULT_NOT_GATEWAY_MUTATION/],
    [null, "unknown-scope", /CCD_GATEWAY_SCOPE_REQUIRED/],
  ]) {
    let accidentallyStarted;
    try {
      await assert.rejects(async () => { accidentallyStarted = await startCcdGateway(root, {}, mutation, scope); }, message);
    } finally {
      if (accidentallyStarted) await new Promise(resolve => accidentallyStarted.close(resolve));
    }
  }
});
