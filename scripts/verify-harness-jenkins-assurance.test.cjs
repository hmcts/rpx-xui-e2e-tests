const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");

const load = () => import(pathToFileURL(path.join(__dirname, "run-harness-jenkins-assurance.mjs")));

test("actual Jenkins CLI preserves private preparation evidence when a child fails", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-cli-retained-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(__dirname, path.join(root, "scripts"), { recursive: true });
  fs.symlinkSync(path.resolve(__dirname, "../node_modules"), path.join(root, "node_modules"), "dir");
  const preload = path.join(root, "children.cjs");
  fs.writeFileSync(preload, `
    const fs = require('node:fs');
    const path = require('node:path');
    require('node:child_process').spawnSync = (command, args) => {
      if (command === 'docker' && args[0] === 'version')
        return {status: 0, stdout: JSON.stringify({Os: 'linux', Arch: 'arm64'})};
      if (command === 'git' && args[0] === 'clone') {
        fs.writeFileSync(path.join(path.dirname(args.at(-1)), 'preparation-evidence.txt'), 'child failed');
      }
      return {status: 1, stdout: ''};
    };
    require('node:module').syncBuiltinESMExports();
  `);
  const result = spawnSync(process.execPath, ["--require", preload, "scripts/run-harness-jenkins-assurance.mjs"], {
    cwd: root, env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr);
  const privateRoot = path.join(root, "functional-output/tests/harness/private/native-ci");
  const jobs = fs.readdirSync(privateRoot);
  assert.equal(jobs.length, 1);
  const job = path.join(privateRoot, jobs[0]);
  assert.equal(fs.statSync(job).mode & 0o777, 0o700);
  assert.equal(fs.readFileSync(path.join(job, "preparation-evidence.txt"), "utf8"), "child failed");
  const summary = JSON.parse(fs.readFileSync(path.join(root, "functional-output/tests/harness/public/release-assurance-summary.json"), "utf8"));
  assert.equal(summary.status, "BLOCKED");
});

test("job-local native evidence uses distinct private directories and preserves prior runs", async (t) => {
  const { createPrivateJobDirectory } = await load();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-retained-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = createPrivateJobDirectory(root);
  const evidence = path.join(first, "receipt.json");
  fs.writeFileSync(evidence, "preserved", { mode: 0o600 });
  const second = createPrivateJobDirectory(root);
  assert.notEqual(first, second);
  assert.equal(path.dirname(first), path.join(root, "functional-output/tests/harness/private/native-ci"));
  assert.equal(fs.readFileSync(evidence, "utf8"), "preserved");
  for (const directory of [first, second, path.dirname(first), path.dirname(path.dirname(first))])
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  fs.chmodSync(path.dirname(first), 0o755);
  assert.throws(() => createPrivateJobDirectory(root), /PRIVATE_JOB_DIRECTORY_REQUIRED/);
  assert.equal(fs.readFileSync(evidence, "utf8"), "preserved");
});

test("job-local evidence rejects aliased ancestors without writing into their target", async (t) => {
  const { createPrivateJobDirectory } = await load();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-evidence-alias-")));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-evidence-outside-")));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.symlinkSync(outside, path.join(root, "functional-output"), "dir");
  assert.throws(() => createPrivateJobDirectory(root), /PRIVATE_JOB_ROOT_ALIAS/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("native preparation rejects unavailable or unsupported Docker without granting execution readiness", async () => {
  const { assertNativeWorkerPlatform } = await load();
  const { collectWorkerCapabilities } = await import(pathToFileURL(path.join(__dirname, "observe-harness-worker.mjs")));
  for (const server of [null, { Os: "linux", Arch: "amd64" }, { Os: "windows", Arch: "arm64" }, { Os: "linux", Arch: "arm64" }]) {
    const report = collectWorkerCapabilities({
      run: (_command, args) => ({
        status: server && args[0] === "version" ? 0 : 1,
        stdout: JSON.stringify(server),
      }),
    });
    if (server?.Os === "linux" && server.Arch === "arm64")
      assert.doesNotThrow(() => assertNativeWorkerPlatform(report));
    else
      assert.throws(() => assertNativeWorkerPlatform(report), /HARNESS_NATIVE_DOCKER_ARM64_REQUIRED/);
    assert.equal(report.nativeReady, false);
    assert.equal(report.releaseApproval, false);
  }
});

test("native job input stays private and only a real owned private directory is accepted", async (t) => {
  const { assertPrivateDirectory, writePrivateJob } = await load();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jenkins-assurance-private-")));
  const alias = `${root}-alias`;
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(alias, { force: true });
  });

  assert.equal(assertPrivateDirectory(root), root);
  fs.symlinkSync(root, alias, "dir");
  assert.throws(() => assertPrivateDirectory(alias), /PRIVATE_JOB_DIRECTORY_REQUIRED/);
  fs.unlinkSync(alias);

  const file = path.join(root, "job-input.json");
  const job = { schemaVersion: 1, candidateManifest: "/private/candidate.json" };
  writePrivateJob(file, job);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), job);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(() => writePrivateJob(file, job), /EEXIST/);

  fs.chmodSync(root, 0o755);
  assert.throws(() => assertPrivateDirectory(root), /PRIVATE_JOB_DIRECTORY_REQUIRED/);
});
