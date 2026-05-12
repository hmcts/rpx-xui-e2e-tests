/* global process, module */

const statusLabel = {
  passed: "PASS",
  failed: "FAIL",
  timedOut: "TIMEOUT",
  interrupted: "INTERRUPTED",
  skipped: "SKIP"
};

const formatDuration = (durationMs) => {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "unknown";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
};

const trimMessage = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

const testTitle = (test) => {
  const titlePath = typeof test.titlePath === "function" ? test.titlePath() : [test.title];
  return titlePath.filter(Boolean).join(" > ");
};

const testLocation = (test) => {
  const cwdPrefix = `${process.cwd()}/`;
  const file = test.location?.file
    ? test.location.file.replace(cwdPrefix, "")
    : "unknown";
  const line = test.location?.line ? `:${test.location.line}` : "";
  return `${file}${line}`;
};

class CiBriefReporter {
  constructor() {
    this.counts = {
      passed: 0,
      failed: 0,
      timedOut: 0,
      interrupted: 0,
      skipped: 0
    };
  }

  onBegin(config, suite) {
    process.stdout.write(`[playwright] START suite total=${suite.allTests().length} workers=${config.workers}\n`);
  }

  onTestBegin(test) {
    process.stdout.write(`[playwright] START [${test.parent.project()?.name ?? "default"}] ${testLocation(test)} ${testTitle(test)}\n`);
  }

  onTestEnd(test, result) {
    this.counts[result.status] = (this.counts[result.status] ?? 0) + 1;
    const label = statusLabel[result.status] ?? result.status.toUpperCase();
    process.stdout.write(
      `[playwright] ${label} [${test.parent.project()?.name ?? "default"}] ${testLocation(test)} ${testTitle(test)} (${formatDuration(result.duration)})\n`
    );

    if (result.status !== "passed" && result.status !== "skipped") {
      const message = trimMessage(result.error?.message ?? result.errors?.[0]?.message);
      if (message) {
        process.stdout.write(`[playwright] ${label} reason: ${message}\n`);
      }
    }
  }

  onEnd(result) {
    process.stdout.write(
      `[playwright] END status=${result.status} passed=${this.counts.passed} failed=${this.counts.failed} timedOut=${this.counts.timedOut} interrupted=${this.counts.interrupted} skipped=${this.counts.skipped}\n`
    );
  }
}

module.exports = CiBriefReporter;
