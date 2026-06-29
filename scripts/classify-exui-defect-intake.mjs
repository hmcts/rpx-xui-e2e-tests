import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const rulesPath = path.join(repoRoot, "src/data/exui-defect-intake-rules.json");
const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
const text = process.argv.slice(2).join(" ").trim();

if (!text) {
  console.error("Usage: yarn harness:defect-intake -- \"<defect title or notes>\"");
  process.exit(1);
}

const lowerText = text.toLowerCase();
const rule =
  rules.find((candidate) => candidate.signalTerms.some((term) => lowerText.includes(term))) ??
  rules.find((candidate) => candidate.route === "owner-confirmed-follow-up");

if (!rule) {
  console.error("No owner-confirmed follow-up route is configured.");
  process.exit(1);
}

const decision = {
  route: rule.route,
  ruleId: rule.id,
  target: rule.target,
  requiredEvidence: rule.requiredEvidence,
  rationale: rule.rationale
};

console.log(JSON.stringify(decision, null, 2));
