const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const load = () => import(pathToFileURL(path.join(__dirname, "run-harness-jenkins-assurance.mjs")));

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
