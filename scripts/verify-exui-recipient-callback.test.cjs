const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const load = () => import("./lib/exui-recipient-callback.mjs");
const fixture = () => import("./lib/exui-recipient-callback-fixture.mjs");
const token = "synthetic-private-ccd-service-token";
const userToken = "synthetic-private-user-bearer";
const callbackPath = "/service-of-documents/validate-additional-recipients";
function body(channel = "email") {
  const recipient = (id, name) => ({
    id,
    value:
      channel === "email"
        ? {
            serveByPostOrEmail: "email",
            emailInformation: {
              emailName: name,
              emailAddress: "probe@harness.example.com",
            },
            postalInformation: null,
          }
        : {
            serveByPostOrEmail: "post",
            postalInformation: {
              postalName: name,
              postalAddress: {
                AddressLine1: "Synthetic callback street",
                PostCode: "SW1A 1AA",
                AddressLine2: null,
              },
            },
            emailInformation: null,
          },
  });
  const details = {
    id: 1234567890123456,
    case_type_id: "HarnessNestedPRL",
    jurisdiction: "HARNESS",
    state: "JUDICIAL_REVIEW",
    case_data: {
      protectedValue: "Synthetic sibling control",
      sodAdditionalRecipients: ["additionalRecipients"],
      sodAdditionalRecipientsList: [
        recipient(
          "11111111-1111-4111-8111-111111111111",
          "HARNESS_CALLBACK_ORIGINAL",
        ),
        recipient(
          "22222222-2222-4222-8222-222222222222",
          "Synthetic sibling recipient",
        ),
      ],
    },
  };
  return {
    event_id: "serviceOfDocuments",
    ignore_warning: false,
    case_details: details,
    case_details_before: {
      ...structuredClone(details),
      case_data: {
        protectedValue: "Synthetic sibling control",
        sodAdditionalRecipientsList: [],
      },
    },
  };
}
async function serve(t, invocationId, options = {}) {
  const api = await load(),
    evidence = [],
    verified = [];
  const configuration = {
    invocationId,
    verifyServiceAuthorization: async (supplied) => {
      verified.push(supplied);
      return supplied === token
        ? "ccd_data"
        : supplied === "webapp-token"
          ? "xui_webapp"
          : null;
    },
    recordEvidence: (record) => {
      evidence.push(record);
    },
    ...options,
  };
  const handler = api.createRecipientCallbackResponder(configuration);
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    api,
    evidence,
    verified,
    configuration,
    port: server.address().port,
    send: (value = body(), extra = {}) =>
      new Promise((resolve, reject) => {
        const bytes = typeof value === "string" ? value : JSON.stringify(value);
        const request = http.request(
          {
            host: "127.0.0.1",
            port: server.address().port,
            path: callbackPath,
            method: "POST",
            ...extra,
            headers: {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(bytes),
              serviceauthorization: token,
              authorization: userToken,
              ...extra.headers,
            },
          },
          (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => (text += chunk));
            response.on("end", () =>
              resolve({ status: response.statusCode, body: JSON.parse(text) }),
            );
          },
        );
        request.on("error", reject);
        request.end(bytes);
      }),
  };
}

test("support only: callback fixture restores only the source Page2 mid-event URL", async () => {
  const api = await fixture();
  const { fixture: restored, binding } = api.deriveRecipientCallbackFixture();
  const { buildEventCapabilityFixtures } =
    await import("./lib/exui-ccd-event-capability.mjs");
  const baseline = buildEventCapabilityFixtures().baseline;
  assert.equal(binding.sourceUrl, "${CCD_DEF_COS_URL}" + callbackPath);
  assert.equal(binding.normalizedUrl, "http://127.0.0.1:3101" + callbackPath);
  assert.equal(binding.pageId, 2);
  assert.equal(binding.stage, "MID_EVENT");
  assert.match(binding.responderSourceDigest, /^sha256:[a-f0-9]{64}$/);
  const row = restored.sheets.CaseEventToFields.find(
    (row) =>
      row.CaseEventID === "serviceOfDocuments" &&
      row.CaseFieldID === "sodAdditionalRecipientsList",
  );
  assert.equal(row.CallBackURLMidEvent, binding.normalizedUrl);
  delete row.CallBackURLMidEvent;
  restored.provenance = baseline.provenance;
  assert.deepEqual(restored, baseline);
  assert.equal(
    baseline.sheets.CaseEventToFields.find(
      (row) =>
        row.CaseEventID === "create" &&
        row.CaseFieldID === "sodAdditionalRecipientsList",
    ).CallBackURLMidEvent,
    undefined,
  );
});

test("support only: callback fixture rejects stage/page/path/condition/source tampering", async () => {
  const api = await fixture();
  for (const change of [
    (value) => (value.binding.pageId = 1),
    (value) => (value.binding.stage = "ABOUT_TO_SUBMIT"),
    (value) => (value.binding.normalizedUrl += "?mode=reject"),
    (value) =>
      (value.binding.responderSourceDigest = "sha256:" + "0".repeat(64)),
    (value) =>
      (value.fixture.sheets.CaseEventToFields.find(
        (row) =>
          row.CaseEventID === "serviceOfDocuments" &&
          row.CaseFieldID === "sodAdditionalRecipientsList",
      ).FieldShowCondition = ""),
  ]) {
    const value = api.deriveRecipientCallbackFixture();
    change(value);
    assert.throws(
      () => api.validateRecipientCallbackFixture(value),
      /CALLBACK_FIXTURE_MISMATCH/,
    );
  }
});

test("support only: HTTP-success business errors remain separate from transport failure and correction succeeds", async (t) => {
  const reject = await serve(t, "recipient-callback-reject");
  const value = body();
  value.case_details.case_data.sodAdditionalRecipientsList[0].value.emailInformation.emailName =
    "HARNESS_CALLBACK_REJECT";
  const rejected = await reject.send(value);
  assert.equal(rejected.status, 200);
  assert.deepEqual(rejected.body.errors, [
    "HARNESS_CALLBACK_BUSINESS_REJECTION",
  ]);
  const corrected = await reject.send(body());
  assert.equal(corrected.status, 200);
  assert.deepEqual(corrected.body.errors, []);
  assert.deepEqual(corrected.body.data, body().case_details.case_data);
  const failure = await serve(t, "recipient-callback-http-error");
  const failed = await failure.send();
  assert.equal(failed.status, 503);
  assert.equal(failed.body.errors, undefined);
  assert.equal(reject.evidence[0].outcome, "business-rejected");
  assert.equal(failure.evidence[0].outcome, "transport-failed");
});
for (const channel of ["email", "post"])
  test(
    "support only: callback normalization preserves sibling data and collection IDs for " +
      channel,
    async (t) => {
      const f = await serve(t, "recipient-callback-normalize"),
        value = body(channel),
        before = structuredClone(value);
      const result = await f.send(value);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.errors, []);
      const expected = structuredClone(value.case_details.case_data),
        first = expected.sodAdditionalRecipientsList[0].value;
      if (channel === "email")
        first.emailInformation.emailName = "HARNESS_CALLBACK_NORMALIZED";
      else first.postalInformation.postalName = "HARNESS_CALLBACK_NORMALIZED";
      assert.deepEqual(result.body.data, expected);
      assert.deepEqual(value, before);
      assert.deepEqual(
        result.body.data.sodAdditionalRecipientsList.map((item) => item.id),
        value.case_details.case_data.sodAdditionalRecipientsList.map(
          (item) => item.id,
        ),
      );
      assert.equal(f.evidence[0].outcome, "normalized");
      assert.equal(f.evidence[0].recipientCount, 2);
    },
  );

test("support only: callback mode is immutable and cannot be request-selected", async (t) => {
  const f = await serve(t, "recipient-callback-normalize");
  f.configuration.invocationId = "recipient-callback-http-error";
  const result = await f.send(body(), {
    headers: { "x-harness-mode": "http-error" },
  });
  assert.equal(result.status, 200);
  assert.equal(
    result.body.data.sodAdditionalRecipientsList[0].value.emailInformation
      .emailName,
    "HARNESS_CALLBACK_NORMALIZED",
  );
  assert.equal(f.evidence[0].invocationId, "recipient-callback-normalize");
  for (const invocationId of ["unknown", "toString", "__proto__"])
    assert.throws(
      () =>
        f.api.createRecipientCallbackResponder({
          ...f.configuration,
          invocationId,
        }),
      /CALLBACK_INVOCATION_REQUIRED/,
    );
});

for (const extra of [
  { path: "/wrong" },
  { path: callbackPath + "?pageId=1" },
  { path: "/service-of-documents/%76alidate-additional-recipients" },
  { method: "GET" },
  { headers: { "content-type": "text/plain" } },
])
  test(
    "support only: callback rejects wrong transport " + JSON.stringify(extra),
    async (t) => {
      const f = await serve(t, "recipient-callback-normalize");
      const result = await f.send(body(), extra);
      assert(result.status >= 400);
      assert.equal(f.evidence[0].requestDigest, null);
    },
  );

for (const change of [
  (value) => (value.event_id = "create"),
  (value) => (value.case_details.case_type_id = "PRLAPPS"),
  (value) => (value.case_details_before.id = "9999999999999999"),
  (value) => delete value.case_details_before,
  (value) =>
    (value.case_details.case_data.sodAdditionalRecipientsList[1].id =
      value.case_details.case_data.sodAdditionalRecipientsList[0].id),
  (value) =>
    (value.case_details.case_data.sodAdditionalRecipientsList[0].value.emailInformation =
      null),
  (value) => value.case_details.case_data.sodAdditionalRecipientsList.pop(),
])
  test("support only: malformed callback structure is a transport error, not business validation", async (t) => {
    const f = await serve(t, "recipient-callback-reject"),
      value = body();
    change(value);
    const result = await f.send(value);
    assert.equal(result.status, 400);
    assert.equal(result.body.errors, undefined);
    assert.equal(f.evidence[0].outcome, "invalid-request");
  });

test("support only: invalid JSON and oversized requests are bounded without raw diagnostic leakage", async (t) => {
  const f = await serve(t, "recipient-callback-normalize");
  assert.equal((await f.send("PRIVATE_BAD_JSON{")).status, 400);
  assert.equal((await f.send("x".repeat(70000))).status, 413);
  assert.doesNotMatch(
    JSON.stringify(f.evidence),
    /PRIVATE_BAD_JSON|synthetic-private|authorization|headers/,
  );
});
for (const headers of [
  { serviceauthorization: "" },
  { serviceauthorization: userToken },
  { serviceauthorization: "webapp-token" },
  { origin: "http://127.0.0.1:3100" },
  { "sec-fetch-site": "same-origin" },
])
  test("support only: browser or non-CCD credentials cannot invoke callback", async (t) => {
    const f = await serve(t, "recipient-callback-normalize");
    const result = await f.send(body(), { headers });
    assert.equal(result.status, 403);
    assert.doesNotMatch(
      JSON.stringify(f.evidence),
      /synthetic-private|webapp-token|authorization|headers/,
    );
  });

test("support only: evidence contains only approved digests and never authorization or raw case values", async (t) => {
  const f = await serve(t, "recipient-callback-normalize");
  await f.send();
  assert.deepEqual(
    Object.keys(f.evidence[0]).sort(),
    [
      "bindingDigest",
      "invocationId",
      "outcome",
      "recipientCount",
      "requestDigest",
      "responseDigest",
      "schemaVersion",
      "sequence",
      "status",
    ].sort(),
  );
  assert.match(f.evidence[0].requestDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(f.evidence[0].responseDigest, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(
    JSON.stringify(f.evidence),
    /Synthetic sibling|1234567890123456|synthetic-private|probe@/,
  );
});

test("support only: verifier and evidence failures are sanitized and cannot return successful normalization", async (t) => {
  const forbidden = await serve(t, "recipient-callback-normalize", {
    verifyServiceAuthorization: async () => {
      throw Error("PRIVATE_AUTH_DIAGNOSTIC");
    },
  });
  const denial = await forbidden.send();
  assert.equal(denial.status, 403);
  assert.doesNotMatch(
    JSON.stringify(forbidden.evidence),
    /PRIVATE_AUTH_DIAGNOSTIC/,
  );
  const missingRecord = await serve(t, "recipient-callback-normalize", {
    recordEvidence: () => {
      throw Error("PRIVATE_SINK_DIAGNOSTIC");
    },
  });
  const failed = await missingRecord.send();
  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, { code: "HARNESS_CALLBACK_EVIDENCE_FAILED" });
});

test("support only: callback uses CCD case_data and numeric reference, not an invented data alias", async (t) => {
  const f = await serve(t, "recipient-callback-normalize");
  for (const change of [
    (value) => (value.case_details.id = String(value.case_details.id)),
    (value) => {
      value.case_details.data = value.case_details.case_data;
      delete value.case_details.case_data;
    },
    (value) => (value.ignore_warning = true),
    (value) => (value.case_details_before.state = "CLOSED"),
    (value) => (value.case_details_before.case_type_id = "OtherType"),
  ]) {
    const value = body();
    change(value);
    assert.equal((await f.send(value)).status, 400);
  }
});

test("support only: repeated callback requests remain immutable transport probes, not exactly-once or persistence proof", async (t) => {
  const f = await serve(t, "recipient-callback-normalize");
  const first = await f.send(),
    second = await f.send();
  assert.deepEqual(second, first);
  assert.deepEqual(
    f.evidence.map((item) => item.sequence),
    [1, 2],
  );
  assert.equal(f.evidence[0].requestDigest, f.evidence[1].requestDigest);
  assert.equal(f.evidence[0].responseDigest, f.evidence[1].responseDigest);
});

test("support only: normalization accepts its emitted value on subsequent page validation without changing siblings or IDs", async (t) => {
  const f = await serve(t, "recipient-callback-normalize"),
    original = body("post");
  const first = await f.send(original);
  const next = structuredClone(original);
  next.case_details.case_data = first.body.data;
  const second = await f.send(next);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.data, first.body.data);
  assert.equal(f.evidence[1].outcome, "normalization-unchanged");
  const reject = await serve(t, "recipient-callback-reject");
  assert.equal((await reject.send(next)).status, 400);
});

test(
  "support only: body deadline stops a client still sending bytes without waiting for request end",
  { timeout: 8000 },
  async (t) => {
    const api = await load(),
      evidence = [];
    const server = http.createServer(
      api.createRecipientCallbackResponder({
        invocationId: "recipient-callback-normalize",
        verifyServiceAuthorization: async () => "ccd_data",
        recordEvidence: (value) => evidence.push(value),
      }),
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const started = Date.now();
    let interval;
    const status = await new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: "127.0.0.1",
          port: server.address().port,
          path: callbackPath,
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": 1000000,
            serviceauthorization: token,
          },
        },
        (response) => {
          response.resume();
          response.on("end", () => {
            clearInterval(interval);
            request.destroy();
            resolve(response.statusCode);
          });
        },
      );
      request.on("error", (error) => {
        clearInterval(interval);
        reject(error);
      });
      request.write("{");
      interval = setInterval(() => request.write(" "), 200);
    });
    assert.equal(status, 408);
    assert(Date.now() - started < 7000);
    assert.equal(evidence[0].outcome, "request-timeout");
    assert.equal(evidence[0].requestDigest, null);
  },
);

test(
  "support only: byte limit responds before an oversized client ends the request",
  { timeout: 2000 },
  async (t) => {
    const f = await serve(t, "recipient-callback-normalize");
    const result = await new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: "127.0.0.1",
          port: f.port,
          path: callbackPath,
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": 1000000,
            serviceauthorization: token,
          },
        },
        (response) => {
          response.resume();
          response.on("end", () => {
            request.destroy();
            resolve(response.statusCode);
          });
        },
      );
      request.on("error", reject);
      request.write("x".repeat(70000));
    });
    assert.equal(result, 413);
    assert.equal(f.evidence[0].outcome, "request-too-large");
  },
);
