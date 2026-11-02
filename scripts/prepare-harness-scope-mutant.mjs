import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyCandidateArtifact,
  describeCandidateArtifact,
  digestCandidateTree,
} from "./lib/exui-candidate-artifact.mjs";
import { writeJsonAtomic, digestBytes } from "./lib/exui-evidence-io.mjs";
import { getReleasePolicy } from "./lib/exui-release-policy.mjs";

const guard =
  /\.filter\(([a-zA-Z_$][\w$]*)=>\1\.roleType&&\1\.roleType==="ORGANISATION"\)\.map\(\1=>\1\.jurisdiction\)/g;
export function transformOrganisationGuard(source) {
  const matches = [...source.matchAll(guard)];
  if (matches.length !== 1)
    throw new Error("EXPECTED_ONE_ORGANISATION_SCOPE_GUARD");
  const [match, variable] = matches[0];
  return source.replace(
    match,
    `.filter(${variable}=>${variable}.roleType).map(${variable}=>${variable}.jurisdiction)`,
  );
}
async function transformationTarget(candidateRoot) {
  const assets = "dist/rpx-exui/browser";
  const targets = [];
  for (const name of await fs.readdir(path.join(candidateRoot, assets))) {
    if (!name.endsWith(".js")) continue;
    const source = await fs.readFile(
      path.join(candidateRoot, assets, name),
      "utf8",
    );
    const matches = [...source.matchAll(guard)];
    if (matches.length) {
      transformOrganisationGuard(source);
      targets.push({ target: `${assets}/${name}`, source });
    }
  }
  if (targets.length !== 1)
    throw new Error("EXPECTED_ONE_SHIPPED_ORGANISATION_SCOPE_GUARD");
  return targets[0];
}
export async function verifyScopeMutant(baseline, mutant) {
  const { target, source } = await transformationTarget(baseline.candidateRoot);
  const changed = await fs.readFile(
    path.join(mutant.candidateRoot, target),
    "utf8",
  );
  if (changed !== transformOrganisationGuard(source))
    throw new Error("SCOPE_TRANSFORMATION_MISMATCH");
  const normalized = await digestCandidateTree(
    mutant.candidateRoot,
    new Map([[target, Buffer.from(source)]]),
  );
  if (normalized !== baseline.payloadDigest)
    throw new Error("UNRELATED_SCOPE_MUTANT_PAYLOAD_CHANGE");
  return {
    mutationDefinitionDigest: getReleasePolicy("exui-wa-scope-pilot")
      .mutationDefinitions[0].definitionDigest,
    transformation: "remove-organisation-role-scope-guard",
    target,
    beforeDigest: digestBytes(source),
    afterDigest: digestBytes(changed),
    baselineArtifactDigest: baseline.identity.artifactDigest,
    mutantArtifactDigest: mutant.identity.artifactDigest,
  };
}
export async function deriveScopeMutant(baselinePath, output) {
  const baseline = await verifyCandidateArtifact(path.resolve(baselinePath));
  const candidateRoot = path.join(path.resolve(output), "artifact");
  await fs.mkdir(path.resolve(output), { recursive: true });
  try {
    await fs.lstat(candidateRoot);
    throw new Error("FRESH_MUTANT_DIRECTORY_REQUIRED");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const { target, source } = await transformationTarget(baseline.candidateRoot);
  await fs.cp(baseline.candidateRoot, candidateRoot, {
    recursive: true,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
  });
  await fs.writeFile(
    path.join(candidateRoot, target),
    transformOrganisationGuard(source),
  );
  const mutant = await describeCandidateArtifact(
    candidateRoot,
    baseline.provenance,
  );
  const derivation = await verifyScopeMutant(baseline, mutant);
  writeJsonAtomic(path.join(output, "candidate-artifact.json"), mutant);
  writeJsonAtomic(path.join(output, "derivation.json"), derivation);
  return { mutant, derivation };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!process.argv[2] || !process.argv[3])
      throw new Error("BASELINE_MANIFEST_AND_FRESH_OUTPUT_REQUIRED");
    await deriveScopeMutant(process.argv[2], process.argv[3]);
    console.log("Sealed production-facing scope mutant created");
  } catch (error) {
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 2;
  }
}
