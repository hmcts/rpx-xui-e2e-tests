#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function readText(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

function listSearchCaseIntegrationSpecs() {
  const relativeDir = "src/tests/integration/searchCase";
  const absoluteDir = path.join(repoRoot, relativeDir);
  return fs
    .readdirSync(absoluteDir)
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => path.join(relativeDir, name));
}

function checkIntegrationSearchCaseUsers() {
  const files = listSearchCaseIntegrationSpecs();
  const missingGlobalSearchUser = [];
  const containsSolicitorUser = [];

  for (const file of files) {
    const content = readText(file);
    if (!content.includes("TEST_USERS.FPL_GLOBAL_SEARCH")) {
      missingGlobalSearchUser.push(file);
    }
    if (content.includes("TEST_USERS.SOLICITOR")) {
      containsSolicitorUser.push(file);
    }
  }

  const passed =
    missingGlobalSearchUser.length === 0 && containsSolicitorUser.length === 0;
  const details = [];
  details.push(`searched ${files.length} integration searchCase specs`);
  if (missingGlobalSearchUser.length > 0) {
    details.push(
      `missing TEST_USERS.FPL_GLOBAL_SEARCH: ${missingGlobalSearchUser.join(", ")}`,
    );
  }
  if (containsSolicitorUser.length > 0) {
    details.push(
      `contains TEST_USERS.SOLICITOR: ${containsSolicitorUser.join(", ")}`,
    );
  }

  return {
    name: "searchCase integration specs use FPL_GLOBAL_SEARCH and avoid SOLICITOR",
    passed,
    details: details.join(" | "),
  };
}

function checkManageButtonContract() {
  const taskListPath = "src/page-objects/pages/exui/taskList.po.ts";
  const myTasksPath = "src/tests/e2e/myWork/myTasks.spec.ts";
  const taskListContent = readText(taskListPath);
  const myTasksContent = readText(myTasksPath);

  const hasDefinition = /async\s+waitForManageButton\s*\(/.test(
    taskListContent,
  );
  const hasUsage = /\.waitForManageButton\s*\(/.test(myTasksContent);

  return {
    name: "waitForManageButton exists in taskList.po.ts and is used in myTasks.spec.ts",
    passed: hasDefinition && hasUsage,
    details: `definition=${hasDefinition} usage=${hasUsage}`,
  };
}

function checkTimeoutContracts() {
  const files = [
    "src/page-objects/pages/exui/createCase.po.ts",
    "src/page-objects/pages/exui/caseDetails.po.ts",
  ];
  const perFile = files.map((file) => {
    const content = readText(file);
    const hasExuiTimeouts = content.includes("EXUI_TIMEOUTS");
    const hasRecommendedTimeout = content.includes("getRecommendedTimeoutMs");
    return { file, hasExuiTimeouts, hasRecommendedTimeout };
  });

  const passed = perFile.every(
    ({ hasExuiTimeouts, hasRecommendedTimeout }) =>
      hasExuiTimeouts && hasRecommendedTimeout,
  );

  const details = perFile
    .map(
      ({ file, hasExuiTimeouts, hasRecommendedTimeout }) =>
        `${file}: EXUI_TIMEOUTS=${hasExuiTimeouts} getRecommendedTimeoutMs=${hasRecommendedTimeout}`,
    )
    .join(" | ");

  return {
    name: "createCase.po.ts and caseDetails.po.ts include EXUI_TIMEOUTS + getRecommendedTimeoutMs",
    passed,
    details,
  };
}

function checkCaseFlagsExpectPoll() {
  const caseFlagsPositivePath =
    "src/tests/e2e/caseFlags/caseFlags.positive.spec.ts";
  const content = readText(caseFlagsPositivePath);
  const passed = /\.\s*poll\s*\(/.test(content);
  return {
    name: "caseFlags positive spec contains poll-based assertions",
    passed,
    details: `${caseFlagsPositivePath}: poll-call=${passed}`,
  };
}

function runChecks() {
  const checks = [
    checkIntegrationSearchCaseUsers(),
    checkManageButtonContract(),
    checkTimeoutContracts(),
    checkCaseFlagsExpectPoll(),
  ];

  let failures = 0;
  for (const check of checks) {
    const prefix = check.passed ? "PASS" : "FAIL";
    console.log(`[${prefix}] ${check.name}`);
    console.log(`       ${check.details}`);
    if (!check.passed) {
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error(
      `\nRobustness gate failed: ${failures}/${checks.length} checks failing.`,
    );
    process.exit(1);
  }

  console.log(
    `\nRobustness gate passed: ${checks.length}/${checks.length} checks.`,
  );
}

runChecks();
