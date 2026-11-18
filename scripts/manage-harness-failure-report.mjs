import fs from 'node:fs';
import path from 'node:path';
import { resetFailureReport, validateFailureReport, writeFailureReport } from './lib/exui-harness-failure-report.mjs';

const [action, directory, hint, ...extra] = process.argv.slice(2);
try {
  if (!['--validate', '--reset', '--ensure'].includes(action) || !directory || extra.length || (hint !== undefined && (action !== '--ensure' || hint !== 'reporting'))) throw new Error('HARNESS_FAILURE_REPORT_USAGE');
  if (action === '--reset') resetFailureReport(directory);
  else if (action === '--ensure' && ['failure.json', 'index.html'].every(name => !fs.lstatSync(path.join(directory, name), { throwIfNoEntry: false }))) {
    writeFailureReport(directory, {
      ...(/^[a-f0-9]{40}$/i.test(process.env.GIT_COMMIT ?? '') ? { commit: process.env.GIT_COMMIT } : {}),
      ...(/^[1-9][0-9]{0,19}$/.test(process.env.BUILD_NUMBER ?? '') ? { buildNumber: process.env.BUILD_NUMBER } : {}),
      primary: { phase: hint === 'reporting' ? 'reporting' : 'preparation', failure: { reason: hint === 'reporting' ? 'HARNESS_REPORT_PUBLICATION_FAILED' : 'HARNESS_NATIVE_PREPARATION_FAILED' }, cleanup: 'unknown' },
      reportedPhases: [],
    });
  } else {
    const value = validateFailureReport(directory);
    if (action === '--ensure' && hint === 'reporting') writeFailureReport(directory, { ...value, reportingFailure: { reason: 'HARNESS_REPORT_PUBLICATION_FAILED' } });
  }
} catch {
  console.error('Harness failure report operation failed.');
  process.exitCode = 1;
}
