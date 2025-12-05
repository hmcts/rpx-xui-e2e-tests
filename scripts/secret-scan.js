#!/usr/bin/env node
/*
 Simple secret scan to catch obvious credential leakage before commit.
 For comprehensive scanning integrate Gitleaks or TruffleHog in CI.
*/
import { execSync } from "node:child_process";
import fs from "node:fs";

const trackedFiles = execSync("git ls-files", { encoding: "utf-8" })
  .split("\n")
  .filter(Boolean)
  // Ignore vendored / tool artifact directories
  .filter((f) => !f.startsWith(".yarn/"))
  .filter((f) => !f.startsWith("node_modules/"))
  // Limit to relevant text-based source & config files
  .filter((f) => /\.(ts|js|json|md|yml|yaml|env|toml|txt)$/i.test(f));

const patterns = [
  /IDAM_SECRET=.+\S/,
  /S2S_SECRET=.+\S/,
  /COURTNAV_SECRET=.+\S/,
  /AKIA[0-9A-Z]{16}/, // AWS access key pattern
  /("|')?xuiwebapp("|')?\s*[:=]\s*[A-Za-z0-9_\-]{20,}/,
];

const allowlist = new Set([".env.example"]);

let findings = [];
for (const file of trackedFiles) {
  if (allowlist.has(file)) continue;
  if (!fs.existsSync(file) || fs.lstatSync(file).isDirectory()) continue;
  const content = fs.readFileSync(file, "utf-8");
  patterns.forEach((p) => {
    const match = content.match(p);
    if (match) {
      findings.push({ file, match: match[0] });
    }
  });
}

if (findings.length) {
  console.error("Potential secret disclosures detected:");
  for (const f of findings) {
    console.error(` - ${f.file}: ${f.match}`);
  }
  process.exit(1);
} else {
  console.log("Secret scan passed: no high-risk patterns found.");
}
