const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const sha = (letter) => `sha256:${letter.repeat(64)}`;
const descriptor = {
  observedImageId: sha("a"),
  digest: sha("b"),
  imageReference: `registry.example/app@${sha("b")}`,
  platform: "linux/arm64",
};
const config = { services: {}, feature: {}, now: false };

test("read-only payload mounts cannot be reached through a writable parent or alias", async (t) => {
  const { assertReadOnlyMountIsolation } =
    await import("./lib/exui-oci-runtime.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oci-mount-alias-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, "payload");
  const output = path.join(root, "output");
  fs.mkdirSync(payload);
  fs.mkdirSync(output);
  assertReadOnlyMountIsolation([payload], [output]);
  assert.throws(
    () => assertReadOnlyMountIsolation([payload], [root]),
    /WRITABLE_ALIAS/,
  );
  assert.throws(
    () => assertReadOnlyMountIsolation([root], [output]),
    /WRITABLE_ALIAS/,
  );
  fs.symlinkSync(payload, path.join(root, "writable-alias"));
  assert.throws(
    () =>
      assertReadOnlyMountIsolation(
        [payload],
        [path.join(root, "writable-alias")],
      ),
    /WRITABLE_ALIAS/,
  );
});

test(
  "actual SIGTERM invokes owned cleanup and exits blocked before receipt finalization",
  { timeout: 5000 },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oci-cancel-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const marker = path.join(root, "cleanup.log");
    const gate = path.join(root, "gate.json");
    const module = pathToFileURL(
      path.join(__dirname, "lib/exui-oci-runtime.mjs"),
    ).href;
    const source = `import fs from 'node:fs';import {installCancellationCleanup} from ${JSON.stringify(module)};
    installCancellationCleanup({resources:new Map([['browser','owner'],['candidate','owner']]),
      onCancel:signal=>fs.appendFileSync(${JSON.stringify(marker)},signal+'\\n'),
      remove:(id,owner)=>fs.appendFileSync(${JSON.stringify(marker)},'rm:'+id+':'+owner+'\\n')});
    console.log('READY');setTimeout(()=>fs.writeFileSync(${JSON.stringify(gate)},'must not finalize'),10000);`;
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", source],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    t.after(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    });
    const terminal = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    await new Promise((resolve, reject) => {
      child.stdout.once("data", (chunk) =>
        chunk.toString().includes("READY")
          ? resolve()
          : reject(new Error("Unexpected child output")),
      );
      child.once("error", reject);
    });
    child.kill("SIGTERM");
    assert.deepEqual(await terminal, { code: 2, signal: null });
    assert.equal(
      fs.readFileSync(marker, "utf8"),
      "SIGTERM\nrm:candidate:owner\nrm:browser:owner\n",
    );
    assert.equal(fs.existsSync(gate), false);
  },
);

test("metadata must be a regular file within the extracted image before its contents are read", async (t) => {
  const { readImageMetadata } = await import("./lib/exui-oci-runtime.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oci-metadata-path-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "harness-build.json"),
    '{"schemaVersion":1}',
  );
  assert.deepEqual(readImageMetadata(root), { schemaVersion: 1 });
  fs.unlinkSync(path.join(root, "harness-build.json"));
  fs.symlinkSync("/etc/passwd", path.join(root, "harness-build.json"));
  assert.throws(() => readImageMetadata(root), /REGULAR_FILE/);
});

test("observed containers reject host networking, extra writable mounts and privilege drift", async () => {
  const { assertOwnedContainer } = await import("./lib/exui-oci-runtime.mjs");
  const expected = {
    image: sha("a"),
    namespace: "c".repeat(64),
    owner: "harness-oci-a1",
    service: "candidate",
    running: true,
    mounts: [{ source: "/sessions", target: "/tmp/.sessions", writable: true }],
  };
  const info = {
    Image: sha("a"),
    Config: {
      Labels: {
        "exui.harness.owner": expected.owner,
        "exui.harness.service": "candidate",
      },
    },
    HostConfig: {
      NetworkMode: `container:${expected.namespace}`,
      ReadonlyRootfs: true,
      Init: true,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      PidsLimit: 256,
      Memory: 4294967296,
      NanoCpus: 2000000000,
    },
    RestartCount: 0,
    State: { Running: true, OOMKilled: false },
    Mounts: [
      {
        Type: "bind",
        Source: "/sessions",
        Destination: "/tmp/.sessions",
        RW: true,
      },
    ],
  };
  assertOwnedContainer(info, expected);
  for (const patch of [
    { NetworkMode: "host" },
    { Privileged: true },
    { CapDrop: [] },
    { SecurityOpt: [] },
    { ReadonlyRootfs: false },
    { Init: false },
    { PortBindings: { "3100/tcp": [{ HostPort: "3100" }] } },
  ])
    assert.throws(() =>
      assertOwnedContainer(
        { ...info, HostConfig: { ...info.HostConfig, ...patch } },
        expected,
      ),
    );
  assert.throws(() =>
    assertOwnedContainer(
      {
        ...info,
        Mounts: [
          ...info.Mounts,
          {
            Type: "bind",
            Source: "/var/run/docker.sock",
            Destination: "/socket",
            RW: true,
          },
        ],
      },
      expected,
    ),
  );
  assert.throws(
    () =>
      assertOwnedContainer(
        { ...info, State: { ...info.State, Running: false } },
        expected,
      ),
    /EXITED/,
  );
});

test("OCI candidate executes image-owned Node with narrow mounts and no inherited process environment", async () => {
  const { candidateImageArguments } =
    await import("./lib/exui-oci-runtime.mjs");
  const args = candidateImageArguments({
    descriptor,
    namespace: "c".repeat(64),
    owner: "harness-oci-a1",
    sessions: "/private/sessions",
    diagnostics: "/private/diagnostics",
    guard: "/private/guard.cjs",
    config,
  });
  assert(args.includes(`container:${"c".repeat(64)}`));
  assert(args.includes("--init"));
  assert(args.includes(descriptor.imageReference));
  assert.deepEqual(args.slice(-4), [
    "/usr/local/bin/node",
    "--require",
    "/harness-network-guard.cjs",
    "/opt/app/dist/rpx-exui/api/server.bundle.js",
  ]);
  assert(args.includes("-i"));
  assert(args.includes("NODE_CONFIG_DIR=/opt/app/config"));
  assert.equal(args.filter((arg) => arg.startsWith("type=bind,")).length, 3);
  assert(
    args.some((arg) => arg.endsWith("dst=/harness-network-guard.cjs,readonly")),
  );
  assert(
    !args.some(
      (arg) =>
        arg.includes("docker.sock") ||
        arg.includes("/output") ||
        arg === "--publish",
    ),
  );
  assert.throws(
    () =>
      candidateImageArguments({
        descriptor,
        namespace: "host",
        owner: "harness-oci-a1",
        sessions: "/s",
        diagnostics: "/d",
        guard: "/g",
        config,
      }),
    /NAMESPACE/,
  );
});

test("browser architecture and runtime image identity are explicit on both supported platforms", async () => {
  const { browserExecutable, assertBrowserRuntime } =
    await import("./lib/exui-oci-runtime.mjs");
  const browsers = {
    browsers: [{ name: "chromium-headless-shell", revision: "1248" }],
  };
  assert(browserExecutable(browsers, "linux/amd64").includes("linux64"));
  assert(browserExecutable(browsers, "linux/arm64").includes("linux-arm64"));
  for (const architecture of ["amd64", "arm64"])
    assertBrowserRuntime(
      {
        Id: sha("a"),
        Os: "linux",
        Architecture: architecture,
        RepoDigests: [`repo@${sha("a")}`],
      },
      sha("a"),
      `linux/${architecture}`,
    );
  assert.throws(() =>
    assertBrowserRuntime(
      {
        Id: sha("a"),
        Os: "linux",
        Architecture: "amd64",
        RepoDigests: ["repo"],
      },
      sha("a"),
      "linux/arm64",
    ),
  );
  assert.throws(() => browserExecutable(browsers, "linux/s390x"));
});

test("host lifecycle finalizes only an observed running candidate followed by its requested SIGTERM", async () => {
  const { stopCandidateAndObserve } =
    await import("./lib/exui-oci-runtime.mjs");
  const before = { State: { Running: true, StartedAt: "start" } };
  const after = {
    State: {
      Running: false,
      StartedAt: "start",
      ExitCode: 143,
      OOMKilled: false,
      Error: "",
    },
    RestartCount: 0,
  };
  const order = [];
  let observed = 0;
  await stopCandidateAndObserve({
    inspect: async () => {
      order.push("inspect");
      return observed++ ? after : before;
    },
    signal: async () => {
      order.push("signal");
      return true;
    },
    wait: async () => {
      order.push("wait");
    },
  });
  assert.deepEqual(order, ["inspect", "signal", "wait", "inspect"]);
  let signalled = false;
  await assert.rejects(
    stopCandidateAndObserve({
      inspect: async () => after,
      signal: async () => {
        signalled = true;
      },
      wait: async () => {},
    }),
    /PREMATURE/,
  );
  assert.equal(signalled, false);
  for (const changed of [
    { ...after, State: { ...after.State, ExitCode: 0 } },
    { ...after, State: { ...after.State, OOMKilled: true } },
    { ...after, RestartCount: 1 },
  ]) {
    let count = 0;
    await assert.rejects(
      stopCandidateAndObserve({
        inspect: async () => (count++ ? changed : before),
        signal: async () => true,
        wait: async () => {},
      }),
    );
  }
  let count = 0;
  await assert.rejects(
    stopCandidateAndObserve({
      inspect: async () => (count++ ? after : before),
      signal: async () => false,
      wait: async () => {},
    }),
    /NOT_REQUESTED/,
  );
});

test("cancellation awaits asynchronous owned cleanup before terminal exit and preserves failures", async () => {
  const { installCancellationCleanup } =
    await import("./lib/exui-oci-runtime.mjs");
  const { EventEmitter } = await import("node:events");
  for (const fail of [false, true]) {
    const target = new EventEmitter(),
      order = [];
    let release;
    target.stderr = { write: () => order.push("warning") };
    target.exit = (code) => order.push(`exit:${code}`);
    const pending = new Promise((resolve, reject) => {
      release = () => (fail ? reject(Error("cleanup")) : resolve());
    });
    const uninstall = installCancellationCleanup({
      resources: new Map([["owned", "owner"]]),
      target,
      onCancel: () => order.push("invalidate"),
      remove: () => {
        order.push("remove");
        return pending;
      },
    });
    target.emit("SIGTERM");
    assert.deepEqual(order, ["invalidate", "remove"]);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
      order,
      fail
        ? ["invalidate", "remove", "warning", "exit:2"]
        : ["invalidate", "remove", "exit:2"],
    );
    uninstall();
  }
});
