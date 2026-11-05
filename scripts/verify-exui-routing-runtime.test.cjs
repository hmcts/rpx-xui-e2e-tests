const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("support only: routing pilot has two narrow obligations and isolated fixed omission invocations", async () => {
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { nativeInvocations } = await import("./lib/exui-native-contract.mjs");
  const policy = getReleasePolicy("exui-decentralised-routing-pilot");
  assert.deepEqual(policy.requiredObligationIds, [
    "routing-create-entry",
    "routing-noc-cache",
  ]);
  assert(!JSON.stringify(policy).includes("configuration-decentralisation:"));
  assert.deepEqual(
    nativeInvocations(policy.releaseScopeId).map((x) => x.invocationId),
    ["baseline", "routing-omit-web-url", "routing-omit-noc-base-url"],
  );
  assert.deepEqual(
    nativeInvocations(policy.releaseScopeId)
      .slice(1)
      .map((x) => x.proofFile),
    ["create-entry.spec.ts", "noc-cache.spec.ts"],
  );
});

test("support only: routing config preserves three origins and each omission removes only its owned property", async () => {
  const { routingConfiguration } =
    await import("./lib/exui-routing-contract.mjs");
  const original = {
    services: {
      ccd: { caseAssignmentApi: "http://127.0.0.1:3101", other: "retained" },
    },
    decentralisedCaseTypeConfig: {
      PCS: { webUrl: "original", nocBaseUrl: "original" },
    },
    decentralisedServiceMap: {},
    feature: { retained: true },
  };
  const baseline = routingConfiguration(original);
  assert.equal(
    baseline.services.ccd.caseAssignmentApi,
    "http://127.0.0.1:3101/central-assignment",
  );
  assert.equal(
    baseline.decentralisedCaseTypeConfig.PCS.nocBaseUrl,
    "http://127.0.0.1:3102/pcs-assignment",
  );
  assert.equal(
    baseline.decentralisedCaseTypeConfig.PCS.webUrl,
    "http://127.0.0.1:3103/pcs-ui",
  );
  assert.equal(baseline.services.ccd.other, "retained");
  assert.equal(original.decentralisedCaseTypeConfig.PCS.webUrl, "original");
  for (const [mutation, property] of [
    ["routing-omit-web-url", "webUrl"],
    ["routing-omit-noc-base-url", "nocBaseUrl"],
  ]) {
    const expected = structuredClone(baseline);
    delete expected.decentralisedCaseTypeConfig.PCS[property];
    assert.deepEqual(routingConfiguration(original, mutation), expected);
  }
  assert.throws(() => routingConfiguration(original, "unknown"), /UNSUPPORTED/);
});

test("support only: other scopes reject routing origins while routing config can declare only its fixed loopback origins", async () => {
  const { candidateEnvironment } =
    await import("./lib/exui-candidate-runtime.mjs");
  const value = {
    destination: "http://127.0.0.1:3102/pcs-assignment",
    browser: "http://127.0.0.1:3103/pcs-ui",
  };
  assert.throws(
    () => candidateEnvironment(value, "/diagnostics"),
    /UNDECLARED/,
  );
  assert.throws(
    () => candidateEnvironment(value, "/diagnostics", "exui-ccd-pilot"),
    /UNDECLARED/,
  );
  const env = candidateEnvironment(
    value,
    "/diagnostics",
    "exui-decentralised-routing-pilot",
  );
  assert.equal(env.EXUI_HARNESS_SCOPE, "exui-decentralised-routing-pilot");
  assert.throws(
    () =>
      candidateEnvironment(
        { destination: "http://127.0.0.1:3104" },
        "/diagnostics",
        "exui-decentralised-routing-pilot",
      ),
    /UNDECLARED/,
  );
});

test("support only: routing is the fifth required CI phase and existing policies stay unchanged", async () => {
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const expected = {
    "exui-wa-family-pilot":
      "sha256:a9c6dd75394cace607ae4bf13dc1c9091565c64fc73d95d32a4426e3cfb7b43f",
    "exui-wa-scope-pilot":
      "sha256:7f870c55aff532dbba8196503505bfbcbf48274785eefe67a2c6798aacdedfd0",
    "exui-ccd-pilot":
      "sha256:dd0cdf377d3a46b93ae0c8114ee6b00158b7b8b91f3de6851e76fc1a75d14a23",
  };
  for (const [scope, digest] of Object.entries(expected))
    assert.equal(getReleasePolicy(scope).policyDigest, digest);
  const ccd = getReleasePolicy("exui-ccd-pilot");
  assert.deepEqual(
    ccd.obligations.flatMap((obligation) => obligation.requiredProofIds).sort(),
    [
      "ccd-nested-roundtrip",
      "ccd-postal-two-roundtrip",
      "ccd-prl-workbasket-inputs",
      "ccd-role-policy",
      "ccd-role-revocation",
    ],
  );
  assert.deepEqual(
    ccd.obligations.find((obligation) => obligation.id === "ccd-role-revocation")
      .requiredMutationIds,
    ["ccd-stale-revoked-bearer"],
  );
  const { runFixedCiPilots } = await import("./run-harness-ci.mjs");
  const calls = [];
  await runFixedCiPilots({
    phase: async (name) => {
      calls.push(name);
      return { status: "PASS", exitCode: 0 };
    },
    derive: async () => {},
    start: async () => {},
    stop: async () => {},
    startEvent: async () => {},
    stopEvent: async () => {},
    startCallback: async () => {}, stopCallback: async () => {},
  });
  assert.deepEqual(calls, ["family", "scope", "ccd", "eventCapability", "routing", "recipientCallback", "selectorEventRow"]);
});

test("support only: scoped real Node guard admits PCS NoC but denies UI/other origins and keeps old scopes unchanged", () => {
  const { spawnSync } = require("node:child_process");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "routing-guard-"));
  try {
    const program = `const fs=require('node:fs');let created=null;fs.mkdirSync=(directory,options)=>{if(directory!=='/tmp/exui-routing-config'||options.mode!==448)throw Error('wrong-private-config');created=directory};fs.lstatSync=()=>({isDirectory:()=>true,isSymbolicLink:()=>false,mode:16832,uid:process.getuid()});fs.realpathSync=directory=>directory;fs.readdirSync=()=>[];const net=require('node:net');net.Socket.prototype.connect=function(){return this};require(${JSON.stringify(path.resolve("scripts/lib/exui-runtime-network-guard.cjs"))});const result=[3100,3101,3102,3103,3104].map(port=>{try{new net.Socket().connect({host:'127.0.0.1',port});return true}catch{return false}});try{new net.Socket().connect({host:'outside.invalid',port:3102});result.push(true)}catch{result.push(false)}console.log(JSON.stringify({result,created}));`;
    for (const scope of [
      "exui-wa-family-pilot",
      "exui-ccd-pilot",
      "exui-decentralised-routing-pilot",
    ]) {
      const result = spawnSync(process.execPath, ["-e", program], {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          EXUI_HARNESS_SCOPE: scope,
          NODE_CONFIG_DIR: "/tmp/exui-routing-config",
          EXUI_ROUTING_CONFIGURATION_MODE:
            "complete-node-config-empty-private-directory",
          EXUI_NETWORK_REJECTIONS: path.join(directory, "rejections.jsonl"),
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        result: [
          true,
          true,
          scope === "exui-decentralised-routing-pilot",
          false,
          false,
          false,
        ],
        created:
          scope === "exui-decentralised-routing-pilot"
            ? "/tmp/exui-routing-config"
            : null,
      });
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("support only: changed sealed implementation is admissible against unchanged reviewed config and independent expected identity", async () => {
  const { describeCandidateArtifact, verifyCandidateArtifact } =
    await import("./lib/exui-candidate-artifact.mjs");
  const { assertRoutingInterpreter } =
    await import("./lib/exui-routing-contract.mjs");
  const { assertCandidateConfigurationSources } =
    await import("./lib/exui-configuration-catalogue.mjs");
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "routing-new-candidate-"));
  try {
    const files = {
      "dist/rpx-exui/browser/index.html": "ui",
      "dist/rpx-exui/browser/future-routing.js": "future compiled Angular",
      "dist/rpx-exui/api/server.bundle.js": "future compiled Node",
      "api/package.json": "{}",
      "runtime/node": "fake-node",
      "package.json":
        '{"dependencies":{"@hmcts/ccd-case-ui-toolkit":"7.4.21"}}',
      "yarn.lock": "lock",
      "node_modules/@hmcts/ccd-case-ui-toolkit/package.json":
        '{"version":"7.4.21"}',
      "config/default.json":
        '{"decentralisedCaseTypeConfig":{"PCS":{"webUrl":"https://pcs.example","nocBaseUrl":"http://pcs.example"}},"decentralisedServiceMap":{}}',
      "config/custom-environment-variables.json": "{}",
    };
    for (const [file, contents] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), contents);
    }
    const review = JSON.parse(
      fs.readFileSync("scripts/fixtures/exui-configuration-review.json"),
    );
    review.sourceFileDigests = Object.fromEntries(
      ["config/default.json", "config/custom-environment-variables.json"].map(
        (file) => ["rpx-xui-webapp:" + file, digestBytes(files[file]).slice(7)],
      ),
    );
    const artifact = await describeCandidateArtifact(root, {
      sourceMethod: "git-archive",
      webappCommit: "c".repeat(40),
      sourceTree: "d".repeat(40),
      platform: "linux/arm64",
      buildImage: "sha256:" + "e".repeat(64),
      install: "immutable-offline",
    });
    const manifest = path.join(
      path.dirname(root),
      path.basename(root) + ".json",
    );
    fs.writeFileSync(manifest, JSON.stringify(artifact));
    try {
      const verified = await verifyCandidateArtifact(manifest);
      assertCandidateConfigurationSources(root, review);
      const observed = assertRoutingInterpreter(
        verified,
        review,
        structuredClone(artifact.identity),
      );
      assert.notEqual(
        observed.contract.revision,
        observed.implementation.identity.webappCommit,
      );
      assert.equal(observed.implementation.sourceTree, "d".repeat(40));
      assert.equal(observed.knownBaselineRoutingChunk, null);
      assert.equal(
        observed.implementation.apiBundle.digest,
        digestBytes(files["dist/rpx-exui/api/server.bundle.js"]),
      );
      assert.throws(
        () =>
          assertRoutingInterpreter(verified, review, {
            ...artifact.identity,
            artifactDigest: "sha256:" + "f".repeat(64),
          }),
        /INDEPENDENT_CANDIDATE_MISMATCH/,
      );
      fs.appendFileSync(
        path.join(root, "dist/rpx-exui/api/server.bundle.js"),
        "drift",
      );
      await assert.rejects(
        verifyCandidateArtifact(manifest),
        /identity mismatch/,
      );
      fs.writeFileSync(path.join(root, "config/default.json"), "{}");
      assert.throws(
        () => assertCandidateConfigurationSources(root, review),
        /SOURCE_DRIFT/,
      );
    } finally {
      fs.rmSync(manifest, { force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function routingSupport(root) {
  const ts = require("typescript");
  const { pathToFileURL } = require("node:url");
  const compiled = ts.transpileModule(
    fs.readFileSync("src/harness/routing.ts", "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  );
  const modulePath = path.join(root, "routing-support.mjs");
  fs.writeFileSync(modulePath, compiled.outputText);
  return import(pathToFileURL(modulePath).href);
}

test("support only: actual served future-named assets must match that sealed candidate; CSRF helper reads real response headers or rejects absence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "routing-assets-"));
  try {
    const { verifyRoutingAsset, csrfToken } = await routingSupport(root);
    fs.writeFileSync(path.join(root, "future-lazy.js"), "new implementation");
    assert.equal(
      verifyRoutingAsset(
        root,
        "/future-lazy.js",
        Buffer.from("new implementation"),
      ).path,
      "/future-lazy.js",
    );
    assert.throws(
      () =>
        verifyRoutingAsset(
          root,
          "/future-lazy.js",
          Buffer.from("wrong served bytes"),
        ),
      /SERVED_ASSET_MISMATCH/,
    );
    assert.throws(
      () => verifyRoutingAsset(root, "/../outside.js", Buffer.from("x")),
      /ASSET_PATH_ESCAPE/,
    );
    assert.equal(
      csrfToken({
        headersArray: () => [
          {
            name: "set-cookie",
            value: "XSRF-TOKEN=actual%2Dresponse; Secure; SameSite=Strict",
          },
        ],
      }),
      "actual-response",
    );
    assert.throws(
      () => csrfToken({ headersArray: () => [] }),
      /ACTUAL_CANDIDATE_CSRF_TOKEN_REQUIRED/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("support only: three provider sockets independently journal destination port, enforce exact routing requests and close all listeners", async () => {
  const http = require("node:http");
  const { startRoutingProviders } =
    await import("./lib/exui-routing-provider.mjs");
  const { routingAnswers, ROUTING_CASES } =
    await import("./lib/exui-routing-contract.mjs");
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "routing-provider-"));
  const ids = [];
  const { server } = await startRoutingProviders(output, {
    seed: (_assignment, id) => ids.push(id),
  });
  const request = (port, method, route, body, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: route,
          method,
          headers: {
            ...headers,
            ...(body ? { "content-type": "application/json" } : {}),
          },
        },
        (res) => {
          let text = "";
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () => resolve({ status: res.statusCode, body: text }));
        },
      );
      req.on("error", reject);
      req.end(body ? JSON.stringify(body) : undefined);
    });
  try {
    assert.equal(new Set(ids).size, 2);
    assert(ids.every((id) => id.startsWith("harness-routing-")));
    const sessions = JSON.parse(
      fs.readFileSync(path.join(output, "routing-sessions.json")),
    );
    assert.notEqual(sessions.primary.id, sessions.fresh.id);
    const questions = await request(
      3101,
      "GET",
      `/central-assignment/noc/noc-questions?case_id=${ROUTING_CASES.a}`,
    );
    assert.equal(questions.status, 200);
    assert.equal(JSON.parse(questions.body).questions[0].case_type_id, "PCS");
    const post = await request(
      3102,
      "POST",
      "/pcs-assignment/noc/verify-noc-answers",
      routingAnswers(ROUTING_CASES.a),
      { Host: "127.0.0.1:3101" },
    );
    assert.equal(post.body, "true");
    const journal = fs
      .readFileSync(path.join(output, "routing-destinations.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.deepEqual(
      journal.map((e) => e.port),
      [3101, 3102],
    );
    const jurisdictions =
      "/aggregated/caseworkers/harness-supervisor/jurisdictions";
    for (const access of ["create", "read"]) {
      const metadata = await request(
        3101,
        "GET",
        `${jurisdictions}?access=${access}`,
      );
      assert.equal(metadata.status, 200, `declared ${access} metadata`);
      assert.equal(JSON.parse(metadata.body)[0].id, "PCS");
    }
    for (const query of [
      "access=update",
      "access=read&access=read",
      "access=read&extra=true",
    ])
      assert.equal(
        (await request(3101, "GET", `${jurisdictions}?${query}`)).status,
        501,
        `undeclared metadata query ${query}`,
      );
    for (const [port, route, body] of [
      [
        3101,
        "/pcs-assignment/noc/verify-noc-answers",
        routingAnswers(ROUTING_CASES.a),
      ],
      [
        3102,
        "/pcs-assignment/noc/extra/verify-noc-answers",
        routingAnswers(ROUTING_CASES.a),
      ],
      [
        3102,
        "/pcs-assignment/noc/verify-noc-answers",
        { ...routingAnswers(ROUTING_CASES.a), extra: true },
      ],
    ])
      assert.equal((await request(port, "POST", route, body)).status, 501);
    assert.equal(
      (
        await request(
          3103,
          "GET",
          "/pcs-ui/cases/case-create/PCS/PCS/ext%3Arouting-create?expected_sub=harness-supervisor",
        )
      ).status,
      200,
    );
    assert.equal((await request(3103, "GET", "/not-declared")).status, 501);
    assert.equal(
      fs
        .readFileSync(path.join(output, "provider-rejections.jsonl"), "utf8")
        .trim()
        .split("\n").length,
      7,
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("support only: shared evaluator needs both narrow baseline proofs and both intended witnesses, never aggregate80ee", async () => {
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { evaluateReleaseEvidence } =
    await import("./lib/exui-release-evidence.mjs");
  const {
    completeRun,
    digest,
  } = require("./fixtures/exui-release-evidence.mock.cjs");
  const input = completeRun(),
    template = structuredClone(input);
  input.policy = getReleasePolicy("exui-decentralised-routing-pilot");
  Object.assign(input.manifest, {
    releaseScopeId: input.policy.releaseScopeId,
    policyDigest: input.policy.policyDigest,
    requiredObligationIds: input.policy.requiredObligationIds,
  });
  input.results = input.policy.obligations.map((obligation) => ({
    ...structuredClone(template.results[0]),
    proofId: obligation.requiredProofIds[0],
    obligationId: obligation.id,
    invocationId: "baseline",
  }));
  input.executions = [
    { ...structuredClone(template.executions[0]), invocationId: "baseline" },
  ];
  input.mutations = input.policy.mutationDefinitions.map(
    (definition, index) => {
      const mutantIdentity = {
        ...structuredClone(input.manifest.identity),
        configurationDigest: digest(String(index + 5)),
      };
      const baselineResult = input.results.find(
        (result) => result.proofId === definition.baselineProofId,
      );
      const mutantResult = {
        ...structuredClone(template.mutations[0].mutantResult),
        obligationId: definition.obligationId,
        proofId: definition.mutantProofId,
        invocationId: definition.mutationId,
        identity: mutantIdentity,
        failureId: definition.expectedFailureId,
      };
      input.executions.push({
        ...structuredClone(template.executions[1]),
        invocationId: definition.mutationId,
        identity: mutantIdentity,
      });
      return {
        mutationId: definition.mutationId,
        obligationId: definition.obligationId,
        runId: input.manifest.runId,
        baselineIdentity: input.manifest.identity,
        mutantIdentity,
        mutationDefinitionDigest: definition.definitionDigest,
        baselineResult,
        mutantResult,
      };
    },
  );
  assert.equal(evaluateReleaseEvidence(input).status, "PASS");
  for (const id of input.policy.requiredObligationIds) {
    const partial = structuredClone(input);
    partial.results = partial.results.filter(
      (result) => result.obligationId !== id,
    );
    assert.equal(evaluateReleaseEvidence(partial).status, "BLOCKED");
  }
  for (const definition of input.policy.mutationDefinitions) {
    const wrong = structuredClone(input);
    wrong.mutations.find(
      (item) => item.mutationId === definition.mutationId,
    ).mutantResult.failureId = "unrelated-startup";
    assert.equal(evaluateReleaseEvidence(wrong).status, "BLOCKED");
  }
  assert(
    !input.manifest.requiredObligationIds.some((id) =>
      id.startsWith("configuration-"),
    ),
  );
});

test("support only: provider failure after partial listener startup closes owned listeners and preserves an unrelated listener", async () => {
  const http = require("node:http");
  const net = require("node:net");
  const { startRoutingProviders } =
    await import("./lib/exui-routing-provider.mjs");
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "routing-partial-"));
  const occupied = http.createServer((_req, res) =>
    res.end("foreign-owned-by-test"),
  );
  await new Promise((resolve) => occupied.listen(3103, "127.0.0.1", resolve));
  const probe = (port) =>
    new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
  try {
    await assert.rejects(
      startRoutingProviders(output, { seed: () => {} }),
      /EADDRINUSE/,
    );
    assert.equal(await probe(3101), false);
    assert.equal(await probe(3102), false);
    assert.equal(await probe(3103), true);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("support only: both independent supervisor scope maps recognize routing before their next safety guard", async () => {
  const { captureCiPhaseExpectation } =
    await import("./lib/exui-candidate-ci-evidence.mjs");
  const { captureNativeOwnership } =
    await import("./lib/exui-native-ci-ownership.mjs");
  assert.throws(
    () =>
      captureCiPhaseExpectation(
        "routing",
        { harnessSources: [] },
        null,
        null,
        null,
      ),
    /SOURCE_INVENTORY/,
  );
  assert.throws(
    () =>
      captureNativeOwnership(
        { releaseScopeId: "exui-decentralised-routing-pilot", runId: "wrong" },
        null,
        null,
        null,
        "routing",
      ),
    /OWNER_REQUIRED/,
  );
});

test("support only: true omission uses routing-only empty API tmpfs configuration and exact owned launch expectations", async () => {
  const {
    candidateArchiveArguments,
    candidateArchiveProcess,
    assertOwnedContainerAuthority,
  } = await import("./lib/exui-oci-runtime.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "routing-config-argv-"));
  try {
    for (const dir of [
      "candidate",
      "sessions",
      "diagnostics",
      "evidence",
      "harness",
    ])
      fs.mkdirSync(path.join(root, dir));
    fs.writeFileSync(path.join(root, "harness/guard.cjs"), "guard");
    const config = {
      decentralisedCaseTypeConfig: {
        PCS: { nocBaseUrl: "http://127.0.0.1:3102/pcs-assignment" },
      },
    };
    const launchProcess = candidateArchiveProcess(
      config,
      "exui-decentralised-routing-pilot",
    );
    assert(
      launchProcess.command.includes(
        "NODE_CONFIG_DIR=/tmp/exui-routing-config",
      ),
    );
    assert(
      launchProcess.command.includes(
        "EXUI_ROUTING_CONFIGURATION_MODE=complete-node-config-empty-private-directory",
      ),
    );
    assert.deepEqual(
      JSON.parse(
        launchProcess.command
          .find((x) => x.startsWith("NODE_CONFIG="))
          .slice("NODE_CONFIG=".length),
      ),
      config,
    );
    assert(
      candidateArchiveProcess({}, "exui-wa-family-pilot").command.includes(
        "NODE_CONFIG_DIR=/candidate/config",
      ),
    );
    const args = candidateArchiveArguments({
      image: "sha256:" + "a".repeat(64),
      namespace: "b".repeat(64),
      owner: "candidate-11111111-1111-4111-8111-111111111111",
      invocationId: "routing-omit-web-url",
      releaseScopeId: "exui-decentralised-routing-pilot",
      candidateRoot: path.join(root, "candidate"),
      sessions: path.join(root, "sessions"),
      diagnostics: path.join(root, "diagnostics"),
      evidenceRoot: path.join(root, "evidence"),
      harnessRoot: path.join(root, "harness"),
      guard: path.join(root, "harness/guard.cjs"),
      config,
    });
    assert.deepEqual(
      args.slice(args.indexOf("sha256:" + "a".repeat(64)) + 1),
      launchProcess.command,
    );
    const expected = {
      image: "sha256:" + "a".repeat(64),
      owner: "owned",
      service: "candidate",
      namespace: "b".repeat(64),
      mounts: [],
      launchProcess,
    };
    const info = {
      Image: expected.image,
      Config: {
        Labels: {
          "exui.harness.owner": "owned",
          "exui.harness.service": "candidate",
        },
        Entrypoint: launchProcess.entrypoint,
        Cmd: launchProcess.command,
      },
      HostConfig: {
        NetworkMode: "container:" + expected.namespace,
        ReadonlyRootfs: true,
        Init: true,
        Privileged: false,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        PidsLimit: 256,
        Memory: 4294967296,
        NanoCpus: 2000000000,
        PortBindings: {},
        Tmpfs: { "/tmp": "rw,nosuid,size=512m" },
      },
      Mounts: [],
    };
    assertOwnedContainerAuthority(info, expected);
    for (const change of [
      (i) => (i.Config.Cmd = ["wrong"]),
      (i) => (i.Config.Entrypoint = ["wrong"]),
      (i) => (i.HostConfig.Tmpfs = {}),
    ]) {
      const wrong = structuredClone(info);
      change(wrong);
      assert.throws(() => assertOwnedContainerAuthority(wrong, expected));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("support only: routing proof collection is exactly two baseline files and one file per fixed omission, with no browser execution", () => {
  const { spawnSync } = require("node:child_process");
  const { completeRun } = require("./fixtures/exui-release-evidence.mock.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "routing-collection-"));
  const manifest = path.join(root, "manifest.json");
  fs.writeFileSync(manifest, JSON.stringify(completeRun().manifest));
  try {
    const env = {
      PATH: process.env.PATH,
      TMPDIR: os.tmpdir(),
      EXUI_HARNESS_SELECTION: "candidate",
      EXUI_HARNESS_SLICE: "routing",
      EXUI_CANDIDATE_RUN_MANIFEST: manifest,
      EXUI_CANDIDATE_URL: "http://127.0.0.1:3100",
      EXUI_EVIDENCE_CONTEXT: path.join(root, "context.json"),
      EXUI_EVIDENCE_REPORT: path.join(root, "report.json"),
      EXUI_HARNESS_TEST_OUTPUT: path.join(root, "output"),
    };
    for (const [file, count] of [
      [null, 2],
      ["create-entry.spec.ts", 1],
      ["noc-cache.spec.ts", 1],
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          "playwright.harness.config.ts",
          "--list",
          "--reporter=list",
          ...(file ? [file] : []),
        ],
        { env, encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`Total: ${count} test`));
      assert(!fs.existsSync(env.EXUI_EVIDENCE_REPORT));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("support only: omission identities bind the complete synthetic load mode and preserve their sibling destination", async () => {
  const { nativeIdentity, nativeInvocations } =
    await import("./lib/exui-native-contract.mjs");
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "routing-identity-"));
  try {
    fs.mkdirSync(path.join(root, "config"));
    fs.writeFileSync(
      path.join(root, "config/default.json"),
      JSON.stringify({
        services: {
          idam: { oauthCallbackUrl: "https://original.invalid" },
          ccd: { caseAssignmentApi: "https://original.invalid" },
        },
        feature: {},
        decentralisedCaseTypeConfig: {
          PCS: {
            webUrl: "https://original.invalid",
            nocBaseUrl: "http://original.invalid",
          },
        },
        decentralisedServiceMap: {},
      }),
    );
    const input = {
      releaseScopeId: "exui-decentralised-routing-pilot",
      artifact: {
        candidateRoot: root,
        identity: {
          webappCommit: "a".repeat(40),
          artifactDigest: "sha256:" + "b".repeat(64),
        },
      },
    };
    const observed = nativeInvocations(input.releaseScopeId).map((invocation) =>
      nativeIdentity(input, invocation, root),
    );
    assert.equal(
      new Set(observed.map((item) => item.identity.configurationDigest)).size,
      3,
    );
    for (const item of observed)
      assert.equal(
        item.identity.configurationDigest,
        digestBytes(
          JSON.stringify({
            config: item.config,
            loadMode: "complete-node-config-empty-private-directory",
          }),
        ),
      );
    assert.equal(
      observed[1].config.decentralisedCaseTypeConfig.PCS.nocBaseUrl,
      observed[0].config.decentralisedCaseTypeConfig.PCS.nocBaseUrl,
    );
    assert.equal(
      observed[2].config.decentralisedCaseTypeConfig.PCS.webUrl,
      observed[0].config.decentralisedCaseTypeConfig.PCS.webUrl,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("support only: repeated API preload reuses only its owned empty0700 config directory and rejects unsafe state without host effects", () => {
  const { spawnSync } = require("node:child_process");
  const source = fs.readFileSync(
    "scripts/lib/exui-runtime-network-guard.cjs",
    "utf8",
  );
  for (const state of [
    "repeat",
    "symlink",
    "file",
    "nonempty",
    "mode",
    "owner",
  ]) {
    const program = `const fs=require('node:fs'),Module=require('node:module');let calls=0;const state=${JSON.stringify(state)};fs.mkdirSync=(directory,options)=>{if(directory!=='/tmp/exui-routing-config'||options.mode!==448)throw Error('unexpected-fs-write');if(++calls>1){const e=Error('exists');e.code='EEXIST';throw e}};fs.lstatSync=()=>({isDirectory:()=>state!=='file',isSymbolicLink:()=>state==='symlink',mode:state==='mode'?16877:16832,uid:process.getuid()+(state==='owner'?1:0)});fs.realpathSync=directory=>directory;fs.readdirSync=()=>state==='nonempty'?['default.json']:[];const net=require('node:net');net.Socket.prototype.connect=function(){return this};const code=${JSON.stringify(source)};try{new Module('first')._compile(code,'guard.cjs');new Module('second')._compile(code,'guard.cjs');console.log(JSON.stringify({accepted:true,calls}))}catch(e){console.log(JSON.stringify({accepted:false,message:e.message,calls}))}`;
    const result = spawnSync(process.execPath, ["-e", program], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        EXUI_HARNESS_SCOPE: "exui-decentralised-routing-pilot",
        NODE_CONFIG_DIR: "/tmp/exui-routing-config",
        EXUI_ROUTING_CONFIGURATION_MODE:
          "complete-node-config-empty-private-directory",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(result.stdout);
    assert.equal(observed.accepted, state === "repeat");
    if (state === "repeat") assert.equal(observed.calls, 2);
    else assert.match(observed.message, /DIRECTORY_UNSAFE/);
  }
});

test("support only: all three synthetic creation events satisfy the sealed toolkit create-access input contract", async () => {
  const { routingJurisdictions, routingProfile } =
    await import("./lib/exui-routing-contract.mjs");
  const events = routingJurisdictions().flatMap((jurisdiction) =>
    jurisdiction.caseTypes.flatMap((caseType) => caseType.events),
  );
  assert.equal(events.length, 3);
  assert(routingProfile().user.idam.roles.includes("caseworker"));
  for (const event of events) {
    // Toolkit7.4.21 CreateCaseFiltersComponent retains only no-pre-state events with a matching create ACL.
    assert.deepEqual(event.pre_states, []);
    assert.deepEqual(event.acls, [{ role: "caseworker", create: true }]);
  }
});
