import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyCandidateArtifact,
  describeCandidateArtifact,
  copyCandidateArtifact,
  assertCandidateDerivationTarget,
  assertFreshCandidateDerivationOutput,
} from "./lib/exui-candidate-artifact.mjs";
import {
  transformHearingPublication,
  verifyHearingPublicationMutant,
} from "./lib/exui-hearing-publication-mutation.mjs";
import { writeJsonAtomic } from "./lib/exui-evidence-io.mjs";
export async function deriveHearingPublicationMutant(baselinePath, output) {
  const manifest = path.resolve(baselinePath),
    beforeManifest = await fs.readFile(manifest),
    baseline = await verifyCandidateArtifact(manifest),
    destination = await assertFreshCandidateDerivationOutput({
      baseline,
      manifestPath: manifest,
      output,
    });
  const target = "dist/rpx-exui/api/server.bundle.js";
  await assertCandidateDerivationTarget(
    path.join(baseline.candidateRoot, target),
  );
  const transformed = transformHearingPublication(
    await fs.readFile(path.join(baseline.candidateRoot, target)),
  );
  await fs.mkdir(destination, { mode: 0o700 });
  const candidateRoot = path.join(destination, "artifact");
  await copyCandidateArtifact(baseline.candidateRoot, candidateRoot);
  await assertCandidateDerivationTarget(path.join(candidateRoot, target));
  await fs.writeFile(path.join(candidateRoot, target), transformed.bytes);
  const mutant = await describeCandidateArtifact(
      candidateRoot,
      baseline.provenance,
    ),
    derivation = await verifyHearingPublicationMutant(baseline, mutant);
  assert.deepEqual(
    await verifyCandidateArtifact(manifest),
    baseline,
    "HEARING_BASE_CHANGED",
  );
  assert(
    (await fs.readFile(manifest)).equals(beforeManifest),
    "HEARING_BASE_MANIFEST_CHANGED",
  );
  writeJsonAtomic(path.join(destination, "candidate-artifact.json"), mutant);
  writeJsonAtomic(path.join(destination, "derivation.json"), derivation);
  return { mutant, derivation };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 4)
      throw Error("BASELINE_MANIFEST_AND_FRESH_OUTPUT_REQUIRED");
    await deriveHearingPublicationMutant(process.argv[2], process.argv[3]);
    console.log("Sealed derived Hearing test artifact created");
  } catch {
    console.error("[harness-hearing-mutant] BLOCKED");
    process.exitCode = 2;
  }
}
