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
let receiptWritten = false;
try {
  if (args.length !== 2 || args[0] !== '--run') throw new Error('RUN_EVIDENCE_REQUIRED');
  const runPath = path.resolve(args[1]);
  fs.rmSync(path.join(path.dirname(runPath), 'gate.json'), { force: true });
  const header = JSON.parse(fs.readFileSync(runPath, 'utf8'));
  const policy = getReleasePolicy(header.manifest?.releaseScopeId);
  const { receipt } = loadRunEvidence(runPath, policy);
  verdict = receipt.verdict;
  writeJsonAtomic(path.join(path.dirname(runPath), 'gate.json'), receipt);
  receiptWritten = true;
} catch {
  // Raw parser, path and framework errors can contain secrets; publish fixed reason codes only.
  verdict = { status: 'BLOCKED', exitCode: 2, reasons: ['RUN_EVIDENCE_UNAVAILABLE_OR_INVALID'] };
}

try {
  writePublicSummary(publicPath, verdict, receiptWritten);
} catch {
  verdict = { status: 'BLOCKED', exitCode: 2, reasons: ['SUMMARY_PUBLICATION_FAILED'] };
}
console.log(`[harness-release-summary] ${verdict.status}; full EXUI release approval unavailable`);
process.exitCode = verdict.exitCode;
