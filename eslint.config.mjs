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
    ignores: [
      "src/tests/**/__snapshots__/**",
      "src/tests/ui/E2E/**",
      "src/tests/ui/functional-integration/**",
      "src/tests/unit/**"
    ]
  },
  {
    files: ["src/tests/unit/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    ignores: ["src/tests/ui/E2E/**", "src/tests/ui/functional-integration/**", "src/tests/api/**"]
  }
);
