import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, "src/data/exui-central-assurance-source.json");
const evidencePath = path.join(repoRoot, "src/data/exui-release-assurance-evidence.json");
const defaultOutputPath = path.join(repoRoot, "functional-output/tests/harness/release-assurance-summary.json");
const outputPath = path.resolve(process.env.EXUI_RELEASE_SUMMARY_OUTPUT ?? defaultOutputPath);

const source = readJson(sourcePath);
const evidence = readJson(evidencePath);
const profiles = source.serviceDefinitionProfiles?.profiles ?? [];
const releaseBlockingFamilies = normalizeList(source.rpxXuiWebapp?.["config/default.json"]?.globalSearchServices ?? []);
const profiledFamilies = new Set(profiles.map((profile) => normalize(profile.serviceFamily)));
const failReasons = releaseBlockingFamilies
  .filter((family) => !profiledFamilies.has(family))
  .map((family) => `release-blocking family without source profile: ${family}`);
const mutationEvidence = evidence.mutationEvidence ?? { status: "pending", requiredCommands: [] };
const warnReasons = [
  ...((Array.isArray(evidence.releaseGate?.warnReasons) ? evidence.releaseGate.warnReasons : [])),
  ...(mutationEvidence.status === "pending"
    ? [`mutation evidence pending: ${(mutationEvidence.requiredCommands ?? []).join(", ")}`]
    : [])
];
const overallStatus = failReasons.length > 0 ? "fail" : warnReasons.length > 0 ? "warn" : "pass";
const ownerSliceCatalogue = profiles
  .map((profile) => ({
    serviceFamily: normalize(profile.serviceFamily),
    label: profile.serviceFamily,
    disposition: profile.priority,
    lanes: profile.lanes ?? [],
    proofLevel: profile.proofLevel,
    representativeCaseTypes: profile.representativeCaseTypes ?? [],
    serviceCodes: profile.serviceCodes ?? [],
    sourceRepositories: (profile.repos ?? []).map((repo) => repo.fullName),
    ownerAction: profile.nextAction,
    rationale: profile.rationale
  }))
  .sort((left, right) => left.serviceFamily.localeCompare(right.serviceFamily));

const summary = {
  overallStatus,
  failReasons,
  warnReasons,
  releaseBlockingCoverage: releaseBlockingFamilies.filter((family) => !failReasons.some((reason) => reason.endsWith(family))),
  mutationEvidence,
  evidenceSummary: `${overallStatus}: ${releaseBlockingFamilies.length} release-blocking families, ${failReasons.length} fail reason(s), ${warnReasons.length} warning(s), mutation evidence ${mutationEvidence.status}`,
  ownerSliceCatalogue
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  `[harness-release-summary] wrote ${path.relative(repoRoot, outputPath)} status=${overallStatus} fail=${failReasons.length} warn=${warnReasons.length}`
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalize(value) {
  return String(value).trim().toUpperCase();
}

function normalizeList(values) {
  return [...new Set(values.map(normalize).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
