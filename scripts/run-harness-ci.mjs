#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { writeConfigurationCoverage } from "./lib/exui-configuration-runtime-coverage.mjs";
import { effectiveCandidateConfiguration } from "./lib/exui-candidate-runtime.mjs";
import { verifyCandidateArtifact } from "./lib/exui-candidate-artifact.mjs";
import { deriveScopeMutant } from "./prepare-harness-scope-mutant.mjs";
import {
  startCcdRuntime,
  importCcdDefinition,
  verifyCcdRuntimeIdentity,
  ccdRequest,
} from "./lib/exui-ccd-runtime.mjs";
import { digestBytes, writeJsonAtomic } from "./lib/exui-evidence-io.mjs";
import {
  validateCiJob,
  createCiOutput,
  prepareCiJob,
  writeCiPublicSummary,
} from "./lib/exui-candidate-ci-inputs.mjs";
import {
  validateCiPhase,
  captureCiPhaseExpectation,
  captureCiOwnership,
} from "./lib/exui-candidate-ci-evidence.mjs";
import {
  executeCiProcess,
  cleanupCiPhase,
  cleanupCiCcd,
  installCiCancellation,
} from "./lib/exui-candidate-ci-process.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const blocked = () => ({ status: "BLOCKED", exitCode: 2 });
const scopes = {
  family: "exui-wa-family-pilot",
  scope: "exui-wa-scope-pilot",
  ccd: "exui-ccd-pilot",
};
export async function runFixedCiPilots(operations) {
  const results = [];
  const checkCancellation = () =>
    assert(!operations.isCancelled?.(), "CI_JOB_CANCELLED");
  const phase = async (name) => {
    checkCancellation();
    const result = await operations.phase(name);
    checkCancellation();
    results.push({ phase: name, ...result });
    return result;
  };
  let result = await phase("family");
  if (result.exitCode !== 0) return { ...result, results };
  checkCancellation();
  await operations.derive();
  checkCancellation();
  result = await phase("scope");
  if (result.exitCode !== 0) return { ...result, results };
  try {
    checkCancellation();
    await operations.start();
    checkCancellation();
    result = await phase("ccd");
    return { ...result, results };
  } finally {
    await operations.stop();
  }
}

export async function runHarnessCi(jobPath) {
  const job = validateCiJob(read(jobPath));
  const envelope = read(job.candidateManifest);
  assert(
    typeof envelope.candidateRoot === "string" &&
      path.isAbsolute(envelope.candidateRoot),
    "CI_ARTIFACT_ROOT_REQUIRED",
  );
  job.output = createCiOutput(job.output, [
    envelope.candidateRoot,
    job.candidateManifest,
    job.browserCache,
    path.join(ROOT, "node_modules"),
  ]);
  const resources = new Map(),
    phaseResults = [];
  let context,
    verdict = blocked(),
    cleanupComplete = true,
    cancelled = false;
  const privateRoot = path.join(job.output, "private");
  const remove = async (_id, resource) => {
    if (resource.kind === "ccd") cleanupCiCcd(resource.directory);
    else await cleanupCiPhase(resource, context);
    resources.delete(_id);
  };
  const uninstall = installCiCancellation({
    resources,
    remove,
    output: job.output,
    phaseResults,
    onCancel: () => {
      cancelled = true;
    },
  });
  try {
    context = await prepareCiJob(job, job.output);
    assert(!cancelled, "CI_JOB_CANCELLED");
    writeConfigurationCoverage({
      harnessRoot: ROOT,
      output: path.join(privateRoot, "configuration"),
    });
    writeJsonAtomic(path.join(privateRoot, "job-input.json"), job);
    const operations = {
      isCancelled: () => cancelled,
      phase: async (name) => {
        assert(!cancelled, "CI_JOB_CANCELLED");
        const directory = path.join(privateRoot, name),
          resource = { kind: "phase", name, directory, child: null };
        resources.set(name, resource);
        const args = [
          "--candidate",
          job.candidateManifest,
          "--browser",
          context.browserRoot,
          "--output",
          directory,
        ];
        if (name === "ccd")
          args.push(
            "--ccd-state",
            path.join(privateRoot, "ccd-runtime/runtime.json"),
          );
        else args.push("--scope", scopes[name]);
        if (name === "scope")
          args.push(
            "--mutant",
            path.join(privateRoot, "scope-mutant/candidate-artifact.json"),
          );
        try {
          const result = await executeCiProcess({
            script: path.join(
              ROOT,
              name === "ccd"
                ? "scripts/run-harness-ccd-candidate.mjs"
                : "scripts/run-harness-candidate.mjs",
            ),
            args,
            output: directory,
            onChild: (child) => {
              resource.child = child;
            },
            onPrepared: (input, handoff) => {
              assert.equal(
                handoff.mode,
                "native-separate-api",
                "CI_NATIVE_AUTHORITY_HANDOFF_REQUIRED",
              );
              const expected = captureCiPhaseExpectation(
                name,
                input,
                handoff,
                context,
                directory,
              );
              resource.expectedContainer = captureCiOwnership(
                input,
                handoff,
                context,
                directory,
                name,
              );
              return expected;
            },
          });
          assert(!cancelled, "CI_JOB_CANCELLED");
          const validated = validateCiPhase(
            directory,
            result.expected,
            result.terminal,
          );
          if (name === "ccd")
            writeConfigurationCoverage({
              harnessRoot: ROOT,
              output: path.join(privateRoot, "configuration"),
              phaseDirectory: directory,
              expected: {
                ...result.expected,
                receiptArtifactDigest: validated.receiptArtifactDigest,
              },
              terminal: result.terminal,
            });
          phaseResults.push({ phase: name, ...validated });
          return validated;
        } finally {
          await remove(name, resource);
        }
      },
      derive: async () => {
        await deriveScopeMutant(
          job.candidateManifest,
          path.join(privateRoot, "scope-mutant"),
        );
        context.mutantArtifact = await verifyCandidateArtifact(
          path.join(privateRoot, "scope-mutant/candidate-artifact.json"),
        );
      },
      start: async () => {
        const directory = path.join(privateRoot, "ccd-runtime");
        resources.set("ccd-runtime", { kind: "ccd", directory });
        context.ccd = await startCcdRuntime(directory);
        importCcdDefinition(context.ccd);
        const observed = verifyCcdRuntimeIdentity(context.ccd),
          config = effectiveCandidateConfiguration(
            context.artifact.candidateRoot,
          ).config;
        config.now = false;
        const apiContracts = Object.fromEntries(
          [
            ["data", 4452],
            ["definition", 4451],
          ].map(([service, port]) => {
            const response = ccdRequest(context.ccd, port, "/v3/api-docs");
            assert.equal(response.status, 200, "CI_CCD_API_REQUIRED");
            return [service, digestBytes(JSON.stringify(response.body))];
          }),
        );
        context.ccdIdentity = {
          ...context.artifact.identity,
          configurationDigest: digestBytes(
            JSON.stringify({
              config,
              gatewayDigest: digestBytes(
                fs.readFileSync(
                  path.join(ROOT, "scripts/lib/exui-ccd-browser-runtime.mjs"),
                ),
              ),
              mutation: null,
            }),
          ),
          definitionDigests: { HarnessNestedPRL: observed.fixtureDigest },
          dependencyIdentities: Object.fromEntries(
            ["data", "definition"].map((service) => [
              service === "data" ? "ccd" : "ccd-definition",
              {
                artifactDigest: context.ccd.images[service].id,
                apiContractDigest: apiContracts[service],
              },
            ]),
          ),
        };
      },
      stop: () => {
        const resource = resources.get("ccd-runtime");
        if (resource) return remove("ccd-runtime", resource);
      },
    };
    const result = await runFixedCiPilots(operations);
    verdict = { status: result.status, exitCode: result.exitCode };
  } catch (error) {
    writeJsonAtomic(path.join(privateRoot, "orchestration-error.json"), {
      message:
        error instanceof Error ? error.message : "CI_ORCHESTRATION_FAILED",
    });
    verdict = blocked();
  } finally {
    for (const [id, resource] of [...resources].reverse())
      try {
        await remove(id, resource);
      } catch {
        cleanupComplete = false;
        verdict = blocked();
      }
    uninstall();
    if (cancelled) verdict = blocked();
    writeJsonAtomic(path.join(privateRoot, "ci-result.json"), {
      classification: "fixed-pilot-suite-no-full-release-approval",
      jobRunId: `ci-${randomUUID()}`,
      status: verdict.status,
      exitCode: verdict.exitCode,
      cleanupComplete,
      phaseResults,
    });
    writeCiPublicSummary(
      job.output,
      verdict,
      phaseResults.length === 3 &&
        phaseResults.every((result) => result.status === "PASS"),
    );
  }
  return verdict;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let verdict = blocked();
  try {
    assert(
      process.argv.length === 4 && process.argv[2] === "--input",
      "CI_INPUT_FILE_REQUIRED",
    );
    verdict = await runHarnessCi(path.resolve(process.argv[3]));
  } catch {
    /* Job diagnostics remain private. */
  }
  console.log(
    `[harness-candidate-ci] ${verdict.status}; full EXUI release approval unavailable`,
  );
  process.exitCode = verdict.exitCode;
}
