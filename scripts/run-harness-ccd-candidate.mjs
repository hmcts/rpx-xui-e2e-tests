#!/usr/bin/env node
import {CALLBACK_SCOPE} from './lib/exui-recipient-callback-contract.mjs';
import {verifyNativeCallbackRuntime} from './lib/exui-recipient-callback-native-import.mjs';
import { classifyNativeFailure, nativeFailurePrefix } from "./lib/exui-native-failure-diagnostics.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
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
import { buildWorkbasketInputDefinition } from "./lib/exui-workbasket-input-definition.mjs";
import { validateWorkbasketInputDescriptor } from "./lib/exui-workbasket-input-import.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (key) => {
  const index = process.argv.indexOf(key);
  return index < 0 ? undefined : process.argv[index + 1];
};
async function launch() {
  const releaseScopeId = arg("--scope") ?? "exui-ccd-pilot";
  if (!["exui-ccd-pilot", EVENT_CAPABILITY_SCOPE, CALLBACK_SCOPE].includes(releaseScopeId))
    throw new Error("UNKNOWN_CCD_SCOPE");
  if (releaseScopeId === CALLBACK_SCOPE && arg("--only")) throw new Error("COMPLETE_CALLBACK_SCOPE_REQUIRED");
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
      "ccd-drop-workbasket-field",
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
    (releaseScopeId !== CALLBACK_SCOPE && !ccd.definitionImported) ||
    !/^[a-f0-9]{64}$/.test(ccd.namespace)
  )
    throw new Error("CCD_READY_IMPORT_REQUIRED");
  if ((ccd.platform ?? "linux/arm64") !== artifact.provenance.platform) throw new Error("CCD_CANDIDATE_PLATFORM_MISMATCH");
  if (releaseScopeId === CALLBACK_SCOPE) verifyNativeCallbackRuntime(ccd,"baseline");
  else verifyCcdRuntimeIdentity(ccd);
  const workbasketReceiptFile = path.join(path.dirname(statePath), "workbasket-input-import/receipt.json");
  const workbasket = releaseScopeId === "exui-ccd-pilot";
  let workbasketDefinitionDigest;
  let workbasketImportDigest;
  if (workbasket) {
    assert(fs.existsSync(workbasketReceiptFile), "CCD_WORKBASKET_IMPORT_REQUIRED");
    const receipt = JSON.parse(fs.readFileSync(workbasketReceiptFile, "utf8"));
    const definition = buildWorkbasketInputDefinition();
    assert.equal(receipt.status, "import-and-inputs-observed", "CCD_WORKBASKET_IMPORT_REQUIRED");
    assert.deepEqual(receipt.bindings, definition.workbasketInputBindings, "CCD_WORKBASKET_BINDINGS_REQUIRED");
    assert.equal(receipt.binding.source.sourceDigest, definition.workbasketInputSource.sourceDigest, "CCD_WORKBASKET_SOURCE_REQUIRED");
    workbasketDefinitionDigest = receipt.binding.workbookDigest;
    workbasketImportDigest = digestBytes(fs.readFileSync(workbasketReceiptFile));
    const actor = ccdCredentials(ccd, "observer");
    const observed = ccdRequest(ccd, 4452, "/internal/case-types/HarnessResultsPRL/work-basket-inputs", {
      headers: { ...actor.headers, experimental: "true",
        accept: "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-workbasket-input-details.v2+json;charset=UTF-8" },
    });
    assert.equal(observed.status, 200, "CCD_WORKBASKET_READ_REQUIRED");
    validateWorkbasketInputDescriptor(observed.body, definition);
    assert.deepEqual(observed.body, receipt.observations.inputs.body, "CCD_WORKBASKET_READ_DRIFT");
  }
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
    releaseScopeId === CALLBACK_SCOPE ? "recipient-callback-native-import.json" : "definition-import.json",
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
    ([EVENT_CAPABILITY_SCOPE,CALLBACK_SCOPE].includes(releaseScopeId)
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
    workbasket,
    workbasketDefinitionDigest,
    workbasketImportDigest,
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
