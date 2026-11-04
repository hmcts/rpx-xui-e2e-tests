#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  verifyCandidateArtifact,
  digestCandidateTree,
} from "./lib/exui-candidate-artifact.mjs";
import { verifyHarnessDependencies } from "./lib/exui-harness-dependencies.mjs";
import { assertCandidateConfigurationSources } from "./lib/exui-configuration-catalogue.mjs";
import { digestBytes, writeJsonAtomic } from "./lib/exui-evidence-io.mjs";
import { createFreshHarnessOutput } from "./lib/exui-output-boundary.mjs";
import { runNativeHostPhase } from "./lib/exui-native-host.mjs";
import {
  ccdCredentials,
  ccdRequest,
  verifyCcdRuntimeIdentity,
} from "./lib/exui-ccd-runtime.mjs";
import { CCD_HARNESS_SOURCE_FILES } from "./lib/exui-ccd-browser-runtime.mjs";
import { EVENT_CAPABILITY_SCOPE } from "./lib/exui-ccd-event-capability.mjs";
import { browserExecutable } from "./lib/exui-oci-runtime.mjs";
import { nativeFailurePhase, reportNativeFailure } from "./lib/exui-native-failure.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (key) => {
  const index = process.argv.indexOf(key);
  return index < 0 ? undefined : process.argv[index + 1];
};
async function launch() {
  const releaseScopeId = arg("--scope") ?? "exui-ccd-pilot";
  if (!["exui-ccd-pilot", EVENT_CAPABILITY_SCOPE].includes(releaseScopeId))
    throw new Error("UNKNOWN_CCD_SCOPE");
  if (releaseScopeId === EVENT_CAPABILITY_SCOPE && arg("--only"))
    throw new Error("COMPLETE_EVENT_CAPABILITY_SCOPE_REQUIRED");
  if (
    arg("--only") &&
    ![
      "baseline",
      "ccd-stale-revoked-bearer",
      "ccd-drop-child",
      "ccd-broaden-access",
      "ccd-write-then-deny",
      "ccd-drop-postal-optional-child",
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
  if (releaseScopeId === EVENT_CAPABILITY_SCOPE && ccd.fixtureSelection !== "event-capability-baseline")
    throw new Error("EVENT_CAPABILITY_BASELINE_RUNTIME_REQUIRED");
  if (releaseScopeId === "exui-ccd-pilot" && ![undefined, "nested-prl"].includes(ccd.fixtureSelection))
    throw new Error("CCD_NESTED_RUNTIME_REQUIRED");
  if (
    !ccd.ready ||
    !ccd.definitionImported ||
    !/^[a-f0-9]{64}$/.test(ccd.namespace)
  )
    throw new Error("CCD_READY_IMPORT_REQUIRED");
  if ((ccd.platform ?? "linux/arm64") !== artifact.provenance.platform) throw new Error("CCD_CANDIDATE_PLATFORM_MISMATCH");
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
  const browserRoot = fs.realpathSync(path.resolve(arg("--browser")));
  const requestedOutput = path.resolve(
    arg("--output") ??
      `functional-output/tests/harness/private/ccd-${randomUUID()}`,
  );
  const output = createFreshHarnessOutput(requestedOutput, [
    artifact.candidateRoot,
    path.resolve(candidate),
    browserRoot,
    path.join(root, "node_modules"),
    path.dirname(path.resolve(statePath)),
  ]);
  const definitionFile = path.join(
    path.dirname(statePath),
    "definition-import.json",
  );
  const definition = JSON.parse(fs.readFileSync(definitionFile, "utf8"));
  const browserDigest = await digestCandidateTree(browserRoot);
  const browser = JSON.parse(
    fs.readFileSync(
      path.join(root, "node_modules/playwright-core/browsers.json"),
      "utf8",
    ),
  ).browsers.find((item) => item.name === "chromium-headless-shell");
  const credentials = Object.fromEntries(
    (releaseScopeId === EVENT_CAPABILITY_SCOPE
      ? ["allowed", "courtadmin", "judge", "observer", "readonly"]
      : ["allowed", "denied", "observer"]).map((name) => [
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
    browserRoot,
    releaseScopeId,
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
    browserExecutable: `/browser/${browserExecutable({ browsers: [browser] }, artifact.provenance.platform)}`,
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
  const verdict = await runNativeHostPhase(output, stagedHarness);
  if (verdict.failure) reportNativeFailure({ nativeFailure: verdict.failure });
  process.exitCode = verdict.exitCode;
  console.log(`Candidate evidence: ${output}`);
}
try {
  await launch();
} catch (error) {
  reportNativeFailure(error, { phase: nativeFailurePhase(arg('--scope') ?? 'exui-ccd-pilot'), category: 'preflight' });
  process.exitCode = 2;
}
