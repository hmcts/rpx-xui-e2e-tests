const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sha = (c) => "sha256:" + c.repeat(64);

test("support only: native API gets sealed application and narrow state, with no evidence, source or Docker socket authority", async () => {
  const { candidateArchiveArguments } =
    await import("./lib/exui-oci-runtime.mjs");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "native-api-mounts-"),
  );
  try {
    for (const name of [
      "candidate",
      "sessions",
      "diagnostics",
      "evidence",
      "harness",
    ])
      fs.mkdirSync(path.join(directory, name));
    fs.writeFileSync(
      path.join(directory, "harness/guard.cjs"),
      "guard-fixture",
    );
    const args = candidateArchiveArguments({
      image: sha("a"),
      namespace: "b".repeat(64),
      owner: "candidate-11111111-1111-4111-8111-111111111111",
      invocationId: "baseline",
      candidateRoot: path.join(directory, "candidate"),
      sessions: path.join(directory, "sessions"),
      diagnostics: path.join(directory, "diagnostics"),
      guard: path.join(directory, "harness/guard.cjs"),
      config: {},
      evidenceRoot: path.join(directory, "evidence"),
      harnessRoot: path.join(directory, "harness"),
    });
    const mounts = args.filter((arg) => arg.startsWith("type=bind"));
    assert.equal(mounts.length, 4);
    assert(mounts.some((value) => value.includes("dst=/candidate,readonly")));
    assert(mounts.some((value) => value.includes("dst=/tmp/.sessions")));
    assert(mounts.some((value) => value.includes("dst=/diagnostics")));
    assert(
      mounts.some((value) =>
        value.includes("dst=/harness-network-guard.cjs,readonly"),
      ),
    );
    assert(
      !mounts.some((value) =>
        /dst=\/output|dst=\/harness,|node_modules|docker\.sock/.test(value),
      ),
    );
    assert(
      !mounts.some((value) => value.includes(path.join(directory, "evidence"))),
    );
    assert.equal(args[args.indexOf("--user") + 1], `${process.getuid()}:${process.getgid()}`);
    assert(args.includes("--read-only"));
    assert(args.includes("--init"));
    assert(args.includes("/candidate/runtime/node"));
    assert(args.includes("/candidate/dist/rpx-exui/api/server.bundle.js"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: host refuses candidate write capability before framework evidence can run", async () => {
  const { assertCandidateWriteDenial } =
    await import("./lib/exui-host-invocation.mjs");
  assert.doesNotThrow(() =>
    assertCandidateWriteDenial({
      attempts: [
        { path: "/output/report.json", denied: true },
        { path: "/harness/controller.mjs", denied: true },
      ],
      controllerSourceVisible: false,
    }),
  );
  assert.throws(
    () =>
      assertCandidateWriteDenial({
        attempts: [
          { path: "/output/report.json", denied: false },
          { path: "/harness/controller.mjs", denied: true },
        ],
        controllerSourceVisible: false,
      }),
    /EVIDENCE_AUTHORITY/,
  );
  assert.throws(
    () =>
      assertCandidateWriteDenial({
        attempts: [
          { path: "/output/report.json", denied: true },
          { path: "/harness/controller.mjs", denied: true },
        ],
        controllerSourceVisible: true,
      }),
    /EVIDENCE_AUTHORITY/,
  );
});

test("support only: CCD observer stays outside application sessions", async () => {
  const { seedAppCcdSessions } = await import("./lib/exui-native-contract.mjs");
  const observed = [];
  const credentials = {
    allowed: { userId: "a" },
    denied: { userId: "d" },
    observer: { userId: "observer-secret" },
  };
  const sessions = seedAppCcdSessions(credentials, (persona, value) => {
    observed.push([persona, value.userId]);
    return persona + "-cookie";
  });
  assert.deepEqual(Object.keys(sessions), ["allowed", "denied"]);
  assert.deepEqual(observed, [
    ["allowed", "a"],
    ["denied", "d"],
  ]);
  assert.equal(sessions.observer, undefined);
});

test("support only: guard readonly mount cannot be rewritten through diagnostic alias", async () => {
  const { candidateArchiveArguments } =
    await import("./lib/exui-oci-runtime.mjs");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "native-guard-alias-"),
  );
  try {
    for (const name of [
      "candidate",
      "sessions",
      "diagnostics",
      "evidence",
      "harness",
    ])
      fs.mkdirSync(path.join(directory, name));
    const guard = path.join(directory, "diagnostics/guard.cjs");
    fs.writeFileSync(guard, "guard-fixture");
    assert.throws(
      () =>
        candidateArchiveArguments({
          image: sha("a"),
          namespace: "b".repeat(64),
          owner: "candidate-11111111-1111-4111-8111-111111111111",
          invocationId: "baseline",
          candidateRoot: path.join(directory, "candidate"),
          sessions: path.join(directory, "sessions"),
          diagnostics: path.join(directory, "diagnostics"),
          guard,
          config: {},
          evidenceRoot: path.join(directory, "evidence"),
          harnessRoot: path.join(directory, "harness"),
        }),
      /WRITABLE_ALIAS/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: native recovery plans bind declared artifacts/runtime and reject a substituted state path", async () => {
  const { captureNativeOwnership } =
    await import("./lib/exui-native-ci-ownership.mjs");
  const tmp = fs.realpathSync(os.tmpdir()),
    root = fs.mkdtempSync(path.join(tmp, "native-plan-"));
  const state = fs.mkdtempSync(path.join(tmp, "harness-native-state-"));
  try {
    for (const name of [
      "candidate/config",
      "stage/scripts/lib",
      "output",
      "browser",
    ])
      fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(
      path.join(root, "candidate/config/default.json"),
      JSON.stringify({
        services: { idam: {} },
        feature: {},
        waSupportedJurisdictions: "IA,CIVIL",
      }),
    );
    fs.writeFileSync(
      path.join(root, "stage/scripts/lib/exui-runtime-network-guard.cjs"),
      "guard",
    );
    for (const id of ["baseline", "wa-drop-family"])
      for (const kind of ["sessions", "diagnostics"])
        fs.mkdirSync(path.join(state, id, kind), { recursive: true });
    const artifact = {
      candidateRoot: path.join(root, "candidate"),
      identity: { artifactDigest: sha("a") },
      provenance: { platform: "linux/arm64", runtimeNodeVersion: "v24.22.1" },
    };
    const nativeRuntime = { imageId: sha("b"), platform: "linux/arm64" };
    const input = {
      releaseScopeId: "exui-wa-family-pilot",
      runId: "candidate-11111111-1111-4111-8111-111111111111",
      artifact,
      nativeRuntime,
      browserRuntimeImage: sha("c"),
      browserRoot: path.join(root, "browser"),
    };
    const context = {
      artifact,
      nativeRuntime,
      browserRuntimeImage: sha("c"),
      browserRoot: input.browserRoot,
    };
    const handoff = {
      mode: "native-separate-api",
      owner: input.runId,
      output: path.join(root, "output"),
      stagedHarness: path.join(root, "stage"),
      stateRoot: state,
    };
    const captured = captureNativeOwnership(
      input,
      handoff,
      context,
      handoff.output,
      "family",
    );
    assert.equal(captured.invocations.length, 2);
    assert.equal(captured.invocations[0].plan.candidate.mounts.length, 4);
    const amdArtifact = { ...artifact, provenance: { ...artifact.provenance, platform: "linux/amd64" } };
    const amdRuntime = { ...nativeRuntime, platform: "linux/amd64" };
    const amdCaptured = captureNativeOwnership({ ...input, artifact: amdArtifact, nativeRuntime: amdRuntime }, handoff, { ...context, artifact: amdArtifact, nativeRuntime: amdRuntime }, handoff.output, "family");
    for (const { plan } of amdCaptured.invocations) {
      assert.equal(plan.platform, "linux/amd64");
      assert.equal(plan.tools.args[plan.tools.args.indexOf("--platform") + 1], "linux/amd64");
      assert.equal(plan.tools.args[plan.tools.args.indexOf("--user") + 1], `${process.getuid()}:${process.getgid()}`);
      const args = plan.candidate.arguments("b".repeat(64));
      assert.equal(args[args.indexOf("--platform") + 1], "linux/amd64");
      assert(args.includes("--read-only"));
    }
    assert.throws(() => captureNativeOwnership(input, handoff, { ...context, artifact: amdArtifact }, handoff.output, "family"), /ARTIFACT_ROOT_MISMATCH/);

    assert.throws(
      () =>
        captureNativeOwnership(
          { ...input, nativeRuntime: { ...nativeRuntime, imageId: sha("d") } },
          handoff,
          context,
          handoff.output,
          "family",
        ),
      /RUNTIME_MISMATCH/,
    );
    assert.throws(
      () =>
        captureNativeOwnership(
          { ...input, artifact: { ...artifact, candidateRoot: "/foreign" } },
          handoff,
          context,
          handoff.output,
          "family",
        ),
      /ARTIFACT_ROOT/,
    );
    assert.throws(
      () =>
        captureNativeOwnership(
          input,
          { ...handoff, stateRoot: root },
          context,
          handoff.output,
          "family",
        ),
      /PRIVATE_STATE/,
    );
    assert.throws(
      () =>
        captureNativeOwnership(
          { ...input, only: "baseline" },
          handoff,
          context,
          handoff.output,
          "family",
        ),
      /COMPLETE_SLICE/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test("support only: native cleanup recovers planned API name without recorded CID and refuses foreign authority", async () => {
  const { cleanupNativeOwnership } =
    await import("./lib/exui-native-ci-ownership.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "native-recover-"));
  const owner = "candidate-11111111-1111-4111-8111-111111111111";
  const namespace = "1".repeat(64),
    id = "2".repeat(64),
    mounts = [{ source: "/sealed", target: "/candidate", writable: false }];
  const plan = {
    namespace,
    tools: { name: owner + "-baseline-tools", image: sha("a"), mounts: [] },
    candidate: { name: owner + "-baseline-candidate", image: sha("b"), mounts },
  };
  const info = {
    Id: id,
    Name: "/" + plan.candidate.name,
    Image: sha("b"),
    Config: {
      Labels: {
        "exui.harness.owner": owner,
        "exui.harness.service": "candidate",
      },
    },
    HostConfig: {
      NetworkMode: "container:" + namespace,
      ReadonlyRootfs: true,
      Init: true,
      Privileged: false,
      PidMode: "",
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      PidsLimit: 256,
      Memory: 4294967296,
      NanoCpus: 2000000000,
      PortBindings: {},
    },
    Mounts: [
      { Type: "bind", Source: "/sealed", Destination: "/candidate", RW: false },
    ],
  };
  const expected = { directory, owner, invocations: [{ plan }] };
  try {
    fs.writeFileSync(
      path.join(directory, "controller-terminal.json"),
      JSON.stringify({ cleanupComplete: true }),
    );
    fs.writeFileSync(
      path.join(directory, "owned-resources.json"),
      JSON.stringify([{ name: plan.candidate.name, id: null }]),
    );
    for (const foreign of [false, true]) {
      let removed = false;
      const observed = structuredClone(info);
      if (foreign) observed.HostConfig.NetworkMode = "host";
      const options = {
        inspect: (key) =>
          !removed && [id, plan.candidate.name].includes(key) ? observed : null,
        remove: (cid) => {
          assert.equal(cid, id);
          removed = true;
        },
      };
      if (foreign) {
        await assert.rejects(
          cleanupNativeOwnership(expected, options),
          /CLEANUP_INCOMPLETE/,
        );
        assert.equal(removed, false);
      } else {
        await cleanupNativeOwnership(expected, options);
        assert.equal(removed, true);
      }
    }
    fs.unlinkSync(path.join(directory, "controller-terminal.json"));
    await assert.rejects(
      cleanupNativeOwnership(expected, {
        inspect: () => null,
        remove: () => assert.fail(),
      }),
      /CLEANUP_INCOMPLETE/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: one failed Tools inspection cannot skip cleanup of another independently owned pair", async () => {
  const { cleanupNativeOwnership } =
    await import("./lib/exui-native-ci-ownership.mjs");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "native-cleanup-aggregate-"),
  );
  const owner = "candidate-11111111-1111-4111-8111-111111111111";
  const plan = (id) => ({
    tools: { name: owner + "-" + id + "-tools", image: sha("a"), mounts: [] },
    candidate: {
      name: owner + "-" + id + "-candidate",
      image: sha("b"),
      mounts: [],
    },
  });
  const first = plan("baseline"),
    second = plan("wa-drop-family"),
    containers = new Map();
  const make = (definition, id, service, namespace) => ({
    Id: id,
    Name: "/" + definition.name,
    Image: definition.image,
    Config: {
      Labels: { "exui.harness.owner": owner, "exui.harness.service": service },
    },
    Mounts: [],
    HostConfig: {
      NetworkMode: namespace ? "container:" + namespace : "none",
      ReadonlyRootfs: true,
      Init: true,
      Privileged: false,
      PidMode: "",
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      PidsLimit: 256,
      Memory: 4294967296,
      NanoCpus: 2000000000,
      PortBindings: {},
    },
  });
  for (const value of [
    make(second.tools, "1".repeat(64), "browser-provider"),
    make(second.candidate, "2".repeat(64), "candidate", "1".repeat(64)),
    make(first.candidate, "3".repeat(64), "candidate", "4".repeat(64)),
  ])
    containers.set(value.Id, value);
  try {
    fs.writeFileSync(
      path.join(directory, "controller-terminal.json"),
      JSON.stringify({ cleanupComplete: true }),
    );
    const removed = [];
    await assert.rejects(
      cleanupNativeOwnership(
        { directory, owner, invocations: [{ plan: second }, { plan: first }] },
        {
          inspect: (key) => {
            if (key === first.tools.name)
              throw Error("transient inspection failure");
            return (
              [...containers.values()].find(
                (x) => x.Id === key || x.Name === "/" + key,
              ) ?? null
            );
          },
          remove: (id) => {
            removed.push(id);
            containers.delete(id);
          },
        },
      ),
      /CLEANUP_INCOMPLETE/,
    );
    assert.deepEqual(removed, ["2".repeat(64), "1".repeat(64)]);
    assert(
      containers.has("3".repeat(64)),
      "unverified namespace must prevent API deletion",
    );
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(directory, "container-cleanup.json")),
      ).cleanupComplete,
      false,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: receipt consumer requires terminal controller cleanup and API write-denial/lifecycle facts", async () => {
  const { validateNativePhaseFinalization } =
    await import("./lib/exui-native-ci-ownership.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "native-terminal-"));
  const write = (name, value) =>
    fs.writeFileSync(path.join(directory, name), JSON.stringify(value));
  try {
    fs.mkdirSync(path.join(directory, "baseline"));
    const controller = {
      status: "completed",
      cleanupComplete: true,
      exitCode: 0,
    };
    write("controller-terminal.json", controller);
    write("baseline/candidate-write-denial.json", {
      attempts: [
        { path: "/output/report.json", denied: true },
        { path: "/harness/controller.mjs", denied: true },
      ],
      controllerSourceVisible: false,
    });
    const lifecycle = {
      requestedStop: true,
      before: { State: { Running: true } },
      after: { State: { Running: false, ExitCode: 143 } },
    };
    write("baseline/candidate-lifecycle.json", lifecycle);
    const check = () =>
      validateNativePhaseFinalization(
        directory,
        [{ invocationId: "baseline" }],
        { code: 0, signal: null },
      );
    assert.doesNotThrow(check);
    write("controller-terminal.json", {
      ...controller,
      cleanupComplete: false,
    });
    assert.throws(check, /CLEANUP_INCOMPLETE/);
    write("controller-terminal.json", controller);
    write("baseline/candidate-lifecycle.json", {
      ...lifecycle,
      requestedStop: false,
    });
    assert.throws(check, /STOP_NOT_OBSERVED/);
    write("baseline/candidate-lifecycle.json", lifecycle);
    fs.unlinkSync(path.join(directory, "baseline/candidate-write-denial.json"));
    assert.throws(check, /ENOENT/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: parent recovery preserves Tools after candidate removal failure and removes both on successful retry", async () => {
  const { cleanupNativeOwnership } =
    await import("./lib/exui-native-ci-ownership.mjs");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "native-parent-retry-"),
  );
  const owner = "candidate-11111111-1111-4111-8111-111111111111",
    toolsId = "1".repeat(64),
    candidateId = "2".repeat(64);
  const plan = {
    tools: { name: owner + "-baseline-tools", image: sha("a"), mounts: [] },
    candidate: {
      name: owner + "-baseline-candidate",
      image: sha("b"),
      mounts: [],
    },
  };
  const containers = new Map();
  for (const [definition, id, service, network] of [
    [plan.tools, toolsId, "browser-provider", "none"],
    [plan.candidate, candidateId, "candidate", "container:" + toolsId],
  ])
    containers.set(id, {
      Id: id,
      Name: "/" + definition.name,
      Image: definition.image,
      Config: {
        Labels: {
          "exui.harness.owner": owner,
          "exui.harness.service": service,
        },
      },
      Mounts: [],
      HostConfig: {
        NetworkMode: network,
        ReadonlyRootfs: true,
        Init: true,
        Privileged: false,
        PidMode: "",
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        PidsLimit: 256,
        Memory: 4294967296,
        NanoCpus: 2000000000,
        PortBindings: {},
      },
    });
  try {
    fs.writeFileSync(
      path.join(directory, "owned-resources.json"),
      JSON.stringify([
        { name: plan.tools.name, id: toolsId },
        { name: plan.candidate.name, id: candidateId },
      ]),
    );
    let fail = true;
    const removed = [];
    const options = {
      inspect: (key) =>
        [...containers.values()].find(
          (x) => x.Id === key || x.Name === "/" + key,
        ) ?? null,
      remove: (id) => {
        if (fail && id === candidateId) throw Error("candidate removal failed");
        removed.push(id);
        containers.delete(id);
      },
    };
    const expected = { directory, owner, invocations: [{ plan }] };
    await assert.rejects(
      cleanupNativeOwnership(expected, options),
      /CLEANUP_INCOMPLETE/,
    );
    assert.equal(containers.size, 2);
    assert.deepEqual(removed, []);
    fail = false;
    await cleanupNativeOwnership(expected, options);
    assert.deepEqual(removed, [candidateId, toolsId]);
    assert.equal(containers.size, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function eventOwnershipFixture(t) {
  const api = await import("./lib/exui-native-ci-ownership.mjs");
  const tmp = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tmp, "native-event-ownership-"));
  const state = fs.mkdtempSync(path.join(tmp, "harness-native-state-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(state, { recursive: true, force: true });
  });
  for (const name of ["candidate/config", "stage/scripts/lib", "output/baseline", "browser"])
    fs.mkdirSync(path.join(root, name), { recursive: true });
  for (const id of ["baseline", "ccd-enable-judge-event", "ccd-remove-courtadmin-recipient-read"])
    for (const kind of ["sessions", "diagnostics"])
      fs.mkdirSync(path.join(state, id, kind), { recursive: true });
  fs.writeFileSync(path.join(root, "candidate/config/default.json"), JSON.stringify({ services: { idam: {} }, feature: {} }));
  fs.writeFileSync(path.join(root, "stage/scripts/lib/exui-runtime-network-guard.cjs"), "guard");
  const artifact = { candidateRoot: path.join(root, "candidate"), identity: { artifactDigest: sha("a") }, provenance: { platform: "linux/arm64", runtimeNodeVersion: "v24.22.1" } };
  const input = {
    releaseScopeId: "exui-ccd-event-capability-pilot",
    runId: "ccd-11111111-1111-4111-8111-111111111111",
    artifact,
    nativeRuntime: { imageId: sha("b"), platform: "linux/arm64" },
    browserRuntimeImage: sha("c"), browserRoot: path.join(root, "browser"),
    ccd: { namespace: "1".repeat(64), owner: "baseline-ccd-owner", fixtureSelection: "event-capability-baseline", images: { data: { id: sha("d") }, definition: { id: sha("e") } } },
    definition: { fixtureDigest: sha("f") }, apiContracts: { data: sha("8"), definition: sha("9") }, gatewayDigest: sha("7"),
  };
  const context = { artifact, nativeRuntime: input.nativeRuntime, browserRuntimeImage: input.browserRuntimeImage, browserRoot: input.browserRoot, ccd: input.ccd };
  const handoff = { mode: "native-separate-api", owner: input.runId, output: path.join(root, "output"), stagedHarness: path.join(root, "stage"), stateRoot: state };
  const expected = api.captureNativeOwnership(input, handoff, context, handoff.output, "eventCapability");
  const { plan } = expected.invocations[0];
  const registry = [["candidate", plan.candidate, "2".repeat(64)], ["browser-provider", plan.tools, "3".repeat(64)]].map(([service, resource, id]) => ({ kind: "container", name: resource.name, id, owner: expected.owner, service, image: resource.image, namespace: plan.namespace, mounts: resource.mounts, removed: true }));
  const candidate = registry[0];
  const before = {
    Id: candidate.id, Name: "/" + candidate.name, Image: candidate.image,
    Config: { Labels: { "exui.harness.owner": expected.owner, "exui.harness.service": "candidate" } },
    HostConfig: { NetworkMode: "container:" + plan.namespace, ReadonlyRootfs: true, Init: true, Privileged: false, PidMode: "", CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges"], PidsLimit: 256, Memory: 4294967296, NanoCpus: 2000000000, PortBindings: {} },
    Mounts: candidate.mounts.map(item => ({ Type: "bind", Source: item.source, Destination: item.target, RW: item.writable })),
    State: { Running: true, ExitCode: 0, OOMKilled: false },
  };
  const lifecycle = { requestedStop: true, before, after: { ...structuredClone(before), State: { Running: false, ExitCode: 143, OOMKilled: false } } };
  const denial = { candidateId: candidate.id, attempts: [{ path: "/output/report.json", denied: true }, { path: "/harness/controller.mjs", denied: true }], controllerSourceVisible: false };
  const put = (name, value) => fs.writeFileSync(path.join(handoff.output, name), JSON.stringify(value));
  const write = () => { put("owned-resources.json", registry); put("baseline/candidate-write-denial.json", denial); put("baseline/candidate-lifecycle.json", lifecycle); };
  write();
  return { api, input, context, handoff, expected, registry, denial, lifecycle, put, write };
}

test("support only: event ownership captures baseline and fresh fault plans separately with exact fixture selection", async t => {
  const f = await eventOwnershipFixture(t);
  assert.deepEqual(f.expected.invocations.map(item => item.invocationId), ["baseline"]);
  const faultInput = { ...f.input, ccd: { ...f.input.ccd, namespace: "4".repeat(64), owner: "fault-ccd-owner", fixtureSelection: "event-capability-mutant" } };
  const faultContext = { ...f.context, ccd: faultInput.ccd };
  const fault = f.api.captureEventFaultOwnership(faultInput, f.handoff, faultContext, f.handoff.output);
  assert.deepEqual(fault.invocations.map(item => item.invocationId), ["ccd-enable-judge-event"]);
  const baselinePlan = f.expected.invocations[0].plan, faultPlan = fault.invocations[0].plan;
  assert.equal(baselinePlan.namespace, f.input.ccd.namespace);
  assert.equal(faultPlan.namespace, faultInput.ccd.namespace);
  assert.notEqual(baselinePlan.namespace, faultPlan.namespace);
  for (const service of ["candidate", "tools"]) {
    assert.notEqual(baselinePlan[service].name, faultPlan[service].name);
    assert.equal(faultPlan[service].namespace, faultInput.ccd.namespace);
  }
  assert.throws(() => f.api.captureNativeOwnership(faultInput, f.handoff, faultContext, f.handoff.output, "eventCapability"), /EVENT_VARIANT_MISMATCH/);
  assert.throws(() => f.api.captureEventFaultOwnership(f.input, f.handoff, f.context, f.handoff.output), /EVENT_VARIANT_MISMATCH/);
  assert.throws(() => f.api.captureEventFaultOwnership(faultInput, f.handoff, f.context, f.handoff.output), /CCD_NAMESPACE_MISMATCH/);
  assert.throws(() => f.api.assertEventBaselineRemoved(fault, { inspect: () => null }), /BASELINE_OWNERSHIP_REQUIRED/);
});

test("support only: read-fault ownership uses its exact namespace, invocation and private process mounts", async t => {
  const f = await eventOwnershipFixture(t);
  const captureEventFaultOwnership = f.api.captureEventFaultOwnership;
  const mutation = "ccd-remove-courtadmin-recipient-read";
  const input = { ...f.input, ccd: { ...f.input.ccd, namespace: "5".repeat(64), owner: "read-fault-owner", fixtureSelection: "event-capability-read-mutant" } };
  const context = { ...f.context, ccd: input.ccd };
  const owned = captureEventFaultOwnership(input, f.handoff, context, f.handoff.output, mutation);
  assert.deepEqual(owned.invocations.map(item => item.invocationId), [mutation]);
  const { plan } = owned.invocations[0];
  assert.equal(plan.namespace, input.ccd.namespace);
  for (const service of ["candidate", "tools"]) {
    assert(plan[service].name.includes(mutation));
    assert.equal(plan[service].namespace, input.ccd.namespace);
  }
  assert.throws(() => captureEventFaultOwnership(input, f.handoff, context, f.handoff.output, "ccd-enable-judge-event"), /EVENT_VARIANT_MISMATCH/);
  assert.throws(() => captureEventFaultOwnership(input, f.handoff, context, f.handoff.output, "../escape"), /EVENT_TRANSITION_INVOCATION/);
});

test("support only: event handoff refuses either baseline child still present by its name or CID", async t => {
  const f = await eventOwnershipFixture(t);
  for (const resource of f.registry) {
    for (const key of [resource.name, resource.id]) {
      const inspected = [];
      assert.throws(() => f.api.assertEventBaselineRemoved(f.expected, { inspect: actual => { inspected.push(actual); return actual === key ? { Id: resource.id } : null; } }), /EVENT_BASELINE_(NAME|CID)_STILL_PRESENT/);
      assert(inspected.includes(key));
      assert.equal(fs.existsSync(path.join(f.handoff.output, "baseline-owned-resources.json")), false);
    }
  }
  assert.throws(() => f.api.assertEventBaselineRemoved(f.expected, { inspect: () => { throw Error("inspection unavailable"); } }), /inspection unavailable/);
  assert.equal(fs.existsSync(path.join(f.handoff.output, "baseline-owned-resources.json")), false);
});

test("support only: event handoff rejects substituted lifecycle, write-probe CID and candidate authority", async t => {
  for (const [change, error] of [
    [f => { f.denial.candidateId = "f".repeat(64); }, /WRITE_PROBE_CID/],
    [f => { f.lifecycle.before.Id = "f".repeat(64); }, /LIFECYCLE_CID/],
    [f => { f.lifecycle.after.Id = "f".repeat(64); }, /LIFECYCLE_CID/],
    [f => { f.lifecycle.before.Mounts[0].Source = "/different-candidate"; }, /MOUNT_MISMATCH/],
    [f => { f.lifecycle.after.Mounts[0].RW = true; }, /MOUNT_MISMATCH/],
    [f => { f.registry[0].mounts = []; }, /MOUNTS_MISMATCH/],
    [f => { f.lifecycle.before.HostConfig.NetworkMode = "host"; }, /NETWORK_MISMATCH/],
    [f => { f.lifecycle.after.Config.Labels["exui.harness.owner"] = "foreign"; }, /OWNER_MISMATCH/],
    [f => { f.lifecycle.requestedStop = false; }, /STOP_NOT_OBSERVED/],
    [f => { f.lifecycle.after.State.OOMKilled = true; }, /BASELINE_OOM/],
    [f => { f.denial.attempts[0].denied = false; }, /EVIDENCE_AUTHORITY/],
  ]) {
    const f = await eventOwnershipFixture(t); change(f); f.write();
    assert.throws(() => f.api.assertEventBaselineRemoved(f.expected, { inspect: () => null }), error);
    assert.equal(fs.existsSync(path.join(f.handoff.output, "baseline-owned-resources.json")), false);
  }
});

test("support only: event removal creates one immutable baseline registry snapshot with exact evidence bindings", async t => {
  const f = await eventOwnershipFixture(t);
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const registryPath = path.join(f.handoff.output, "owned-resources.json");
  const originalRegistry = fs.readFileSync(registryPath);
  const inspected = [];
  const check = () => f.api.assertEventBaselineRemoved(f.expected, { inspect: key => { inspected.push(key); return null; } });
  const result = check();
  assert.deepEqual(inspected, f.registry.flatMap(item => [item.name, item.id]));
  assert.deepEqual(result.removed, f.registry.map(({ name, id }) => ({ name, id })));
  assert.deepEqual(result.bindings.map(item => item.path), ["baseline/candidate-write-denial.json", "baseline/candidate-lifecycle.json", "baseline-owned-resources.json"]);
  for (const binding of result.bindings)
    assert.equal(binding.digest, digestBytes(fs.readFileSync(path.join(f.handoff.output, binding.path))));
  const snapshot = path.join(f.handoff.output, "baseline-owned-resources.json");
  const frozen = fs.readFileSync(snapshot);
  assert.equal(fs.statSync(snapshot).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(frozen), f.registry);
  assert.deepEqual(fs.readFileSync(registryPath), originalRegistry);
  assert.throws(check, /EEXIST/);
  assert.deepEqual(fs.readFileSync(snapshot), frozen);
  f.put("owned-resources.json", [{ name: "later-fault-resource", id: "f".repeat(64) }]);
  assert.deepEqual(fs.readFileSync(snapshot), frozen);
  assert(!result.bindings.some(item => item.path === "owned-resources.json"));
});

test("support only: event fault candidate arguments cannot be selected under an unrelated release scope", async t => {
  const f = await eventOwnershipFixture(t);
  const { candidateArchiveArguments } = await import("./lib/exui-oci-runtime.mjs");
  const args = {
    image: f.input.nativeRuntime.imageId, namespace: f.input.ccd.namespace,
    owner: f.input.runId, invocationId: "ccd-enable-judge-event",
    candidateRoot: f.input.artifact.candidateRoot,
    sessions: path.join(f.handoff.stateRoot, "ccd-enable-judge-event/sessions"),
    diagnostics: path.join(f.handoff.stateRoot, "ccd-enable-judge-event/diagnostics"),
    guard: path.join(f.handoff.stagedHarness, "scripts/lib/exui-runtime-network-guard.cjs"),
    config: {}, evidenceRoot: f.handoff.output, harnessRoot: f.handoff.stagedHarness,
    releaseScopeId: "exui-ccd-event-capability-pilot",
  };
  for (const invocationId of ["ccd-enable-judge-event", "ccd-remove-courtadmin-recipient-read"]) {
    const selected = { ...args, invocationId,
      sessions: path.join(f.handoff.stateRoot, invocationId, "sessions"),
      diagnostics: path.join(f.handoff.stateRoot, invocationId, "diagnostics") };
    assert(candidateArchiveArguments(selected).includes("/candidate/runtime/node"));
    assert.throws(() => candidateArchiveArguments({ ...selected, releaseScopeId: "exui-ccd-pilot" }), /CCD_EVENT_SCOPE_REQUIRED/);
  }
  assert.throws(() => candidateArchiveArguments({ ...args, invocationId: "ccd-drop-child" }), /UNSUPPORTED_CCD_EVENT_INVOCATION/);
});

test("native AMD64 image admission binds platform, manifest and config identity", async () => {
  const { nativeRuntimeImages, assertNativeRuntimeImage } = await import("./lib/exui-native-containers.mjs");
  const images = nativeRuntimeImages("linux/amd64");
  assert.equal(images.api.reference, "node@sha256:0925478b811e8890f5508ad2a75135933310effd45492696ecf7c111c8339d02");
  assert.match(images.browser.reference, /^mcr.microsoft.com\/playwright@sha256:/);
  for (const pin of Object.values(images)) {
    const info = { Id: pin.manifestDigest, Os: "linux", Architecture: "amd64", RepoDigests: [pin.reference] };
    assertNativeRuntimeImage(info, pin, "linux/amd64");
    assertNativeRuntimeImage({ ...info, Id: pin.configDigest }, pin, "linux/amd64");
    for (const patch of [{ Id: sha("f") }, { Architecture: "arm64" }, { Os: "windows" }, { RepoDigests: [] }, { RepoDigests: [pin.reference.replace(/.$/, "f")] }])
      assert.throws(() => assertNativeRuntimeImage({ ...info, ...patch }, pin, "linux/amd64"), /NATIVE_RUNTIME_/);
  }
  assert.throws(() => nativeRuntimeImages("linux/ppc64le"), /UNSUPPORTED_NATIVE_PLATFORM/);
});
