import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const runLint = args.has("--lint");
const runManifest = args.has("--manifest");
const runCi = args.has("--ci");
const runOdhin = args.has("--odhin") || runCi;
const includeCiUi = ["1", "true", "yes", "on"].includes((process.env.SUPERTEST_CI_INCLUDE_UI ?? "").toLowerCase());
const testUrl = process.env.TEST_URL || (runCi ? "https://manage-case.aat.platform.hmcts.net" : "http://localhost:3455");
const storagePath = process.env.PW_UI_STORAGE_PATH;
const storageDescription = storagePath || "per-user storage under test-results/storage-states/ui";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const odhinOutput =
  process.env.PW_ODHIN_OUTPUT ||
  process.env.PLAYWRIGHT_REPORT_FOLDER ||
  (runCi ? "functional-output/tests/supertester/odhin-report" : "test-results/supertester-poc-odhin-report");
const odhinIndex = process.env.PW_ODHIN_INDEX || (runCi ? "supertester-central-assurance.html" : "supertester-poc-odhin.html");

const commonEnv = {
  ...process.env,
  API_AUTH_MODE: process.env.API_AUTH_MODE || "ui",
  COURT_ADMIN_PASSWORD: process.env.COURT_ADMIN_PASSWORD || "Pa55word11",
  COURT_ADMIN_USERNAME: process.env.COURT_ADMIN_USERNAME || "exui.local.srt@hmcts.net",
  HEARING_MANAGER_CR84_OFF_PASSWORD: process.env.HEARING_MANAGER_CR84_OFF_PASSWORD || "Pa55word11",
  HEARING_MANAGER_CR84_OFF_USERNAME: process.env.HEARING_MANAGER_CR84_OFF_USERNAME || "exui.local.srt@hmcts.net",
  HEARING_MANAGER_CR84_ON_PASSWORD: process.env.HEARING_MANAGER_CR84_ON_PASSWORD || "Pa55word11",
  HEARING_MANAGER_CR84_ON_USERNAME: process.env.HEARING_MANAGER_CR84_ON_USERNAME || "exui.local.srt@hmcts.net",
  IDAM_TESTING_SUPPORT_URL: process.env.IDAM_TESTING_SUPPORT_URL || "http://localhost:5000",
  IDAM_WEB_URL: process.env.IDAM_WEB_URL || "http://localhost:5000",
  PW_UI_STORAGE: process.env.PW_UI_STORAGE || "0",
  S2S_URL: process.env.S2S_URL || "http://localhost:4502",
  SOLICITOR_PASSWORD: process.env.SOLICITOR_PASSWORD || "Pa55word11",
  SOLICITOR_USERNAME: process.env.SOLICITOR_USERNAME || "exui.local.srt@hmcts.net",
  TEST_ENV: process.env.TEST_ENV || (runCi ? "aat" : "local"),
  TEST_URL: testUrl
};

if (runCi && !process.env.API_AUTH_MODE) {
  delete commonEnv.API_AUTH_MODE;
}

if (storagePath?.trim()) {
  commonEnv.PW_UI_STORAGE_PATH = storagePath;
}

if (!commonEnv.PW_CHROMIUM_PATH && fs.existsSync(chromePath)) {
  commonEnv.PW_CHROMIUM_PATH = chromePath;
}

if (!commonEnv.COREPACK_HOME) {
  commonEnv.COREPACK_HOME = "/private/tmp/corepack-cache";
}

const odhinEnv = {
  ...commonEnv,
  PLAYWRIGHT_REPORTERS: process.env.PLAYWRIGHT_REPORTERS || "dot,odhin",
  PLAYWRIGHT_REPORT_FOLDER: odhinOutput,
  PLAYWRIGHT_REPORT_PROJECT: process.env.PLAYWRIGHT_REPORT_PROJECT || "EXUI Supertester",
  PW_ODHIN_API_LOGS: process.env.PW_ODHIN_API_LOGS || "summary",
  PW_ODHIN_CONSOLE_TEST_OUTPUT: process.env.PW_ODHIN_CONSOLE_TEST_OUTPUT || "only-on-failure",
  PW_ODHIN_ENV: process.env.PW_ODHIN_ENV || "local-ccd",
  PW_ODHIN_INDEX: odhinIndex,
  PW_ODHIN_LIGHTWEIGHT: process.env.PW_ODHIN_LIGHTWEIGHT || "false",
  PW_ODHIN_OUTPUT: odhinOutput,
  PW_ODHIN_PROJECT: process.env.PW_ODHIN_PROJECT || "EXUI Supertester",
  PW_ODHIN_RELEASE: process.env.PW_ODHIN_RELEASE || "test/srt-poc-local-ccd",
  PW_ODHIN_TEST_FOLDER: process.env.PW_ODHIN_TEST_FOLDER || "src/tests",
  PW_ODHIN_TITLE: process.env.PW_ODHIN_TITLE || "EXUI Supertester POC"
};

async function checkUrl(label, target) {
  try {
    const response = await fetch(target, { method: "GET" });
    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
    console.log(`[supertest-local] ${label}: ${response.status}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not reachable at ${target}: ${detail}`);
  }
}

function runCommand(label, command, commandArgs, env = commonEnv) {
  console.log(`\n[supertest-local] ${label}`);
  console.log(`[supertest-local] ${command} ${commandArgs.join(" ")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} exited with ${code}`));
    });
  });
}

try {
  console.log(`[supertest-local] TEST_URL=${testUrl}`);
  console.log(`[supertest-local] UI storage=${storageDescription}`);
  console.log(`[supertest-local] mode=${runCi ? "ci" : "local"} API_AUTH_MODE=${commonEnv.API_AUTH_MODE ?? "auto"}`);

  if (!runCi) {
    await checkUrl("EXUI shell", `${testUrl.replace(/\/+$/, "")}/work/my-work/available`);
    await checkUrl("EXUI API", "http://localhost:3001/health");
    await checkUrl("Synthetic SRT shim", "http://localhost:8091/health");
    await checkUrl("Role assignment", "http://localhost:4096/health");
  }

  if (runManifest) {
    await runCommand("Source-truth manifest drift check", "yarn", ["supertest:manifest"]);
  }

  if (runLint) {
    await runCommand("Lint", "yarn", ["lint"]);
  }

  if (runOdhin) {
    const projectArgs = runCi && !includeCiUi ? ["--project=api"] : ["--project=api", "--project=ui", "--project=integration"];
    const specArgs = runCi && !includeCiUi
      ? ["src/tests/api/exui-central-assurance.api.ts"]
      : [
          "src/tests/api/exui-central-assurance.api.ts",
          "src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts",
          "src/tests/integration/hearings/superServiceFamilies.positive.spec.ts"
        ];
    await runCommand("Central assurance Odhín report", "./node_modules/.bin/playwright", [
      "test",
      ...projectArgs,
      ...specArgs,
      "--workers=1",
      "--timeout=90000",
      "--global-timeout=120000"
    ], odhinEnv);

    console.log(`\n[supertest-local] Odhín report: ${path.join(odhinOutput, odhinIndex)}`);
  } else {
    await runCommand("Central assurance API proof", "./node_modules/.bin/playwright", [
      "test",
      "--project=api",
      "src/tests/api/exui-central-assurance.api.ts",
      "--workers=1"
    ]);

    await runCommand("Manage-tasks UI proof", "./node_modules/.bin/playwright", [
      "test",
      "--project=ui",
      "src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts",
      "--timeout=90000",
      "--global-timeout=120000",
      "--workers=1"
    ]);

    await runCommand("Hearings UI proof", "./node_modules/.bin/playwright", [
      "test",
      "--project=integration",
      "src/tests/integration/hearings/superServiceFamilies.positive.spec.ts",
      "--timeout=90000",
      "--global-timeout=120000",
      "--workers=1"
    ]);
  }

  console.log("\n[supertest-local] POC proof completed.");
} catch (error) {
  console.error("\n[supertest-local] POC proof failed.");
  console.error(error instanceof Error ? error.message : error);
  if (!runCi) {
    console.error("\nStart the local shell with: yarn supertest:local:shell");
  }
  process.exitCode = 1;
}
