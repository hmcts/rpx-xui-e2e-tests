import fs from 'node:fs';
import path from 'node:path';
import { digestBytes } from './lib/exui-evidence-io.mjs';
import { validatePromotionReceipt } from './lib/exui-release-evidence.mjs';

let verdict = { status: 'BLOCKED', exitCode: 2 };
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--receipt' || args[2] !== '--expected') throw new Error('INVALID_ARGUMENTS');
  const receiptPath = fs.realpathSync(path.resolve(args[1]));
  const expectedPath = fs.realpathSync(path.resolve(args[3]));
  if (receiptPath === expectedPath) throw new Error('EXPECTED_IDENTITY_MUST_BE_INDEPENDENT');
  const bytes = fs.readFileSync(receiptPath);
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  // The deployment job obtains this digest from the immutable producer artifact, independently of these bytes.
  if (expected.receiptArtifactDigest !== digestBytes(bytes)) throw new Error('RECEIPT_ARTIFACT_MISMATCH');
  verdict = validatePromotionReceipt(JSON.parse(bytes), expected);
} catch {
  verdict = { status: 'BLOCKED', exitCode: 2 };
}
console.log(`[harness-release-gate] ${verdict.status}`);
process.exitCode = verdict.exitCode;
