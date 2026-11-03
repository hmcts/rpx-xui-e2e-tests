/* global require, process */
const Reporter = require('./harness-public-odhin-reporter.cjs');

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--reset') {
    for (const selection of ['support', 'model']) Reporter.resetPublicReport(selection);
  } else if (args.length === 2 && args[0] === '--validate' && ['support', 'model'].includes(args[1])) {
    Reporter.validatePublicReport(args[1]);
  } else {
    throw new Error('INVALID_PUBLIC_REPORT_COMMAND');
  }
} catch {
  console.error('[harness-report] Public Odhín report validation or reset failed.');
  process.exitCode = 2;
}
