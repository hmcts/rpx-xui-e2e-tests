#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = process.cwd();
const outputPath = path.resolve(
  root,
  process.env.AI_AUDIT_METADATA_OUTPUT ||
    "functional-output/tests/governance/ai-audit-metadata.json",
);

const runGit = (cmd) => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const exists = (relativePath) => {
  const absolutePath = path.resolve(root, relativePath);
  return {
    path: relativePath,
    exists: fs.existsSync(absolutePath),
  };
};

const metadata = {
  generated_at: new Date().toISOString(),
  repository: {
    name: process.env.GITHUB_REPOSITORY || "hmcts/rpx-xui-e2e-tests",
    branch:
      process.env.GIT_BRANCH ||
      process.env.BRANCH_NAME ||
      process.env.GITHUB_REF_NAME ||
      runGit("git rev-parse --abbrev-ref HEAD") ||
      "unknown",
    commit_sha:
      process.env.GIT_COMMIT ||
      process.env.GITHUB_SHA ||
      runGit("git rev-parse HEAD") ||
      "unknown",
  },
  build: {
    ci: Boolean(process.env.CI || process.env.JENKINS_URL || process.env.BUILD_ID),
    build_id: process.env.BUILD_ID || process.env.GITHUB_RUN_ID || "local",
    build_url: process.env.BUILD_URL || process.env.GITHUB_SERVER_URL || "local",
    actor: process.env.BUILD_USER_ID || process.env.GITHUB_ACTOR || process.env.USER || "unknown",
  },
  ai_asset_metadata: {
    agent_name: process.env.AI_AGENT_NAME || "",
    version: process.env.AI_AGENT_VERSION || "",
    prompt_id: process.env.AI_PROMPT_ID || "",
    reviewer: process.env.AI_REVIEWER || "",
    timestamp: process.env.AI_TIMESTAMP || "",
    audit_reference: process.env.AI_AUDIT_REFERENCE || "HMCTS-AI-2025-04",
  },
  report_configuration: {
    reporters: process.env.PLAYWRIGHT_REPORTERS || process.env.PLAYWRIGHT_DEFAULT_REPORTER || "default",
    odhin_output: process.env.PLAYWRIGHT_REPORT_FOLDER || process.env.PW_ODHIN_OUTPUT || "",
    junit_output: process.env.PLAYWRIGHT_JUNIT_OUTPUT || "playwright-junit.xml",
  },
  evidence: {
    odhin_reports: [
      exists("functional-output/tests/playwright-api/odhin-report"),
      exists("functional-output/tests/playwright-e2e/odhin-report"),
      exists("functional-output/tests/api_functional/odhin-report"),
    ],
    html_reports: [exists("playwright-report"), exists("test-results")],
    junit_reports: [
      exists("playwright-junit.xml"),
      exists("functional-output/tests/api_functional/playwright-junit.xml"),
    ],
    traceability_docs: [
      exists("docs/DECISIONS.md"),
      exists("docs/RESULT.md"),
      exists("docs/TRACEABILITY.md"),
    ],
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2));

console.log(`[ai-governance] wrote metadata: ${path.relative(root, outputPath)}`);
