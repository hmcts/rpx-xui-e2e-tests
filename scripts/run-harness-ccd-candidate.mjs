#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { runOwnedDocker } from "./lib/exui-candidate-child.mjs";
import { randomUUID } from "node:crypto";
import {
  verifyCandidateArtifact,
  describeCandidateArtifact,
  digestCandidateTree,
} from "./lib/exui-candidate-artifact.mjs";
import {
  effectiveCandidateConfiguration,
  candidateEnvironment,
  isolatedContainerArguments,
  assertRuntimeIdentity,
  assertCandidateShutdown,
} from "./lib/exui-candidate-runtime.mjs";
import {
  ccdCredentials,
  ccdRequest,
  verifyCcdRuntimeIdentity,
} from "./lib/exui-ccd-runtime.mjs";
import {
  startCcdGateway,
  CCD_HARNESS_SOURCE_FILES,
  seedCcdSession,
} from "./lib/exui-ccd-browser-runtime.mjs";
import { getReleasePolicy } from "./lib/exui-release-policy.mjs";
import { assertCandidateConfigurationSources } from "./lib/exui-configuration-catalogue.mjs";
import { verifyHarnessDependencies } from "./lib/exui-harness-dependencies.mjs";
import {
  digestBytes,
  writeJsonAtomic,
  loadRunEvidence,
  writePublicSummary,
} from "./lib/exui-evidence-io.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeImage =
  "sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27";
const arg = (key) => {
  const i = process.argv.indexOf(key);
  return i < 0 ? undefined : process.argv[i + 1];
};
const exited = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
const ref = (output, file) => ({
  path: path.relative(output, file),
  digest: digestBytes(fs.readFileSync(file)),
});
async function ready(child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null)
      throw new Error("CCD_CANDIDATE_STARTUP_FAILED");
    try {
      if ((await fetch("http://127.0.0.1:3100/external/config/ui")).ok) return;
    } catch {
      /* owned startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("CCD_CANDIDATE_STARTUP_TIMEOUT");
}

async function inside() {
  const output = "/output";
  const input = JSON.parse(fs.readFileSync(`${output}/input.json`, "utf8"));
  await verifyHarnessDependencies(
    "/harness/node_modules",
    path.join(root, "package.json"),
    path.join(root, "yarn.lock"),
    input.harnessDependencies.digest,
  );
  assertCandidateConfigurationSources(
    "/candidate",
    JSON.parse(
      fs.readFileSync(
        path.join(root, "scripts/fixtures/exui-configuration-review.json"),
        "utf8",
      ),
    ),
  );
  if (
    digestBytes(
      fs.readFileSync("/harness/scripts/lib/exui-ccd-browser-runtime.mjs"),
    ) !== input.gatewayDigest
  )
    throw new Error("CCD_GATEWAY_ARTIFACT_MISMATCH");
  if (
    digestBytes(
      JSON.stringify(
        input.harnessSources.map((file) => [
          file,
          digestBytes(fs.readFileSync(path.join(root, file))),
        ]),
      ),
    ) !== input.harnessSourceDigest
  )
    throw new Error("HARNESS_SOURCE_SNAPSHOT_MISMATCH");
  const observed = await describeCandidateArtifact(
    "/candidate",
    input.artifact.provenance,
  );
  assertRuntimeIdentity(input.artifact.identity, observed.identity);
  if ((await digestCandidateTree("/browser")) !== input.browserDigest)
    throw new Error("BROWSER_ARTIFACT_MISMATCH");
  for (const [service, port] of [
    ["data", 4452],
    ["definition", 4451],
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}/v3/api-docs`);
    if (
      !response.ok ||
      digestBytes(JSON.stringify(await response.json())) !==
        input.apiContracts[service]
    )
      throw new Error("CCD_API_CONTRACT_MISMATCH");
  }
  const liveDefinition = await fetch(
    "http://127.0.0.1:4451/api/data/case-type/HarnessNestedPRL",
    { headers: input.credentials.observer.headers },
  );
  if (
    !liveDefinition.ok ||
    digestBytes(JSON.stringify(await liveDefinition.json())) !==
      input.definition.observedDefinitionDigest
  )
    throw new Error("CCD_IMPORTED_DEFINITION_DRIFT");
  const policy = getReleasePolicy("exui-ccd-pilot");
  const executions = [],
    mutations = [],
    identities = [];
  let manifest;
  const invocations = input.only
    ? [input.only]
    : [
        "baseline",
        "ccd-drop-child",
        "ccd-broaden-access",
        "ccd-write-then-deny",
      ];
  try {
    for (const invocationId of invocations) {
      const mutation = invocationId === "baseline" ? null : invocationId;
      const dir = `${output}/${invocationId}`;
      fs.mkdirSync(dir, { mode: 0o700 });
      const { config } = effectiveCandidateConfiguration("/candidate");
      config.now = false;
      const identity = {
        ...input.artifact.identity,
        configurationDigest: digestBytes(
          JSON.stringify({
            config,
            gatewayDigest: input.gatewayDigest,
            mutation,
          }),
        ),
        definitionDigests: { HarnessNestedPRL: input.definition.fixtureDigest },
        dependencyIdentities: Object.fromEntries(
          ["data", "definition"].map((name) => [
            name === "data" ? "ccd" : "ccd-definition",
            {
              artifactDigest: input.ccd.images[name].id,
              apiContractDigest: input.apiContracts[name],
            },
          ]),
        ),
      };
      identities.push({ invocationId, identity });
      const current = {
        schemaVersion: 1,
        runId: input.runId,
        harnessCommit: input.harnessCommit,
        releaseScopeId: policy.releaseScopeId,
        policyDigest: policy.policyDigest,
        identity,
        requiredObligationIds: policy.requiredObligationIds,
        runtimeMetadata: {
          isolation: "docker-owned-ccd-network-none",
          runtimeImage,
          browserDigest: input.browserDigest,
          gatewayDigest: input.gatewayDigest,
          definitionImportDigest: input.definitionImportDigest,
          observedDefinitionDigest: input.definition.observedDefinitionDigest,
          definitionVersion: String(input.definition.definitionVersion),
          harnessSourceDigest: input.harnessSourceDigest,
          harnessDependencyDigest: input.harnessDependencies.digest,
          playwrightVersion: input.harnessDependencies.playwrightVersion,
          ccdNamespace: input.ccd.namespace,
          ccdImages: JSON.stringify(input.ccd.images),
          excludedSeams:
            "synthetic-session,IDAM-simulator,feature-flags,telemetry; real CCD RBAC only; ABAC/provider excluded",
          faultBoundary: mutation ?? "transparent CCD transport",
          harnessSourceState: input.harnessSourceState,
        },
      };
      if (!manifest) manifest = current;
      writeJsonAtomic(`${dir}/manifest.json`, current);
      writeJsonAtomic(`${dir}/context.json`, {
        runId: input.runId,
        invocationId,
        identity,
        harnessCommit: input.harnessCommit,
        releaseScopeId: policy.releaseScopeId,
        policyDigest: policy.policyDigest,
        harnessSourceState: input.harnessSourceState,
        harnessSourceDigest: input.harnessSourceDigest,
      });
      writeJsonAtomic(`${dir}/runtime-identity.json`, {
        identity,
        payloadDigest: observed.payloadDigest,
      });
      const sessions = Object.fromEntries(
        Object.entries(input.credentials).map(([name, credential]) => [
          name,
          seedCcdSession(name, credential),
        ]),
      );
      writeJsonAtomic(`${dir}/personas.json`, {
        credentials: input.credentials,
        sessions,
      });
      const gateway = await startCcdGateway(dir, input.credentials, mutation);
      const log = fs.openSync(`${dir}/candidate.log`, "wx", 0o600);
      const child = spawn(
        "/candidate/runtime/node",
        [
          "--require",
          "/harness/scripts/lib/exui-runtime-network-guard.cjs",
          "/candidate/dist/rpx-exui/api/server.bundle.js",
        ],
        {
          cwd: "/tmp",
          env: candidateEnvironment(config, dir),
          stdio: ["ignore", log, log],
        },
      );
      const terminal = exited(child);
      let execution;
      try {
        await ready(child);
        const testLog = fs.openSync(`${dir}/playwright.log`, "wx", 0o600);
        const testArgs = [
          "/harness/node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          "/harness/playwright.harness.config.ts",
        ];
        if (mutation)
          testArgs.push(
            mutation === "ccd-drop-child"
              ? "nested-conditional.spec.ts"
              : "case-event-policy.spec.ts",
          );
        const browser = spawn(process.execPath, testArgs, {
          cwd: root,
          env: {
            PATH: "/usr/local/bin:/usr/bin:/bin",
            HOME: "/tmp",
            EXUI_HARNESS_SELECTION: "ccd",
            EXUI_CANDIDATE_RUN_MANIFEST: `${dir}/manifest.json`,
            EXUI_CANDIDATE_URL: "http://127.0.0.1:3100",
            EXUI_RUNTIME_IDENTITY: `${dir}/runtime-identity.json`,
            EXUI_CANDIDATE_ASSETS: "/candidate/dist/rpx-exui/browser",
            EXUI_HARNESS_TEST_OUTPUT: `${dir}/test-output`,
            EXUI_EVIDENCE_CONTEXT: `${dir}/context.json`,
            EXUI_EVIDENCE_REPORT: `${dir}/report.json`,
            EXUI_SESSION_COOKIE: sessions.allowed,
            EXUI_CHROMIUM_EXECUTABLE: input.browserExecutable,
            EXUI_CCD_PERSONAS: `${dir}/personas.json`,
            EXUI_CCD_EVIDENCE: dir,
            ...(mutation ? { EXUI_HARNESS_MUTATION: mutation } : {}),
          },
          stdio: ["ignore", testLog, testLog],
        });
        const result = await exited(browser);
        fs.closeSync(testLog);
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error("CCD_CANDIDATE_EXITED_DURING_PROOF");
        const report = JSON.parse(
          fs.readFileSync(`${dir}/report.json`, "utf8"),
        );
        execution = {
          invocationId,
          runId: input.runId,
          identity,
          kind: mutation ? "mutation" : "baseline",
          terminalState: result.signal ? "interrupted" : "completed",
          runnerExitCode: result.code,
          unexpectedGlobalErrors: report.globalErrors,
          resultArtifact: ref(output, `${dir}/report.json`),
        };
      } finally {
        const requestedStop =
          child.exitCode === null &&
          child.signalCode === null &&
          child.kill("SIGTERM");
        const stopped = await terminal;
        fs.closeSync(log);
        await new Promise((resolve) => gateway.close(resolve));
        if (execution) assertCandidateShutdown(stopped, requestedStop);
        if (
          [
            "network-rejections.jsonl",
            "unhandled-provider.jsonl",
            "gateway-errors.jsonl",
          ].some((file) => fs.existsSync(`${dir}/${file}`))
        )
          throw new Error("CCD_RUNTIME_DESTINATION_OR_TRANSPORT_FAILURE");
      }
      writeJsonAtomic(`${dir}/execution.json`, execution);
      executions.push(ref(output, `${dir}/execution.json`));
      if (invocationId === "baseline" && execution.runnerExitCode !== 0) break;
    }
    for (const item of identities.filter(
      (item) => item.invocationId !== "baseline",
    )) {
      const definition = policy.mutationDefinitions.find(
        (definition) => definition.mutationId === item.invocationId,
      );
      const baseline = identities.find(
        (item) => item.invocationId === "baseline",
      );
      if (!baseline) continue;
      const file = `${output}/${item.invocationId}/derivation.json`;
      writeJsonAtomic(file, {
        mutationDefinitionDigest: definition.definitionDigest,
        baselineIdentity: baseline.identity,
        mutantIdentity: item.identity,
        transformation: item.invocationId,
        target:
          "declared CCD gateway fault; same actual Angular/Node/CCD artifact",
        gatewayDigest: input.gatewayDigest,
      });
      mutations.push({
        mutationId: item.invocationId,
        baselineInvocationId: "baseline",
        mutantInvocationId: item.invocationId,
        derivationArtifact: ref(output, file),
      });
    }
  } finally {
    if (manifest)
      writeJsonAtomic(`${output}/run.json`, {
        schemaVersion: 1,
        manifest,
        executionArtifacts: executions,
        mutations,
      });
    try {
      const { receipt } = loadRunEvidence(`${output}/run.json`, policy);
      writeJsonAtomic(`${output}/gate.json`, receipt);
      writePublicSummary(
        `${output}/public/release-assurance-summary.json`,
        receipt.verdict,
        true,
      );
      process.exitCode = receipt.verdict.exitCode;
    } catch {
      writePublicSummary(`${output}/public/release-assurance-summary.json`, {
        status: "BLOCKED",
      });
      process.exitCode = 2;
    }
  }
}

async function launch() {
  if (
    arg("--only") &&
    ![
      "baseline",
      "ccd-drop-child",
      "ccd-broaden-access",
      "ccd-write-then-deny",
    ].includes(arg("--only"))
  )
    throw new Error("UNKNOWN_CCD_INVOCATION");
  const candidate = arg("--candidate"),
    statePath = arg("--ccd-state");
  if (!candidate || !statePath)
    throw new Error("CANDIDATE_AND_OWNED_CCD_STATE_REQUIRED");
  const artifact = await verifyCandidateArtifact(path.resolve(candidate));
  const harnessDependencies = await verifyHarnessDependencies(
    path.join(root, "node_modules"),
    path.join(root, "package.json"),
    path.join(root, "yarn.lock"),
  );
  assertCandidateConfigurationSources(
    artifact.candidateRoot,
    JSON.parse(
      fs.readFileSync(
        path.join(root, "scripts/fixtures/exui-configuration-review.json"),
        "utf8",
      ),
    ),
  );
  const ccd = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (
    !ccd.ready ||
    !ccd.definitionImported ||
    !/^[a-f0-9]{64}$/.test(ccd.namespace)
  )
    throw new Error("CCD_READY_IMPORT_REQUIRED");
  verifyCcdRuntimeIdentity(ccd);
  const inspection = spawnSync("docker", ["inspect", ccd.namespace], {
    encoding: "utf8",
  });
  const owner = JSON.parse(inspection.stdout)[0];
  if (
    owner.HostConfig.NetworkMode !== "none" ||
    owner.Config.Labels?.["exui.harness.owner"] !== ccd.owner
  )
    throw new Error("CCD_OWNERSHIP_ISOLATION_MISMATCH");
  const output = path.resolve(
    arg("--output") ??
      `functional-output/tests/harness/private/ccd-${randomUUID()}`,
  );
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  if (fs.existsSync(`${output}/input.json`))
    throw new Error("FRESH_RUN_DIRECTORY_REQUIRED");
  writePublicSummary(`${output}/public/release-assurance-summary.json`, {
    status: "BLOCKED",
  });
  const definitionFile = path.join(
    path.dirname(statePath),
    "definition-import.json",
  );
  const definition = JSON.parse(fs.readFileSync(definitionFile, "utf8"));
  const browserRoot = fs.realpathSync(path.resolve(arg("--browser")));
  const browserDigest = await digestCandidateTree(browserRoot);
  const browser = JSON.parse(
    fs.readFileSync(
      path.join(root, "node_modules/playwright-core/browsers.json"),
      "utf8",
    ),
  ).browsers.find((item) => item.name === "chromium");
  const credentials = Object.fromEntries(
    ["allowed", "denied", "observer"].map((name) => [
      name,
      ccdCredentials(ccd, name),
    ]),
  );
  const apiContracts = Object.fromEntries(
    [
      ["data", 4452],
      ["definition", 4451],
    ].map(([service, port]) => {
      const response = ccdRequest(ccd, port, "/v3/api-docs");
      if (response.status !== 200) throw new Error("CCD_API_CONTRACT_REQUIRED");
      return [service, digestBytes(JSON.stringify(response.body))];
    }),
  );
  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  const dirty = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });
  const harnessSources = CCD_HARNESS_SOURCE_FILES;
  const harnessSourceDigest = digestBytes(
    JSON.stringify(
      harnessSources.map((file) => [
        file,
        digestBytes(fs.readFileSync(path.join(root, file))),
      ]),
    ),
  );
  const runId = `ccd-${randomUUID()}`;
  writeJsonAtomic(`${output}/input.json`, {
    artifact,
    ccd,
    credentials,
    definition,
    apiContracts,
    harnessDependencies,
    definitionImportDigest: digestBytes(fs.readFileSync(definitionFile)),
    gatewayDigest: digestBytes(
      fs.readFileSync(
        path.join(root, "scripts/lib/exui-ccd-browser-runtime.mjs"),
      ),
    ),
    browserDigest,
    browserExecutable: `/browser/chromium_headless_shell-${browser.revision}/chrome-headless-shell-linux-arm64/chrome-headless-shell`,
    harnessCommit: commit.stdout.trim(),
    harnessSourceState: dirty.stdout.trim() ? "dirty" : "clean",
    harnessSources,
    harnessSourceDigest,
    runId,
    only: arg("--only"),
  });
  fs.chmodSync(`${output}/input.json`, 0o600);
  const stagedHarness = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "exui-ccd-harness-"),
  );
  fs.chmodSync(stagedHarness, 0o700);
  fs.mkdirSync(path.join(stagedHarness, "node_modules"));
  for (const file of harnessSources) {
    const target = path.join(stagedHarness, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  const cidFile = path.join(output, "container-id");
  writeJsonAtomic(`${output}/container-launch.json`, {
    owner: runId,
    name: runId,
    cidFile,
    stagedHarness,
  });
  const args = isolatedContainerArguments({
    owner: runId,
    cidFile,
    harnessRoot: stagedHarness,
    dependenciesRoot: path.join(root, "node_modules"),
    candidateRoot: artifact.candidateRoot,
    output,
    browserRoot,
    image: runtimeImage,
  });
  args[args.indexOf("none")] = `container:${ccd.namespace}`;
  args[args.indexOf("scripts/run-harness-candidate.mjs")] =
    "scripts/run-harness-ccd-candidate.mjs";

  try {
    const result = await runOwnedDocker(args, { output, owner: runId });
    process.exitCode = result.code ?? 2;
  } finally {
    if (!fs.existsSync(path.join(output, "controller-cancelled.json"))) {
      // Docker Desktop releases its read-only nested bind after the client exits.
      for (let attempt = 0; ; attempt++) {
        try {
          fs.rmdirSync(path.join(stagedHarness, "node_modules"));
          break;
        } catch (error) {
          if (error.code !== "EACCES" || attempt === 19) throw error;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      fs.rmSync(stagedHarness, { recursive: true, force: true });
    }
  }
  console.log(`CCD candidate private evidence: ${output}`);
}
try {
  if (process.argv.includes("--inside")) await inside();
  else await launch();
} catch (error) {
  console.error(`BLOCKED: ${error.message}`);
  process.exitCode = 2;
}
