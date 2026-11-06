import { spawn } from "node:child_process";
import process from "node:process";

import diagnosticConfig from "./harness-diagnostic-config.cjs";
import { writePublicSummary } from "./lib/exui-evidence-io.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const switches = new Set(["--aat", "--lint", "--manifest", "--ci", "--odhin", "--local"]);
const native = args.filter((arg) => arg.startsWith("--native-evidence="));
const selected = args.filter((arg) => arg.startsWith("--selection="));
if (native.length > 1 || native.some(arg => !arg.slice("--native-evidence=".length)) || selected.length > 1 || args.some((arg) => !switches.has(arg) && !arg.startsWith("--selection=") && !arg.startsWith("--native-evidence="))) {
  console.error("[harness-diagnostic] BLOCKED: diagnostic POC only; candidate/release execution requires an isolated candidate runner.");
  process.exit(2);
}
const selection = selected[0]?.slice("--selection=".length) || "model";
const runCi = args.includes("--ci");
const local = args.includes("--local");
const aat = args.includes("--aat");
if ((native.length && !aat) || (aat && args.some(arg => arg !== "--aat" && !arg.startsWith("--native-evidence="))) || !Object.hasOwn(diagnosticConfig.selections, selection) || (local && (runCi || selected.length)) || (runCi && selection !== "model")) {
  console.error("[harness-diagnostic] BLOCKED: invalid diagnostic selection.");
  process.exit(2);
}
try {
  writePublicSummary("functional-output/tests/harness/public/release-assurance-summary.json", {
    status: "BLOCKED", exitCode: 2, reasons: []
  });
} catch {
  console.error("[harness-diagnostic] BLOCKED: public diagnostic summary could not be initialized.");
  process.exit(2);
}
if (aat) {
  try {
    const { runLocalAat } = (await import("./run-harness-local-aat.cjs")).default;
    const result = await runLocalAat(process.env, { nativeEvidencePath: native[0]?.slice("--native-evidence=".length) });
    console.log(`[harness-aat] Diagnostics ${result.status}${result.nativeStatus ? ` / Native ${result.nativeStatus}` : ""}; no release approval.`);
    process.exit(result.exitCode);
  } catch {
    console.error("[harness-aat] Collection incomplete or invalid; see private diagnostics.");
    process.exit(2);
  }
}
console.log("[harness-diagnostic] Diagnostic only: no release credit; no native candidate receipt is produced.");

const offlineEnvKeys = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "COREPACK_HOME", "CI", "PW_CHROMIUM_PATH", "XUI_WEBAPP_ROOT"];
const offlineEnv = Object.fromEntries(offlineEnvKeys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
const localEnv = { ...process.env };
if (local) {
  let target;
  try {
    diagnosticConfig.buildConfig({ ...process.env, IDAM_WEB_URL: process.env.IDAM_WEB_URL || "http://localhost:5000", EXUI_DIAGNOSTIC_SELECTION: "environment" });
    target = new URL(process.env.TEST_URL);
  } catch { /* Report only the required input names below. */ }
  if (!target || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || process.env.TEST_ENV !== "local") {
    console.error("[harness-diagnostic] BLOCKED: local diagnostics require explicit loopback TEST_URL and TEST_ENV=local.");
    process.exit(2);
  }
  Object.assign(localEnv, { API_AUTH_MODE: "ui", API_AUTH_STORAGE_SCOPE: "harness-local", PW_UI_STORAGE: "0" });
  for (const persona of ["SOLICITOR"]) {
    localEnv[`${persona}_USERNAME`] ||= "exui.local.srt@hmcts.net";
    localEnv[`${persona}_PASSWORD`] ||= "Pa55word11";
  }
  localEnv.IDAM_WEB_URL ||= "http://localhost:5000";
  localEnv.IDAM_TESTING_SUPPORT_URL ||= "http://localhost:5000";
  localEnv.S2S_URL ||= "http://localhost:4502";
}

function privateReporting(output) {
  return {
    PLAYWRIGHT_REPORTERS: "failures,json,odhin,junit", PW_TEST_REPORTER: "",
    PLAYWRIGHT_JSON_ONLY_FAILURES: "false", PLAYWRIGHT_JUNIT_ONLY_FAILURES: "false",
    PLAYWRIGHT_REPORT_FOLDER: `${output}/odhin-report`, PLAYWRIGHT_REPORT_TARGET: `${output}/odhin-report`,
    PW_ODHIN_OUTPUT: `${output}/odhin-report`, PW_ODHIN_TARGET: `${output}/odhin-report`,
    PW_ODHIN_INDEX: "harness-diagnostic.html", PLAYWRIGHT_REPORT_INDEX_FILENAME: "harness-diagnostic.html",
    PW_ODHIN_START_SERVER: "false", PLAYWRIGHT_JUNIT_OUTPUT: `${output}/junit.xml`,
    PLAYWRIGHT_JUNIT_OUTPUT_FILE: `${output}/junit.xml`, PLAYWRIGHT_JSON_OUTPUT: `${output}/playwright.json`,
    PLAYWRIGHT_JSON_OUTPUT_FILE: `${output}/playwright.json`, PLAYWRIGHT_PERFETTO_OUTPUT_FILE: `${output}/perfetto.json`,
    PLAYWRIGHT_HTML_OUTPUT: `${output}/html-report`, PLAYWRIGHT_HTML_OUTPUT_DIR: `${output}/html-report`,
    PLAYWRIGHT_HTML_REPORT: `${output}/html-report`, PLAYWRIGHT_LAST_RUN_OUTPUT_FILE: `${output}/test-results/.last-run.json`,
    PLAYWRIGHT_OUTPUT_DIR: `${output}/test-results`, PLAYWRIGHT_TEST_OUTPUT_DIR: `${output}/test-results`,
    PW_NODE_API_LOG_ROOT: `${output}/test-results`, PW_API_ENDPOINTS_OUTPUT: `${output}/api-endpoints.json`
  };
}

function run(command, commandArgs, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: process.cwd(), env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Diagnostic child failed (${code ?? "signal"}).`)));
  });
}

try {
  // Explicit local setup is separate from the default portable model selection.
  if (local) await run("node", ["scripts/bootstrap-harness-local-sessions.mjs"], localEnv);
  if (args.includes("--manifest")) await run("yarn", ["harness:manifest"], offlineEnv);
  if (args.includes("--lint")) await run("yarn", ["lint"], offlineEnv);
  for (const mode of runCi ? ["harness"] : local ? ["model", "environment"] : [selection]) {
    const output = runCi ? "functional-output/tests/harness/private/ci" : `functional-output/tests/harness/private/diagnostics/${mode}`;
    const env = {
      ...(mode === "environment" ? (local ? localEnv : process.env) : offlineEnv),
      ...(runCi ? { CI: "true" } : {}),
      ...(mode !== "environment" && !runCi ? { TEST_URL: "http://127.0.0.1:3455", TEST_ENV: "local" } : {}),
      ...privateReporting(output),
      EXUI_DIAGNOSTIC_SELECTION: mode,
      EXUI_DIAGNOSTIC_ODHIN: args.includes("--odhin") || runCi ? "1" : "0"
    };
    if (!runCi) diagnosticConfig.buildConfig(env);
    if (mode === "environment") env.API_AUTH_MODE = "ui";
    console.log(`[harness-diagnostic] selection=${mode}; supporting evidence only`);
    await run("./node_modules/.bin/playwright", [
      "test", runCi ? "--config=playwright.harness-ci.config.ts" : "--config=playwright.harness-diagnostic.config.ts", `--output=${output}/test-results`
    ], env);
  }
} catch (error) {
  console.error("[harness-diagnostic] Diagnostic failed.");
  // Input names and exit status are sufficient; do not echo target URLs or credentials.
  console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "Check the private diagnostic output.");
  process.exitCode = 1;
}
