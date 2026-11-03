const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { writeRunBundle } = require("./fixtures/exui-evidence-bundle.mock.cjs");
const cli = path.resolve("scripts/export-exui-private-evidence.mjs");
const digest = (bytes) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const temporary = () =>
  fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "private-evidence-"));
const io = () => import("./lib/exui-evidence-io.mjs");
async function fixture(root, status = "PASS", alter) {
  const phase = path.join(root, "phase");
  const policy = (
    await import("./lib/exui-release-policy.mjs")
  ).getReleasePolicy("exui-wa-scope-pilot");
  const initial = writeRunBundle(phase, policy);
  const report = initial.baselineReport;
  if (status !== "BLOCKED")
    report.tests.push({
      ...report.tests[0],
      proofId: "wa-org-scope-civil",
      status: status === "FAIL" ? "failed" : "passed",
      failureId: status === "FAIL" ? "organisation-scope" : null,
    });
  report.status = status === "FAIL" ? "failed" : "passed";
  writeRunBundle(phase, policy, {
    baselineReport: report,
    baselineExit: status === "FAIL" ? 1 : 0,
    runtimeMetadata: {
      isolation: "native-separate-api-owned-network-none",
      candidateAuthorityIsolation: "separate-container-no-evidence-mount",
      harnessDependencyDigest: digest("deps"),
      browserDigest: digest("browser"),
    },
  });
  if (alter) alter(phase);
  const loaded = (await io()).loadRunEvidence(
    path.join(phase, "run.json"),
    policy,
  );
  if (!alter) assert.equal(loaded.receipt.verdict.status, status);
  const gate = Buffer.from(JSON.stringify(loaded.receipt, null, 2) + "\n");
  fs.writeFileSync(path.join(phase, "gate.json"), gate);
  const m = loaded.input.manifest;
  const launch = {
    runId: m.runId,
    harnessCommit: m.harnessCommit,
    releaseScopeId: m.releaseScopeId,
    policyDigest: m.policyDigest,
    identity: m.identity,
    harnessSourceDigest: m.runtimeMetadata.harnessSourceDigest,
    harnessDependencyDigest: m.runtimeMetadata.harnessDependencyDigest,
    browserDigest: m.runtimeMetadata.browserDigest,
    nativeAuthority: true,
  };
  const expected = path.join(root, "expected.json");
  write(expected, {
    ...launch,
    evidenceManifestDigest: loaded.evidenceManifestDigest,
    receiptArtifactDigest: digest(gate),
  });
  const terminal = path.join(root, "observed-terminal.json");
  write(terminal, {
    terminal: { code: loaded.receipt.verdict.exitCode, signal: null },
    expected: launch,
  });
  write(path.join(phase, "controller-terminal.json"), {
    status: "completed",
    exitCode: loaded.receipt.verdict.exitCode,
    cleanupComplete: true,
  });
  for (const e of loaded.input.executions) {
    const d = path.join(phase, e.invocationId);
    fs.mkdirSync(d);
    write(path.join(d, "candidate-write-denial.json"), {
      attempts: [
        { path: "/output/report.json", denied: true },
        { path: "/harness/controller.mjs", denied: true },
      ],
      controllerSourceVisible: false,
    });
    write(path.join(d, "candidate-lifecycle.json"), {
      requestedStop: true,
      before: { State: { Running: true } },
      after: { State: { Running: false, ExitCode: 143 } },
    });
    fs.writeFileSync(
      path.join(d, "browser-journal.jsonl"),
      '{"private":"private-export-secret-canary"}\n',
    );
    fs.mkdirSync(path.join(d, "empty-directory"));
  }
  write(path.join(phase, "source-snapshot.json"), {
    retained: true,
    path: path.join(root, "external-source-do-not-follow"),
    digest: launch.harnessSourceDigest,
  });
  fs.mkdirSync(path.join(root, "external-source-do-not-follow"));
  fs.writeFileSync(
    path.join(root, "external-source-do-not-follow/sentinel"),
    "external-original",
  );
  fs.mkdirSync(path.join(phase, "public"));
  fs.writeFileSync(
    path.join(phase, "public/release-assurance-summary.json"),
    "original-public-sentinel",
  );
  return {
    phase,
    expected,
    terminal,
    destination: path.join(root, "bundle"),
    loaded,
    gate,
  };
}
function child(args, preload) {
  const r = spawnSync(
    process.execPath,
    [...(preload ? ["--require", preload] : []), cli, ...args],
    { encoding: "utf8", env: { PATH: process.env.PATH }, timeout: 15000 },
  );
  assert.equal(r.error, undefined);
  assert.doesNotMatch(
    r.stdout + r.stderr,
    /private-export-secret-canary|external-original|synthetic-fs-secret/,
  );
  return r;
}
const exportArgs = (f) => [
  "export",
  "--phase",
  f.phase,
  "--expected",
  f.expected,
  "--terminal",
  f.terminal,
  "--destination",
  f.destination,
];
const verifyArgs = (f, hash) => [
  "verify",
  "--bundle",
  f.destination,
  "--expected",
  f.expected,
  "--manifest-digest",
  hash,
];
function tree(root) {
  const rows = [];
  const visit = (dir, rel = "") => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name),
        r = rel ? rel + "/" + name : name,
        s = fs.lstatSync(p);
      rows.push(
        s.isDirectory()
          ? ["directory", r]
          : s.isSymbolicLink()
            ? ["link", r, fs.readlinkSync(p)]
            : ["file", r, digest(fs.readFileSync(p))],
      );
      if (s.isDirectory()) visit(p, r);
    }
  };
  visit(root);
  return rows;
}
for (const status of ["PASS", "FAIL", "BLOCKED"])
  test(
    "support only: actual private CLI preserves complete native " +
      status +
      " and exact consumer outcome",
    async () => {
      const root = temporary();
      try {
        const f = await fixture(root, status);
        const before = tree(f.phase);
        const result = child(exportArgs(f));
        assert.equal(result.status, 0, result.stderr);
        const summary = JSON.parse(result.stdout);
        assert.equal(summary.originalStatus, status);
        assert.equal(summary.kind, "private-evidence-operation");
        assert.equal(summary.releaseApproval, false);
        assert.deepEqual(tree(path.join(f.destination, "phase")), before);
        assert.deepEqual(tree(f.phase), before);
        assert(
          fs.existsSync(
            path.join(f.destination, "phase/baseline-1/empty-directory"),
          ),
        );
        assert.equal(
          fs.readFileSync(path.join(f.destination, "phase/gate.json"), "utf8"),
          f.gate.toString(),
        );
        const all = tree(f.destination);
        for (const [kind, relative] of all)
          assert.equal(
            fs.statSync(path.join(f.destination, relative)).mode & 0o777,
            kind === "directory" ? 0o700 : 0o600,
            relative,
          );
        const bundleBefore = tree(f.destination);
        const checked = child(verifyArgs(f, summary.manifestDigest));
        assert.equal(checked.status, 0, checked.stderr);
        assert.equal(JSON.parse(checked.stdout).originalStatus, status);
        assert.deepEqual(tree(f.destination), bundleBefore);
        const consumer = spawnSync(
          process.execPath,
          [
            path.resolve("scripts/verify-exui-release-gate.mjs"),
            "--receipt",
            path.join(f.destination, "phase/gate.json"),
            "--expected",
            f.expected,
          ],
          { encoding: "utf8", env: { PATH: process.env.PATH } },
        );
        assert.equal(consumer.status, f.loaded.receipt.verdict.exitCode);
        assert.equal(
          fs.readFileSync(
            path.join(root, "external-source-do-not-follow/sentinel"),
            "utf8",
          ),
          "external-original",
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

function rewriteRaw(phase, change) {
  const run = read(path.join(phase, "run.json")),
    ref = run.executionArtifacts[0],
    execution = read(path.join(phase, ref.path));
  const report = read(path.join(phase, execution.resultArtifact.path));
  change(execution, report);
  const reportBytes = Buffer.from(JSON.stringify(report));
  fs.writeFileSync(
    path.join(phase, execution.resultArtifact.path),
    reportBytes,
  );
  execution.resultArtifact.digest = digest(reportBytes);
  const executionBytes = Buffer.from(JSON.stringify(execution));
  fs.writeFileSync(path.join(phase, ref.path), executionBytes);
  ref.digest = digest(executionBytes);
  write(path.join(phase, "run.json"), run);
}
for (const [name, change] of [
  [
    "unfinalized execution",
    (e) => {
      e.terminalState = "interrupted";
    },
  ],
  [
    "unsupported runner exit",
    (e) => {
      e.runnerExitCode = 2;
    },
  ],
  [
    "timed-out report",
    (_e, r) => {
      r.status = "timedout";
    },
  ],
  [
    "interrupted test",
    (_e, r) => {
      r.tests[0].status = "interrupted";
    },
  ],
])
  test(
    "support only: matching recomputed BLOCKED cannot export " + name,
    async () => {
      const root = temporary();
      try {
        const f = await fixture(root, "PASS", (phase) =>
          rewriteRaw(phase, change),
        );
        assert.equal(f.loaded.receipt.verdict.status, "BLOCKED");
        const before = tree(f.phase);
        assert.equal(child(exportArgs(f)).status, 2);
        assert(!fs.existsSync(path.join(f.destination, "manifest.json")));
        assert.deepEqual(tree(f.phase), before);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

test("support only: independent identity, both transport digests and implementation digests cannot be substituted", async () => {
  for (const field of [
    "receiptArtifactDigest",
    "evidenceManifestDigest",
    "identity",
    "harnessSourceDigest",
    "harnessDependencyDigest",
    "browserDigest",
    "terminal-launch",
    "terminal-signal",
    "terminal-exit",
  ]) {
    const root = temporary();
    try {
      const f = await fixture(root);
      const expected = read(f.expected),
        observed = read(f.terminal);
      if (field === "identity") {
        expected.identity.artifactDigest = digest("foreign");
        observed.expected.identity = expected.identity;
      } else if (field === "terminal-launch")
        observed.expected.harnessCommit = "f".repeat(40);
      else if (field === "terminal-signal")
        observed.terminal.signal = "SIGTERM";
      else if (field === "terminal-exit") observed.terminal.code = 2;
      else {
        expected[field] = digest("foreign");
        if (
          !["receiptArtifactDigest", "evidenceManifestDigest"].includes(field)
        )
          observed.expected[field] = expected[field];
      }
      write(f.expected, expected);
      write(f.terminal, observed);
      const before = tree(f.phase);
      assert.equal(child(exportArgs(f)).status, 2, field);
      assert(!fs.existsSync(f.destination), field);
      assert.deepEqual(tree(f.phase), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("support only: paths reject aliases, symlinks, nonregular entries, overlap, stale output and public destinations without touching inputs", async () => {
  for (const kind of [
    "nested-link",
    "root-alias",
    "input-alias",
    "fifo",
    "phase-overlap",
    "input-overlap",
    "stale-empty",
    "public-output",
    "relative",
    "inside-expected",
    "root-overlap",
    "nonprivate-parent",
  ]) {
    const root = temporary();
    try {
      const f = await fixture(root);
      if (kind === "nested-link")
        fs.symlinkSync(
          path.join(root, "external-source-do-not-follow"),
          path.join(f.phase, "escape"),
        );
      if (kind === "root-alias") {
        fs.symlinkSync(f.phase, path.join(root, "phase-alias"));
        f.phase = path.join(root, "phase-alias");
      }
      if (kind === "input-alias") {
        fs.symlinkSync(f.expected, path.join(root, "expected-alias"));
        f.expected = path.join(root, "expected-alias");
      }
      if (kind === "fifo") {
        const r = spawnSync("/usr/bin/mkfifo", [path.join(f.phase, "pipe")]);
        assert.equal(r.status, 0);
      }
      if (kind === "phase-overlap")
        f.destination = path.join(f.phase, "new-bundle");
      if (kind === "input-overlap") f.destination = f.expected;
      if (kind === "stale-empty") fs.mkdirSync(f.destination);
      if (kind === "public-output") {
        const d = path.join(root, "functional-output/tests/harness/public");
        fs.mkdirSync(d, { recursive: true });
        f.destination = path.join(d, "bundle");
      }
      if (kind === "root-overlap") f.phase = "/";
      if (kind === "nonprivate-parent") {
        const d = path.join(root, "shared-parent");
        fs.mkdirSync(d, { mode: 0o755 });
        fs.chmodSync(d, 0o755);
        f.destination = path.join(d, "bundle");
      }
      if (kind === "relative") f.destination = "relative-private-bundle";
      if (kind === "inside-expected") {
        fs.copyFileSync(f.expected, path.join(f.phase, "self-expected.json"));
        f.expected = path.join(f.phase, "self-expected.json");
      }
      const publicFile = path.join(
        root,
        "phase/public/release-assurance-summary.json",
      );
      const publicBefore = fs.readFileSync(publicFile);
      const r = child(exportArgs(f));
      assert.equal(r.status, 2, kind);
      assert(!fs.existsSync(path.join(f.destination, "manifest.json")), kind);
      assert(fs.readFileSync(publicFile).equals(publicBefore));
      assert.equal(
        fs.readFileSync(
          path.join(root, "external-source-do-not-follow/sentinel"),
          "utf8",
        ),
        "external-original",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("support only: every raw artifact and cleanup record matters; copy is not a valid-subset shortcut", async () => {
  for (const kind of [
    "tampered-report",
    "truncated-run",
    "missing-report",
    "missing-lifecycle",
    "cleanup-incomplete",
    "quarantine",
  ]) {
    const root = temporary();
    try {
      const f = await fixture(root);
      if (kind === "tampered-report")
        fs.appendFileSync(path.join(f.phase, "baseline-report.json"), " ");
      if (kind === "truncated-run")
        fs.writeFileSync(path.join(f.phase, "run.json"), "{");
      if (kind === "missing-report")
        fs.unlinkSync(path.join(f.phase, "baseline-report.json"));
      if (kind === "missing-lifecycle")
        fs.unlinkSync(
          path.join(f.phase, "baseline-1/candidate-lifecycle.json"),
        );
      if (kind === "cleanup-incomplete") {
        const c = read(path.join(f.phase, "controller-terminal.json"));
        c.cleanupComplete = false;
        write(path.join(f.phase, "controller-terminal.json"), c);
      }
      if (kind === "quarantine")
        fs.copyFileSync(
          path.join(f.phase, "run.json"),
          path.join(f.phase, "interrupted-run.json"),
        );
      const before = tree(f.phase);
      assert.equal(child(exportArgs(f)).status, 2, kind);
      assert.deepEqual(tree(f.phase), before);
      assert(!fs.existsSync(f.destination));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("support only: external manifest digest, exact file/directory inventory and read-only replay reject tampering", async () => {
  for (const kind of [
    "manifest-digest",
    "manifest-edit",
    "extra-file",
    "extra-directory",
    "missing-directory",
    "missing-file",
    "changed-file",
    "symlink",
    "unsafe-manifest",
    "duplicate-manifest",
    "self-expectation",
    "wrong-expectation",
    "mode",
    "fifo-expectation",
  ]) {
    const root = temporary();
    try {
      const f = await fixture(root);
      const r = child(exportArgs(f));
      assert.equal(r.status, 0, r.stderr);
      let hash = JSON.parse(r.stdout).manifestDigest;
      const manifestFile = path.join(f.destination, "manifest.json");
      if (kind === "manifest-digest") hash = digest("wrong");
      if (kind === "manifest-edit") fs.appendFileSync(manifestFile, " ");
      if (kind === "extra-file")
        fs.writeFileSync(path.join(f.destination, "extra"), "unreviewed");
      if (kind === "extra-directory")
        fs.mkdirSync(path.join(f.destination, "extra-directory"));
      if (kind === "missing-directory")
        fs.rmdirSync(
          path.join(f.destination, "phase/baseline-1/empty-directory"),
        );
      if (kind === "missing-file")
        fs.unlinkSync(path.join(f.destination, "phase/baseline-report.json"));
      if (kind === "changed-file")
        fs.appendFileSync(
          path.join(f.destination, "phase/baseline-report.json"),
          " ",
        );
      if (kind === "symlink")
        fs.symlinkSync(f.expected, path.join(f.destination, "escape"));
      if (["unsafe-manifest", "duplicate-manifest"].includes(kind)) {
        const m = read(manifestFile);
        if (kind === "unsafe-manifest") m.inventory[0].path = "../escape";
        else m.inventory.push(m.inventory[0]);
        write(manifestFile, m);
        hash = digest(fs.readFileSync(manifestFile));
      }
      if (kind === "self-expectation")
        f.expected = path.join(f.destination, "transport/expected.json");
      if (kind === "wrong-expectation") {
        const x = read(f.expected);
        x.identity.artifactDigest = digest("foreign");
        write(f.expected, x);
      }
      if (kind === "fifo-expectation") {
        f.expected = path.join(root, "expected-pipe");
        assert.equal(spawnSync("/usr/bin/mkfifo", [f.expected]).status, 0);
      }
      if (kind === "mode")
        fs.chmodSync(
          path.join(f.destination, "phase/baseline-report.json"),
          0o644,
        );
      const before = tree(f.destination);
      assert.equal(child(verifyArgs(f, hash)).status, 2, kind);
      assert.deepEqual(tree(f.destination), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

function faultHook(root, f, kind) {
  const hook = path.join(root, "fault.cjs"),
    events = path.join(root, "fault-events.jsonl");
  fs.writeFileSync(
    hook,
    `const fs=require('node:fs');const original={read:fs.readFileSync,write:fs.writeFileSync,link:fs.linkSync,remove:fs.rmSync};let fired=false;const phase=${JSON.stringify(f.phase)};const out=${JSON.stringify(f.destination)};function fault(name){fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({fault:name})+'\\n');fired=true;throw Error('synthetic-fs-secret');}fs.writeFileSync=function(file,...args){if(!fired&&${JSON.stringify(kind)}==='copy'&&String(file)===out+'/phase/baseline-report.json')fault('copy');const result=original.write.call(this,file,...args);if(!fired&&${JSON.stringify(kind)}==='source-change'&&String(file)===out+'/transport/producer-terminal.json'){fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({fault:'source-change'})+'\\n');fired=true;original.write.call(fs,phase+'/changed-during-copy','changed');}return result;};fs.linkSync=function(from,to){if(!fired&&${JSON.stringify(kind)}==='commit'&&String(to)===out+'/manifest.json')fault('commit');if(!fired&&${JSON.stringify(kind)}==='foreign-marker'&&String(to)===out+'/manifest.json'){fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({fault:'foreign-marker'})+'\\n');fired=true;original.write.call(fs,to,'foreign-marker-must-remain');}const result=original.link.call(this,from,to);if(!fired&&${JSON.stringify(kind)}==='link-after'&&String(to)===out+'/manifest.json')fault('link-after');return result;};fs.rmSync=function(file,...args){if(!fired&&${JSON.stringify(kind)}==='temporary-cleanup'&&String(file).startsWith(out+'/.manifest-'))fault('temporary-cleanup');return original.remove.call(this,file,...args);};fs.readFileSync=function(file,...args){const value=original.read.call(this,file,...args);if(!fired&&${JSON.stringify(kind)}==='source-change'&&String(file)===out+'/transport/producer-terminal.json'){fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({fault:'source-change'})+'\\n');fired=true;original.write.call(fs,phase+'/changed-during-copy','changed');}return value;};`,
  );
  return { hook, events };
}
test("support only: actual copy, source-change and completion faults leave no completed packet or input mutation by exporter", async () => {
  for (const kind of [
    "copy",
    "commit",
    "link-after",
    "temporary-cleanup",
    "source-change",
  ]) {
    const root = temporary();
    try {
      const f = await fixture(root);
      const before = tree(f.phase);
      const { hook, events } = faultHook(root, f, kind);
      assert.equal(child(exportArgs(f), hook).status, 2, kind);
      assert.equal(
        readEvents(events)[0].fault,
        kind,
        "intended exact filesystem fault must fire",
      );
      assert(!fs.existsSync(path.join(f.destination, "manifest.json")));
      if (kind === "source-change")
        fs.unlinkSync(path.join(f.phase, "changed-during-copy"));
      assert.deepEqual(tree(f.phase), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
function readEvents(file) {
  return fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
}

test("support only: failed exclusive manifest publication preserves a foreign marker", async () => {
  const root = temporary();
  try {
    const f = await fixture(root);
    const { hook, events } = faultHook(root, f, "foreign-marker");
    assert.equal(child(exportArgs(f), hook).status, 2);
    assert.equal(readEvents(events)[0].fault, "foreign-marker");
    assert.equal(
      fs.readFileSync(path.join(f.destination, "manifest.json"), "utf8"),
      "foreign-marker-must-remain",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("support only: private output modes are explicit under permissive and restrictive caller umasks", async () => {
  for (const mask of [0, 0o777]) {
    const root = temporary();
    try {
      const f = await fixture(root);
      const hook = path.join(root, "umask.cjs");
      fs.writeFileSync(hook, `process.umask(${mask});`);
      const r = child(exportArgs(f), hook);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(
        child(verifyArgs(f, JSON.parse(r.stdout).manifestDigest)).status,
        0,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
