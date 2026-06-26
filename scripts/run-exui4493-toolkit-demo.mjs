import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const workspaceRoot = resolve(repoRoot, "..");
const webappRoot = resolve(process.env.XUI_WEBAPP_ROOT ?? join(workspaceRoot, "rpx-xui-webapp"));
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
    PLAYWRIGHT_REPORTERS: process.env.PLAYWRIGHT_REPORTERS ?? "list,odhin",
    PW_ODHIN_OUTPUT: process.env.PW_ODHIN_OUTPUT ?? "test-results/exui-4493-toolkit-odhin-report",
    PW_ODHIN_INDEX: process.env.PW_ODHIN_INDEX ?? "exui-4493-toolkit.html",
    PW_ODHIN_TITLE: process.env.PW_ODHIN_TITLE ?? "EXUI-4493 installed toolkit proof",
    XUI_WEBAPP_ROOT: webappRoot
  };

  return spawnSync(
    "./node_modules/.bin/playwright",
    [
      "test",
      "--project=api",
      "src/tests/api/exui-historic-replay-packs.api.ts",
      "-g",
      "EXUI-4493 installed webapp toolkit"
    ],
    {
      cwd: repoRoot,
      env,
      stdio: "inherit"
    }
  ).status ?? 1;
}

console.log("\n[EXUI-4493 real toolkit proof]");
console.log(`webapp=${webappRoot}`);
console.log(`installed toolkit=${readToolkitVersion()}`);
console.log("This proof executes the ReadFieldsFilterPipe class from the toolkit bundle installed by rpx-xui-webapp.");
console.log("For a genuine red run, set XUI_WEBAPP_ROOT to a webapp checkout that has the older/broken toolkit installed.");

process.exit(runPlaywrightProof());
