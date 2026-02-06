#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const summaryPath =
  process.env.COVERAGE_SUMMARY_PATH ?? "coverage/coverage-summary.json";
const textOutPath =
  process.env.COVERAGE_TEXT_PATH ?? "coverage/coverage-summary.txt";
const rowsOutPath =
  process.env.COVERAGE_ROWS_PATH ?? "coverage/coverage-summary-rows.json";

async function main() {
  const { readCoverageSummary, buildCoverageRows, formatCoverageText } =
    await import("@hmcts/playwright-common");
  const summary = readCoverageSummary(summaryPath);

  if (!summary) {
    console.log(
      `No coverage summary found at ${path.resolve(summaryPath)}; skipping report generation.`,
    );
    return;
  }

  const rows = buildCoverageRows(summary.totals);
  const textSummary = formatCoverageText(summary.totals);

  fs.mkdirSync(path.dirname(textOutPath), { recursive: true });
  fs.mkdirSync(path.dirname(rowsOutPath), { recursive: true });
  fs.writeFileSync(textOutPath, textSummary, "utf8");
  fs.writeFileSync(rowsOutPath, JSON.stringify(rows, null, 2), "utf8");
  console.log(`Coverage summary written to ${textOutPath} and ${rowsOutPath}`);
}

main().catch((err) => {
  console.warn(
    `reportCoverage: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(0);
});
