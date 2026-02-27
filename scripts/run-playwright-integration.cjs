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
    "functional-output/tests/playwright-integration/odhin-report",
  PW_ODHIN_INDEX:
    process.env.PW_ODHIN_INDEX ?? "playwright-odhin-integration.html",
  PLAYWRIGHT_REPORTERS: process.env.PLAYWRIGHT_REPORTERS ?? "list,odhin",
};

const commandArgs = [
  "playwright",
  "test",
  "--project=ui",
  "src/tests/integration",
  ...args,
];

const result = spawnSync("yarn", commandArgs, {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
