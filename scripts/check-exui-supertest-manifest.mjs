import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, "src/data/exui-central-assurance-source.json");
const xuiWebappRoot = path.resolve(process.env.RPX_XUI_WEBAPP_DIR ?? path.join(repoRoot, "../rpx-xui-webapp"));
const prlDefinitionsRoot = path.resolve(
  process.env.PRL_CCD_DEFINITIONS_DIR ?? path.join(repoRoot, "../prl-ccd-definitions")
);

const source = readJson(sourcePath);
const expectedDefault = source.rpxXuiWebapp["config/default.json"];
const expectedEnv = source.rpxXuiWebapp["config/custom-environment-variables.json"];

const failures = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
    console.log(`[supertest-manifest] PRL CCD definitions not present at ${prlDefinitionsRoot}; skipping optional PRL source check.`);
    return;
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
}

const { defaultConfig, envConfig } = readXuiConfig();
checkXuiDefaultConfig(defaultConfig);
checkXuiEnvConfig(envConfig);
checkPrlDefinitions();

if (failures.length > 0) {
  console.error("[supertest-manifest] Source-truth drift detected.");
  for (const failure of failures) {
    console.error(`\n- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`[supertest-manifest] rpx-xui-webapp config matches ${path.relative(repoRoot, sourcePath)}.`);
  console.log("[supertest-manifest] PRL representative case type, hearing role, and ABA5 source anchors are present.");
  console.log(
    `[supertest-manifest] coverage input sets: global=${expectedDefault.globalSearchServices.length}, wa=${expectedDefault.waSupportedJurisdictions.length}, staff=${expectedDefault.staffSupportedJurisdictions.length}, hearings=${expectedDefault.hearings.hearingsJurisdictions.length}`
  );
}
