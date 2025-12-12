#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT ?? "test-results/json/results.json";
const flakeBudgetEnv = process.env.FLAKE_BUDGET;
const percentBudgetEnv = process.env.FLAKE_PERCENT_BUDGET;
const budget = Number.parseInt(flakeBudgetEnv ?? "0", 10);
const percentBudget = Number.parseFloat(percentBudgetEnv ?? "0");

const resolveAllowedFlakes = (totalTests) => {
  const hasPercentBudget = Number.isFinite(percentBudget) && percentBudget > 0;
  if (flakeBudgetEnv) {
    return Math.max(0, Number.isFinite(budget) ? budget : 0);
  }
  if (hasPercentBudget) {
    return Math.floor((totalTests * percentBudget) / 100);
  }
  return 0;
};

const collectTests = (suites = []) => {
  const tests = [];
  for (const suite of suites) {
    if (Array.isArray(suite.tests)) {
      tests.push(...suite.tests);
    }
    if (Array.isArray(suite.suites)) {
      tests.push(...collectTests(suite.suites));
    }
  }
  return tests;
};

const isFlaky = (test) => {
  const results = Array.isArray(test?.results) ? test.results : [];
  const retryCount = results.filter((r) => (r?.retry ?? 0) > 0).length;
  const hadFailures = results.some((r) =>
    ["failed", "timedOut", "interrupted"].includes(r?.status),
  );
  const hasPass = results.some((r) => r?.status === "passed");
  const flaggedFlaky = test?.outcome === "flaky" || test?.status === "flaky";
  return flaggedFlaky || retryCount > 0 || (hadFailures && hasPass) || results.length > 1;
};

const main = () => {
  const resolvedPath = path.resolve(process.cwd(), reportPath);
  if (!fs.existsSync(resolvedPath)) {
    console.warn(`[flake-budget] JSON report not found at ${resolvedPath}; skipping flake check.`);
    process.exit(0);
  }

  const raw = fs.readFileSync(resolvedPath, "utf8");
  const json = JSON.parse(raw);
  const tests = collectTests(json.suites ?? []);
  const flakyTests = tests.filter(isFlaky);
  const allowed = resolveAllowedFlakes(tests.length);

  const retryCount = tests
    .flatMap((test) => (Array.isArray(test?.results) ? test.results : []))
    .filter((result) => (result?.retry ?? 0) > 0).length;

  console.log(
    `[flake-budget] inspected ${tests.length} tests; flaky=${flakyTests.length}; retries=${retryCount}; budget=${allowed}`,
  );

  if (flakyTests.length > allowed) {
    console.error(
      `[flake-budget] Flake budget exceeded: ${flakyTests.length} flaky tests > allowed ${allowed}. Set FLAKE_BUDGET or FLAKE_PERCENT_BUDGET to adjust.`,
    );
    process.exit(1);
  }
};

main();
