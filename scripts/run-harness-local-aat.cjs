const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const Reporter = require("./harness-public-odhin-reporter.cjs");
const overview = require("./harness-public-overview.cjs");
const fixture = require("./fixtures/harness-public-report-titles.json");
const AAT_ORIGIN = "https://manage-case.aat.platform.hmcts.net";
const IDAM_ORIGIN = "https://idam-web-public.aat.platform.hmcts.net";
const offlineKeys = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "COREPACK_HOME",
  "PW_CHROMIUM_PATH",
  "PLAYWRIGHT_BROWSERS_PATH",
];
const credentialKeys = [
  "SOLICITOR_USERNAME",
  "SOLICITOR_PASSWORD",
  "DIVORCE_SOLICITOR_USERNAME",
  "DIVORCE_SOLICITOR_PASSWORD",
  "WA_SOLICITOR_USERNAME",
  "WA_SOLICITOR_PASSWORD",
];
const fail = () => new Error("LOCAL_AAT_INCOMPLETE_OR_INVALID");
const identity = (entry) => JSON.stringify([entry.file, entry.titlePath]);
function normalizePhase(document, expected, exitCode, root, bounds) {
  if (
    ![0, 1].includes(exitCode) ||
    document.config?.rootDir !== root ||
    !Array.isArray(document.errors) ||
    !document.stats
  )
    throw fail();
  const stats = document.stats;
  if (
    !Number.isFinite(new Date(stats.startTime).getTime()) ||
    typeof stats.startTime !== "string" ||
    !Number.isFinite(stats.duration) ||
    stats.duration < 0 ||
    !Number.isFinite(
      new Date(new Date(stats.startTime).getTime() + stats.duration).getTime(),
    )
  )
    throw fail();
  if (
    bounds &&
    (new Date(stats.startTime).getTime() < bounds.startedAt - 1000 ||
      new Date(stats.startTime).getTime() + stats.duration >
        bounds.finishedAt + 1000)
  )
    throw fail();
  const registry = new Map(
    expected.map((entry) => {
      const normalized = overview.normalize(entry);
      return [identity(normalized), normalized];
    }),
  );
  const seen = new Set(),
    records = [];
  function visit(suite, parents = []) {
    if (!suite || typeof suite !== "object") throw fail();
    for (const spec of suite.specs ?? []) {
      const key = identity(
        overview.normalize({
          file: spec.file,
          titlePath: ["", "", ...parents, spec.title],
        }),
      );
      if (!registry.has(key) || seen.has(key) || spec.tests?.length !== 1)
        throw fail();
      const test = spec.tests[0],
        observed = test.results?.[0];
      if (
        test.expectedStatus !== "passed" ||
        test.results?.length !== 1 ||
        !observed ||
        !["passed", "failed", "skipped", "timedOut"].includes(
          observed.status,
        ) ||
        observed.retry !== 0 ||
        !Number.isFinite(observed.duration) ||
        observed.duration < 0 ||
        !Number.isFinite(new Date(observed.startTime).getTime()) ||
        !Number.isSafeInteger(observed.workerIndex) ||
        !Number.isSafeInteger(observed.parallelIndex)
      )
        throw fail();
      if (
        test.status !==
        (observed.status === "passed"
          ? "expected"
          : observed.status === "skipped"
            ? "skipped"
            : "unexpected")
      )
        throw fail();
      seen.add(key);
      const safe = {
        status: observed.status,
        retry: 0,
        duration: observed.duration,
        startTime: new Date(observed.startTime),
        workerIndex: observed.workerIndex,
        parallelIndex: observed.parallelIndex,
      };
      if (spec.file === "src/tests/harness/diagnostic/configuration.spec.ts") {
        const stack =
          typeof observed.error?.stack === "string" ? observed.error.stack : "";
        const message =
          typeof observed.error?.message === "string"
            ? observed.error.message
            : "";
        const loginBlocked =
          observed.status === "failed" &&
          stack.includes("createStorageStateViaUi") &&
          stack.includes("/src/fixtures/api-auth.ts:") &&
          message.includes("exui-header") &&
          message.includes("locator.waitFor") &&
          (/Timeout/i.test(message) ||
            message.includes("Recent UI session capture failed"));
        safe.aatOutcome =
          observed.status === "passed"
            ? "response-passed"
            : observed.status === "skipped"
              ? "skipped"
              : loginBlocked
                ? "login-setup-blocked"
                : "failure-unclassified";
        const missing = message.match(
          /(?:^|\n)(?:Error: )?api\/globalSearch\/services is missing central must-run service families: ([A-Z_]+(?:, [A-Z_]+)*)(?:\r?\n|$)/,
        );
        const codes = missing?.[1].split(", ") || [];
        if (
          observed.status === "failed" &&
          spec.title === fixture.selections.environment[2].titlePath.at(-1) &&
          codes.length &&
          new Set(codes).size === codes.length &&
          codes.every((code) => Object.hasOwn(overview.familyNames, code))
        ) {
          safe.aatOutcome = "service-family-contract-mismatch";
          safe.aatMissingFamilies = codes;
        }
      }
      records.push({ entry: registry.get(key), observed: safe });
    }
    for (const child of suite.suites ?? [])
      visit(child, [...parents, child.title]);
  }
  visit(document);
  const passed = records.filter(
    (record) => record.observed.status === "passed",
  ).length;
  const skipped = records.filter(
    (record) => record.observed.status === "skipped",
  ).length;
  const failed = records.length - passed - skipped;
  if (
    seen.size !== registry.size ||
    records.length !== expected.length ||
    stats.expected !== passed ||
    stats.skipped !== skipped ||
    stats.unexpected !== failed ||
    stats.flaky !== 0 ||
    (exitCode === 0 && (failed || document.errors.length)) ||
    (exitCode === 1 && !failed && !document.errors.length)
  )
    throw fail();
  return {
    records,
    startTime: new Date(stats.startTime),
    duration: stats.duration,
    globalErrors: document.errors.length,
    status: exitCode === 0 ? "passed" : "failed",
  };
}
function selectedEnv(env, keys) {
  return Object.fromEntries(
    keys.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]),
  );
}
function phaseEnvironment(env, runRoot) {
  if (
    env.TEST_URL !== AAT_ORIGIN ||
    env.TEST_ENV !== "aat" ||
    env.IDAM_WEB_URL !== IDAM_ORIGIN ||
    !["SOLICITOR", "DIVORCE_SOLICITOR", "WA_SOLICITOR"].some(
      (prefix) => env[`${prefix}_USERNAME`] && env[`${prefix}_PASSWORD`],
    )
  )
    throw fail();
  const offline = { ...selectedEnv(env, offlineKeys), CI: "true" };
  return {
    offline,
    aat: {
      ...offline,
      ...selectedEnv(env, credentialKeys),
      TEST_URL: AAT_ORIGIN,
      TEST_ENV: "aat",
      IDAM_WEB_URL: IDAM_ORIGIN,
      API_AUTH_MODE: "ui",
      API_AUTH_STORAGE_SCOPE: path.basename(runRoot),
      PW_UI_STORAGE: "0",
      PW_UI_STORAGE_PATH: path.join(runRoot, "aat", "ui-storage.json"),
      EXUI_DIAGNOSTIC_SELECTION: "environment",
      EXUI_DIAGNOSTIC_ODHIN: "0",
    },
  };
}
async function runLocalAat(env = process.env) {
  const root = process.cwd();
  const privateRoot = path.join(
    root,
    "functional-output/tests/harness/private",
  );
  // Reset validates fixed ancestry before the producer creates its private child output.
  Reporter.resetPublicReport("harness");
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const runRoot = fs.mkdtempSync(path.join(privateRoot, ".local-aat-"));
  fs.chmodSync(runRoot, 0o700);
  const environments = phaseEnvironment(env, runRoot);
  let child,
    interrupted = false;
  let forceTimer;
  const cancel = () => {
    interrupted = true;
    if (child) {
      child.kill("SIGTERM");
      forceTimer ||= setTimeout(() => child?.kill("SIGKILL"), 5000);
    }
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  const phases = [];
  try {
    for (const phase of [
      {
        name: "offline",
        config: "playwright.harness-ci.config.ts",
        env: environments.offline,
        entries: overview.entries,
      },
      {
        name: "aat",
        config: "playwright.harness-diagnostic.config.ts",
        env: environments.aat,
        entries: fixture.selections.environment,
      },
    ]) {
      if (interrupted) throw fail();
      const output = path.join(runRoot, phase.name);
      fs.mkdirSync(output, { mode: 0o700 });
      const jsonFile = path.join(output, "playwright.json");
      const log = fs.openSync(path.join(output, "process.log"), "wx", 0o600);
      let terminal;
      const startedAt = Date.now();
      try {
        terminal = await new Promise((resolve, reject) => {
          child = spawn(
            process.execPath,
            [
              path.join(root, "node_modules/@playwright/test/cli.js"),
              "test",
              "--config",
              path.join(root, phase.config),
              "--reporter=json",
              `--output=${path.join(output, "test-results")}`,
            ],
            {
              cwd: phase.name === "aat" ? output : root,
              env: { ...phase.env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonFile },
              stdio: ["ignore", log, log],
            },
          );
          const timeout = setTimeout(cancel, 600000);
          child.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          child.once("close", (code, signal) => {
            clearTimeout(timeout);
            clearTimeout(forceTimer);
            forceTimer = undefined;
            child = undefined;
            resolve({ code, signal });
          });
        });
      } finally {
        fs.closeSync(log);
      }
      fs.writeFileSync(
        path.join(output, "terminal.json"),
        JSON.stringify(terminal) + "\n",
        { flag: "wx", mode: 0o600 },
      );
      if (interrupted || terminal.signal) throw fail();
      const stat = fs.lstatSync(jsonFile);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        fs.realpathSync(jsonFile) !== jsonFile
      )
        throw fail();
      fs.chmodSync(jsonFile, 0o600);
      const bytes = fs.readFileSync(jsonFile);
      const normalized = normalizePhase(
        JSON.parse(bytes),
        phase.entries,
        terminal.code,
        root,
        { startedAt, finishedAt: Date.now() },
      );
      phases.push({
        ...normalized,
        name: phase.name,
        exitCode: terminal.code,
        jsonDigest: crypto.createHash("sha256").update(bytes).digest("hex"),
      });
    }
    if (interrupted) throw fail();
    const records = phases.flatMap((phase) => phase.records);
    if (records.length !== 121) throw fail();
    const reporter = new Reporter({ selection: "local-aat" });
    const tests = records.map((record) => ({
      location: { file: path.join(root, record.entry.file) },
      titlePath: () => record.entry.titlePath,
      retries: 0,
      expectedStatus: "passed",
    }));
    reporter.onBegin({}, { allTests: () => tests });
    for (let index = 0; index < records.length; index++)
      reporter.onTestEnd(tests[index], records[index].observed);
    for (const phase of phases)
      for (let index = 0; index < phase.globalErrors; index++)
        reporter.onError();
    const start = Math.min(...phases.map((phase) => phase.startTime.getTime()));
    const end = Math.max(
      ...phases.map((phase) => phase.startTime.getTime() + phase.duration),
    );
    const status = phases.every((phase) => phase.status === "passed")
      ? "passed"
      : "failed";
    fs.writeFileSync(
      path.join(runRoot, "collection.json"),
      JSON.stringify({
        schemaVersion: 1,
        profile: "local-aat",
        origin: "manage-case.aat.platform.hmcts.net",
        phases: phases.map((phase) => ({
          name: phase.name,
          workingDirectory:
            phase.name === "aat" ? path.join(runRoot, "aat") : root,
          exitCode: phase.exitCode,
          jsonDigest: phase.jsonDigest,
          records: phase.records.length,
        })),
      }) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    await reporter.onEnd({
      status,
      startTime: new Date(start),
      duration: end - start,
    });
    if (interrupted) {
      Reporter.resetPublicReport("local-aat");
      throw fail();
    }
    return { status, exitCode: status === "passed" ? 0 : 1 };
  } finally {
    clearTimeout(forceTimer);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
module.exports = {
  normalizePhase,
  phaseEnvironment,
  runLocalAat,
  AAT_ORIGIN,
  IDAM_ORIGIN,
};
