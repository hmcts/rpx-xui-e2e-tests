import { LintingConfig } from "@hmcts/playwright-common";
import pluginJs from "@eslint/js";
import prettier from "eslint-config-prettier";
import pluginImport from "eslint-plugin-import";
import tseslint from "typescript-eslint";

const ignored = {
  ignores: [
    ...LintingConfig.ignored.ignores,
    "node_modules",
    "playwright-report",
    "scripts/**",
    "test-results",
    "coverage",
    "reports",
  ],
};

export default tseslint.config(
  ignored,
  pluginJs.configs.recommended,
  ...LintingConfig.tseslintRecommended,
  LintingConfig.tseslintPlugin,
  LintingConfig.playwright,
  prettier,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      import: pluginImport,
    },
    rules: {
      "playwright/no-skipped-test": "warn",
      "playwright/no-focused-test": "error",
      "playwright/prefer-web-first-assertions": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "import/order": [
        "warn",
        {
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: [
      "src/tests/**/*.ts",
      "src/utils/**/*.ts",
      "src/data/**/*.ts",
      "src/fixtures/**/*.ts",
      "src/global/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
