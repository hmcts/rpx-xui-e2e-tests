const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const image = "sha256:" + "a".repeat(64);
function fixture(fault) {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "host-engine-test-"));
  const directory = path.join(output, "baseline");
  fs.mkdirSync(directory);
  const diagnostics = path.join(output, "diagnostics");
  fs.mkdirSync(diagnostics);
  const owner = "candidate-11111111-1111-4111-8111-111111111111";
  const containers = new Map(),
    calls = [],
    inspectCalls = [],
    resources = new Map();
  let next = 0;
  const lookup = (key) =>
    [...containers.values()].find(
      (x) => x.Id === key || x.Name === "/" + key,
    ) ?? null;
  const inspect = (key) => {
    inspectCalls.push(key);
    const value = lookup(key);
    return value ? structuredClone(value) : null;
  };
  const write = (name, value) =>
    fs.writeFileSync(path.join(directory, name), JSON.stringify(value));
  const mounts = (service) => [
    {
      source: "/" + service,
      target: service === "candidate" ? "/candidate" : "/harness",
      writable: false,
    },
  ];
  const docker = (args) => {
    calls.push(args);
    const [op, id] = args;
    if (op === "create") {
      const name = args[args.indexOf("--name") + 1];
      const service = name.endsWith("-tools")
        ? "browser-provider"
        : "candidate";
      const namespace =
        service === "candidate" ? [...containers.values()][0].Id : null;
      const info = {
        Id: String(++next).repeat(64),
        Name: "/" + name,
        Image: image,
        Config: {
          Labels: {
            "exui.harness.owner": owner,
            "exui.harness.service": service,
          },
        },
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
        Mounts: mounts(service).map((m) => ({
          Type: "bind",
          Source: m.source,
          Destination: m.target,
          RW: m.writable,
        })),
        State: {
          Running: false,
          OOMKilled: false,
          ExitCode: 0,
          Error: "",
          StartedAt: "fixed",
        },
        RestartCount: 0,
      };
      containers.set(info.Id, info);
      if (fault === "create-timeout" && service === "candidate")
        throw Error("create interrupted after daemon success");
      return info.Id;
    }
    const info = lookup(id);
    if (op === "start") {
      info.State.Running = true;
      if (
        fault !== "startup-cancel" &&
        info.Config.Labels["exui.harness.service"] === "browser-provider"
      ) {
        if (fault === "provider-exits-before-ready") setTimeout(() => { info.State.Running = false; }, 250);
        else if (fault === "delayed-provider-ready") setTimeout(() => write("provider-ready.json", {}), 1250);
        else write("provider-ready.json", {});
      }
      return "";
    }
    if (op === "logs") return "diagnostic-only";
    if (op === "rm") {
      const cid = args.at(-1);
      if (fault === "cleanup-failure") throw Error("remove failed");
      containers.delete(cid);
      return "";
    }
    if (op === "kill") {
      const target = lookup(args.at(-1));
      target.State.Running = false;
      const isCandidate =
        target.Config.Labels["exui.harness.service"] === "candidate";
      target.State.ExitCode = isCandidate ? 143 : 0;
      if (!isCandidate) write("provider-stopped.json", { closed: true });
      return "";
    }
    if (op === "wait") return String(info.State.ExitCode);
    if (op === "exec") {
      const script = args.at(-1);
      if (script.includes("net.connect")) return "[false,false]";
      if (script.includes("osRelease"))
        return JSON.stringify({
          nodeVersion: "v24.22.1",
          platform: "linux",
          architecture: "arm64",
          osRelease: "ID=debian\nVERSION_CODENAME=bookworm\n",
        });
      if (script.includes("controllerSourceVisible"))
        return JSON.stringify({
          attempts: [
            {
              path: "/output/report.json",
              denied: fault !== "write-capability",
            },
            { path: "/harness/controller.mjs", denied: true },
          ],
          controllerSourceVisible: false,
        });
      if (script.includes("container-cgroup-v2"))
        return JSON.stringify({ peakMemoryBytes: 1 });
      return "";
    }
    throw Error("unexpected fake operation " + op);
  };
  const spec = {
    kind: "native",
    output,
    directory,
    owner,
    invocationId: "baseline",
    platform: "linux/arm64",
    diagnostics,
    manifest: { identity: {}, runtimeMetadata: {} },
    payloadDigest: image,
    tools: { image, mounts: mounts("browser-provider"), args: ["create"] },
    candidate: {
      image,
      node: "/candidate/runtime/node",
      expectedNodeVersion: "v24.22.1",
      mounts: mounts("candidate"),
      arguments: () => ["create"],
    },
    proofArguments: [],
  };
  const runProof = async () => {
    if (fault === "proof-client-error") throw Error("known proof child failed");
    const candidate = [...containers.values()].find(
      (x) => x.Config.Labels["exui.harness.service"] === "candidate",
    );
    if (fault === "premature-exit") candidate.State.Running = false;
    if (fault === "wrong-mount") candidate.Mounts[0].RW = true;
    if (fault === "wrong-namespace") candidate.HostConfig.NetworkMode = "host";
    if (["unhandled-provider.jsonl", "gateway-errors.jsonl"].includes(fault))
      write(fault, { code: "gateway-diagnostic" });
    write("framework-terminal.json", { code: 0, signal: null });
    return { code: 0, signal: null };
  };
  return {
    spec,
    resources,
    docker,
    inspect,
    runProof,
    calls,
    inspectCalls,
    write,
    containers,
    dispose: () => fs.rmSync(output, { recursive: true, force: true }),
  };
}
test("support only: provider readiness polls its file frequently without spawning inspect every 100ms", async () => {
  const { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const f = fixture("delayed-provider-ready");
  try {
    const result = await runHostInvocation(f.spec, f);
    assert.equal(result.terminal.code, 0);
    assert(f.inspectCalls.filter(key => key === "1".repeat(64)).length <= 8);
    assert.equal(f.containers.size, 0);
  } finally {
    f.dispose();
  }
});
test("support only: provider health failure is detected within the one-second inspection interval", async () => {
  const { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const f = fixture("provider-exits-before-ready");
  const started = Date.now();
  try {
    await assert.rejects(runHostInvocation(f.spec, f), /HOST_PROVIDER_STARTUP_EXIT/);
    assert(Date.now() - started < 2000);
    assert.equal(f.containers.size, 0);
  } finally {
    f.dispose();
  }
});
test("support only: real shared engine observes separate API lifetime and final cleanup before returning framework terminal", async () => {
  const { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const f = fixture();
  try {
    const result = await runHostInvocation(f.spec, {
      ...f,
      inspect: (key) => {
        const value = f.inspect(key);
        return value ? structuredClone(value) : null;
      },
    });
    assert.equal(result.terminal.code, 0);
    assert.equal(f.containers.size, 0);
    assert.equal(
      f.spec.manifest.runtimeMetadata.candidateAuthorityIsolation,
      "separate-container-no-evidence-mount",
    );
    const records = JSON.parse(
      fs.readFileSync(path.join(f.spec.output, "owned-resources.json")),
    );
    assert.equal(records.length, 2);
    assert(records.every((x) => x.removed));
    assert(
      f.calls.findIndex((x) => x[0] === "kill") >
        f.calls.findIndex((x) =>
          x.at(-1)?.includes?.("controllerSourceVisible"),
        ),
    );
  } finally {
    f.dispose();
  }
});

test("support only: source-event host invocation reports ordered provider, candidate, readiness, proof and shutdown/cleanup timings", async () => {
  const { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const f = fixture();
  const timings = [];
  try {
    const result = await runHostInvocation(f.spec, {
      ...f,
      onLifecycleTiming: (record) => timings.push(record),
    });
    assert.equal(result.terminal.code, 0);
    assert.equal(f.containers.size, 0);
    assert.deepEqual(timings.map(({ step, status }) => [step, status]), [
      ["browser-provider-setup", "completed"],
      ["candidate-runtime-setup", "completed"],
      ["application-readiness", "completed"],
      ["playwright-proof", "completed"],
      ["post-proof-resource-observation", "completed"],
      ["candidate-graceful-shutdown", "completed"],
      ["provider-graceful-shutdown", "completed"],
      ["resource-cleanup", "completed"],
    ]);
    assert.deepEqual(timings[0].details.map(({ step, status }) => [step, status]), [
      ["provider-container-create", "completed"],
      ["provider-container-start", "completed"],
      ["provider-readiness", "completed"],
      ["provider-ownership-check", "completed"],
      ["provider-egress-probes", "completed"],
    ]);
    assert(timings[0].details.every(row => Number.isSafeInteger(row.durationMs) && row.durationMs >= 0));
    for (const timing of timings) {
      assert.equal(timing.invocationId, "baseline");
      assert.equal(timing.runId, f.spec.owner);
      assert(Number.isFinite(Date.parse(timing.startedAt)));
      assert(Number.isSafeInteger(timing.durationMs) && timing.durationMs >= 0);
    }
  } finally {
    f.dispose();
  }
});

test("support only: lifecycle timing records a proof failure and cleanup without changing the error", async () => {
  const { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const f = fixture("proof-client-error");
  const timings = [];
  try {
    await assert.rejects(
      runHostInvocation(f.spec, { ...f, onLifecycleTiming: (record) => timings.push(record) }),
      /known proof child failed/,
    );
    assert.equal(f.containers.size, 0);
    assert.deepEqual(timings.map(({ step, status }) => [step, status]), [
      ["browser-provider-setup", "completed"],
      ["candidate-runtime-setup", "completed"],
      ["application-readiness", "completed"],
      ["playwright-proof", "failed"],
      ["resource-cleanup", "completed"],
    ]);
  } finally {
    f.dispose();
  }
});

for (const fault of [
  "create-timeout",
  "write-capability",
  "proof-client-error",
  "premature-exit",
  "wrong-mount",
  "wrong-namespace",
  "cleanup-failure",
  "unhandled-provider.jsonl",
  "gateway-errors.jsonl",
])
  test(
    "support only: real shared engine fails closed for " + fault,
    async () => {
      const { runHostInvocation } =
        await import("./lib/exui-host-invocation.mjs");
      const f = fixture(fault);
      try {
        await assert.rejects(
          runHostInvocation(f.spec, f),
          ["unhandled-provider.jsonl", "gateway-errors.jsonl"].includes(fault)
            ? /HOST_UNDECLARED_DESTINATION/
            : undefined,
        );
        if (
          ["wrong-mount", "wrong-namespace", "cleanup-failure"].includes(fault)
        )
          assert(
            f.containers.size > 0,
            "foreign or unremovable resource remains explicit",
          );
        else
          assert.equal(
            f.containers.size,
            0,
            "recover the exact owned planned name even without returned CID",
          );
        assert(!fs.existsSync(path.join(f.spec.directory, "execution.json")));
      } finally {
        f.dispose();
      }
    },
  );
test("support only: missing CID and absent planned name leaves unknown create outcome explicit", async () => {
  const { removeHostResource } = await import("./lib/exui-host-invocation.mjs");
  const f = fixture();
  try {
    f.resources.set("planned", {
      kind: "container",
      name: "planned",
      id: null,
    });
    assert.throws(
      () =>
        removeHostResource(f.resources, "planned", f.spec.output, {
          inspect: () => null,
          docker: () => assert.fail("no removal without authority"),
        }),
      /CREATION_OUTCOME_UNCERTAIN/,
    );
  } finally {
    f.dispose();
  }
});

test("support only: default proof-client branch observes actual spawned child exit and removes process authority", async () => {
  const { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const { spawn } = require("node:child_process");
  const f = fixture();
  try {
    const result = await runHostInvocation(f.spec, {
      ...f,
      runProof: undefined,
      inspect: (key) => {
        const value = f.inspect(key);
        return value ? structuredClone(value) : null;
      },
      spawnProof: (_command, _args, options) => {
        f.write("framework-terminal.json", { code: 1, signal: null });
        return spawn(process.execPath, ["-e", "process.exit(1)"], options);
      },
    });
    assert.deepEqual(result.terminal, { code: 1, signal: null });
    assert(
      [...f.resources.values()].every(
        (x) => x.kind === "container" && x.removed,
      ),
    );
  } finally {
    f.dispose();
  }
});

test("support only: default proof-client spawn error cannot finalize framework evidence", async () => {
  const { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const { spawn } = require("node:child_process");
  const f = fixture();
  try {
    await assert.rejects(
      runHostInvocation(f.spec, {
        ...f,
        runProof: undefined,
        spawnProof: (_command, _args, options) =>
          spawn("/definitely-absent-harness-command", [], options),
      }),
    );
    assert.equal(f.containers.size, 0);
    assert(
      [...f.resources.values()].every(
        (x) => x.kind === "container" && x.removed,
      ),
    );
  } finally {
    f.dispose();
  }
});

test("support only: forced termination of the exact proof client remains cleanup-incomplete", async () => {
  const { removeHostResource } = await import("./lib/exui-host-invocation.mjs");
  const { EventEmitter } = require("node:events");
  const f = fixture();
  try {
    const child = new EventEmitter();
    child.pid = 12345;
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      if (signal === "SIGKILL") {
        child.signalCode = signal;
        setImmediate(() => child.emit("exit", null, signal));
      }
      return true;
    };
    f.resources.set("proof", { kind: "process", child });
    // Actual-child graceful termination is covered by the shared runtime suite; this checks the engine adapter's forced-terminal classification.
    await assert.rejects(
      removeHostResource(f.resources, "proof", f.spec.output),
      /PROOF_CLIENT_FORCED/,
    );
    assert(f.resources.has("proof"));
  } finally {
    f.dispose();
  }
});

test("support only: provider-startup cancellation removes only the registered Tools container before API creation", async () => {
  const { runHostInvocation, removeHostResource } =
    await import("./lib/exui-host-invocation.mjs");
  const { installCancellationCleanup } =
    await import("./lib/exui-oci-runtime.mjs");
  const { EventEmitter } = require("node:events");
  const f = fixture("startup-cancel"),
    target = new EventEmitter();
  let exit, cancelled = false;
  const timings = [];
  target.stderr = { write: () => {} };
  target.exit = (code) => {
    exit = code;
  };
  const uninstall = installCancellationCleanup({
    resources: f.resources,
    target,
    onCancel: () => { cancelled = true; },
    remove: (key) => removeHostResource(f.resources, key, f.spec.output, f),
  });
  try {
    const running = runHostInvocation(f.spec, { ...f, isCancelled: () => cancelled, onLifecycleTiming: record => timings.push(record) });
    target.emit("SIGTERM");
    await assert.rejects(running, /HOST_INVOCATION_CANCELLED/);
    assert.equal(exit, 2);
    assert.equal(f.containers.size, 0);
    assert.equal(f.calls.filter((x) => x[0] === "create").length, 1);
    assert.deepEqual(timings[0].details.map(({step,status}) => [step,status]), [
      ["provider-container-create", "completed"],
      ["provider-container-start", "completed"],
      ["provider-readiness", "failed"],
      ["provider-ownership-check", "not-run"],
      ["provider-egress-probes", "not-run"],
    ]);
  } finally {
    uninstall();
    f.dispose();
  }
});

test("support only: cancellation at an awaited proof boundary stops normal continuation before another container or final receipt", async () => {
  const { runHostInvocation } = await import("./lib/exui-host-invocation.mjs");
  const f = fixture();
  let cancelled = false;
  try {
    await assert.rejects(
      runHostInvocation(f.spec, {
        ...f,
        isCancelled: () => cancelled,
        runProof: async () => {
          cancelled = true;
          return { code: 0, signal: null };
        },
      }),
      /INVOCATION_CANCELLED/,
    );
    assert.equal(f.containers.size, 0);
    const before = f.calls.length;
    await assert.rejects(
      runHostInvocation(f.spec, { ...f, isCancelled: () => true }),
      /INVOCATION_CANCELLED/,
    );
    assert.equal(
      f.calls.length,
      before,
      "cancelled continuation cannot register/create further resources",
    );
    assert(!fs.existsSync(path.join(f.spec.directory, "resources.json")));
  } finally {
    f.dispose();
  }
});

test("support only: candidate removal failure preserves its verified Tools namespace across inner and outer cleanup until retry succeeds", async () => {
  const { runHostInvocation, removeHostResource } =
    await import("./lib/exui-host-invocation.mjs");
  const f = fixture();
  let fail = true;
  const docker = (args) => {
    if (
      fail &&
      args[0] === "rm" &&
      f.inspect(args.at(-1))?.Config.Labels["exui.harness.service"] ===
        "candidate"
    )
      throw Error("candidate removal failed");
    return f.docker(args);
  };
  try {
    await assert.rejects(
      runHostInvocation(f.spec, { ...f, docker }),
      /CLEANUP_FAILED/,
    );
    assert.equal(
      f.containers.size,
      2,
      "retain independently inspectable namespace owner",
    );
    const tools = [...f.resources.values()].find(
        (x) => x.service === "browser-provider",
      ),
      candidate = [...f.resources.values()].find(
        (x) => x.service === "candidate",
      );
    assert.throws(
      () =>
        removeHostResource(f.resources, tools.name, f.spec.output, {
          docker,
          inspect: f.inspect,
        }),
      /NAMESPACE_CANDIDATE_CLEANUP_REQUIRED/,
    );
    assert.equal(
      f.calls.filter((x) => x[0] === "rm").length,
      0,
      "outer/signal helper must not remove Tools either",
    );
    fail = false;
    removeHostResource(f.resources, candidate.name, f.spec.output, {
      docker,
      inspect: f.inspect,
    });
    removeHostResource(f.resources, tools.name, f.spec.output, {
      docker,
      inspect: f.inspect,
    });
    assert.equal(f.containers.size, 0);
  } finally {
    f.dispose();
  }
});

for (const fault of [
  "none",
  "daemon-created-client-timeout",
  "create-uncertain",
  "foreign-image",
  "copy-failure",
])
  test(
    "support only: OCI extraction pre-registers planned ownership and reconciles " +
      fault,
    async () => {
      const { withOwnedImageExtraction } =
        await import("./lib/exui-oci-extraction.mjs");
      const output = fs.mkdtempSync(
        path.join(os.tmpdir(), "oci-extraction-owned-"),
      );
      const owner = "harness-oci-11111111-1111-4111-8111-111111111111",
        id = "4".repeat(64),
        resources = new Map();
      const descriptor = {
        imageReference: "registry/app@" + image,
        digest: image,
        observedImageId: image,
        platform: "linux/arm64",
      };
      let container = null,
        removed = false,
        copied = false;
      const docker = (args) => {
        if (args[0] === "create") {
          const record = JSON.parse(
            fs.readFileSync(path.join(output, "extraction-recovery.json")),
          );
          assert.equal(record.id, null);
          assert.equal(record.name, owner + "-payload");
          assert(resources.has(record.name));
          assert(args.includes("--pull") && args.includes("never"));
          assert.equal(args[args.indexOf("--name") + 1], record.name);
          container = {
            Id: id,
            Name: "/" + record.name,
            Image:
              fault === "foreign-image" ? "sha256:" + "f".repeat(64) : image,
            Config: {
              Labels: {
                "exui.harness.owner": owner,
                "exui.harness.service": "payload-extraction",
              },
            },
            Mounts: [],
            State: { Running: false, OOMKilled: false },
            RestartCount: 0,
            HostConfig: {
              NetworkMode: "none",
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
          };
          if (fault === "create-uncertain") {
            container = null;
            throw Error("create timed out");
          }
          if (fault === "daemon-created-client-timeout")
            throw Error("create timed out after daemon success");
          return id;
        }
        assert.equal(args[0], "rm");
        assert.equal(args.at(-1), id);
        removed = true;
        container = null;
        return "";
      };
      const inspect = (key) =>
        container && [id, owner + "-payload"].includes(key)
          ? structuredClone(container)
          : null;
      const action = () =>
        withOwnedImageExtraction(
          { descriptor, observedImageId: image, owner, output, resources },
          async (observed) => {
            copied = true;
            assert.equal(observed, id);
            if (fault === "copy-failure") throw Error("copy failed");
            return "sealed";
          },
          { docker, inspect },
        );
      try {
        if (fault === "none") assert.equal(await action(), "sealed");
        else await assert.rejects(action());
        if (
          ["none", "copy-failure", "daemon-created-client-timeout"].includes(
            fault,
          )
        )
          assert.equal(removed, true);
        else assert.equal(removed, false);
        if (
          [
            "daemon-created-client-timeout",
            "create-uncertain",
            "foreign-image",
          ].includes(fault)
        )
          assert.equal(copied, false);
        const record = JSON.parse(
          fs.readFileSync(path.join(output, "extraction-recovery.json")),
        );
        assert.equal(record.removed, removed);
        if (removed) assert.equal(record.id, id);
      } finally {
        fs.rmSync(output, { recursive: true, force: true });
      }
    },
  );
