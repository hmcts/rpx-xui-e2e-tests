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
      provenance: { runtimeNodeVersion: "v24.22.1" },
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
