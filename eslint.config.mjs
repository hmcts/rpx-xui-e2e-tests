import { LintingConfig } from "@hmcts/playwright-common";
import tseslint from "typescript-eslint";

export default tseslint.config(
  LintingConfig.tseslintRecommended,
  LintingConfig.ignored,
  {
    ...LintingConfig.tseslintPlugin,
    files: ["src/**/*.ts", "playwright.config.ts"],
    rules: { "@typescript-eslint/no-duplicate-enum-values": "off" }
  },
  {
    ...LintingConfig.playwright,
    files: ["src/tests/**/*.ts", "src/hooks/**/*.ts", "src/fixtures/**/*.ts"],
    ignores: ["src/tests/**/__snapshots__/**"]
  }
);
