const odhinModule = require("odhin-reports-playwright");

const OdhinReporter = odhinModule.default ?? odhinModule;

class OdhinAdaptiveReporter {
  constructor(options = {}) {
    this.options = options;
    const configuredLightweight = options.lightweight;
    const envLightweight = process.env.PW_ODHIN_LIGHTWEIGHT;
    this.lightweight =
      typeof configuredLightweight === "boolean"
        ? configuredLightweight
        : envLightweight
          ? envLightweight.toLowerCase() === "true"
          : true;

    const normalizeTestOutputMode = (raw) => {
      if (raw === true || raw === false) {
        return raw;
      }
      const normalized = String(raw ?? "only-on-failure")
        .trim()
        .toLowerCase();
      if (normalized === "true") {
        return true;
      }
      if (normalized === "false") {
        return false;
      }
      return "only-on-failure";
    };

    // Default mode suppresses stdout/stderr forwarding into Odhin to keep reports quiet.
    this.testOutputMode = normalizeTestOutputMode(options.testOutput);
    const configuredCaptureStdio = options.captureStdio;
    const envCaptureStdio = process.env.PW_ODHIN_CAPTURE_STDIO;
    this.captureStdio =
      typeof configuredCaptureStdio === "boolean"
        ? configuredCaptureStdio
        : envCaptureStdio
          ? envCaptureStdio.toLowerCase() === "true"
          : false;
    this.inner = new OdhinReporter(options);
  }

  async onBegin(config, suite) {
    if (typeof this.inner.onBegin === "function") {
      await this.inner.onBegin(config, suite);
    }
  }

  async onTestEnd(test, result) {
    if (typeof this.inner.onTestEnd !== "function") {
      return;
    }

    let nextResult = result;
    const passedOrSkipped =
      result?.status === "passed" || result?.status === "skipped";
    const shouldTrimHeavyArtifacts = this.lightweight && passedOrSkipped;

    const shouldDropTestOutput =
      this.testOutputMode === false ||
      (this.testOutputMode === "only-on-failure" && passedOrSkipped);

    if (shouldTrimHeavyArtifacts || shouldDropTestOutput) {
      nextResult = { ...result };

      if (shouldDropTestOutput) {
        nextResult.stdout = [];
        nextResult.stderr = [];
      }

      if (shouldTrimHeavyArtifacts) {
        nextResult.steps = [];
        nextResult.attachments = [];
      }
    }

    await this.inner.onTestEnd(test, nextResult);
  }

  async onEnd(result) {
    if (typeof this.inner.onEnd === "function") {
      await this.inner.onEnd(result);
    }
  }

  async onStdOut(chunk, test, result) {
    if (!this.captureStdio) {
      return;
    }
    if (typeof this.inner.onStdOut === "function") {
      await this.inner.onStdOut(chunk, test, result);
    }
  }

  async onStdErr(chunk, test, result) {
    if (!this.captureStdio) {
      return;
    }
    if (typeof this.inner.onStdErr === "function") {
      await this.inner.onStdErr(chunk, test, result);
    }
  }
}

module.exports = OdhinAdaptiveReporter;
