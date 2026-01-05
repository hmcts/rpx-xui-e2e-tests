#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const summaryPath = process.env.COVERAGE_SUMMARY_PATH ?? "coverage/coverage-summary.json";
const textOutPath = process.env.COVERAGE_TEXT_PATH ?? "coverage/coverage-summary.txt";
const rowsOutPath = process.env.COVERAGE_ROWS_PATH ?? "coverage/coverage-summary-rows.json";

try {
  if (!fs.existsSync(summaryPath)) {
    console.log(`No coverage summary found at ${path.resolve(summaryPath)}; skipping report generation.`);
    process.exit(0);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const totals = summary.total ?? summary.totals ?? {};
  const rows = buildRows(totals);
  const textSummary = formatText(rows);

  fs.mkdirSync(path.dirname(textOutPath), { recursive: true });
  fs.mkdirSync(path.dirname(rowsOutPath), { recursive: true });
  fs.writeFileSync(textOutPath, textSummary, "utf8");
  fs.writeFileSync(rowsOutPath, JSON.stringify(rows, null, 2), "utf8");
  console.log(`Coverage summary written to ${textOutPath} and ${rowsOutPath}`);
} catch (err) {
  console.warn(`reportCoverage: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(0);
}

function buildRows(totals) {
  const metrics = ["lines", "functions", "branches", "statements"];
  return metrics.map((metric) => {
    const data = totals[metric] ?? {};
    return {
      metric,
      pct: typeof data.pct === "number" ? data.pct : null,
      covered: data.covered ?? null,
      total: data.total ?? null
    };
  });
}

function formatText(rows) {
  return rows
    .map(({ metric, pct, covered, total }) => {
      const pctText = pct === null ? "n/a" : `${pct.toFixed(2)}%`;
      return `${metric}: ${pctText} (${covered ?? 0}/${total ?? 0})`;
    })
    .join("\n");
}
