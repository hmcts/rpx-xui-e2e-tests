import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaySharedRoleNativeBindings } from './lib/exui-shared-role-native-binding.mjs';
import { writeJsonAtomic } from './lib/exui-evidence-io.mjs';

const names = ['--candidate-artifact', '--ccd-phase', '--event-phase', '--output'];
try {
  const args = process.argv.slice(2), options = {};
  if (args.length !== names.length * 2) throw new Error('SHARED_ROLE_ARGUMENTS');
  for (let index = 0; index < args.length; index += 2) {
    if (!names.includes(args[index]) || Object.hasOwn(options, args[index]) || !path.isAbsolute(args[index + 1] ?? '')) throw new Error('SHARED_ROLE_ARGUMENTS');
    options[args[index]] = args[index + 1];
  }
  const result = await replaySharedRoleNativeBindings({
    harnessRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    candidateArtifactPath: options['--candidate-artifact'],
    ccdPhaseDirectory: options['--ccd-phase'],
    eventPhaseDirectory: options['--event-phase'],
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
