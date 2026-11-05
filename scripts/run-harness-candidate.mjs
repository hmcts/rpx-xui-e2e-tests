#!/usr/bin/env node
import { classifyNativeFailure, nativeFailurePrefix } from "./lib/exui-native-failure-diagnostics.mjs";
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
import { HARNESS_SOURCE_FILES } from "./lib/exui-candidate-runtime.mjs";
import { getReleasePolicy } from "./lib/exui-release-policy.mjs";
import {
  ROUTING_SCOPE,
  assertRoutingInterpreter,
} from "./lib/exui-routing-contract.mjs";
import { verifyHearingPublicationMutant } from "./lib/exui-hearing-publication-mutation.mjs";
import { browserExecutable } from "./lib/exui-oci-runtime.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (key) => {
  const index = process.argv.indexOf(key);
  return index < 0 ? undefined : process.argv[index + 1];
};
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
  const routingInterpreter =
    releaseScopeId === ROUTING_SCOPE
      ? assertRoutingInterpreter(artifact, review, artifact.identity)
      : null;
  const mutantPath = arg("--mutant");
  if (releaseScopeId === "exui-wa-scope-pilot" && !mutantPath)
    throw new Error("SCOPE_MUTANT_ARTIFACT_REQUIRED");
  if (releaseScopeId === "exui-hearing-publication-pilot" && !mutantPath)
    throw new Error("HEARING_MUTANT_ARTIFACT_REQUIRED");
  const mutantArtifact = mutantPath
    ? await verifyCandidateArtifact(path.resolve(mutantPath))
    : null;
  if (releaseScopeId === "exui-hearing-publication-pilot")
    await verifyHearingPublicationMutant(artifact, mutantArtifact);
  const browserRoot = fs.realpathSync(
    path.resolve(arg("--browser") ?? "functional-output/inputs/browser"),
  );
  const requestedOutput = path.resolve(
    arg("--output") ??
      `functional-output/tests/harness/private/candidate-${randomUUID()}`,
  );
  const output = createFreshHarnessOutput(requestedOutput, [
    artifact.candidateRoot,
    path.resolve(candidate),
    browserRoot,
    path.join(root, "node_modules"),
    ...(mutantArtifact ? [mutantArtifact.candidateRoot] : []),
  ]);
  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  if (commit.status !== 0) throw new Error("HARNESS_COMMIT_REQUIRED");
  const browsers = JSON.parse(
    fs.readFileSync(
      path.join(root, "node_modules/playwright-core/browsers.json"),
      "utf8",
    ),
  );
  const revision = browsers.browsers.find(
    (item) => item.name === "chromium-headless-shell",
  ).revision;
  const browserRelative = browserExecutable(browsers, artifact.provenance.platform);
  if (!fs.existsSync(path.join(browserRoot, browserRelative)))
    throw new Error("MATCHING_CANDIDATE_BROWSER_REQUIRED");
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
  const runId = `candidate-${randomUUID()}`;
  writeJsonAtomic(`${output}/input.json`, {
    artifact,
    browserRoot,
    releaseScopeId,
    ...(routingInterpreter ? { routingInterpreter } : {}),
    mutantArtifact,
    harnessSourceState,
    harnessDependencies,
    harnessSourceDigest,
    harnessSources,
    harnessCommit: commit.stdout.trim(),
    runId,
    browserExecutable: `/browser/${browserRelative}`,
    browserDigest,
    browserVersion: `playwright-1.64.1-chromium-${revision}-${artifact.provenance.platform.replace("/", "-")}`,
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
  const verdict = await runNativeHostPhase(output, stagedHarness);
  process.exitCode = verdict.exitCode;
  console.log(`Candidate evidence: ${output}`);
}
try {
  await launch();
} catch (error) {
  console.error(nativeFailurePrefix + JSON.stringify(classifyNativeFailure(error)));
  console.error(`BLOCKED: ${error.message}`);
  process.exitCode = 2;
}
