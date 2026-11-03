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
    owner: "candidate-11111111-1111-4111-8111-111111111111",
    cidFile: "/output/container-id",
    image: "sha256:" + "a".repeat(64),
  });
  assert.equal(args[args.indexOf("--network") + 1], "none");
  assert.equal(args[args.indexOf("--cidfile") + 1], "/output/container-id");
  assert.equal(
    args[args.indexOf("--name") + 1],
    "candidate-11111111-1111-4111-8111-111111111111",
  );
  assert(
    args.includes(
      "exui.harness.owner=candidate-11111111-1111-4111-8111-111111111111",
    ),
  );
  assert(args.includes("exui.harness.service=candidate-runtime"));
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
    const ccdChild = spawnSync(process.execPath, ["scripts/run-harness-ccd-candidate.mjs"], {
      cwd: stage, encoding: "utf8", timeout: 5000, env: { PATH: process.env.PATH },
    });
    assert.equal(ccdChild.status, 2, ccdChild.stderr);
    assert.match(ccdChild.stderr, /CANDIDATE_AND_OWNED_CCD_STATE_REQUIRED/);
    assert.doesNotMatch(ccdChild.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.equal(fs.existsSync(path.join(stage, "node_modules")), false);
    const inspectClosure = () => spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      await import('./scripts/run-harness-native-tools.mjs');
      await import('./scripts/prepare-harness-event-capability.mjs');
      const { prepareCcdImport } = await import('./scripts/lib/exui-ccd-runtime.mjs');
      const baseline = prepareCcdImport(undefined, 'event-capability-baseline');
      const mutant = prepareCcdImport(undefined, 'event-capability-mutant');
      assert(baseline.file.length > 0 && mutant.file.length > 0);
      assert.notEqual(baseline.binding.workbookDigest, mutant.binding.workbookDigest);
      for (const file of [
        'src/fixtures/harnessCcdEvent.ts',
        'src/tests/harness/ccd/courtadmin-cell.spec.ts',
        'src/tests/harness/ccd/event-capability.spec.ts',
        'scripts/fixtures/ccd/workbook.py',
      ]) assert(fs.statSync(file).isFile());
    `], { cwd: stage, encoding: "utf8", timeout: 5000, env: { PATH: process.env.PATH } });
    const complete = inspectClosure();
    assert.equal(complete.status, 0, complete.stderr);
    const modulePath = path.join(stage, "scripts/lib/exui-ccd-event-capability.mjs");
    const moduleBytes = fs.readFileSync(modulePath);
    fs.unlinkSync(modulePath);
    const missingModule = inspectClosure();
    assert.notEqual(missingModule.status, 0);
    assert.match(missingModule.stderr, /ERR_MODULE_NOT_FOUND/);
    fs.writeFileSync(modulePath, moduleBytes);
    fs.unlinkSync(path.join(stage, "scripts/fixtures/ccd/event-capability/binding.json"));
    const missingFixture = inspectClosure();
    assert.notEqual(missingFixture.status, 0);
    assert.match(missingFixture.stderr, /ENOENT/);
    assert.match(missingFixture.stderr, /event-capability\/binding\.json/);
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

test("provider seam preserves independently expected PCS membership and its source-backed label", async () => {
  const { startProviderSeams } = await import("./lib/exui-provider-seams.mjs");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "current-wa-provider-"),
  );
  const server = await startProviderSeams(directory);
  try {
    const response = await fetch(
      "http://127.0.0.1:3101/refdata/location/orgServices",
    );
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.deepEqual(rows.map((row) => row.ccd_service_name).sort(), [
      "CIVIL",
      "EMPLOYMENT",
      "IA",
      "PCS",
      "PRIVATELAW",
      "PUBLICLAW",
      "ST_CIC",
    ]);
    assert.equal(
      rows.find((row) => row.ccd_service_name === "PCS")
        .service_short_description,
      "Mortgage and Landlord Possession Claims",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("synthetic current runtime supplies the exact renamed managed Redis property without inherited credentials", async () => {
  const { effectiveCandidateConfiguration } = await load();
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "current-redis-config-"),
  );
  fs.mkdirSync(path.join(directory, "config"));
  fs.writeFileSync(
    path.join(directory, "config/default.json"),
    JSON.stringify({
      services: { idam: { oauthCallbackUrl: "/oauth2/callback" } },
      feature: {},
      waSupportedJurisdictions:
        "IA,CIVIL,PRIVATELAW,PUBLICLAW,EMPLOYMENT,ST_CIC,PCS",
    }),
  );
  try {
    const { config } = effectiveCandidateConfiguration(directory);
    assert.equal(
      Object.hasOwn(
        config.secrets.rpx,
        "webapp-managed-redis-connection-string",
      ),
      true,
    );
    assert.equal(
      Object.hasOwn(config.secrets.rpx, "webapp-redis-connection-string"),
      false,
    );
    assert.equal(config.feature.redisEnabled, false);
    assert.equal(
      config.waSupportedJurisdictions,
      "IA,CIVIL,PRIVATELAW,PUBLICLAW,EMPLOYMENT,ST_CIC,PCS",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("scope derivation preserves symlink modes under private umask and still rejects unrelated payload changes", async () => {
  const { describeCandidateArtifact } =
    await import("./lib/exui-candidate-artifact.mjs");
  const { deriveScopeMutant, verifyScopeMutant } =
    await import("./prepare-harness-scope-mutant.mjs");
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "scope-copy-mode-")));
  const root = path.join(directory, "baseline");
  const files = {
    "dist/rpx-exui/browser/index.html": "<app-root></app-root>",
    "dist/rpx-exui/browser/guard.js":
      'a.filter(h=>h.roleType&&h.roleType==="ORGANISATION").map(h=>h.jurisdiction)',
    "dist/rpx-exui/api/server.bundle.js": "server-fixture",
    "api/package.json": '{"name":"jui"}',
    "config/default.json": "{}",
    "runtime/node": "node-fixture",
    "package.json": '{"dependencies":{"@hmcts/ccd-case-ui-toolkit":"7.4.21"}}',
    "yarn.lock": "lock-fixture",
    "node_modules/@hmcts/ccd-case-ui-toolkit/package.json":
      '{"version":"7.4.21"}',
    "node_modules/tool/cli.js": "tool-fixture",
  };
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), contents);
  }
  const link = "node_modules/.bin/tool";
  fs.mkdirSync(path.dirname(path.join(root, link)), { recursive: true });
  fs.symlinkSync("../tool/cli.js", path.join(root, link));
  if (process.platform === "darwin")
    fs.lchmodSync(path.join(root, link), 0o755);
  const baseline = await describeCandidateArtifact(root, {
    sourceMethod: "git-archive",
    webappCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    platform: "linux/arm64",
    buildImage: "sha256:" + "c".repeat(64),
    install: "immutable-offline",
  });
  const manifest = path.join(directory, "baseline.json");
  fs.writeFileSync(manifest, JSON.stringify(baseline));
  const previous = process.umask(0o077);
  try {
    const { mutant } = await deriveScopeMutant(
      manifest,
      path.join(directory, "mutant"),
    );
    assert.equal(
      fs.lstatSync(path.join(mutant.candidateRoot, link)).mode & 0o777,
      fs.lstatSync(path.join(root, link)).mode & 0o777,
    );
    await verifyScopeMutant(baseline, mutant);
    fs.writeFileSync(
      path.join(mutant.candidateRoot, "unrelated.js"),
      "unrelated-change",
    );
    await assert.rejects(
      verifyScopeMutant(baseline, mutant),
      /UNRELATED_SCOPE_MUTANT_PAYLOAD_CHANGE/,
    );
  } finally {
    process.umask(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("known child termination is observed and forced shutdown stays explicit", async () => {
  const { terminateOwnedChild } = await load();
  const { spawn } = require("node:child_process");
  const { once } = require("node:events");
  for (const ignore of [false, true]) {
    const child = spawn(
      process.execPath,
      [
        "-e",
        `process.on('SIGTERM',()=>{${ignore ? "" : "process.exit(0)"}});console.log('ready');setInterval(()=>{},1000);`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await once(child.stdout, "data");
    const result = await terminateOwnedChild(child, {
      graceMs: 25,
      killMs: 1000,
    });
    assert.equal(result.observed, true);
    assert.equal(result.forced, ignore);
    assert.equal(
      ignore ? child.signalCode : child.exitCode,
      ignore ? "SIGKILL" : 0,
    );
  }
});

test("phase supervisor forwards cancellation to its exact Docker client and observes exit", async () => {
  const { runOwnedDocker } = await import("./lib/exui-candidate-child.mjs");
  const { spawn } = require("node:child_process");
  const { once, EventEmitter } = require("node:events");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "owned-docker-client-"),
  );
  const target = new EventEmitter();
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  target.exit = finish;
  target.stderr = { write: () => {} };
  let child;
  try {
    const running = runOwnedDocker([], {
      output: directory,
      owner: "owned-test-client",
      signalTarget: target,
      launch: () => {
        child = spawn(
          process.execPath,
          [
            "-e",
            "process.on('SIGTERM',()=>process.exit(0));console.log('ready');setInterval(()=>{},1000);",
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        return child;
      },
    });
    const rejected = assert.rejects(running, /CANCELLED/);
    await once(child.stdout, "data");
    target.emit("SIGTERM");
    await rejected;
    assert.equal(await done, 2);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(directory, "docker-client-shutdown.json")),
    );
    assert.equal(receipt.observed, true);
    assert.equal(receipt.forced, false);
    assert.equal(child.exitCode, 0);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("scope derivation rejects aliased targets, overlap and stale output before modifying immutable inputs", async () => {
  const { describeCandidateArtifact, verifyCandidateArtifact } =
    await import("./lib/exui-candidate-artifact.mjs");
  const { deriveScopeMutant } =
    await import("./prepare-harness-scope-mutant.mjs");
  for (const kind of ["file-link", "parent-link", "overlap", "stale"]) {
    const directory = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "scope-safe-input-"),
    );
    try {
      const root = path.join(directory, "baseline");
      const target = "dist/rpx-exui/browser/guard.js";
      const files = {
        "dist/rpx-exui/browser/index.html": "<app-root/>",
        [target]:
          'a.filter(h=>h.roleType&&h.roleType==="ORGANISATION").map(h=>h.jurisdiction)',
        "dist/rpx-exui/api/server.bundle.js": "server-fixture",
        "api/package.json": "{}",
        "config/default.json": "{}",
        "runtime/node": "node-fixture",
        "package.json":
          '{"dependencies":{"@hmcts/ccd-case-ui-toolkit":"7.4.21"}}',
        "yarn.lock": "lock",
        "node_modules/@hmcts/ccd-case-ui-toolkit/package.json":
          '{"version":"7.4.21"}',
      };
      for (const [file, bytes] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), bytes);
      }
      let backing = path.join(root, target);
      if (kind === "file-link") {
        backing = path.join(root, "api/backing.js");
        fs.renameSync(path.join(root, target), backing);
        fs.symlinkSync(backing, path.join(root, target));
      }
      if (kind === "parent-link") {
        const from = path.dirname(path.join(root, target)),
          to = from + "-original";
        fs.renameSync(from, to);
        fs.symlinkSync(to, from);
        backing = path.join(to, "guard.js");
      }
      const baseline = await describeCandidateArtifact(root, {
        sourceMethod: "git-archive",
        webappCommit: "a".repeat(40),
        sourceTree: "b".repeat(40),
        platform: "linux/arm64",
        buildImage: "sha256:" + "c".repeat(64),
        install: "immutable-offline",
      });
      const manifest = path.join(directory, "baseline.json");
      fs.writeFileSync(manifest, JSON.stringify(baseline));
      const manifestBefore = fs.readFileSync(manifest),
        backingBefore = fs.readFileSync(backing);
      const output =
        kind === "overlap"
          ? path.join(root, "new-output")
          : path.join(directory, "derived");
      if (kind === "stale") fs.mkdirSync(output);
      const expectedGuard = {
        "file-link": "CANDIDATE_DERIVATION_TARGET_REGULAR_FILE_REQUIRED",
        "parent-link": "CANDIDATE_DERIVATION_TARGET_ALIAS",
        overlap: "CANDIDATE_DERIVATION_OUTPUT_INPUT_OVERLAP",
        stale: "FRESH_CANDIDATE_DERIVATION_OUTPUT_REQUIRED",
      }[kind];
      await assert.rejects(deriveScopeMutant(manifest, output), (error) =>
        error.message.split("\n")[0] === expectedGuard,
      );
      assert(
        fs.readFileSync(backing).equals(backingBefore),
        kind + " backing unchanged",
      );
      assert(
        fs.readFileSync(manifest).equals(manifestBefore),
        kind + " manifest unchanged",
      );
      assert.deepEqual(
        await verifyCandidateArtifact(manifest),
        baseline,
        kind + " complete base seal unchanged",
      );
      if (kind === "stale") assert.deepEqual(fs.readdirSync(output), []);
      else
        assert.equal(
          fs.existsSync(output),
          false,
          kind + " rejects before mkdir",
        );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});
