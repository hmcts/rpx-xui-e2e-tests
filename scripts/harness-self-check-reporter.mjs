// Only Node's structured final global summary supplies aggregate counts.
const countKeys = [
  "tests",
  "passed",
  "failed",
  "cancelled",
  "skipped",
  "todo",
  "suites",
  "topLevel",
];
const invalid = (reason) => ({ schemaVersion: 1, complete: false, reason });
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const validCounts = (counts) =>
  counts &&
  Object.keys(counts).sort().join(",") === countKeys.slice().sort().join(",") &&
  countKeys.every((key) => integer(counts[key])) &&
  counts.tests ===
    counts.passed +
      counts.failed +
      counts.cancelled +
      counts.skipped +
      counts.todo;
const validOutcome = (counts, success) =>
  typeof success === "boolean" &&
  success === (counts.failed === 0 && counts.cancelled === 0);
export async function summarizeNodeTestEvents(source) {
  let global,
    globals = 0,
    declaredTests = 0,
    duplicateFile = false,
    invalidFile = false;
  const files = new Set();
  const additiveKeys = countKeys;
  const fileTotals = Object.fromEntries(additiveKeys.map((key) => [key, 0]));
  for await (const event of source) {
    if (event?.type !== "test:summary") continue;
    const data = event.data;
    if (data && typeof data.file === "string") {
      if (
        !validCounts(data.counts) ||
        !validOutcome(data.counts, data.success) ||
        !Number.isFinite(data.duration_ms) ||
        data.duration_ms < 0
      ) {
        invalidFile = true;
        continue;
      }
      duplicateFile ||= files.has(data.file);
      files.add(data.file);
      declaredTests += data.counts.tests;
      for (const key of additiveKeys) fileTotals[key] += data.counts[key];
    } else if (
      data &&
      data.file === undefined &&
      data.entryFile === undefined
    ) {
      globals++;
      if (globals === 1) global = data;
    } else invalidFile = true;
  }
  if (globals !== 1)
    return invalid(globals === 0 ? "SUMMARY_MISSING" : "SUMMARY_DUPLICATE");
  if (duplicateFile || invalidFile || !integer(declaredTests))
    return invalid("FILE_SUMMARY_INVALID");
  if (
    !global.counts ||
    !countKeys.every((key) => integer(global.counts[key])) ||
    typeof global.success !== "boolean" ||
    !Number.isFinite(global.duration_ms) ||
    global.duration_ms < 0
  )
    return invalid("SUMMARY_INVALID");
  const counts = Object.fromEntries(
    countKeys.map((key) => [key, global.counts[key]]),
  );
  if (!validCounts(global.counts) || !validOutcome(counts, global.success))
    return invalid("SUMMARY_COUNTS_CONTRADICTORY");
  if (
    declaredTests > 0 &&
    additiveKeys.some(
      (key) => !integer(fileTotals[key]) || fileTotals[key] !== counts[key],
    )
  )
    return invalid("FILE_SUMMARY_INVALID");
  return {
    schemaVersion: 1,
    complete: true,
    nodeVersion: process.version,
    success: global.success,
    counts,
    nodeDurationMs: global.duration_ms,
    fileCount: files.size,
    declaredTests,
  };
}
export function validateSelfCheckOutcome(summary, terminal, expectedFiles) {
  const incomplete = (reason) => ({
    status: "incomplete",
    reason,
    counts: null,
    nodeDurationMs: null,
  });
  if (
    terminal?.started !== true ||
    terminal.observed !== true ||
    terminal.forced !== false ||
    terminal.cancelled !== false ||
    terminal.signal !== null
  )
    return incomplete("CHILD_INTERRUPTED");
  if (summary?.complete !== true)
    return incomplete(
      [
        "SUMMARY_MISSING",
        "SUMMARY_DUPLICATE",
        "FILE_SUMMARY_INVALID",
        "SUMMARY_INVALID",
        "SUMMARY_COUNTS_CONTRADICTORY",
      ].includes(summary?.reason)
        ? summary.reason
        : "SUMMARY_INVALID",
    );
  if (
    Object.keys(summary).sort().join(",") !==
      [
        "schemaVersion",
        "complete",
        "nodeVersion",
        "success",
        "counts",
        "nodeDurationMs",
        "fileCount",
        "declaredTests",
      ]
        .sort()
        .join(",") ||
    summary.schemaVersion !== 1 ||
    summary.nodeVersion !== process.version ||
    !validCounts(summary.counts) ||
    !validOutcome(summary.counts, summary.success) ||
    !Number.isFinite(summary.nodeDurationMs) ||
    summary.nodeDurationMs < 0 ||
    !integer(summary.fileCount) ||
    !integer(summary.declaredTests)
  )
    return incomplete("SUMMARY_INVALID");
  if (!integer(expectedFiles) || expectedFiles === 0)
    return incomplete("FILE_SELECTION_UNCONFIRMED");
  if (summary.declaredTests === 0) return incomplete("NO_DECLARED_TESTS");
  if (
    summary.fileCount !== expectedFiles ||
    summary.declaredTests !== summary.counts.tests
  )
    return incomplete("FILE_SELECTION_UNCONFIRMED");
  if (!(
    (terminal.code === 0 && summary.success === true) ||
    (terminal.code === 1 && summary.success === false)
  ))
    return incomplete("CHILD_SUMMARY_CONTRADICTORY");
  return {
    status:
      summary.counts.cancelled > 0
        ? "incomplete"
        : summary.success
          ? "passed"
          : "failed",
    reason: summary.counts.cancelled > 0 ? "TESTS_CANCELLED" : null,
    counts: summary.counts,
    nodeDurationMs: summary.nodeDurationMs,
  };
}
export default async function* reporter(source) {
  yield JSON.stringify(await summarizeNodeTestEvents(source)) + "\n";
}
