import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { validateGeneratedDefinitionSnapshot } from "./lib/exui-definition-discovery.mjs";

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, "src/data/exui-central-assurance-source.json");
const evidencePath = path.join(repoRoot, "src/data/exui-release-assurance-evidence.json");
const xuiWebappRoot = path.resolve(process.env.RPX_XUI_WEBAPP_DIR ?? path.join(repoRoot, "../rpx-xui-webapp"));
const prlDefinitionsRoot = path.resolve(
  process.env.PRL_CCD_DEFINITIONS_DIR ?? path.join(repoRoot, "../prl-ccd-definitions")
);

const source = readJson(sourcePath);
const expectedDefault = source.rpxXuiWebapp["config/default.json"];
const expectedEnv = source.rpxXuiWebapp["config/custom-environment-variables.json"];
const expectedDefinitionProfiles = source.serviceDefinitionProfiles?.profiles ?? [];

const failures = [];
const assuranceGaps = [];
const releaseEvidence = readJson(evidencePath);
const mutationEvidence = releaseEvidence.mutationEvidence ?? {};
const mutationCommands = Array.isArray(mutationEvidence.requiredCommands) ? mutationEvidence.requiredCommands : [];
const mutationStatus = ["pending", "passed"].includes(mutationEvidence.status) ? mutationEvidence.status : "pending";

if (!["pending", "passed"].includes(mutationEvidence.status)) {
  failures.push(`release assurance mutation evidence has unsupported status: ${JSON.stringify(mutationEvidence.status)}`);
}

if (mutationCommands.length === 0) {
  failures.push("release assurance mutation evidence has no required commands.");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findJsonFiles(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return findJsonFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
  });
}

function normalize(value) {
  return String(value).trim().toUpperCase();
}

function splitCsv(value, options = { normalizeCase: true }) {
  return String(value ?? "")
    .split(",")
    .map((entry) => (options.normalizeCase ? normalize(entry) : String(entry).trim()))
    .filter(Boolean);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameOrdered(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sameSet(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function checkOrdered(label, actual, expected) {
  if (!sameOrdered(actual, expected)) {
    failures.push(`${label} drifted.\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
  }
}

function checkSet(label, actual, expected) {
  if (!sameSet(actual, expected)) {
    failures.push(`${label} drifted.\n  actual:   ${JSON.stringify(sorted(actual))}\n  expected: ${JSON.stringify(sorted(expected))}`);
  }
}

function checkValue(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} drifted.\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
  }
}

function configuredFamiliesFromSource() {
  return [
    ...expectedDefault.jurisdictions,
    ...expectedDefault.globalSearchServices,
    ...expectedDefault.waSupportedJurisdictions,
    ...expectedDefault.staffSupportedJurisdictions,
    ...expectedDefault.hearings.hearingsJurisdictions
  ].map(normalize);
}

function normalizeMapping(mapping) {
  return Object.fromEntries(
    mapping.map(({ service, serviceCodes }) => [normalize(service), sorted(serviceCodes.map(normalize))])
  );
}

function readXuiConfig() {
  const defaultConfig = readJson(path.join(xuiWebappRoot, "config/default.json"));
  const envConfig = readJson(path.join(xuiWebappRoot, "config/custom-environment-variables.json"));
  return { defaultConfig, envConfig };
}

function checkXuiDefaultConfig(defaultConfig) {
  checkOrdered(
    "rpx-xui-webapp config/default.json globalSearchServices",
    splitCsv(defaultConfig.globalSearchServices),
    expectedDefault.globalSearchServices
  );
  checkOrdered(
    "rpx-xui-webapp config/default.json waSupportedJurisdictions",
    splitCsv(defaultConfig.waSupportedJurisdictions),
    expectedDefault.waSupportedJurisdictions
  );
  checkOrdered(
    "rpx-xui-webapp config/default.json staffSupportedJurisdictions",
    splitCsv(defaultConfig.staffSupportedJurisdictions),
    expectedDefault.staffSupportedJurisdictions
  );
  checkOrdered(
    "rpx-xui-webapp config/default.json jurisdictions",
    splitCsv(defaultConfig.jurisdictions),
    expectedDefault.jurisdictions
  );
  checkOrdered(
    "rpx-xui-webapp config/default.json services.hearings.hearingsJurisdictions",
    splitCsv(defaultConfig.services?.hearings?.hearingsJurisdictions),
    expectedDefault.hearings.hearingsJurisdictions
  );

  for (const [jurisdiction, expectedCaseTypes] of Object.entries(expectedDefault.hearings.caseTypesByJurisdiction)) {
    const configKey = jurisdiction.toLowerCase();
    checkOrdered(
      `rpx-xui-webapp services.hearings.${configKey}.caseTypes`,
      splitCsv(defaultConfig.services?.hearings?.[configKey]?.caseTypes, { normalizeCase: false }),
      expectedCaseTypes
    );
  }

  checkValue(
    "rpx-xui-webapp serviceRefDataMapping",
    JSON.stringify(normalizeMapping(defaultConfig.serviceRefDataMapping)),
    JSON.stringify(normalizeMapping(expectedDefault.serviceRefDataMapping))
  );
}

function checkXuiEnvConfig(envConfig) {
  checkValue("custom env GLOBAL_SEARCH_SERVICES", envConfig.globalSearchServices, expectedEnv.globalSearchServices);
  checkValue("custom env WA_SUPPORTED_JURISDICTIONS", envConfig.waSupportedJurisdictions, expectedEnv.waSupportedJurisdictions);
  checkValue(
    "custom env STAFF_SUPPORTED_JURISDICTIONS",
    envConfig.staffSupportedJurisdictions,
    expectedEnv.staffSupportedJurisdictions
  );
  checkValue("custom env JURISDICTIONS", envConfig.jurisdictions, expectedEnv.jurisdictions);
  checkValue("custom env SERVICE_REF_DATA_MAPPING", envConfig.serviceRefDataMapping?.__name, expectedEnv.serviceRefDataMapping);
  checkValue(
    "custom env HEARINGS_JURISDICTIONS",
    envConfig.services?.hearings?.hearingsJurisdictions,
    expectedEnv.hearingsJurisdictions
  );
}

function checkPrlDefinitions() {
  if (!fs.existsSync(prlDefinitionsRoot)) {
    const message = `PRL CCD definitions not present at ${prlDefinitionsRoot}; source evidence unavailable.`;
    if (process.env.HARNESS_MANIFEST_EXTERNAL_SOURCE_MODE === "strict") failures.push(message);
    else console.log(`[harness-manifest] ${message}`);
    return false;
  }

  const expectedPrl = source.prlCcdDefinitions.representativeCaseType;
  const caseTypes = readJson(path.join(prlDefinitionsRoot, "definitions/private-law/json/CaseType.json"));
  const hasRepresentativeCaseType = caseTypes.some(
    (caseType) => caseType.ID === expectedPrl.caseType && caseType.JurisdictionID === expectedPrl.jurisdiction
  );
  if (!hasRepresentativeCaseType) {
    failures.push(
      `PRL CCD representative case type missing: ${expectedPrl.jurisdiction}/${expectedPrl.caseType}`
    );
  }

  const roleAssignmentPath = path.join(prlDefinitionsRoot, "config/preview-am-role-assignments.json");
  if (fs.existsSync(roleAssignmentPath)) {
    const roleAssignmentUsers = readJson(roleAssignmentPath);
    const roleAssignments = roleAssignmentUsers.flatMap((user) => user.roleAssignments ?? []);
    const hasHearingManager = roleAssignments.some(
      (assignment) =>
        assignment.roleName === "hearing-manager" &&
        assignment.attributes?.jurisdiction === expectedPrl.jurisdiction
    );
    if (!hasHearingManager) {
      failures.push("PRL CCD representative hearing-manager role assignment is missing.");
    }
  }

  const valuesPath = path.join(prlDefinitionsRoot, "charts/prl-ccd-definitions/values.preview.template.yaml");
  if (fs.existsSync(valuesPath)) {
    const values = fs.readFileSync(valuesPath, "utf8");
    if (!values.includes(`value: "${expectedPrl.hmctsServiceCode}"`)) {
      failures.push(`PRL preview HMC subscription does not expose service code ${expectedPrl.hmctsServiceCode}.`);
    }
  }

  const searchInputPath = path.join(prlDefinitionsRoot, "definitions/private-law/json/SearchInputFields.json");
  if (fs.existsSync(searchInputPath)) {
    const searchInputRows = readJson(searchInputPath);
    const hasCaseReferenceSearchInput = searchInputRows.some(
      (row) => row.CaseTypeID === expectedPrl.caseType && row.CaseFieldID === "[CASE_REFERENCE]"
    );
    if (!hasCaseReferenceSearchInput) {
      failures.push("PRL SearchInputFields is missing CCD field [CASE_REFERENCE].");
    }
  } else {
    failures.push("PRL SearchInputFields.json evidence file is missing.");
  }

  const caseEventIds = new Set(
    findJsonFiles(path.join(prlDefinitionsRoot, "definitions/private-law/json/CaseEvent"))
      .flatMap((caseEventPath) => readJson(caseEventPath))
      .map((event) => event.ID)
      .filter(Boolean)
  );

  for (const slice of source.prlCcdDefinitions.normalizedSlices ?? []) {
    for (const eventId of slice.lanes?.flatMap((lane) => lane.events ?? []) ?? []) {
      if (!caseEventIds.has(eventId)) {
        failures.push(`PRL normalized slice ${slice.sliceId} references missing event ${eventId}.`);
      }
    }

    for (const evidenceRef of slice.evidenceRefs ?? []) {
      const evidencePath = evidenceRef.split("#")[0];
      if (!fs.existsSync(path.join(prlDefinitionsRoot, evidencePath))) {
        failures.push(`PRL normalized slice ${slice.sliceId} references missing evidence file ${evidencePath}.`);
      }
    }
  }
  return true;
}

function checkServiceDefinitionProfiles() {
  const configuredFamilies = new Set(configuredFamiliesFromSource());
  const profileFamilies = new Set(expectedDefinitionProfiles.map((profile) => normalize(profile.serviceFamily)));
  if (profileFamilies.size !== expectedDefinitionProfiles.length) {
    failures.push("serviceDefinitionProfiles contains duplicate normalized family profiles.");
  }

  checkSet("serviceDefinitionProfiles configured family coverage", [...profileFamilies], [...configuredFamilies]);

  const missingProfiles = [...configuredFamilies].filter((family) => !profileFamilies.has(family));
  if (missingProfiles.length > 0) {
    failures.push(`serviceDefinitionProfiles missing configured families: ${sorted(missingProfiles).join(", ")}`);
  }

  const releaseBlockingWithoutCcd = expectedDefinitionProfiles
    .filter((profile) => profile.priority === "release-blocking" && profile.proofLevel !== "ccd-backed")
    .map((profile) => normalize(profile.serviceFamily));
  for (const family of releaseBlockingWithoutCcd) {
    assuranceGaps.push(`${family}: required configured family has no CCD-backed source profile.`);
  }

  const knownSourceGaps = expectedDefinitionProfiles
    .filter((profile) => profile.proofLevel === "source-unidentified" || profile.proofLevel === "source-unavailable")
    .map((profile) => normalize(profile.serviceFamily));
  for (const family of knownSourceGaps) {
    assuranceGaps.push(`${family}: CCD definition source is unidentified or unavailable.`);
  }

  for (const profile of expectedDefinitionProfiles) {
    if (!String(profile.rationale ?? "").trim()) {
      failures.push(`serviceDefinitionProfiles.${profile.serviceFamily} is missing a rationale.`);
    }
    if (!String(profile.nextAction ?? "").trim()) {
      failures.push(`serviceDefinitionProfiles.${profile.serviceFamily} is missing a nextAction.`);
    }
    if (profile.proofLevel === "ccd-backed" && (profile.repos?.length ?? 0) === 0) {
      failures.push(`serviceDefinitionProfiles.${profile.serviceFamily} is CCD-backed but has no repository evidence.`);
    }
    for (const repo of profile.repos ?? []) {
      const definitionMetricTotal =
        repo.jsonFiles +
        repo.caseEventToFields +
        repo.caseEventToComplexTypes +
        repo.authorisationCaseField +
        repo.caseField +
        repo.complexTypes;
      if (profile.proofLevel === "ccd-backed" && definitionMetricTotal === 0 && (repo.evidenceRefs?.length ?? 0) === 0) {
        failures.push(
          `serviceDefinitionProfiles.${profile.serviceFamily}.${repo.fullName} is service-backed but has no structured evidenceRefs.`
        );
      }
      if (repo.generatedDefinitions && !validateGeneratedDefinitionSnapshot(repo, repoRoot)) {
        failures.push(`serviceDefinitionProfiles.${profile.serviceFamily}.${repo.fullName} has an invalid generated definition snapshot.`);
      }
    }
  }
}

const { defaultConfig, envConfig } = readXuiConfig();
checkXuiDefaultConfig(defaultConfig);
checkXuiEnvConfig(envConfig);
const prlSourceChecked = checkPrlDefinitions();
checkServiceDefinitionProfiles();

if (failures.length > 0) {
  console.error("[harness-manifest] Source-truth drift detected.");
  for (const failure of failures) {
    console.error(`\n- ${failure}`);
  }
} else {
  console.log(`[harness-manifest] rpx-xui-webapp config matches ${path.relative(repoRoot, sourcePath)}.`);
  if (prlSourceChecked) {
    console.log(`[harness-manifest] Available PRL source anchors checked for ${source.prlCcdDefinitions.normalizedSlices.length} declared slice(s); no runtime or semantic-equivalence proof.`);
  }
  console.log(
    `[harness-manifest] coverage input sets: global=${expectedDefault.globalSearchServices.length}, wa=${expectedDefault.waSupportedJurisdictions.length}, staff=${expectedDefault.staffSupportedJurisdictions.length}, hearings=${expectedDefault.hearings.hearingsJurisdictions.length}`
  );
  console.log(
    `[harness-manifest] catalogue classifies ${expectedDefinitionProfiles.length} configured EXUI families; CCD-backed labels describe source inventory only.`
  );
  console.log(
    `[harness-manifest] catalogue diagnostic only; no release approval. Recorded source/model mutation status=${mutationStatus} (${mutationCommands.join(", ")}). Source validation does not prove candidate/CCD execution, independent denied-write integrity or valid interaction coverage.`
  );
}

if (assuranceGaps.length > 0) {
  console.error("[harness-manifest] Assurance gaps remain; BLOCKED diagnostic, no release approval.");
  for (const gap of [...new Set(assuranceGaps)]) console.error(`\n- ${gap}`);
}
process.exitCode = failures.length > 0 ? 1 : assuranceGaps.length > 0 ? 2 : 0;
