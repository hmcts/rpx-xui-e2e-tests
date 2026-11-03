import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
if (!process.env.XUI_WEBAPP_ROOT) throw new Error("DIAGNOSTIC_EXPLICIT_TOOLKIT_ROOT_REQUIRED");
const webappRoot = resolve(process.env.XUI_WEBAPP_ROOT);
const reportOutput = "functional-output/tests/harness/private/diagnostics/toolkit/odhin-report";
const reportIndex = "harness-diagnostic.html";
const toolkitPackagePath = join(webappRoot, "node_modules", "@hmcts", "ccd-case-ui-toolkit", "package.json");

function readToolkitVersion() {
  if (!existsSync(toolkitPackagePath)) {
    return "not installed";
  }

  return JSON.parse(readFileSync(toolkitPackagePath, "utf8")).version ?? "unknown";
}

function runPlaywrightProof() {
  const env = {
    ...process.env,
    EXUI_DIAGNOSTIC_SELECTION: "toolkit",
    EXUI_DIAGNOSTIC_ODHIN: "1",
    XUI_WEBAPP_ROOT: webappRoot
  };

  return spawnSync(
    "./node_modules/.bin/playwright",
    [
      "test",
      "--config=playwright.harness-diagnostic.config.ts",
      "src/tests/harness/diagnostic/toolkit.spec.ts",
      "-g",
      "EXUI-4493 extracted installed toolkit class"
    ],
    {
      cwd: repoRoot,
      env,
      stdio: "inherit"
    }
  ).status ?? 1;
}

console.log("\n[EXUI-4493 extracted installed-class diagnostic]");
console.log(`webapp=${webappRoot}`);
console.log(`installed toolkit=${readToolkitVersion()}`);
console.log("This proof executes the ReadFieldsFilterPipe class from the toolkit bundle installed by rpx-xui-webapp.");
console.log("For a genuine red run, set XUI_WEBAPP_ROOT to a webapp checkout that has the older/broken toolkit installed.");

const status = runPlaywrightProof();
console.log(`Supporting Odhín diagnostic report (no release credit): ${join(reportOutput, reportIndex)}`);
process.exit(status);
