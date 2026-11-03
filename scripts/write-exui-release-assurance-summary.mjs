import fs from 'node:fs';
import path from 'node:path';
import { getReleasePolicy } from './lib/exui-release-policy.mjs';
import { loadRunEvidence, writeJsonAtomic, writePublicSummary, validatePublicSummary } from './lib/exui-evidence-io.mjs';

const args = process.argv.slice(2);
if (args[0] === '--validate-public-summary') {
  try {
    if (args.length !== 2) throw new Error('INVALID_ARGUMENTS');
    validatePublicSummary(path.resolve(args[1]));
    process.exit(0);
  } catch {
    console.error('[harness-release-summary] BLOCKED: unsafe or missing public artifact');
    process.exit(2);
  }
}
const publicPath = path.resolve('functional-output/tests/harness/public/release-assurance-summary.json');
let verdict = { status: 'BLOCKED', exitCode: 2, reasons: ['RUN_EVIDENCE_REQUIRED'] };
const runPath = args.length === 2 && args[0] === '--run' && args[1] ? path.resolve(args[1]) : null;
const gatePath = runPath ? path.join(path.dirname(runPath), 'gate.json') : null;
let failureCode = 'SUMMARY_PUBLICATION_FAILED';
try {
  for (const file of [gatePath, publicPath].filter(Boolean)) fs.rmSync(file, { force: true });
  writePublicSummary(publicPath, verdict, false);
  failureCode = 'RUN_EVIDENCE_UNAVAILABLE_OR_INVALID';
  if (args.length !== 2 || args[0] !== '--run') throw new Error('RUN_EVIDENCE_REQUIRED');
  const header = JSON.parse(fs.readFileSync(runPath, 'utf8'));
  const policy = getReleasePolicy(header.manifest?.releaseScopeId);
  const { receipt } = loadRunEvidence(runPath, policy);
  verdict = receipt.verdict;
  failureCode = 'SUMMARY_PUBLICATION_FAILED';
  writePublicSummary(publicPath, verdict, true);
  // The machine receipt is the final commit: public publication must succeed first.
  failureCode = 'GATE_PUBLICATION_FAILED';
  writeJsonAtomic(gatePath, receipt);
} catch {
  // Raw parser, path and framework errors can contain secrets; publish fixed reason codes only.
  verdict = { status: 'BLOCKED', exitCode: 2, reasons: [...verdict.reasons, failureCode] };
  for (const file of [gatePath, publicPath].filter(Boolean)) {
    try { fs.rmSync(file, { force: true }); } catch { /* The producer must still report failed finalization if cleanup is unavailable. */ }
  }
  try { writePublicSummary(publicPath, verdict, false); } catch { /* Best effort; never replace the nonzero exit. */ }
}
console.log(`[harness-release-summary] ${verdict.status}; full EXUI release approval unavailable`);
process.exitCode = verdict.exitCode;
