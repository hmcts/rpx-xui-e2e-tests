import pluginJs from "@eslint/js";
import prettier from "eslint-config-prettier";
import pluginImport from "eslint-plugin-import";
import pluginPlaywright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules",
      ".yarn",
      "playwright-report",
      "test-results",
      "coverage",
      "reports"
    ]
  },
  {
    extends: [
      pluginJs.configs.recommended,
      ...tseslint.configs.recommended,
      prettier
    ],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    plugins: {
      import: pluginImport,
      playwright: pluginPlaywright
    },
    rules: {
      "playwright/no-skipped-test": "warn",
      "playwright/no-focused-test": "error",
      "import/order": [
        "warn",
        {
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true }
        }
      ]
    }
  }
);
