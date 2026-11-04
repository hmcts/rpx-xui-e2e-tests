#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { digestBytes } from "./lib/exui-evidence-io.mjs";
import { assertFreshCandidateDerivationOutput } from "./lib/exui-candidate-artifact.mjs";
import {
  buildEventCapabilityFixtures,
  validateEventCapabilityPair,
  deriveCourtadminReadFault,
  validateCourtadminReadPair,
  COURTADMIN_READ_MUTATION,
  EVENT_CAPABILITY_SCOPE,
  EVENT_CAPABILITY_MUTATION,
  EVENT_CAPABILITY_PROOFS,
  EVENT_CAPABILITY_SOURCE_DIGEST,
} from "./lib/exui-ccd-event-capability.mjs";

const fixtureRoot = fileURLToPath(new URL("./fixtures/ccd/", import.meta.url));
export async function prepareEventCapabilityFixtures(output) {
  const sourcePath = path.join(fixtureRoot, "event-capability.source.json");
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const pair = buildEventCapabilityFixtures(source);
  pair["read-mutant"] = deriveCourtadminReadFault(pair.baseline, source);
  const readTransformation = validateCourtadminReadPair(pair.baseline, pair["read-mutant"], source);
  const transformation = validateEventCapabilityPair(
    pair.baseline,
    pair.mutant,
    source,
  );
  const destination = await assertFreshCandidateDerivationOutput({
    baseline: { candidateRoot: fixtureRoot },
    manifestPath: sourcePath,
    output,
  });
  fs.mkdirSync(destination, { mode: 0o700 });
  fs.chmodSync(destination, 0o700);
  const binding = {
    schemaVersion: 1,
    scope: EVENT_CAPABILITY_SCOPE,
    mutationId: EVENT_CAPABILITY_MUTATION,
    readMutationId: COURTADMIN_READ_MUTATION,
    readTransformation,
    proofs: EVENT_CAPABILITY_PROOFS,
    sourceRevision: source.revision,
    sourceProjectionDigest: EVENT_CAPABILITY_SOURCE_DIGEST,
    transformation,
    releaseCredit: false,
  };
  for (const name of ["baseline", "mutant", "read-mutant"]) {
    const file = path.join(destination, name + ".json");
    fs.writeFileSync(file, JSON.stringify(pair[name], null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    const workbook = path.join(destination, name + ".xlsx");
    const result = spawnSync(
      "python3",
      [path.join(fixtureRoot, "workbook.py"), file, workbook],
      { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    if (result.error || result.status !== 0)
      throw new Error("EVENT_CAPABILITY_WORKBOOK_FAILED");
    fs.chmodSync(workbook, 0o600);
    binding[name] = {
      sourceDigest: digestBytes(fs.readFileSync(file)),
      workbookDigest: digestBytes(fs.readFileSync(workbook)),
    };
  }
  fs.writeFileSync(
    path.join(destination, "binding.json"),
    JSON.stringify(binding, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  return binding;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (
      args.length !== 2 ||
      args[0] !== "--output" ||
      !path.isAbsolute(args[1])
    )
      throw new Error("EVENT_CAPABILITY_OUTPUT_REQUIRED");
    await prepareEventCapabilityFixtures(args[1]);
    console.log(
      "[harness-event-fixture] Prepared source-bound fixtures; runtime acceptance not established.",
    );
  } catch {
    console.error(
      "[harness-event-fixture] BLOCKED: fixture preparation rejected.",
    );
    process.exitCode = 2;
  }
}
