const test = require("node:test"),
  assert = require("node:assert/strict");
test("v3 writer exposes finite actual-file groups and has no foreign empty groups", async () => {
  const { eventV3ArtifactGroups } = await import(
    process.env.EXUI_V3_WRITER_UNDER_TEST ||
      "./lib/exui-event-v3-host-writer.mjs"
  );
  const base = eventV3ArtifactGroups("baseline");
  assert.equal(base.readbacks.length, 22);
  assert.equal(base.sharedRoleArtifacts.length, 8);
  assert.equal(base.judgeEventArtifacts.length, 6);
  assert.equal(base.sourceShapeArtifacts.length, 16);
  const shape = eventV3ArtifactGroups("ccd-shape-recipient-collection");
  assert.equal(shape.readbacks.length, 6);
  assert.equal(shape.sharedRoleArtifacts, undefined);
  assert.equal(shape.judgeEventArtifacts, undefined);
  const role = eventV3ArtifactGroups("ccd-remove-courtadmin-recipient-read");
  assert.equal(role.readbacks.length, 5);
  assert.equal(role.judgeEventArtifacts, undefined);
  assert.equal(role.sourceShapeArtifacts, undefined);
  assert.throws(() => eventV3ArtifactGroups("unknown"));
});
const fs = require("node:fs"),
  path = require("node:path"),
  {
    eventV3WriterFixture,
  } = require("./fixtures/exui-event-v3-host-writer.mock.cjs");
test("each fixed invocation seals source bytes and actual finite facts before completion", async (t) => {
  const { EVENT_V3_IDS } = await import(
    process.env.EXUI_V3_WRITER_UNDER_TEST ||
      "./lib/exui-event-v3-host-writer.mjs"
  );
  for (const id of ["baseline", ...EVENT_V3_IDS]) {
    const f = await eventV3WriterFixture(t, id),
      ref = f.api.writeV3Completion(f.root, {
        input: f.input,
        id,
        facts: f.facts,
        ...f.completionArgs,
      });
    const value = f.api.readV3Completion(f.root, ref, f.input, id);
    assert.equal(value.invocationId, id);
    assert.equal(
      f.api.readV3File(f.root, value.readbacks).files.length,
      id === "baseline"
        ? 22
        : id.startsWith("ccd-shape-") || id === "ccd-enable-judge-event"
          ? 6
          : 5,
    );
    assert.throws(() =>
      f.api.writeV3Completion(f.root, {
        input: f.input,
        id,
        facts: f.facts,
        ...f.completionArgs,
      }),
    );
    fs.appendFileSync(path.join(f.root, id, "personas.json"), " ");
    assert.throws(() => f.api.readV3Completion(f.root, ref, f.input, id));
  }
});
test("missing, foreign, aliased, forced and mismatched facts never publish completion", async (t) => {
  for (const fault of [
    "missing",
    "foreign",
    "alias",
    "forced",
    "provider-failure",
    "missing-creator",
    "unremoved",
    "wrong-proof",
  ]) {
    const f = await eventV3WriterFixture(t, "ccd-shape-recipient-collection");
    if (fault === "missing")
      fs.unlinkSync(path.join(f.root, f.id, "personas.json"));
    if (fault === "foreign") {
      f.execution.sharedRoleArtifacts = [];
      f.put(f.id + "/execution.json", f.execution);
    }
    if (fault === "alias") {
      const file = path.join(f.root, f.id, "personas.json");
      fs.renameSync(file, file + ".saved");
      fs.symlinkSync(file + ".saved", file);
    }
    if (fault === "forced") f.facts.host.forced = true;
    if (fault === "provider-failure") f.facts.fixture.code = 137;
    if (fault === "missing-creator") f.facts.creators.pop();
    if (fault === "unremoved") {
      const rows = JSON.parse(
        fs.readFileSync(path.join(f.root, "owned-resources.json")),
      );
      rows[0].removed = false;
      f.put("owned-resources.json", rows);
    }
    if (fault === "wrong-proof") {
      const report = JSON.parse(
        fs.readFileSync(path.join(f.root, f.id, "report.json")),
      );
      report.tests[0].failureId = "foreign-fault";
      f.put(f.id + "/report.json", report);
      f.execution.resultArtifact = f.api.pinV3File(
        f.root,
        f.id + "/report.json",
      );
      f.put(f.id + "/execution.json", f.execution);
    }
    assert.throws(
      () =>
        f.api.writeV3Completion(f.root, {
          input: f.input,
          id: f.id,
          facts: f.facts,
          ...f.completionArgs,
        }),
      undefined,
      fault,
    );
    assert(
      !fs.existsSync(path.join(f.root, "v3", f.id, "completion.json")),
      fault,
    );
  }
});
test("retirement requires all bound creators settled and both exact ID/name absence observations", async (t) => {
  const f = await eventV3WriterFixture(t),
    completion = f.api.writeV3Completion(f.root, {
      input: f.input,
      id: f.id,
      facts: f.facts,
      ...f.completionArgs,
    });
  const native = f.api.readV3File(
    f.root,
    f.api.readV3File(f.root, completion).registry,
  );
  const resources = [
    { name: f.input.ccd.owner + "-database", id: f.input.ccd.namespace },
    ...native.map(({ id, name }) => ({ id, name })),
  ];
  const creators = resources.map((row) => ({
    ...row,
    state: "settled",
    terminal: f.terminal(0),
  }));
  const missing = {
      code: 1,
      signal: null,
      classification: "no-such-container",
    },
    absence = resources.map((row) => ({
      ...row,
      byId: missing,
      byName: missing,
    }));
  for (const changed of [
    creators.slice(1),
    creators.map((row, i) => (i ? row : { ...row, state: "pending" })),
    creators.map((row, i) =>
      i ? row : { ...row, terminal: { ...row.terminal, observed: false } },
    ),
  ])
    assert.throws(() =>
      f.api.writeV3Retirement(f.root, {
        input: f.input,
        id: f.id,
        completion,
        creators: changed,
        absence,
      }),
    );
  assert.throws(() =>
    f.api.writeV3Retirement(f.root, {
      input: f.input,
      id: f.id,
      completion,
      creators,
      absence: absence.map((row, i) =>
        i
          ? row
          : {
              ...row,
              byName: { code: 2, signal: null, classification: "unknown" },
            },
      ),
    }),
  );
  const ref = f.api.writeV3Retirement(f.root, {
    input: f.input,
    id: f.id,
    completion,
    creators,
    absence,
  });
  assert.equal(f.api.readV3File(f.root, ref).kind, "retirement");
});
test("real host invocation optin returns finite observed terminal facts only after cleanup", async (t) => {
  const {
      hostEngineFixture,
    } = require("./fixtures/exui-event-v3-host-engine.mock.cjs"),
    { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const f = hostEngineFixture();
  t.after(f.dispose);
  const observed = await runHostInvocation(f.spec, {
    ...f,
    eventSerialV3: true,
  });
  assert.equal(f.containers.size, 0);
  assert.equal(observed.v3Finalization.host.code, 0);
  assert.equal(observed.v3Finalization.fixture.code, 0);
  assert.equal(observed.v3Finalization.creators.length, 2);
  assert(!JSON.stringify(observed.v3Finalization).includes("Config"));
  assert(!JSON.stringify(observed.v3Finalization).includes("Mounts"));
});
test("real host optin rejects mismatched provider wait instead of emitting completion facts", async (t) => {
  const {
      hostEngineFixture,
    } = require("./fixtures/exui-event-v3-host-engine.mock.cjs"),
    { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const f = hostEngineFixture();
  t.after(f.dispose);
  const actual = f.docker;
  await assert.rejects(
    runHostInvocation(f.spec, {
      ...f,
      eventSerialV3: true,
      docker: (args) =>
        args[0] === "wait" && args[1].startsWith("1") ? "137" : actual(args),
    }),
    /HOST_V3_TERMINAL_REQUIRED/,
  );
  assert.equal(f.containers.size, 0);
});

test("actual v3 prepared-context caller binds independently derived CCD identity before checkpoint capture", async (t) => {
  const {
    eventV3PreparedIdentityFixture,
  } = require("./fixtures/exui-event-v3-host-writer.mock.cjs");
  const { root, ROOT, prepared, baseline, input } =
    await eventV3PreparedIdentityFixture(t);
  const { nativeIdentity } = await import("./lib/exui-native-contract.mjs");
  const { captureCiPhaseExpectation } =
    await import("./lib/exui-candidate-ci-evidence.mjs");
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const { EVENT_CAPABILITY_SCOPE } =
    await import("./lib/exui-ccd-event-capability.mjs");
  const source = fs.readFileSync(
    process.env.EXUI_V3_RUNNER_UNDER_TEST ||
      path.join(__dirname, "run-harness-event-serial-v3.mjs"),
    "utf8",
  );
  const begin = source.indexOf(
    "    context = await prepareCiJob(job, job.output);",
  );
  const end = source.indexOf(
    '    resources.set("eventCapability", phase);',
    begin,
  );
  assert(begin >= 0 && end > begin);
  // Execute the actual caller statements, replacing only prepared/runtime boundaries.
  const actualCaller = new (Object.getPrototypeOf(
    async function () {},
  ).constructor)(
    "prepareCiJob",
    "start",
    "job",
    "phase",
    "nativeIdentity",
    "digestBytes",
    "fs",
    "path",
    "ROOT",
    "EVENT_CAPABILITY_SCOPE",
    "let context;\n" + source.slice(begin, end) + "\nreturn phase.context;",
  );
  const context = await actualCaller(
    async () => prepared,
    async (id) => {
      assert.equal(id, "baseline");
      return baseline;
    },
    { output: root },
    {},
    nativeIdentity,
    digestBytes,
    fs,
    path,
    ROOT,
    EVENT_CAPABILITY_SCOPE,
  );
  const expectedIdentity = nativeIdentity(
    {
      ...baseline,
      artifact: prepared.artifact,
      releaseScopeId: EVENT_CAPABILITY_SCOPE,
      gatewayDigest: digestBytes(
        fs.readFileSync(
          path.join(ROOT, "scripts/lib/exui-ccd-browser-runtime.mjs"),
        ),
      ),
    },
    { mutation: null },
    root,
  ).identity;
  const expected = captureCiPhaseExpectation(
    "eventCapability",
    input,
    { owner: input.runId, mode: "native-separate-api", stagedHarness: root },
    context,
    root,
  );
  assert.deepEqual(expected.identity, expectedIdentity);
  assert.deepEqual(
    JSON.parse(JSON.stringify(expected)).identity,
    expectedIdentity,
  );
  assert.equal(prepared.ccdIdentity, undefined);
  assert.equal(baseline.ccdIdentity, undefined);
});
