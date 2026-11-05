import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { replaySharedRoleNativeBindings } from './lib/exui-shared-role-native-binding.mjs';
import { writeJsonAtomic } from './lib/exui-evidence-io.mjs';

const names = ['--candidate-artifact', '--ccd-phase', '--event-phase', '--output', '--ccd-source-inputs'];
try {
  const args = process.argv.slice(2), options = {};
  if (![8, 10].includes(args.length)) throw new Error('SHARED_ROLE_ARGUMENTS');
  for (let index = 0; index < args.length; index += 2) {
    if (!names.includes(args[index]) || Object.hasOwn(options, args[index]) || !path.isAbsolute(args[index + 1] ?? '')) throw new Error('SHARED_ROLE_ARGUMENTS');
    options[args[index]] = args[index + 1];
  }
  if (!names.slice(0,4).every(name => options[name])) throw new Error('SHARED_ROLE_ARGUMENTS');
  const result = await replaySharedRoleNativeBindings({
    harnessRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    candidateArtifactPath: options['--candidate-artifact'],
    ccdPhaseDirectory: options['--ccd-phase'],
    eventPhaseDirectory: options['--event-phase'],
    ...(options['--ccd-source-inputs'] ? { sourceImageInputs: JSON.parse(fs.readFileSync(options['--ccd-source-inputs'], 'utf8')) } : {}),
  });
  writeJsonAtomic(options['--output'], result);
  console.log(JSON.stringify({ status: 'BLOCKED', bindingStatus: result.bindingStatus, catalogueCredit: false, missingAcceptanceEvidence: result.missingAcceptanceEvidence }));
  process.exitCode = 2;
} catch (error) {
  // Assertions may contain private actual/expected values. Public diagnostics are codes only.
  const code = /^SHARED_ROLE_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'SHARED_ROLE_EVIDENCE_REJECTED';
  console.log(JSON.stringify({ status: 'BLOCKED', code, catalogueCredit: false }));
  process.exitCode = 2;
}
