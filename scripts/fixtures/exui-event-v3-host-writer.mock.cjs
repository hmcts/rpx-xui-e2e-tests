const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
// Unit-only bytes/terminal fixtures: deliberately lack domain observations and cannot pass domain replay.
exports.eventV3WriterFixture = async (t, id = "baseline") => {
  const api = await import(
      process.env.EXUI_V3_WRITER_UNDER_TEST ||
        "../lib/exui-event-v3-host-writer.mjs"
    ),
    { getReleasePolicy } = await import("../lib/exui-release-policy.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "v3-writer-unit-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, id));
  const input = {
    runId: "ccd-11111111-1111-4111-8111-111111111111",
    releaseScopeId: "exui-ccd-event-capability-pilot",
    nativeRuntime: { imageId: "sha256:" + "a".repeat(64) },
    browserRuntimeImage: "sha256:" + "b".repeat(64),
    ccd: {
      owner: "harness-" + "c".repeat(16),
      namespace: "1".repeat(64),
      containers: { database: "1".repeat(64) },
    },
  };
  const put = (name, value) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), JSON.stringify(value));
  };
  const groups = api.eventV3ArtifactGroups(id);
  for (const name of groups.readbacks)
    put(id + "/" + name, { synthetic: true });
  const mutations = getReleasePolicy(input.releaseScopeId).mutationDefinitions,
    mutation = mutations.find((row) => row.mutationId === id),
    ordinal = id === "baseline" ? 0 : api.EVENT_V3_IDS.indexOf(id) + 1;
  const tests = (mutation ? [mutation] : mutations).map((row) => ({
    proofId: mutation ? row.mutantProofId : row.baselineProofId,
    status: mutation ? "failed" : "passed",
    retry: 0,
    expectedStatus: "passed",
    unattributedErrors: 0,
    ...(mutation ? { failureId: row.expectedFailureId } : {}),
  }));
  const manifest = {
    harnessCommit: "f".repeat(40),
    releaseScopeId: input.releaseScopeId,
    policyDigest: "sha256:" + "c".repeat(64),
    runtimeMetadata: {
      harnessSourceState: "clean",
      harnessSourceDigest: "sha256:" + "d".repeat(64),
    },
  };
  put(id + "/manifest.json", manifest);
  const context = {
    runId: input.runId,
    invocationId: id,
    identity: { synthetic: true },
    harnessCommit: manifest.harnessCommit,
    releaseScopeId: manifest.releaseScopeId,
    policyDigest: manifest.policyDigest,
    harnessSourceState: "clean",
    harnessSourceDigest: manifest.runtimeMetadata.harnessSourceDigest,
  };
  put(id + "/report.json", {
    schemaVersion: 1,
    complete: true,
    status: ordinal ? "failed" : "passed",
    context,
    tests,
    globalErrors: [],
  });
  put(id + "/framework-terminal.json", { code: ordinal ? 1 : 0, signal: null });
  put(id + "/candidate-write-denial.json", { synthetic: true });
  put(id + "/candidate-lifecycle.json", { synthetic: true });
  const native = ["candidate", "browser-provider"].map((service, index) => ({
    kind: "container",
    service,
    id: String(index + 2).repeat(64),
    name: input.runId + "-" + id + (index ? "-tools" : "-candidate"),
    owner: input.runId,
    namespace: input.ccd.namespace,
    image: index ? input.browserRuntimeImage : input.nativeRuntime.imageId,
    removed: true,
  }));
  put("owned-resources.json", native);
  const terminal = (code) => ({
    started: true,
    observed: true,
    forced: false,
    cancelled: false,
    code,
    signal: null,
  });
  const facts = {
    host: terminal(ordinal ? 1 : 0),
    fixture: terminal(0),
    creators: native.map(({ id, name }) => ({
      id,
      name,
      terminal: terminal(0),
    })),
  };
  const execution = {
    invocationId: id,
    runId: input.runId,
    identity: { synthetic: true },
    resultArtifact: api.pinV3File(root, id + "/report.json"),
    runnerExitCode: ordinal ? 1 : 0,
    unexpectedGlobalErrors: [],
    ...api.captureV3ExecutionArtifacts(root, id),
  };
  put(id + "/execution.json", execution);
  let ack = null,
    proof = null,
    checkpointDigest = "sha256:" + "f".repeat(64);
  if (ordinal) {
    ack = api.writeV3File(root, "v3/" + id + "/ack.json", {
      schemaVersion: 3,
      kind: "ack",
      runId: input.runId,
      invocationId: id,
      ordinal,
      sequence: 3 + (ordinal - 1) * 5,
      capture: {
        path: "synthetic-unit-only",
        digest: "sha256:" + "e".repeat(64),
      },
      token: "11111111-1111-4111-8111-111111111111",
    });
    proof = api.writeV3ProofStart(root, input, id, ack);
    checkpointDigest = null;
  }
  return {
    root,
    id,
    input,
    facts,
    put,
    api,
    execution,
    terminal,
    completionArgs: { ack, proof, checkpointDigest },
  };
};

// Strict serialized lifecycle vertical; domain JSON placeholders deliberately cannot pass semantic replay.
exports.serialParentFixture = async (t) => {
  const f = await require("./exui-event-v3.mock.cjs").eventV3Fixture(t),
    api = await import(
      process.env.EXUI_V3_WRITER_UNDER_TEST ||
        "../lib/exui-event-v3-host-writer.mjs"
    ),
    { selectEventCapabilityRuntime } =
      await import("../lib/exui-ccd-event-transition.mjs"),
    { readEventBaselineCheckpoint } =
      await import("../lib/exui-native-proof-validation.mjs");
  const root = f.directory,
    input = f.read("input.json"),
    expected = f.expected.baselineExpected,
    templates = new Map(),
    events = [],
    tasks = [],
    errors = [];
  let live = 1,
    maxLive = 1,
    stopped = false;
  for (const id of ["baseline", ...api.EVENT_V3_IDS]) {
    const ordinal = id === "baseline" ? 0 : api.EVENT_V3_IDS.indexOf(id) + 1,
      completion = f.completions[ordinal],
      registry = f.read(completion.registry.path);
    const record =
        id === "baseline" ? null : f.read(id + "/runtime-input.json"),
      state =
        id === "baseline"
          ? input
          : selectEventCapabilityRuntime(input, id, record);
    for (const name of api.eventV3ArtifactGroups(id).readbacks)
      if (!fs.existsSync(path.join(root, id, name)))
        f.put(id + "/" + name, { syntheticDomainPlaceholder: true });
    templates.set(id, {
      state,
      record,
      registry,
      execution: f.read(id + "/execution.json"),
      facts: {
        host: f.read(completion.host.path),
        fixture: f.read(completion.fixture.path),
        creators: registry.map(({ name, id }) => ({
          name,
          id,
          terminal: {
            started: true,
            observed: true,
            forced: false,
            cancelled: false,
            code: 0,
            signal: null,
          },
        })),
      },
    });
    for (const name of [
      "v3-readbacks.json",
      "v3-host-terminal.json",
      "v3-fixture-terminal.json",
      "v3-owned-native.json",
      "v3-raw-seal.json",
      "v3-creators.json",
      "v3-absence.json",
    ])
      fs.rmSync(path.join(root, id, name), { force: true });
    if (record) fs.unlinkSync(path.join(root, id, "runtime-input.json"));
  }
  fs.rmSync(path.join(root, "v3"), { recursive: true, force: true });
  const emit = (id) => {
    const item = templates.get(id);
    f.put("owned-resources.json", item.registry);
    f.put(id + "/execution.json", {
      ...item.execution,
      ...api.captureV3ExecutionArtifacts(root, id),
    });
    const ack =
        id === "baseline"
          ? null
          : api.pinV3File(root, "v3/" + id + "/ack.json"),
      proof = ack ? api.writeV3ProofStart(root, item.state, id, ack) : null;
    const checkpointDigest =
      id === "baseline"
        ? readEventBaselineCheckpoint(root, expected).checkpointDigest
        : null;
    const completion = api.writeV3Completion(root, {
      input: item.state,
      id,
      ack,
      proof,
      checkpointDigest,
      facts: item.facts,
    });
    events.push("complete:" + id);
    return completion;
  };
  f.put("independent-preexecution.json", expected);
  emit("baseline");
  const startFault = async (id) => {
    events.push("start:" + id);
    live++;
    maxLive = Math.max(maxLive, live);
    const task = (async () => {
      await api.waitV3Ack(root, input, id, {
        isCancelled: () => stopped || errors.length > 0,
      });
      events.push("ack:" + id);
      emit(id);
    })();
    tasks.push(
      task.catch((error) => {
        errors.push(error);
      }),
    );
    return templates.get(id).record;
  };
  const retire = async (id, state, completion) => {
    events.push("retire:" + id);
    const native = api.readV3File(
      root,
      api.readV3File(root, completion).registry,
    );
    const resources = [
      ...Object.entries(state.ccd.containers).map(([service, cid]) => ({
        name: state.ccd.owner + "-" + service,
        id: cid,
      })),
      ...native.map(({ name, id }) => ({ name, id })),
    ];
    live--;
    const terminal = {
        started: true,
        observed: true,
        forced: false,
        cancelled: false,
        code: 0,
        signal: null,
      },
      missing = { code: 1, signal: null, classification: "no-such-container" };
    return {
      creators: resources.map((row) => ({
        ...row,
        state: "settled",
        terminal,
      })),
      absence: resources.map((row) => ({
        ...row,
        byId: missing,
        byName: missing,
      })),
    };
  };
  return {
    ...f,
    root,
    input,
    expected,
    events,
    startFault,
    retire,
    tasks,
    errors,
    stop: () => {
      stopped = true;
    },
    get maxLive() {
      return maxLive;
    },
  };
};

// Unit-only shape of prepareCiJob + the actual start() return, with no supplied CCD identity.
exports.eventV3PreparedIdentityFixture = async (t) => {
  const os = require("node:os");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "v3-prepared-identity-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { CCD_HARNESS_SOURCE_FILES } =
    await import("../lib/exui-ccd-browser-runtime.mjs");
  const { digestBytes } = await import("../lib/exui-evidence-io.mjs");
  const ROOT = path.resolve(__dirname, "../..");
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(
    path.join(root, "config/default.json"),
    JSON.stringify({ services: { idam: {} }, feature: {} }),
  );
  const digest = "sha256:" + "1".repeat(64);
  const sourceDigest = digestBytes(
    JSON.stringify(
      CCD_HARNESS_SOURCE_FILES.map((p) => [
        p,
        digestBytes(fs.readFileSync(path.join(ROOT, p))),
      ]),
    ),
  );
  const prepared = {
    artifact: { candidateRoot: root, identity: { artifactDigest: digest } },
    commit: "824b0d2753c765f9dce79bf6666109b0544b8e61",
    dependencies: { digest },
    browserDigest: digest,
    sourceDigests: { eventCapability: sourceDigest },
  };
  const baseline = {
    ccd: { images: { data: { id: digest }, definition: { id: digest } } },
    definition: { fixtureDigest: digest },
    definitionImportDigest: digest,
    apiContracts: { data: digest, definition: digest },
    credentials: {},
  };
  const input = {
    harnessSources: CCD_HARNESS_SOURCE_FILES,
    harnessCommit: prepared.commit,
    harnessSourceState: "clean",
    artifact: prepared.artifact,
    harnessDependencies: prepared.dependencies,
    browserDigest: digest,
    harnessSourceDigest: sourceDigest,
    runId: "ccd-11111111-1111-4111-8111-111111111111",
  };
  return { root, ROOT, prepared, baseline, input };
};
