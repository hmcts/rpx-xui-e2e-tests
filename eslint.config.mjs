import js from "@eslint/js";
import eslintPluginImport from "eslint-plugin-import";
import playwright from "eslint-plugin-playwright";
import globals from "globals";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const filesToLint = [
  "**/*.ts",
  "**/*.mts",
];

export default tseslint.config(
  {
    ignores: [
      "node_modules",
      ".yarn",
      "dist",
      "playwright-report",
      "test-results",
      "playwright/.cache",
    ],
  },
  {
    files: filesToLint,
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      import: eslintPluginImport,
      playwright,
    },
    rules: {
      "playwright/no-skipped-test": "warn",
      "playwright/no-focused-test": "error",
      "import/order": [
        "warn",
        {
          "alphabetize": { order: "asc", caseInsensitive: true },
          "newlines-between": "always",
        },
      ],
    },
  }
  ,
  {
    files: ["page-objects/**/*.ts", "utils/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "import/order": "off",
      "no-empty-pattern": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
    },
  }
);
