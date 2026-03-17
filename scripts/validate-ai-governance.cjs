#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const metadataPath = path.resolve(
  root,
  process.env.AI_AUDIT_METADATA_OUTPUT ||
    "functional-output/tests/governance/ai-audit-metadata.json",
);

const strict = String(process.env.AI_GOVERNANCE_STRICT || "0") === "1";
const aiAssisted = String(process.env.AI_ASSISTED || "0") === "1";

const errors = [];
const warnings = [];

if (!fs.existsSync(metadataPath)) {
  errors.push(`missing metadata file: ${path.relative(root, metadataPath)}`);
} else {
  const raw = fs.readFileSync(metadataPath, "utf8");
  const payload = JSON.parse(raw);

  const requiredMetadataKeys = [
    "agent_name",
    "version",
    "prompt_id",
    "reviewer",
    "timestamp",
    "audit_reference",
  ];

  for (const key of requiredMetadataKeys) {
    const value = payload?.ai_asset_metadata?.[key];
    if (!value || String(value).trim().length === 0) {
      if (aiAssisted) {
        errors.push(`ai_asset_metadata.${key} is required when AI_ASSISTED=1`);
      } else {
        warnings.push(`ai_asset_metadata.${key} is not populated`);
      }
    }
  }

  const anyOdhin = (payload?.evidence?.odhin_reports || []).some((x) => x.exists);
  const anyJUnit = (payload?.evidence?.junit_reports || []).some((x) => x.exists);

  if (!anyOdhin) {
    warnings.push("no Odhin report path detected");
  }
  if (!anyJUnit) {
    warnings.push("no JUnit report path detected");
  }
}

if (warnings.length) {
  console.log("[ai-governance] warnings:");
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}

if (errors.length) {
  console.error("[ai-governance] errors:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
}

if (strict && errors.length) {
  process.exit(1);
}

console.log(
  `[ai-governance] validation complete (strict=${strict ? "on" : "off"}, ai_assisted=${aiAssisted ? "on" : "off"})`,
);
