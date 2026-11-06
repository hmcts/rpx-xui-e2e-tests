/* global module, require, process */
const path = require('node:path');
const { fullMachineReporters } = require('./harness-reporting.cjs');
const { existsSync } = require('node:fs');

const selections = Object.freeze({
  model: [
    'src/tests/api/exui-central-assurance.api.ts',
    'src/tests/api/exui-historic-replay-packs.api.ts'
  ],
  environment: ['src/tests/harness/diagnostic/configuration.spec.ts'],
  toolkit: ['src/tests/harness/diagnostic/toolkit.spec.ts']
});

function validateHttpUrl(value) {
  let target;
  try { target = new URL(value); } catch { throw new Error('DIAGNOSTIC_HTTP_TARGET_REQUIRED'); }
  if (value.trim() !== value || !['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) {
    throw new Error('DIAGNOSTIC_HTTP_TARGET_REQUIRED');
  }
}

function buildConfig(env = process.env) {
  const selection = env.EXUI_DIAGNOSTIC_SELECTION || 'model';
  if (!Object.hasOwn(selections, selection)) throw new Error('UNKNOWN_HARNESS_DIAGNOSTIC_SELECTION');
  let baseURL = "http://127.0.0.1:3455";
  if (selection === 'environment') {
    if (!env.TEST_URL || !['local', 'aat', 'demo'].includes(env.TEST_ENV)) {
      throw new Error('DIAGNOSTIC_TEST_URL_AND_TEST_ENV_REQUIRED');
    }
    validateHttpUrl(env.TEST_URL);
    if (!env.IDAM_WEB_URL) throw new Error('DIAGNOSTIC_IDAM_WEB_URL_REQUIRED');
    validateHttpUrl(env.IDAM_WEB_URL);
    if (selection === 'environment' && env.API_AUTH_MODE && env.API_AUTH_MODE !== 'ui') {
      throw new Error('DIAGNOSTIC_UI_SESSION_AUTH_REQUIRED');
    }
    baseURL = env.TEST_URL;
  }
  if (selection.startsWith('toolkit') && (!env.XUI_WEBAPP_ROOT || !path.isAbsolute(env.XUI_WEBAPP_ROOT))) {
    throw new Error('DIAGNOSTIC_EXPLICIT_TOOLKIT_ROOT_REQUIRED');
  }
  if (selection.startsWith('toolkit') && !existsSync(path.join(env.XUI_WEBAPP_ROOT, 'node_modules/@hmcts/ccd-case-ui-toolkit/package.json'))) {
    throw new Error('DIAGNOSTIC_INSTALLED_TOOLKIT_REQUIRED');
  }
  const output = `functional-output/tests/harness/private/diagnostics/${selection}`;
  const reporter = [['failures'], ...fullMachineReporters(output, env)];
  if (env.EXUI_DIAGNOSTIC_ODHIN === '1') {
    reporter.push(['./src/tests/common/reporters/odhin-adaptive.reporter.cjs', {
      outputFolder: `${output}/odhin-report`, indexFilename: 'harness-diagnostic.html',
      title: `Harness ${selection} diagnostic — no release credit`,
      testEnvironment: selection, project: 'EXUI Harness diagnostics',
      startServer: false, profile: false, consoleLog: false, consoleError: false,
      testOutput: 'only-on-failure', apiLogs: 'summary', lightweight: true
    }]);
  }
  return {
    testDir: '.', testMatch: [...selections[selection]],
    outputDir: `${output}/test-results`, reporter,
    workers: 1, retries: 0, fullyParallel: false, forbidOnly: true,
    timeout: 90000, expect: { timeout: 15000 },
    use: {
      baseURL, browserName: 'chromium', headless: true,
      timezoneId: 'Europe/London', storageState: { cookies: [], origins: [] },
      trace: 'off', screenshot: 'only-on-failure', video: 'off',
      ...(env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: env.PW_CHROMIUM_PATH } } : {})
    }
  };
}

module.exports = { buildConfig, selections };
