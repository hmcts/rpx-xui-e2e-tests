const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const modulePath = path.join(__dirname, "lib/exui-ccd-role-transition.mjs");
async function implementation() {
  const value = fs.existsSync(modulePath)
    ? await import(pathToFileURL(modulePath).href)
    : {};
  assert.equal(
    typeof value.provisionRoleTransitionActor,
    "function",
    "actual simulator identity lifecycle is required",
  );
  return value;
}
const email =
  "transitioning-11111111-1111-4111-8111-111111111111@harness.example.com";
const userId = "22222222-2222-4222-8222-222222222222";
function simulator({
  reuseToken = false,
  wrongId = false,
  retainRole = false,
} = {}) {
  let roles = [],
    token = 0;
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, ...options });
    assert.equal(new URL(url).origin, "http://127.0.0.1:5000");
    assert.equal(options.redirect, "error");
    if (
      url.endsWith("/testing-support/accounts") &&
      options.method === "POST"
    ) {
      const body = JSON.parse(options.body);
      assert.equal(body.email, email);
      roles = body.roles.map((role) => role.code);
      if (retainRole && token > 0) roles.push("caseworker-harness-allowed");
      return Response.json({ uuid: userId });
    }
    if (
      url.includes("/testing-support/accounts?email=") ||
      url.endsWith("/details")
    ) {
      return Response.json({
        id:
          wrongId && token > 0
            ? "33333333-3333-4333-8333-333333333333"
            : userId,
        email,
        roles,
      });
    }
    assert.ok(url.endsWith("/o/token"));
    assert.equal(new URLSearchParams(options.body).get("username"), email);
    token += 1;
    return Response.json({
      access_token: `synthetic-${reuseToken ? 1 : token}`,
    });
  };
  return { fetchImpl, calls };
}
test("identity provisioning rejects malformed synthetic UUID before contacting IDAM", async () => {
  const { provisionRoleTransitionActor } = await implementation();
  let calls = 0;
  await assert.rejects(
    provisionRoleTransitionActor({
      email: `transitioning-${"-".repeat(36)}@harness.example.com`,
      serviceAuthorization: "synthetic-service",
      fetchImpl: async () => {
        calls++;
      },
    }),
    /CCD_TRANSITION_SYNTHETIC_IDENTITY_REQUIRED/,
  );
  assert.equal(calls, 0);
});

test("account creation and role replacement reject missing or mismatched response UUID", async () => {
  const { provisionRoleTransitionActor, revokeRoleTransitionActor } =
    await implementation();
  for (const phase of ["create", "revoke"]) {
    for (const response of [
      {},
      { uid: userId },
      { uuid: "33333333-3333-4333-8333-333333333333" },
    ]) {
      const sim = simulator();
      const initial =
        phase === "revoke"
          ? await provisionRoleTransitionActor({
              email,
              serviceAuthorization: "synthetic-service",
              fetchImpl: sim.fetchImpl,
            })
          : null;
      const fetchImpl = async (url, options) => {
        const observed = await sim.fetchImpl(url, options);
        return url.endsWith("/testing-support/accounts") &&
          options.method === "POST"
          ? Response.json(response)
          : observed;
      };
      await assert.rejects(
        phase === "create"
          ? provisionRoleTransitionActor({
              email,
              serviceAuthorization: "synthetic-service",
              fetchImpl,
            })
          : revokeRoleTransitionActor(initial, { fetchImpl }),
        /CCD_TRANSITION_IDENTITY_MISMATCH/,
      );
    }
  }
});

test("role replacement preserves same actor and acquires a distinct token without restoring the grant", async () => {
  const { provisionRoleTransitionActor, revokeRoleTransitionActor } =
    await implementation();
  const sim = simulator();
  const before = await provisionRoleTransitionActor({
    email,
    serviceAuthorization: "synthetic-service",
    fetchImpl: sim.fetchImpl,
  });
  assert.deepEqual(before.roles, [
    "caseworker",
    "caseworker-harness",
    "caseworker-harness-allowed",
  ]);
  const result = await revokeRoleTransitionActor(before, {
    fetchImpl: sim.fetchImpl,
  });
  assert.equal(result.credential.userId, before.userId);
  assert.deepEqual(result.credential.roles, [
    "caseworker",
    "caseworker-harness",
  ]);
  assert.notEqual(
    result.credential.headers.Authorization,
    before.headers.Authorization,
  );
  assert.deepEqual(result.observations.before.roles, before.roles);
  assert.deepEqual(
    result.observations.afterAccount.roles,
    result.credential.roles,
  );
  assert.deepEqual(
    result.observations.afterAuthentication.roles,
    result.credential.roles,
  );
  assert.equal(result.observations.tokensDistinct, true);
  assert.equal(
    sim.calls.filter(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/testing-support/accounts"),
    ).length,
    2,
  );
  const removal = sim.calls.findIndex(
    (call, index) =>
      index > 0 &&
      call.method === "POST" &&
      call.url.endsWith("/testing-support/accounts"),
  );
  assert.ok(
    !sim.calls
      .slice(removal + 1)
      .some(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith("/testing-support/accounts"),
      ),
  );
  assert.ok(!JSON.stringify(result.observations).includes("Bearer"));
});
for (const [name, fault, code] of [
  [
    "unchanged token",
    { reuseToken: true },
    "CCD_TRANSITION_TOKEN_NOT_DISTINCT",
  ],
  [
    "identity substitution",
    { wrongId: true },
    "CCD_TRANSITION_IDENTITY_MISMATCH",
  ],
  ["retained grant", { retainRole: true }, "CCD_TRANSITION_ROLES_MISMATCH"],
])
  test(`role replacement rejects ${name} before the denial oracle`, async () => {
    const { provisionRoleTransitionActor, revokeRoleTransitionActor } =
      await implementation();
    const normal = simulator();
    const initial = await provisionRoleTransitionActor({
      email,
      serviceAuthorization: "synthetic-service",
      fetchImpl: normal.fetchImpl,
    });
    const sim = simulator(fault);
    // Prime the fake service with the granted actor; its post-replacement response carries the fault.
    await sim.fetchImpl("http://127.0.0.1:5000/testing-support/accounts", {
      method: "POST",
      redirect: "error",
      body: JSON.stringify({
        email,
        roles: initial.roles.map((code) => ({ code })),
      }),
    });
    await sim.fetchImpl("http://127.0.0.1:5000/o/token", {
      method: "POST",
      redirect: "error",
      body: new URLSearchParams({ username: email }).toString(),
    });
    await assert.rejects(
      revokeRoleTransitionActor(initial, { fetchImpl: sim.fetchImpl }),
      new RegExp(code),
    );
  });
test("transition handoff rejects wrong actor, case, roles and token identity", async () => {
  const {
    provisionRoleTransitionActor,
    revokeRoleTransitionActor,
    roleTransitionRecord,
    validateRoleTransition,
  } = await implementation();
  const sim = simulator();
  const initial = await provisionRoleTransitionActor({
    email,
    serviceAuthorization: "synthetic-service",
    fetchImpl: sim.fetchImpl,
  });
  const { credential } = await revokeRoleTransitionActor(initial, {
    fetchImpl: sim.fetchImpl,
  });
  const record = roleTransitionRecord(initial, credential, "1234567812345678");
  assert.deepEqual(validateRoleTransition(record, initial), credential);
  for (const update of [
    { caseId: "bad" },
    { oldTokenDigest: "sha256:" + "0".repeat(64) },
    {
      credential: {
        ...credential,
        userId: "33333333-3333-4333-8333-333333333333",
      },
    },
    { credential: { ...credential, roles: initial.roles } },
    { credential: { ...credential, headers: initial.headers } },
  ])
    assert.throws(
      () => validateRoleTransition({ ...record, ...update }, initial),
      /CCD_TRANSITION_/,
    );
});
test("renewed synthetic session serializes observed roles and never derives the revoked grant", async () => {
  const { seedCcdSession } = await import("./lib/exui-ccd-browser-runtime.mjs");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "ccd-observed-session-"),
  );
  try {
    seedCcdSession(
      "transitioning-renewed",
      {
        userId,
        email,
        roles: ["caseworker", "caseworker-harness"],
        headers: { Authorization: "Bearer synthetic-renewed" },
      },
      directory,
    );
    const actual = JSON.parse(
      fs.readFileSync(
        path.join(directory, "harness-ccd-transitioning-renewed.json"),
      ),
    );
    assert.deepEqual(actual.passport.user.userinfo.roles, [
      "caseworker",
      "caseworker-harness",
    ]);
    assert.equal(
      fs.statSync(
        path.join(directory, "harness-ccd-transitioning-renewed.json"),
      ).mode & 0o777,
      0o600,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("CCD role removal baseline and stale-bearer fault are mandatory in the fixed native policy", async () => {
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { nativeInvocations } = await import("./lib/exui-native-contract.mjs");
  const policy = getReleasePolicy("exui-ccd-pilot");
  assert.ok(
    policy.requiredObligationIds.includes("ccd-role-revocation"),
    "revocation may not be omitted from gate requirements",
  );
  const obligation = policy.obligations.find(
    (item) => item.id === "ccd-role-revocation",
  );
  assert.ok(obligation, "role removal must be a required obligation");
  assert.deepEqual(obligation.requiredProofIds, ["ccd-role-revocation"]);
  assert.deepEqual(obligation.requiredMutationIds, [
    "ccd-stale-revoked-bearer",
  ]);
  assert.equal(
    policy.mutationDefinitions.find(
      (item) => item.mutationId === "ccd-stale-revoked-bearer",
    ).expectedFailureId,
    "revoked-data-isolation",
  );
  assert.ok(
    nativeInvocations("exui-ccd-pilot").some(
      (item) => item.mutation === "ccd-stale-revoked-bearer",
    ),
  );
});
test("revocation invocation is admitted only to native CCD and observer remains outside all app sessions", async (t) => {
  const { toolContainerArguments, candidateArchiveArguments } =
    await import("./lib/exui-oci-runtime.mjs");
  const { seedAppCcdSessions, nativeInvocation } =
    await import("./lib/exui-native-contract.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "revocation-contract-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dirs = Object.fromEntries(
    [
      "harnessRoot",
      "dependenciesRoot",
      "candidateRoot",
      "output",
      "browserRoot",
      "sessions",
      "diagnostics",
    ].map((key) => {
      const value = path.join(root, key);
      fs.mkdirSync(value);
      return [key, value];
    }),
  );
  const guard = path.join(root, "guard.cjs");
  fs.writeFileSync(guard, "readonly");
  const common = {
    ...dirs,
    image: "sha256:" + "a".repeat(64),
    owner: "candidate-11111111-1111-4111-8111-111111111111",
    platform: "linux/arm64",
    invocationId: "ccd-stale-revoked-bearer",
  };
  assert.ok(
    toolContainerArguments({ ...common, native: true }).includes(
      common.invocationId,
    ),
  );
  assert.throws(
    () => toolContainerArguments({ ...common, native: false }),
    /UNSUPPORTED_OCI_INVOCATION/,
  );
  const api = {
    ...common,
    guard,
    namespace: "b".repeat(64),
    config: {},
    releaseScopeId: "exui-ccd-pilot",
    evidenceRoot: dirs.output,
  };
  assert.ok(
    candidateArchiveArguments(api).includes("container:" + "b".repeat(64)),
  );
  assert.throws(
    () =>
      candidateArchiveArguments({
        ...api,
        releaseScopeId: "exui-wa-family-pilot",
      }),
    /CCD_REVOCATION_SCOPE_REQUIRED/,
  );
  assert.throws(
    () =>
      nativeInvocation(
        { releaseScopeId: "exui-wa-family-pilot" },
        common.invocationId,
      ),
    /UNKNOWN_NATIVE_INVOCATION/,
  );
  const actors = { allowed: {}, denied: {}, observer: {}, transitioning: {} };
  const seen = [];
  const sessions = seedAppCcdSessions(actors, (persona) => {
    seen.push(persona);
    return persona;
  });
  assert.deepEqual(seen, ["allowed", "denied", "transitioning"]);
  assert.equal(Object.hasOwn(sessions, "observer"), false);
});
test("curated CCD collection includes the new baseline and selects exactly one role-removal fault proof without execution", async (t) => {
  const { spawnSync } = require("node:child_process");
  const { completeRun } = require("./fixtures/exui-release-evidence.mock.cjs");
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { NATIVE_HARNESS_SOURCE_FILES } =
    await import("./lib/exui-native-sources.mjs");
  for (const source of [
    "scripts/lib/exui-ccd-role-transition.mjs",
    "src/tests/harness/ccd/role-revocation.spec.ts",
  ])
    assert.ok(NATIVE_HARNESS_SOURCE_FILES.includes(source));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "revocation-collection-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { manifest } = completeRun();
  const policy = getReleasePolicy("exui-ccd-pilot");
  Object.assign(manifest, {
    releaseScopeId: policy.releaseScopeId,
    policyDigest: policy.policyDigest,
    requiredObligationIds: policy.requiredObligationIds,
  });
  const file = path.join(root, "manifest.json");
  fs.writeFileSync(file, JSON.stringify(manifest));
  function collect(extra = []) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "../node_modules/@playwright/test/cli.js"),
        "test",
        "--config",
        "playwright.harness.config.ts",
        "--list",
        "--reporter=json",
        ...extra,
      ],
      {
        cwd: path.resolve(__dirname, ".."),
        env: {
          PATH: process.env.PATH,
          EXUI_HARNESS_SELECTION: "ccd",
          EXUI_CANDIDATE_RUN_MANIFEST: file,
          EXUI_CANDIDATE_URL: "http://127.0.0.1:3100",
          EXUI_EVIDENCE_CONTEXT: path.join(root, "context.json"),
          EXUI_EVIDENCE_REPORT: path.join(root, "report.json"),
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const report = JSON.parse(result.stdout),
      specs = [];
    const visit = (suite) => {
      specs.push(...(suite.specs ?? []));
      for (const child of suite.suites ?? []) visit(child);
    };
    for (const suite of report.suites) visit(suite);
    assert.deepEqual(report.errors, []);
    assert.ok(
      specs.every((spec) =>
        spec.tests.every((item) => item.results.length === 0),
      ),
    );
    return specs;
  }
  const baseline = collect();
  assert.equal(baseline.length, 4);
  assert.ok(
    baseline.some((spec) => spec.file.endsWith("case-event-policy.spec.ts")),
  );
  assert.ok(
    baseline.some((spec) => spec.file.endsWith("postal-conditional.spec.ts")),
  );
  const fault = collect(["role-revocation.spec.ts"]);
  assert.equal(fault.length, 1);
  assert.ok(fault[0].file.endsWith("role-revocation.spec.ts"));
});
