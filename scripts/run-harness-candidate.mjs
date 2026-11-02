#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, createHmac } from "node:crypto";
import {
  verifyCandidateArtifact,
  describeCandidateArtifact,
  digestCandidateTree,
} from "./lib/exui-candidate-artifact.mjs";
import {
  CANDIDATE_URL,
  effectiveCandidateConfiguration,
  candidateEnvironment,
  isolatedContainerArguments,
  assertRuntimeIdentity,
  assertCandidateShutdown,
  HARNESS_SOURCE_FILES,
} from "./lib/exui-candidate-runtime.mjs";
import {
  startProviderSeams,
  seedSyntheticSession,
  scopeRoleAssignments,
} from "./lib/exui-provider-seams.mjs";
import { verifyHarnessDependencies } from "./lib/exui-harness-dependencies.mjs";
import { verifyScopeMutant } from "./prepare-harness-scope-mutant.mjs";
import { assertCandidateConfigurationSources } from "./lib/exui-configuration-catalogue.mjs";
import { getReleasePolicy } from "./lib/exui-release-policy.mjs";
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
  const index = process.argv.indexOf(key);
  return index < 0 ? undefined : process.argv[index + 1];
};
const childExit = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
const ref = (output, file) => ({
  path: path.relative(output, file),
  digest: digestBytes(fs.readFileSync(file)),
});
async function waitForCandidate(child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error("CANDIDATE_STARTUP_FAILED");
    try {
      const response = await fetch(`${CANDIDATE_URL}/external/config/ui`);
      if (response.ok) return;
    } catch {
      /* owned process is still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("CANDIDATE_STARTUP_TIMEOUT");
}
async function inside() {
  const output = "/output";
  const input = JSON.parse(fs.readFileSync(`${output}/input.json`, "utf8"));
  const actualHarnessDigest = digestBytes(
    JSON.stringify(
      input.harnessSources.map((file) => [
        file,
        digestBytes(fs.readFileSync(path.join(root, file))),
      ]),
    ),
  );
  if (actualHarnessDigest !== input.harnessSourceDigest)
    throw new Error("HARNESS_SOURCE_CHANGED_BEFORE_EXECUTION");
  const harnessDependencies = await verifyHarnessDependencies(
    "/harness/node_modules",
    path.join(root, "package.json"),
    path.join(root, "yarn.lock"),
    input.harnessDependencies.digest,
  );
  if ((await digestCandidateTree("/browser")) !== input.browserDigest)
    throw new Error("BROWSER_ARTIFACT_MISMATCH");
  const observed = await describeCandidateArtifact(
    "/candidate",
    input.artifact.provenance,
  );
  assertRuntimeIdentity(input.artifact.identity, observed.identity);
  const review = JSON.parse(
    fs.readFileSync(
      path.join(root, "scripts/fixtures/exui-configuration-review.json"),
      "utf8",
    ),
  );
  const sourceInputs = await assertCandidateConfigurationSources(
    "/candidate",
    review,
  );
  const policy = getReleasePolicy(input.releaseScopeId);
  const scoped = policy.releaseScopeId === "exui-wa-scope-pilot";
  const mutantObserved = scoped
    ? await describeCandidateArtifact(
        "/mutant",
        input.mutantArtifact.provenance,
      )
    : null;
  if (scoped)
    assertRuntimeIdentity(
      input.mutantArtifact.identity,
      mutantObserved.identity,
    );
  const scopeDerivation = scoped
    ? await verifyScopeMutant(observed, mutantObserved)
    : null;
  const invocations = scoped
    ? [
        { invocationId: "scope-ia", kind: "baseline", persona: "ia" },
        { invocationId: "scope-civil", kind: "baseline", persona: "civil" },
        {
          invocationId: "wa-scope-broadened",
          kind: "mutation",
          persona: "ia",
          mutation: "wa-broaden-scope",
        },
      ]
    : [
        { invocationId: "baseline", kind: "baseline", mutation: null },
        {
          invocationId: "wa-drop-family",
          kind: "mutation",
          mutation: "wa-drop-family",
        },
      ];
  const executions = [];
  const mutations = [];
  const identities = [];
  let manifest;
  try {
    for (const invocation of invocations) {
      const { mutation, invocationId } = invocation;
      const candidateRoot = scoped && mutation ? "/mutant" : "/candidate";
      const artifactIdentity =
        scoped && mutation ? mutantObserved.identity : observed.identity;
      const dir = `${output}/${invocationId}`;
      fs.mkdirSync(dir, { mode: 0o700 });
      const { config, digest } = effectiveCandidateConfiguration(
        candidateRoot,
        mutation === "wa-drop-family" ? mutation : null,
      );
      const identity = {
        ...artifactIdentity,
        configurationDigest: digest,
        definitionDigests: {},
        dependencyIdentities: {},
      };
      identities.push(identity);
      const invocationManifest = {
        schemaVersion: 1,
        runId: input.runId,
        harnessCommit: input.harnessCommit,
        releaseScopeId: policy.releaseScopeId,
        policyDigest: policy.policyDigest,
        runtimeMetadata: {
          isolation: "docker-network-none",
          runtimeImage,
          artifactConfigurationDigest:
            input.artifact.identity.configurationDigest,
          effectiveConfigurationDigest: digest,
          excludedSeams:
            "synthetic-auth,refdata,task-provider,feature-flags,telemetry",
          browser: input.browserVersion,
          browserDigest: input.browserDigest,
          harnessDependencyDigest: harnessDependencies.digest,
          playwrightVersion: harnessDependencies.playwrightVersion,
          harnessSourceState: input.harnessSourceState,
          harnessSourceDigest: input.harnessSourceDigest,
          reviewedConfigurationSources: digestBytes(
            JSON.stringify(sourceInputs),
          ),
        },
        identity,
        requiredObligationIds: policy.requiredObligationIds,
      };
      if (!manifest) manifest = invocationManifest;
      writeJsonAtomic(`${dir}/manifest.json`, invocationManifest);
      writeJsonAtomic(`${dir}/runtime-identity.json`, {
        identity,
        candidatePid: null,
        payloadDigest: observed.payloadDigest,
      });
      writeJsonAtomic(`${dir}/context.json`, {
        harnessSourceState: input.harnessSourceState,
        harnessSourceDigest: input.harnessSourceDigest,
        runId: input.runId,
        invocationId,
        identity,
        harnessCommit: input.harnessCommit,
        releaseScopeId: policy.releaseScopeId,
        policyDigest: policy.policyDigest,
      });
      const log = fs.openSync(`${dir}/candidate.log`, "wx", 0o600);
      const assignments = scoped
        ? scopeRoleAssignments(invocation.persona.toUpperCase())
        : undefined;
      const providers = await startProviderSeams(dir, assignments);
      const persona = seedSyntheticSession(assignments);
      const sessionCookie = `s:${persona.id}.${createHmac("sha256", "synthetic-session-value").update(persona.id).digest("base64").replace(/=+$/, "")}`;
      const server = spawn(
        `${candidateRoot}/runtime/node`,
        [
          "--require",
          "/harness/scripts/lib/exui-runtime-network-guard.cjs",
          `${candidateRoot}/dist/rpx-exui/api/server.bundle.js`,
        ],
        {
          cwd: "/tmp",
          env: candidateEnvironment(config, output),
          stdio: ["ignore", log, log],
        },
      );
      const serverFinished = childExit(server);
      let execution;
      let resources;
      try {
        await waitForCandidate(server);
        writeJsonAtomic(`${dir}/runtime-identity.json`, {
          identity,
          candidatePid: server.pid,
          payloadDigest: observed.payloadDigest,
        });
        const env = {
          PATH: "/usr/local/bin:/usr/bin:/bin",
          HOME: "/tmp",
          EXUI_HARNESS_SELECTION: "candidate",
          EXUI_CANDIDATE_RUN_MANIFEST: `${dir}/manifest.json`,
          EXUI_CANDIDATE_URL: CANDIDATE_URL,
          EXUI_RUNTIME_IDENTITY: `${dir}/runtime-identity.json`,
          EXUI_CANDIDATE_ASSETS: `${candidateRoot}/dist/rpx-exui/browser`,
          EXUI_HARNESS_SLICE: scoped ? "scope" : "family",
          ...(scoped ? { EXUI_SCOPE_PERSONA: invocation.persona } : {}),
          EXUI_HARNESS_TEST_OUTPUT: `${dir}/test-output`,
          EXUI_EVIDENCE_CONTEXT: `${dir}/context.json`,
          EXUI_EVIDENCE_REPORT: `${dir}/report.json`,
          EXUI_PROVIDER_REQUESTS: `${dir}/provider-requests.jsonl`,
          EXUI_SESSION_COOKIE: sessionCookie,
          EXUI_CHROMIUM_EXECUTABLE: input.browserExecutable,
          ...(mutation ? { EXUI_HARNESS_MUTATION: mutation } : {}),
        };
        const testLog = fs.openSync(`${dir}/playwright.log`, "wx", 0o600);
        const started = Date.now();
        const testChild = spawn(
          process.execPath,
          [
            "/harness/node_modules/@playwright/test/cli.js",
            "test",
            "--config",
            "/harness/playwright.harness.config.ts",
          ],
          { cwd: root, env, stdio: ["ignore", testLog, testLog] },
        );
        const terminal = await childExit(testChild);
        fs.closeSync(testLog);
        if (server.exitCode !== null || server.signalCode !== null)
          throw new Error("CANDIDATE_EXITED_DURING_PROOF");
        const report = JSON.parse(
          fs.readFileSync(`${dir}/report.json`, "utf8"),
        );
        execution = {
          invocationId,
          runId: input.runId,
          identity,
          kind: invocation.kind,
          terminalState: terminal.signal ? "interrupted" : "completed",
          runnerExitCode: terminal.code,
          unexpectedGlobalErrors: report.globalErrors,
          resultArtifact: ref(output, `${dir}/report.json`),
        };
        resources = {
          elapsedMs: Date.now() - started,
          measured: {
            source: "container-cgroup-v2",
            peakMemoryBytes: Number(
              fs.readFileSync("/sys/fs/cgroup/memory.peak", "utf8").trim(),
            ),
            cpuUsageMicros: Number(
              /^usage_usec (\d+)$/m.exec(
                fs.readFileSync("/sys/fs/cgroup/cpu.stat", "utf8"),
              )[1],
            ),
            pidsAtCompletion: Number(
              fs.readFileSync("/sys/fs/cgroup/pids.current", "utf8").trim(),
            ),
          },
          isolation: "network-none",
          limits: { memoryBytes: 4294967296, cpus: 2, pids: 256 },
        };
      } finally {
        const requestedStop =
          server.exitCode === null &&
          server.signalCode === null &&
          server.kill("SIGTERM");
        const serverTerminal = await serverFinished;
        fs.closeSync(log);
        await new Promise((resolve) => providers.close(resolve));
        if (execution) assertCandidateShutdown(serverTerminal, requestedStop);
      }
      if (fs.existsSync(`${output}/network-rejections.jsonl`))
        throw new Error("UNDECLARED_NODE_DESTINATION");
      if (fs.existsSync(`${dir}/provider-rejections.jsonl`))
        throw new Error("UNDECLARED_PROVIDER_REQUEST");
      writeJsonAtomic(`${dir}/execution.json`, execution);
      writeJsonAtomic(`${dir}/resources.json`, resources);
      executions.push(ref(output, `${dir}/execution.json`));
    }
    const definition = policy.mutationDefinitions[0];
    writeJsonAtomic(`${output}/derivation.json`, {
      mutationDefinitionDigest: definition.definitionDigest,
      baselineIdentity: identities[0],
      mutantIdentity: identities.at(-1),
      transformation: scoped
        ? "remove-organisation-role-scope-guard"
        : "remove-supported-IA-family",
      ...(scoped
        ? {
            productionArtifact: input.mutantArtifact,
            transformationRecord: scopeDerivation,
          }
        : {}),
      target: scoped
        ? scopeDerivation.target
        : "NODE_CONFIG.waSupportedJurisdictions",
      ...(scoped
        ? {
            beforeDigest: scopeDerivation.beforeDigest,
            afterDigest: scopeDerivation.afterDigest,
          }
        : {
            before:
              effectiveCandidateConfiguration("/candidate").config
                .waSupportedJurisdictions,
            after: effectiveCandidateConfiguration(
              "/candidate",
              "wa-drop-family",
            ).config.waSupportedJurisdictions,
          }),
    });
    mutations.push({
      mutationId: definition.mutationId,
      baselineInvocationId: scoped ? "scope-ia" : "baseline",
      mutantInvocationId: scoped ? "wa-scope-broadened" : "wa-drop-family",
      derivationArtifact: ref(output, `${output}/derivation.json`),
    });
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
  const candidate = arg("--candidate");
  if (!candidate) throw new Error("CANDIDATE_ARTIFACT_REQUIRED");
  const releaseScopeId = arg("--scope") ?? "exui-wa-family-pilot";
  getReleasePolicy(releaseScopeId);
  const artifact = await verifyCandidateArtifact(path.resolve(candidate));
  const review = JSON.parse(
    fs.readFileSync(
      path.join(root, "scripts/fixtures/exui-configuration-review.json"),
      "utf8",
    ),
  );
  await assertCandidateConfigurationSources(artifact.candidateRoot, review);
  const mutantPath = arg("--mutant");
  if (releaseScopeId === "exui-wa-scope-pilot" && !mutantPath)
    throw new Error("SCOPE_MUTANT_ARTIFACT_REQUIRED");
  const mutantArtifact = mutantPath
    ? await verifyCandidateArtifact(path.resolve(mutantPath))
    : null;
  const output = path.resolve(
    arg("--output") ??
      `functional-output/tests/harness/private/candidate-${randomUUID()}`,
  );
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  if (fs.existsSync(`${output}/input.json`))
    throw new Error("FRESH_RUN_DIRECTORY_REQUIRED");
  writePublicSummary(`${output}/public/release-assurance-summary.json`, {
    status: "BLOCKED",
  });
  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  if (commit.status !== 0) throw new Error("HARNESS_COMMIT_REQUIRED");
  const browserRoot = fs.realpathSync(
    path.resolve(arg("--browser") ?? "functional-output/inputs/browser"),
  );
  const browsers = JSON.parse(
    fs.readFileSync(
      path.join(root, "node_modules/playwright-core/browsers.json"),
      "utf8",
    ),
  );
  const revision = browsers.browsers.find(
    (item) => item.name === "chromium-headless-shell",
  ).revision;
  const browserRelative = `chromium_headless_shell-${revision}/chrome-headless-shell-linux-arm64/chrome-headless-shell`;
  if (!fs.existsSync(path.join(browserRoot, browserRelative)))
    throw new Error("MATCHING_ARM64_BROWSER_REQUIRED");
  const browserDigest = await digestCandidateTree(browserRoot);
  const harnessDependencies = await verifyHarnessDependencies(
    path.join(root, "node_modules"),
    path.join(root, "package.json"),
    path.join(root, "yarn.lock"),
  );
  const harnessSources = HARNESS_SOURCE_FILES;
  const sourceStatus = spawnSync(
    "git",
    ["status", "--porcelain", "--", ...harnessSources],
    { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH } },
  );
  if (sourceStatus.status !== 0)
    throw new Error("HARNESS_SOURCE_STATE_REQUIRED");
  const harnessSourceState = sourceStatus.stdout ? "dirty-diagnostic" : "clean";
  const harnessSourceDigest = digestBytes(
    JSON.stringify(
      harnessSources.map((file) => [
        file,
        digestBytes(fs.readFileSync(path.join(root, file))),
      ]),
    ),
  );
  writeJsonAtomic(`${output}/input.json`, {
    artifact,
    releaseScopeId,
    mutantArtifact,
    harnessSourceState,
    harnessDependencies,
    harnessSourceDigest,
    harnessSources,
    harnessCommit: commit.stdout.trim(),
    runId: `candidate-${randomUUID()}`,
    browserExecutable: `/browser/${browserRelative}`,
    browserDigest,
    browserVersion: `playwright-1.64.1-chromium-${revision}-linux-arm64`,
  });
  const stagedHarness = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "exui-harness-sources-"),
  );
  fs.chmodSync(stagedHarness, 0o700);
  for (const file of harnessSources) {
    const destination = path.join(stagedHarness, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  fs.mkdirSync(path.join(stagedHarness, "node_modules"));
  const args = isolatedContainerArguments({
    harnessRoot: stagedHarness,
    dependenciesRoot: path.join(root, "node_modules"),
    candidateRoot: artifact.candidateRoot,
    output,
    browserRoot,
    ...(mutantArtifact ? { mutantRoot: mutantArtifact.candidateRoot } : {}),
    image: runtimeImage,
  });
  const child = spawn("docker", args, {
    env: { PATH: process.env.PATH },
    stdio: "inherit",
  });
  try {
    const terminal = await childExit(child);
    process.exitCode = terminal.code ?? 2;
  } finally {
    try {
      fs.rmSync(stagedHarness, { recursive: true, force: true });
    } catch (error) {
      if (!["EACCES", "EPERM"].includes(error.code)) throw error;
      writeJsonAtomic(`${output}/source-snapshot.json`, {
        retained: true,
        path: stagedHarness,
        digest: harnessSourceDigest,
      });
    }
  }
  console.log(`Candidate evidence: ${output}`);
}
try {
  if (process.argv.includes("--inside")) await inside();
  else await launch();
} catch (error) {
  console.error(`BLOCKED: ${error.message}`);
  process.exitCode = 2;
}
