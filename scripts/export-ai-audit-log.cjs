#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const inputPath = path.resolve(
  root,
  process.env.AI_AUDIT_METADATA_OUTPUT ||
    "functional-output/tests/governance/ai-audit-metadata.json",
);
const outputPath = path.resolve(
  root,
  process.env.AI_AUDIT_EXPORT_OUTPUT ||
    "functional-output/tests/governance/ai-audit-events.jsonl",
);

if (!fs.existsSync(inputPath)) {
  console.log(
    `[ai-governance] metadata not found, skipping export: ${path.relative(root, inputPath)}`,
  );
  process.exit(0);
}

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const event = {
  event_type: "hmcts.ai.audit.metadata",
  generated_at: payload.generated_at,
  repo_name: payload?.repository?.name,
  branch: payload?.repository?.branch,
  commit_sha: payload?.repository?.commit_sha,
  build_id: payload?.build?.build_id,
  build_url: payload?.build?.build_url,
  actor: payload?.build?.actor,
  agent_name: payload?.ai_asset_metadata?.agent_name || "",
  agent_version: payload?.ai_asset_metadata?.version || "",
  prompt_id: payload?.ai_asset_metadata?.prompt_id || "",
  reviewer: payload?.ai_asset_metadata?.reviewer || "",
  timestamp: payload?.ai_asset_metadata?.timestamp || "",
  audit_reference: payload?.ai_asset_metadata?.audit_reference || "",
  reporters: payload?.report_configuration?.reporters || "",
  evidence_paths: {
    odhin_reports: (payload?.evidence?.odhin_reports || []).map((x) => x.path),
    html_reports: (payload?.evidence?.html_reports || []).map((x) => x.path),
    junit_reports: (payload?.evidence?.junit_reports || []).map((x) => x.path),
    traceability_docs: (payload?.evidence?.traceability_docs || []).map(
      (x) => x.path,
    ),
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(event)}\n`);

console.log(
  `[ai-governance] exported JSONL event: ${path.relative(root, outputPath)}`,
);
