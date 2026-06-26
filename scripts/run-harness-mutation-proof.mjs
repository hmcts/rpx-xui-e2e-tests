import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const mutation = process.env.EXUI_ASSURANCE_MUTATION || "drop-prl-wa-family";
const focusedSpec = "src/tests/api/exui-central-assurance.api.ts";
const mutationProofs = {
  "drop-prl-wa-family": {
    grep: "api/wa-supported-jurisdiction/get mutation proof catches a shared WA family regression",
    expectedEvidence: [
      "drop-prl-wa-family",
      "api/wa-supported-jurisdiction/get is missing central must-run service families: PRIVATELAW",
    ],
    summary: "the injected EXUI-style WA regression was caught",
  },
  "drop-civil-hearings-case-type": {
    grep: "civil hearings service pack mutation proof catches a missing Civil case type",
    expectedEvidence: ["drop-civil-hearings-case-type", "Array []"],
    summary: "the injected EXUI-style Civil hearings regression was caught",
  },
};
const mutationProof = mutationProofs[mutation];
if (!mutationProof) {
  console.error(`[harness-mutation] Unsupported EXUI_ASSURANCE_MUTATION=${mutation}.`);
  console.error(`[harness-mutation] Supported values: ${Object.keys(mutationProofs).join(", ")}`);
  process.exit(1);
}
const focusedGrep = process.env.EXUI_ASSURANCE_MUTATION_GREP || mutationProof.grep;
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const reportOutput =
  process.env.PW_ODHIN_OUTPUT || "functional-output/tests/harness/mutation-proof/odhin-report";
const reportIndex = process.env.PW_ODHIN_INDEX || "harness-mutation-proof.html";

const commonEnv = {
  ...process.env,
  API_AUTH_MODE: process.env.API_AUTH_MODE || "ui",
  COREPACK_HOME: process.env.COREPACK_HOME || "/private/tmp/corepack-cache",
  PW_UI_STORAGE: process.env.PW_UI_STORAGE || "0",
  TEST_ENV: process.env.TEST_ENV || "local",
  TEST_URL: process.env.TEST_URL || "http://localhost:3455",
};

if (!commonEnv.PW_CHROMIUM_PATH && fs.existsSync(chromePath)) {
  commonEnv.PW_CHROMIUM_PATH = chromePath;
}

function runPlaywright(label, env) {
  const args = [
    "test",
    "--project=api",
    focusedSpec,
    "--grep",
    focusedGrep,
    "--workers=4",
    "--timeout=90000",
    "--global-timeout=120000",
  ];

  console.log(`\n[harness-mutation] ${label}`);
  console.log(`[harness-mutation] ./node_modules/.bin/playwright ${args.join(" ")}`);

  return new Promise((resolve) => {
    const child = spawn("./node_modules/.bin/playwright", args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = `${label}\n`;
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      output += String(error);
      resolve({ code: 1, output });
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

const baseline = await runPlaywright("Step 1/2: control run without injected fault", {
  ...commonEnv,
  EXUI_ASSURANCE_MUTATION: "",
  PLAYWRIGHT_REPORTERS: "list",
});

if (baseline.code !== 0) {
  console.error("\n[harness-mutation] Control run failed. Fix the baseline before demonstrating mutation detection.");
  process.exitCode = baseline.code;
  process.exit();
}

const mutated = await runPlaywright(`Step 2/2: inject ${mutation} and expect the assurance gate to fail`, {
  ...commonEnv,
  EXUI_ASSURANCE_MUTATION: mutation,
  PLAYWRIGHT_REPORTERS: process.env.PLAYWRIGHT_REPORTERS || "list,odhin",
  PLAYWRIGHT_REPORT_FOLDER: reportOutput,
  PLAYWRIGHT_REPORT_PROJECT: "EXUI Central Assurance Mutation Proof",
  PW_ODHIN_API_LOGS: process.env.PW_ODHIN_API_LOGS || "summary",
  PW_ODHIN_CONSOLE_TEST_OUTPUT: process.env.PW_ODHIN_CONSOLE_TEST_OUTPUT || "all",
  PW_ODHIN_ENV: process.env.PW_ODHIN_ENV || "local-ccd",
  PW_ODHIN_INDEX: reportIndex,
  PW_ODHIN_LIGHTWEIGHT: process.env.PW_ODHIN_LIGHTWEIGHT || "false",
  PW_ODHIN_OUTPUT: reportOutput,
  PW_ODHIN_PROJECT: "EXUI Central Assurance Mutation Proof",
  PW_ODHIN_RELEASE: process.env.PW_ODHIN_RELEASE || "test/srt-poc-local-ccd",
  PW_ODHIN_TEST_FOLDER: "src/tests/api",
  PW_ODHIN_TITLE: "EXUI Central Assurance Mutation Proof",
});

if (mutated.code === 0) {
  console.error("\n[harness-mutation] Mutation was not caught.");
  console.error("[harness-mutation] The target endpoint may have been skipped, or the contract is not asserting the dropped family.");
  process.exitCode = 1;
  process.exit();
}

const missingEvidence = mutationProof.expectedEvidence.filter((needle) => !mutated.output.includes(needle));

if (missingEvidence.length) {
  console.error("\n[harness-mutation] The mutation failed the suite, but not with the expected evidence.");
  console.error(`[harness-mutation] Missing output: ${missingEvidence.join(", ")}`);
  process.exitCode = 1;
  process.exit();
}

console.log("\n[harness-mutation] Mutation proof passed.");
console.log(`[harness-mutation] The control run was green, ${mutationProof.summary}, and no source config was changed.`);
console.log(`[harness-mutation] Odhín failure report: ${path.join(reportOutput, reportIndex)}`);
