const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const load = async () =>
  Object.assign(
    {},
    ...(await Promise.all([
      import("./run-harness-ci.mjs"),
      import("./lib/exui-candidate-ci-inputs.mjs"),
      import("./lib/exui-candidate-ci-evidence.mjs"),
      import("./lib/exui-candidate-ci-process.mjs"),
    ])),
  );
const digest = (c) => "sha256:" + c.repeat(64);
const job = {
  schemaVersion: 1,
  candidateManifest: "/inputs/candidate.json",
  expectedArtifactDigest: digest("a"),
  browserCache: "/inputs/browser",
  output: "/outputs/fresh",
};

test("support only: candidate CI requires an explicit strict native-artifact job contract", async () => {
  const { validateCiJob } = await load();
  assert.deepEqual(validateCiJob(job), job);
  for (const altered of [
    { ...job, phases: ["family"] },
    { ...job, output: "relative" },
    { ...job, expectedArtifactDigest: "latest" },
    { ...job, candidateManifest: "/inputs/a\nsecret" },
  ])
    assert.throws(() => validateCiJob(altered));
});

test("support only: CLI missing inputs exits BLOCKED without legacy execution", () => {
  const result = spawnSync(
    process.execPath,
    [path.resolve("scripts/run-harness-ci.mjs")],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        TEST_URL: "https://credential-sentinel.invalid",
      },
    },
  );
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /BLOCKED/);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /credential-sentinel|POC proof/,
  );
});

test("support only: cleanup verifies CID, owner, image, network and every writable mount", async () => {
  const { assertCiContainer } = await load();
  const expected = {
    id: "1".repeat(64),
    owner: "candidate-11111111-1111-4111-8111-111111111111",
    image: digest("a"),
    network: "none",
    mounts: [
      { source: "/source", target: "/harness", writable: false },
      { source: "/output", target: "/output", writable: true },
    ],
  };
  const info = {
    Id: expected.id,
    Image: expected.image,
    Config: {
      Labels: {
        "exui.harness.owner": expected.owner,
        "exui.harness.service": "candidate-runtime",
      },
    },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Privileged: false,
    },
    Mounts: expected.mounts.map((m) => ({
      Type: "bind",
      Source: m.source,
      Destination: m.target,
      RW: m.writable,
    })),
  };
  assertCiContainer(info, expected);
  for (const mutate of [
    (i) => (i.Id = "2".repeat(64)),
    (i) => (i.Image = digest("b")),
    (i) => (i.Config.Labels["exui.harness.owner"] = "foreign"),
    (i) => (i.HostConfig.NetworkMode = "bridge"),
    (i) => (i.Mounts[0].RW = true),
    (i) =>
      i.Mounts.push({
        Type: "bind",
        Source: "/host",
        Destination: "/unexpected",
        RW: true,
      }),
  ]) {
    const changed = structuredClone(info);
    mutate(changed);
    assert.throws(() => assertCiContainer(changed, expected));
  }
});

test("support only: fixed pilot order stops on a validated failure and always cleans owned CCD", async () => {
  const { runFixedCiPilots } = await load();
  for (const failed of [null, "family", "scope", "ccd", "startup"]) {
    const calls = [];
    const operations = {
      phase: async (name) => {
        calls.push(name);
        return {
          status: failed === name ? "FAIL" : "PASS",
          exitCode: failed === name ? 1 : 0,
        };
      },
      derive: async () => {
        calls.push("derive");
      },
      start: async () => {
        calls.push("start");
        if (failed === "startup") throw Error("startup");
      },
      stop: async () => {
        calls.push("stop");
      },
    };
    if (failed === "startup")
      await assert.rejects(runFixedCiPilots(operations), /startup/);
    else {
      const result = await runFixedCiPilots(operations);
      assert.equal(result.exitCode, failed ? 1 : 0);
    }
    assert.deepEqual(
      calls,
      failed === "family"
        ? ["family"]
        : failed === "scope"
          ? ["family", "derive", "scope"]
          : failed === "startup"
            ? ["family", "derive", "scope", "start", "stop"]
            : ["family", "derive", "scope", "start", "ccd", "stop"],
    );
  }
});

test("support only: stale output is rejected without replacing historical evidence", async () => {
  const { createCiOutput } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-stale-"));
  try {
    fs.writeFileSync(path.join(directory, "gate.json"), "historical");
    assert.throws(() => createCiOutput(directory), /FRESH/);
    assert.equal(
      fs.readFileSync(path.join(directory, "gate.json"), "utf8"),
      "historical",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: receipt consumption uses independent expected identity and re-evaluates raw evidence", async () => {
  const { validateCiPhase } = await load();
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { loadRunEvidence } = await import("./lib/exui-evidence-io.mjs");
  const {
    writeRunBundle,
  } = require("./fixtures/exui-evidence-bundle.mock.cjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-receipt-"));
  try {
    const policy = getReleasePolicy("exui-wa-family-pilot");
    const { runPath, run } = writeRunBundle(directory, policy);
    const { receipt } = loadRunEvidence(runPath, policy);
    fs.writeFileSync(
      path.join(directory, "gate.json"),
      JSON.stringify(receipt),
    );
    const expected = {
      runId: run.manifest.runId,
      harnessCommit: run.manifest.harnessCommit,
      releaseScopeId: policy.releaseScopeId,
      policyDigest: policy.policyDigest,
      identity: run.manifest.identity,
      harnessSourceDigest: run.manifest.runtimeMetadata.harnessSourceDigest,
    };
    assert.equal(
      validateCiPhase(directory, expected, { code: 0, signal: null }).status,
      "PASS",
    );
    assert.throws(
      () =>
        validateCiPhase(
          directory,
          {
            ...expected,
            identity: { ...expected.identity, artifactDigest: digest("7") },
          },
          { code: 0, signal: null },
        ),
      /IDENTITY/,
    );
    assert.throws(
      () =>
        validateCiPhase(directory, expected, { code: null, signal: "SIGTERM" }),
      /TERMINAL/,
    );
    fs.rmSync(path.join(directory, "gate.json"));
    assert.throws(() =>
      validateCiPhase(directory, expected, { code: 0, signal: null }),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: process controller captures launch expectations before gate and preserves observed child exit", async () => {
  const { executeCiProcess } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-child-"));
  const output = path.join(directory, "phase");
  try {
    const script = path.join(directory, "child.cjs");
    fs.writeFileSync(
      script,
      `const fs=require('fs'),p=process.argv[2];fs.writeFileSync(p+'/input.json',JSON.stringify({runId:'owned-launch'}));fs.writeFileSync(p+'/container-launch.json','{}');const timer=setInterval(()=>{if(fs.existsSync(p+'/independent-preexecution.json')){clearInterval(timer);fs.writeFileSync(p+'/gate.json','{}');process.exit(23);}},5);`,
    );
    const result = await executeCiProcess({
      script,
      args: [output],
      output,
      onPrepared: (input) => ({
        runId: input.runId,
        identity: "independently-declared",
      }),
    });
    assert.equal(result.terminal.code, 23);
    assert.equal(result.terminal.signal, null);
    assert.equal(result.expected.runId, "owned-launch");
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(output, "independent-preexecution.json")),
      ).capturedBeforeGate,
      true,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: launch cannot credit a completed or absent input handoff", async () => {
  const { executeCiProcess } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-child-missing-"));
  try {
    for (const earlyGate of [false, true]) {
      const output = path.join(directory, String(earlyGate)),
        script = path.join(directory, `child-${earlyGate}.cjs`);
      fs.writeFileSync(
        script,
        earlyGate
          ? `const fs=require('fs'),p=process.argv[2];fs.writeFileSync(p+'/gate.json','{}');fs.writeFileSync(p+'/input.json','{}');fs.writeFileSync(p+'/container-launch.json','{}');setTimeout(()=>process.exit(0),100);`
          : "process.exit(0)",
      );
      await assert.rejects(
        executeCiProcess({
          script,
          args: [output],
          output,
          onPrepared: () => ({}),
        }),
        earlyGate ? /PRECEDE_GATE/ : /LAUNCH_INPUTS_REQUIRED/,
      );
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: foreign container cannot reach destructive cleanup; matched CID must be observed removed", async () => {
  const { removeCiContainer } = await load();
  const expected = {
    id: "1".repeat(64),
    owner: "owned",
    image: digest("a"),
    network: "none",
    mounts: [],
  };
  let removed = false;
  const info = {
    Id: expected.id,
    Image: expected.image,
    Config: {
      Labels: {
        "exui.harness.owner": "foreign",
        "exui.harness.service": "candidate-runtime",
      },
    },
    HostConfig: { NetworkMode: "none", ReadonlyRootfs: true },
    Mounts: [],
  };
  assert.throws(
    () =>
      removeCiContainer(expected, {
        inspect: () => info,
        remove: () => {
          removed = true;
        },
      }),
    /OWNER/,
  );
  assert.equal(removed, false);
  info.Config.Labels["exui.harness.owner"] = "owned";
  removeCiContainer(expected, {
    inspect: () => (removed ? null : info),
    remove: (id) => {
      assert.equal(id, expected.id);
      removed = true;
    },
  });
  assert.equal(removed, true);
});

test("support only: observed daemon architecture and pinned image inventory control CI support", async () => {
  const { observeCiToolchain } = await load();
  const { CCD_IMAGES } = await import("./lib/exui-ccd-runtime.mjs");
  const { ARM64_BROWSER_RUNTIME } = await import("./lib/exui-oci-runtime.mjs");
  let architecture = "arm64",
    missing = false;
  const run = (_command, args) => {
    if (args[0] === "version")
      return JSON.stringify({
        Os: "linux",
        Arch: architecture,
        Version: "29.9.2",
      });
    const image = args[2];
    if (missing) throw Error("missing-cache");
    return JSON.stringify([
      {
        Id: image,
        Os: "linux",
        Architecture: "arm64",
        RepoDigests: ["registry/image@" + image],
      },
    ]);
  };
  const observed = observeCiToolchain({
    run,
    controller: { os: "darwin", architecture: "arm64", node: "v24.22.1" },
  });
  assert.equal(observed.docker.architecture, "arm64");
  assert.equal(observed.browserRuntime.image, ARM64_BROWSER_RUNTIME);
  assert.equal(
    Object.keys(observed.ccdImages).length,
    Object.keys(CCD_IMAGES).length,
  );
  architecture = "amd64";
  assert.throws(() => observeCiToolchain({ run }), /ARM64_DOCKER/);
  architecture = "arm64";
  missing = true;
  assert.throws(() => observeCiToolchain({ run }), /missing-cache/);
});

test("support only: mutable handoff cannot substitute another private source snapshot", async () => {
  const { captureCiOwnership } = await load();
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "ci-owned-snapshot-"),
  );
  try {
    const stage = path.join(directory, "stage");
    fs.mkdirSync(stage);
    const { HARNESS_SOURCE_FILES } =
      await import("./lib/exui-candidate-runtime.mjs");
    for (const file of HARNESS_SOURCE_FILES) {
      const target = path.join(stage, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.resolve(file), target);
    }
    const sourceDigest = digestBytes(
      JSON.stringify(
        HARNESS_SOURCE_FILES.map((file) => [
          file,
          digestBytes(fs.readFileSync(path.resolve(file))),
        ]),
      ),
    );
    const input = {
      runId: "candidate-11111111-1111-4111-8111-111111111111",
      harnessSources: HARNESS_SOURCE_FILES,
      harnessSourceDigest: sourceDigest,
    };
    const output = path.join(directory, "phase");
    fs.mkdirSync(output);
    const handoff = {
      owner: input.runId,
      cidFile: path.join(output, "container-id"),
      stagedHarness: stage,
    };
    const context = {
      sourceDigests: { family: sourceDigest },
      artifact: { candidateRoot: "/candidate" },
      browserRoot: "/browser",
      job: { output: directory },
    };
    const expected = captureCiOwnership(
      input,
      handoff,
      context,
      output,
      "family",
    );
    assert.equal(expected.owner, input.runId);
    assert.equal(
      expected.id,
      undefined,
      "CID may not yet exist when immutable expectations are captured",
    );
    fs.writeFileSync(path.join(stage, HARNESS_SOURCE_FILES[0]), "tampered");
    assert.throws(
      () => captureCiOwnership(input, handoff, context, output, "family"),
      /SNAPSHOT_DIGEST/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: cancellation invalidates public PASS before owned cleanup and records cleanup failure honestly", async () => {
  const { installCiCancellation } = await load();
  const { EventEmitter } = require("node:events");
  const { writePublicSummary } = await import("./lib/exui-evidence-io.mjs");
  for (const failed of [false, true]) {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "ci-cancel-"));
    const target = new EventEmitter();
    let exit;
    target.exit = (code) => {
      exit = code;
    };
    target.stderr = { write: () => {} };
    try {
      const summary = path.join(
        output,
        "public/release-assurance-summary.json",
      );
      writePublicSummary(summary, { status: "PASS", exitCode: 0 }, true);
      const resources = new Map([["owned-cid", "owner"]]);
      let attempted = false;
      const uninstall = installCiCancellation({
        resources,
        output,
        target,
        remove: () => {
          attempted = true;
          assert.equal(JSON.parse(fs.readFileSync(summary)).status, "BLOCKED");
          if (failed) throw Error("foreign-owner");
        },
      });
      target.emit("SIGTERM");
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(exit, 2);
      assert.equal(attempted, true);
      const result = JSON.parse(
        fs.readFileSync(path.join(output, "private/ci-result.json")),
      );
      assert.equal(result.cleanupComplete, !failed);
      assert.equal(result.interruptedBy, "SIGTERM");
      assert.equal(JSON.parse(fs.readFileSync(summary)).releaseApproval, false);
      uninstall();
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  }
});

test("support only: child transport preserves the owned temporary root and excludes inherited service credentials", async () => {
  const { executeCiProcess } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-child-env-"));
  const output = path.join(directory, "phase");
  const before = process.env.IDAM_SECRET;
  process.env.IDAM_SECRET = "credential-sentinel";
  try {
    const script = path.join(directory, "child.cjs");
    fs.writeFileSync(
      script,
      `const fs=require('fs'),p=process.argv[2];fs.writeFileSync(p+'/environment.json',JSON.stringify({tmp:process.env.TMPDIR,secret:process.env.IDAM_SECRET}));fs.writeFileSync(p+'/input.json','{}');fs.writeFileSync(p+'/container-launch.json','{}');const timer=setInterval(()=>{if(fs.existsSync(p+'/independent-preexecution.json')){clearInterval(timer);process.exit(0);}},5);`,
    );
    await executeCiProcess({
      script,
      args: [output],
      output,
      onPrepared: () => ({}),
    });
    const env = JSON.parse(
      fs.readFileSync(path.join(output, "environment.json")),
    );
    assert.equal(env.tmp, fs.realpathSync(os.tmpdir()));
    assert.equal(env.secret, undefined);
  } finally {
    if (before === undefined) delete process.env.IDAM_SECRET;
    else process.env.IDAM_SECRET = before;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: independently declared artifact mismatch initializes BLOCKED before any phase can start", async () => {
  const { describeCandidateArtifact } =
    await import("./lib/exui-candidate-artifact.mjs");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "ci-artifact-input-"),
  );
  try {
    const artifact = path.join(directory, "artifact");
    const files = {
      "dist/rpx-exui/browser/index.html": "ui-fixture",
      "dist/rpx-exui/api/server.bundle.js": "server-fixture",
      "api/package.json": "{}",
      "config/default.json": "{}",
      "runtime/node": "node-fixture",
      "package.json":
        '{"dependencies":{"@hmcts/ccd-case-ui-toolkit":"7.4.21"}}',
      "yarn.lock": "lock-fixture",
      "node_modules/@hmcts/ccd-case-ui-toolkit/package.json":
        '{"version":"7.4.21"}',
    };
    for (const [name, contents] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(artifact, name)), {
        recursive: true,
      });
      fs.writeFileSync(path.join(artifact, name), contents);
    }
    const manifest = await describeCandidateArtifact(artifact, {
      sourceMethod: "git-archive",
      webappCommit: "a".repeat(40),
      sourceTree: "b".repeat(40),
      platform: "linux/arm64",
      buildImage: digest("c"),
      install: "immutable-offline",
    });
    const candidateManifest = path.join(directory, "candidate.json");
    fs.writeFileSync(candidateManifest, JSON.stringify(manifest));
    const output = path.join(directory, "fresh"),
      input = path.join(directory, "job.json");
    fs.writeFileSync(
      input,
      JSON.stringify({
        ...job,
        candidateManifest,
        output,
        expectedArtifactDigest: digest("0"),
      }),
    );
    const result = spawnSync(
      process.execPath,
      [path.resolve("scripts/run-harness-ci.mjs"), "--input", input],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );
    assert.equal(result.status, 2);
    const summary = JSON.parse(
      fs.readFileSync(
        path.join(output, "public/release-assurance-summary.json"),
      ),
    );
    assert.equal(summary.status, "BLOCKED");
    assert.equal(summary.releaseApproval, false);
    assert.equal(summary.receiptAvailable, false);
    assert.equal(fs.existsSync(path.join(output, "private/family")), false);
    assert.match(
      fs.readFileSync(
        path.join(output, "private/orchestration-error.json"),
        "utf8",
      ),
      /DECLARED_ARTIFACT_DIGEST_MISMATCH/,
    );
    assert.deepEqual(fs.readdirSync(path.join(output, "public")), [
      "release-assurance-summary.json",
    ]);
    const guardedOutput = path.join(directory, "authority-guarded");
    fs.writeFileSync(
      input,
      JSON.stringify({
        ...job,
        candidateManifest,
        output: guardedOutput,
        expectedArtifactDigest: manifest.identity.artifactDigest,
      }),
    );
    const guarded = spawnSync(
      process.execPath,
      [path.resolve("scripts/run-harness-ci.mjs"), "--input", input],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );
    assert.equal(guarded.status, 2);
    assert.match(
      fs.readFileSync(
        path.join(guardedOutput, "private/orchestration-error.json"),
        "utf8",
      ),
      /NATIVE_CANDIDATE_AUTHORITY_ISOLATION_REQUIRED/,
    );
    assert.equal(
      fs.existsSync(path.join(guardedOutput, "private/family")),
      false,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: output overlap and canonical symlink aliases are rejected before touching immutable bytes", async () => {
  const { createCiOutput } = await load();
  const { digestCandidateTree } =
    await import("./lib/exui-candidate-artifact.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-overlap-"));
  try {
    const immutable = path.join(directory, "candidate");
    fs.mkdirSync(immutable);
    fs.writeFileSync(path.join(immutable, "sentinel"), "sealed");
    const before = await digestCandidateTree(immutable);
    const alias = path.join(directory, "alias");
    fs.symlinkSync(immutable, alias);
    for (const output of [
      path.join(immutable, "fresh"),
      path.join(alias, "fresh-alias"),
    ]) {
      assert.throws(() => createCiOutput(output, [immutable]), /OVERLAP/);
      assert.equal(fs.existsSync(output), false);
      assert.equal(await digestCandidateTree(immutable), before);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: public summary reset rejects outside-root directory symlinks", async () => {
  const { writeCiPublicSummary } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-public-link-"));
  const output = path.join(directory, "output"),
    outside = path.join(directory, "outside");
  fs.mkdirSync(output);
  fs.mkdirSync(outside);
  fs.writeFileSync(
    path.join(outside, "release-assurance-summary.json"),
    "outside-sentinel",
  );
  fs.symlinkSync(outside, path.join(output, "public"));
  try {
    assert.throws(
      () =>
        writeCiPublicSummary(fs.realpathSync(output), {
          status: "BLOCKED",
          exitCode: 2,
        }),
      /PUBLIC/,
    );
    assert.equal(
      fs.readFileSync(
        path.join(outside, "release-assurance-summary.json"),
        "utf8",
      ),
      "outside-sentinel",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: coherent product FAIL propagates one and a forged PASS cannot replace raw mutation evidence", async () => {
  const { validateCiPhase } = await load();
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { loadRunEvidence } = await import("./lib/exui-evidence-io.mjs");
  const {
    writeRunBundle,
  } = require("./fixtures/exui-evidence-bundle.mock.cjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-product-fail-"));
  try {
    const policy = getReleasePolicy("exui-wa-scope-pilot");
    const { runPath, run } = writeRunBundle(directory, policy, {
      baselineExit: 1,
      baselineReport: {
        schemaVersion: 1,
        complete: true,
        status: "failed",
        globalErrors: [],
        tests: [
          {
            proofId: "wa-org-scope-ia",
            expectedStatus: "passed",
            status: "passed",
            retry: 0,
            failureId: null,
            unattributedErrors: 0,
          },
          {
            proofId: "wa-org-scope-civil",
            expectedStatus: "passed",
            status: "failed",
            retry: 0,
            failureId: "organisation-scope",
            unattributedErrors: 0,
          },
        ],
      },
    });
    const { receipt } = loadRunEvidence(runPath, policy);
    assert.equal(receipt.verdict.status, "FAIL");
    fs.writeFileSync(
      path.join(directory, "gate.json"),
      JSON.stringify(receipt),
    );
    const expected = {
      runId: run.manifest.runId,
      harnessCommit: run.manifest.harnessCommit,
      releaseScopeId: policy.releaseScopeId,
      policyDigest: policy.policyDigest,
      identity: run.manifest.identity,
      harnessSourceDigest: run.manifest.runtimeMetadata.harnessSourceDigest,
    };
    assert.equal(
      validateCiPhase(directory, expected, { code: 1, signal: null }).exitCode,
      1,
    );
    assert.throws(
      () =>
        validateCiPhase(
          directory,
          { ...expected, runId: "different-current-launch" },
          { code: 1, signal: null },
        ),
      /INDEPENDENT_IDENTITY/,
    );
    fs.writeFileSync(
      path.join(directory, "gate.json"),
      JSON.stringify({
        ...receipt,
        verdict: { status: "PASS", exitCode: 0, reasons: [] },
      }),
    );
    assert.throws(
      () => validateCiPhase(directory, expected, { code: 0, signal: null }),
      /RECOMPUTATION/,
    );
    fs.writeFileSync(
      path.join(directory, "gate.json"),
      JSON.stringify(receipt),
    );
    fs.rmSync(path.join(directory, "baseline-report.json"));
    assert.throws(() =>
      validateCiPhase(directory, expected, { code: 1, signal: null }),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: partial CCD startup recovers unrecorded server-created containers and tolerates removed services", async () => {
  const { cleanupCiCcd } = await load();
  const { CCD_IMAGES } = await import("./lib/exui-ccd-runtime.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-ccd-recovery-"));
  try {
    const owner = "harness-0123456789abcdef",
      resources = Object.fromEntries(
        Object.entries(CCD_IMAGES).map(([service, image]) => [
          service,
          { name: `${owner}-${service}`, image },
        ]),
      );
    fs.writeFileSync(
      path.join(directory, "recovery.json"),
      JSON.stringify({ owner, output: directory, resources }),
    );
    fs.writeFileSync(
      path.join(directory, "runtime.json"),
      JSON.stringify({ owner, output: directory, containers: {} }),
    );
    const id = "a".repeat(64),
      existing = {
        Id: id,
        Name: `/${resources.database.name}`,
        Image: CCD_IMAGES.database,
        Config: {
          Labels: {
            "exui.harness.owner": owner,
            "exui.harness.service": "database",
          },
        },
        HostConfig: { NetworkMode: "none" },
      };
    let stopped;
    cleanupCiCcd(directory, {
      inspect: (name) => (name === resources.database.name ? existing : null),
      stop: (state) => {
        stopped = state;
      },
    });
    assert.deepEqual(stopped.containers, { database: id });
    assert.equal(stopped.namespace, id);
    for (const change of [
      (i) => (i.Image = digest("f")),
      (i) => (i.Config.Labels["exui.harness.owner"] = "foreign"),
      (i) => (i.HostConfig.NetworkMode = "bridge"),
    ]) {
      const altered = structuredClone(existing);
      change(altered);
      stopped = null;
      assert.throws(() =>
        cleanupCiCcd(directory, {
          inspect: (name) =>
            name === resources.database.name ? altered : null,
          stop: (state) => {
            stopped = state;
          },
        }),
      );
      assert.equal(stopped, null);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: cancellation observes a late host handoff and terminal Docker client before cleanup", async () => {
  const { cleanupCiPhase } = await load();
  const { spawn } = require("node:child_process");
  const { once } = require("node:events");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-late-handoff-"));
  const owner = "candidate-11111111-1111-4111-8111-111111111111",
    id = "a".repeat(64),
    script = path.join(directory, "child.cjs");
  let child;
  try {
    fs.writeFileSync(
      script,
      `const fs=require('fs'),p=process.argv[2];process.on('SIGTERM',()=>{fs.writeFileSync(p+'/container-launch.json','{}');fs.writeFileSync(p+'/container-id',${JSON.stringify(id)});fs.writeFileSync(p+'/docker-client-shutdown.json',JSON.stringify({owner:${JSON.stringify(owner)},observed:true,forced:false}));process.exit(0);});console.log('ready');setInterval(()=>{},1000);`,
    );
    child = spawn(process.execPath, [script, directory], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH },
    });
    await once(child.stdout, "data");
    const expected = { owner, image: digest("a"), network: "none", mounts: [] };
    const info = {
      Id: id,
      Name: `/${owner}`,
      Image: expected.image,
      Config: {
        Labels: {
          "exui.harness.owner": owner,
          "exui.harness.service": "candidate-runtime",
        },
      },
      HostConfig: { NetworkMode: "none", ReadonlyRootfs: true },
      Mounts: [],
    };
    let removed = false;
    await cleanupCiPhase(
      { directory, name: "family", child, expectedContainer: expected },
      {},
      {
        inspect: () => (removed ? null : info),
        remove: () => {
          assert.equal(
            child.exitCode,
            0,
            "host terminal must be observed before Docker removal",
          );
          removed = true;
        },
      },
    );
    assert.equal(removed, true);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: missing CID recovers only the planned owned container and unknown creation stays incomplete", async () => {
  const { cleanupCiPhase } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ci-missing-cid-"));
  const owner = "candidate-11111111-1111-4111-8111-111111111111",
    id = "a".repeat(64),
    expected = { owner, image: digest("a"), network: "none", mounts: [] };
  try {
    fs.writeFileSync(path.join(directory, "container-launch.json"), "{}");
    fs.writeFileSync(
      path.join(directory, "docker-client-shutdown.json"),
      JSON.stringify({ owner, observed: true, forced: false }),
    );
    const info = {
      Id: id,
      Name: `/${owner}`,
      Image: expected.image,
      Config: {
        Labels: {
          "exui.harness.owner": owner,
          "exui.harness.service": "candidate-runtime",
        },
      },
      HostConfig: { NetworkMode: "none", ReadonlyRootfs: true },
      Mounts: [],
    };
    let removed = false;
    await cleanupCiPhase(
      { directory, name: "family", expectedContainer: expected },
      {},
      {
        inspect: (name) => {
          assert([owner, id].includes(name));
          return removed ? null : info;
        },
        remove: (actual) => {
          assert.equal(actual, id);
          removed = true;
        },
        reconcileMs: 0,
      },
    );
    assert.equal(removed, true);
    await assert.rejects(
      cleanupCiPhase(
        { directory, name: "family", expectedContainer: expected },
        {},
        {
          inspect: () => null,
          remove: () => assert.fail("unknown identity cannot be removed"),
          reconcileMs: 0,
        },
      ),
      /CREATION_OUTCOME_UNCERTAIN/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: terminal async cancellation overwrites an intervening normal PASS", async () => {
  const { installCiCancellation } = await load();
  const { EventEmitter } = require("node:events");
  const { writePublicSummary } = await import("./lib/exui-evidence-io.mjs");
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "ci-cancel-final-"));
  const target = new EventEmitter();
  let release, exited;
  const done = new Promise((resolve) => {
    exited = resolve;
  });
  target.exit = exited;
  target.stderr = { write: () => {} };
  try {
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const uninstall = installCiCancellation({
      resources: new Map([["owned", {}]]),
      output,
      target,
      remove: () => pending,
    });
    target.emit("SIGTERM");
    writePublicSummary(
      path.join(output, "public/release-assurance-summary.json"),
      { status: "PASS", exitCode: 0 },
      true,
    );
    release();
    assert.equal(await done, 2);
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(output, "public/release-assurance-summary.json"),
        ),
      ).status,
      "BLOCKED",
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(output, "private/ci-result.json")))
        .exitCode,
      2,
    );
    uninstall();
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("support only: phase source membership is parent-owned and rejects empty or changed inventories before hashing", async () => {
  const { captureCiPhaseExpectation } = await load();
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const { HARNESS_SOURCE_FILES } =
    await import("./lib/exui-candidate-runtime.mjs");
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "ci-source-inventory-"),
  );
  try {
    const identity = { artifactDigest: digest("a") },
      context = {
        commit: "a".repeat(40),
        artifact: { identity },
        dependencies: { digest: digest("b") },
        browserDigest: digest("c"),
        identity,
        ccdIdentity: identity,
      };
    const input = {
      runId: "candidate-11111111-1111-4111-8111-111111111111",
      harnessCommit: context.commit,
      harnessSourceState: "clean",
      artifact: { identity },
      harnessDependencies: context.dependencies,
      browserDigest: context.browserDigest,
      harnessSources: [],
      harnessSourceDigest: digestBytes("[]"),
    };
    const handoff = {
      owner: input.runId,
      cidFile: path.join(directory, "container-id"),
      stagedHarness: directory,
    };
    for (const name of ["family", "scope", "ccd"])
      for (const list of [
        [],
        HARNESS_SOURCE_FILES.slice(1),
        [...HARNESS_SOURCE_FILES].reverse(),
      ])
        assert.throws(
          () =>
            captureCiPhaseExpectation(
              name,
              { ...input, harnessSources: list },
              handoff,
              context,
              directory,
            ),
          /SOURCE_INVENTORY/,
        );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: actual CI stop callback returns owned cleanup completion and propagates rejection", async () => {
  const { runFixedCiPilots } = await load();
  const source = fs.readFileSync(
    path.resolve("scripts/run-harness-ci.mjs"),
    "utf8",
  );
  const match = source.match(/stop:\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\},/);
  assert(match, "fixed CCD stop callback exists");
  const stop = new Function("resources", "remove", `return()=>{${match[1]}}`)(
    new Map([["ccd-runtime", {}]]),
    () => Promise.reject(Error("controlled-owned-cleanup-rejection")),
  );
  await assert.rejects(
    runFixedCiPilots({
      phase: async () => ({ status: "PASS", exitCode: 0 }),
      derive: async () => {},
      start: async () => {},
      stop,
    }),
    /controlled-owned-cleanup-rejection/,
  );
});
