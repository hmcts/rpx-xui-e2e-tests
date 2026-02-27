#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const rawArgs = process.argv.slice(2);
const args =
  rawArgs.length > 0 && rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const env = {
  ...process.env,
  PW_UI_STORAGE: process.env.PW_UI_STORAGE ?? "1",
  PW_UI_WORKERS: process.env.PW_UI_WORKERS ?? "2",
  PLAYWRIGHT_REPORT_FOLDER:
    process.env.PLAYWRIGHT_REPORT_FOLDER ??
    "functional-output/tests/playwright-e2e/odhin-report",
  PLAYWRIGHT_REPORTERS: process.env.PLAYWRIGHT_REPORTERS ?? "list,odhin",
};

const commandArgs = [
  "playwright",
  "test",
  "--project=ui",
  "src/tests/e2e",
  `--retries=${process.env.PW_E2E_RETRIES ?? "1"}`,
  ...args,
];

const result = spawnSync("yarn", commandArgs, {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
