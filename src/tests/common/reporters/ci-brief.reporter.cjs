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

const testLocation = (test) => {
  const cwdPrefix = `${process.cwd()}/`;
  const file = test.location?.file
    ? test.location.file.replace(cwdPrefix, "")
    : "unknown";
  const line = test.location?.line ? `:${test.location.line}` : "";
  return `${file}${line}`;
};

const resolveProgressEvery = () => {
  const configured = Number.parseInt(process.env.PW_CI_BRIEF_PROGRESS_EVERY ?? "25", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 25;
};

class CiBriefReporter {
  constructor() {
    this.total = 0;
    this.completed = 0;
    this.progressEvery = resolveProgressEvery();
    this.counts = {
      passed: 0,
      failed: 0,
      timedOut: 0,
      interrupted: 0,
      skipped: 0
    };
  }

  onBegin(config, suite) {
    this.total = suite.allTests().length;
    process.stdout.write(`[playwright] START total=${this.total} workers=${config.workers}\n`);
  }

  progressLine(prefix) {
    return `[playwright] ${prefix} ${this.completed}/${this.total} passed=${this.counts.passed} failed=${this.counts.failed} timedOut=${this.counts.timedOut} interrupted=${this.counts.interrupted} skipped=${this.counts.skipped}`;
  }

  onTestEnd(test, result) {
    this.completed += 1;
    this.counts[result.status] = (this.counts[result.status] ?? 0) + 1;
    const label = statusLabel[result.status] ?? result.status.toUpperCase();

    if (result.status === "failed" || result.status === "timedOut" || result.status === "interrupted") {
      process.stdout.write(`${this.progressLine(label)} location=${testLocation(test)} duration=${formatDuration(result.duration)}\n`);
      return;
    }

    if (this.completed === this.total || this.completed % this.progressEvery === 0) {
      process.stdout.write(`${this.progressLine("PROGRESS")}\n`);
    }
  }

  onEnd(result) {
    process.stdout.write(
      `${this.progressLine(`END status=${result.status}`)}\n`
    );
  }
}

module.exports = CiBriefReporter;
