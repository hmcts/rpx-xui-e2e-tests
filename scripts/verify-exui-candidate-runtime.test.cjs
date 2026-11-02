const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const load = () => import("./lib/exui-candidate-runtime.mjs");
test("runtime child environment excludes poisoned inherited destinations and credentials", async () => {
  const { candidateEnvironment } = await load();
  process.env.TEST_ENV = "aat";
  process.env.SERVICES_CALLBACK = "https://callback-canary.invalid";
  process.env.AUTH_PASSWORD = "credential-canary";
  const env = candidateEnvironment(
    { service: "http://127.0.0.1:3101" },
    "/output",
  );
  assert.equal(env.TEST_ENV, undefined);
  assert.equal(env.SERVICES_CALLBACK, undefined);
  assert.equal(env.AUTH_PASSWORD, undefined);
  assert.doesNotMatch(JSON.stringify(env), /canary|aat/);
});
test("callback and imported destination rejection happens before execution", async () => {
  const { validateDestinations } = await load();
  assert.throws(
    () =>
      validateDestinations({
        nested: [{ callbackUrl: "https://unexpected.invalid?token=canary" }],
      }),
    /UNDECLARED_RUNTIME_DESTINATION/,
  );
  assert.throws(
    () => validateDestinations({ callbackUrl: "oauth2/callback" }),
    /INVALID_RUNTIME_CALLBACK/,
  );
  assert.throws(
    () => validateDestinations({ url: "http://user:canary@127.0.0.1:3101" }),
    /UNDECLARED_RUNTIME_DESTINATION/,
  );
  validateDestinations({
    callbackUrl: "http://127.0.0.1:3100/oauth2/callback",
  });
});
test("container has no shared network, host socket, environment inheritance, or writable candidate", async () => {
  const { isolatedContainerArguments } = await load();
  const args = isolatedContainerArguments({
    harnessRoot: "/harness",
    candidateRoot: "/candidate",
    output: "/output",
    browserRoot: "/browser",
    dependenciesRoot: "/dependencies",
    image: "sha256:" + "a".repeat(64),
  });
  assert.equal(args[args.indexOf("--network") + 1], "none");
  assert(args.includes("--read-only"));
  assert(args.includes("type=bind,src=/candidate,dst=/candidate,readonly"));
  assert(
    !args.some((arg) => /docker.sock|host.docker|--env|--publish/.test(arg)),
  );
});
test("production family mutation changes only effective candidate configuration and its digest", async () => {
  const { effectiveCandidateConfiguration } = await load();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-config-"));
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(
    path.join(root, "config/default.json"),
    JSON.stringify({
      services: {
        idam: { oauthCallbackUrl: "oauth2/callback" },
        url: "https://shared.invalid",
      },
      feature: {},
      waSupportedJurisdictions: "IA,CIVIL",
    }),
  );
  try {
    const baseline = effectiveCandidateConfiguration(root);
    const mutant = effectiveCandidateConfiguration(root, "wa-drop-family");
    assert.equal(baseline.config.waSupportedJurisdictions, "IA,CIVIL");
    assert.equal(mutant.config.waSupportedJurisdictions, "CIVIL");
    assert.notEqual(baseline.digest, mutant.digest);
    mutant.config.waSupportedJurisdictions =
      baseline.config.waSupportedJurisdictions;
    assert.deepEqual(mutant.config, baseline.config);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
test("runtime identity mismatch is rejected", async () => {
  const { assertRuntimeIdentity } = await load();
  assert.throws(
    () => assertRuntimeIdentity({ candidate: "a" }, { candidate: "b" }),
    /IDENTITY_MISMATCH/,
  );
});
test("candidate network guard stops an undeclared socket before DNS and logs no destination or credentials", () => {
  const { spawnSync } = require("node:child_process");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-egress-"));
  const log = path.join(directory, "rejections.jsonl");
  try {
    const child = spawnSync(
      process.execPath,
      [
        "--require",
        path.resolve("scripts/lib/exui-runtime-network-guard.cjs"),
        "-e",
        "require('node:net').connect({ host: 'credential-canary.invalid', port: 443 })",
      ],
      { encoding: "utf8", env: { EXUI_NETWORK_REJECTIONS: log } },
    );
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /UNDECLARED_NODE_DESTINATION/);
    assert.deepEqual(JSON.parse(fs.readFileSync(log, "utf8")), {
      code: "UNDECLARED_NODE_DESTINATION",
    });
    assert.doesNotMatch(fs.readFileSync(log, "utf8"), /credential-canary/);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
test("network guard permits owned HTTP including Node normalized socket arguments", () => {
  const { spawnSync } = require("node:child_process");
  const child = spawnSync(
    process.execPath,
    [
      "--require",
      path.resolve("scripts/lib/exui-runtime-network-guard.cjs"),
      "-e",
      `const http = require('node:http'); const server = http.createServer((_req,res) => res.end('owned')); server.listen(3101,'127.0.0.1',() => http.get('http://127.0.0.1:3101', res => { if(res.statusCode !== 200) process.exitCode=1; res.resume(); res.on('end',() => server.close()); }).on('error',() => {process.exitCode=1;server.close();}));`,
    ],
    {
      encoding: "utf8",
      timeout: 3000,
      env: { EXUI_NETWORK_REJECTIONS: "/not-created" },
    },
  );
  assert.equal(child.status, 0, child.stderr);
});
test("scope mutation requires exactly one shipped production guard and preserves surrounding code", async () => {
  const { transformOrganisationGuard } =
    await import("./prepare-harness-scope-mutant.mjs");
  const before =
    'prefix.filter(h=>h.roleType&&h.roleType==="ORGANISATION").map(h=>h.jurisdiction)suffix';
  assert.equal(
    transformOrganisationGuard(before),
    "prefix.filter(h=>h.roleType).map(h=>h.jurisdiction)suffix",
  );
  assert.throws(() => transformOrganisationGuard("no guard"), /EXPECTED_ONE/);
  assert.throws(
    () => transformOrganisationGuard(before + before),
    /EXPECTED_ONE/,
  );
});
test("normalized mutant tree seal proves every other file remains unchanged", async () => {
  const { digestCandidateTree } =
    await import("./lib/exui-candidate-artifact.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scope-seal-"));
  try {
    fs.writeFileSync(path.join(directory, "guard.js"), "original");
    fs.writeFileSync(path.join(directory, "other.js"), "untouched");
    const original = await digestCandidateTree(directory);
    fs.writeFileSync(path.join(directory, "guard.js"), "mutant");
    assert.equal(
      await digestCandidateTree(
        directory,
        new Map([["guard.js", Buffer.from("original")]]),
      ),
      original,
    );
    fs.writeFileSync(path.join(directory, "other.js"), "unrelated change");
    assert.notEqual(
      await digestCandidateTree(
        directory,
        new Map([["guard.js", Buffer.from("original")]]),
      ),
      original,
    );
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});

test("curated source snapshot imports complete runner closure and excludes workspace credential files", async () => {
  const { HARNESS_SOURCE_FILES } = await load();
  const { spawnSync } = require("node:child_process");
  const stage = fs.mkdtempSync(
    path.join(os.tmpdir(), "harness-source-closure-"),
  );
  try {
    for (const file of HARNESS_SOURCE_FILES) {
      const destination = path.join(stage, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.resolve(file), destination);
    }
    assert.equal(fs.existsSync(path.join(stage, ".env")), false);
    assert.equal(fs.existsSync(path.join(stage, ".git")), false);
    const child = spawnSync(
      process.execPath,
      ["scripts/run-harness-candidate.mjs"],
      {
        cwd: stage,
        encoding: "utf8",
        timeout: 5000,
        env: { PATH: process.env.PATH },
      },
    );
    assert.equal(child.status, 2, child.stderr);
    assert.match(child.stderr, /CANDIDATE_ARTIFACT_REQUIRED/);
    assert.doesNotMatch(child.stderr, /ERR_MODULE_NOT_FOUND/);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
});
test("Harness engine is exactly declared, locked and bound to actual dependency bytes", async () => {
  const { verifyHarnessDependencies } =
    await import("./lib/exui-harness-dependencies.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-deps-"));
  const dependencies = path.join(directory, "node_modules");
  try {
    for (const name of ["@playwright/test", "playwright", "playwright-core"]) {
      fs.mkdirSync(path.join(dependencies, name), { recursive: true });
      fs.writeFileSync(
        path.join(dependencies, name, "package.json"),
        JSON.stringify({ version: "1.64.1" }),
      );
    }
    const manifest = path.join(directory, "package.json");
    const lock = path.join(directory, "yarn.lock");
    fs.writeFileSync(
      manifest,
      JSON.stringify({ devDependencies: { "@playwright/test": "1.64.1" } }),
    );
    fs.writeFileSync(
      lock,
      '"@playwright/test@npm:1.64.1":\n  version: 1.64.1\n',
    );
    const sealed = await verifyHarnessDependencies(
      dependencies,
      manifest,
      lock,
    );
    assert.equal(sealed.playwrightVersion, "1.64.1");
    fs.writeFileSync(
      path.join(dependencies, "playwright-core/changed.js"),
      "drift",
    );
    await assert.rejects(
      verifyHarnessDependencies(dependencies, manifest, lock, sealed.digest),
      /DEPENDENCY_BYTES_CHANGED/,
    );
    fs.writeFileSync(
      path.join(dependencies, "playwright-core/package.json"),
      JSON.stringify({ version: "1.63.0" }),
    );
    await assert.rejects(
      verifyHarnessDependencies(dependencies, manifest, lock),
      /INSTALLED_MISMATCH/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("candidate finalization requires observed supervisor-requested shutdown, including signals", async () => {
  const { assertCandidateShutdown } = await load();
  assertCandidateShutdown({ code: null, signal: "SIGTERM" }, true);
  for (const terminal of [
    { code: null, signal: "SIGKILL" },
    { code: 0, signal: null },
    { code: 1, signal: null },
  ])
    assert.throws(
      () => assertCandidateShutdown(terminal, true),
      /CANDIDATE_UNEXPECTED_TERMINATION/,
    );
  assert.throws(
    () => assertCandidateShutdown({ code: null, signal: "SIGTERM" }, false),
    /CANDIDATE_UNEXPECTED_TERMINATION/,
  );
});
