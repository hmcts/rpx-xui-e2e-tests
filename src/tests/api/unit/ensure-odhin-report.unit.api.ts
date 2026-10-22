import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);

const ensureReport = require('../../../../scripts/ensure-odhin-report.cjs') as {
  ensureOdhinReport: (options: { reportDir: string; reportFile?: string; suiteName?: string }) => {
    created: boolean;
    reportPath: string;
  };
  parseArgs: (argv: string[]) => { reportDir: string; reportFile: string; suiteName: string };
};

test.describe('ensure Odhín report script', { tag: '@svc-internal' }, () => {
  let reportDir: string;

  test.beforeEach(() => {
    reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'odhin-report-'));
  });

  test.afterEach(() => {
    fs.rmSync(reportDir, { recursive: true, force: true });
  });

  test('preserves an existing generated report', () => {
    const reportPath = path.join(reportDir, 'xui-playwright-integration.html');
    const bytes = Buffer.from('<html>\r\n<body>real Odhín report — π</body></html>\n');
    fs.writeFileSync(reportPath, bytes);

    const result = ensureReport.ensureOdhinReport({
      reportDir,
      reportFile: 'xui-playwright-integration.html',
      suiteName: 'Integration',
    });

    expect(result).toEqual({ created: false, reportPath });
    expect(fs.readFileSync(reportPath)).toEqual(bytes);
  });

  test('creates a fallback report when Odhín did not write HTML', () => {
    const result = ensureReport.ensureOdhinReport({
      reportDir,
      reportFile: 'xui-playwright-integration.html',
      suiteName: 'AAT Playwright Integration Test',
    });

    expect(result.created).toBe(true);
    const html = fs.readFileSync(result.reportPath, 'utf8');
    expect(html).toContain('AAT Playwright Integration Test');
    expect(html).toContain('Odhín HTML report is unavailable.');
    expect(html).toContain('Test results are unavailable in this report');
    expect(html).not.toMatch(/integration command failed|failed integration runs|never ran|not run|\b\d+ passed\b/i);
    expect(html).toContain('xui-playwright-integration.html');
  });

  test('escapes the caller label without inventing why results are unavailable', () => {
    const result = ensureReport.ensureOdhinReport({
      reportDir,
      reportFile: 'nightly.html',
      suiteName: 'UI <script> & "quoted" \'label\'',
    });
    const html = fs.readFileSync(result.reportPath, 'utf8');
    expect(html).toContain('UI &lt;script&gt; &amp; &quot;quoted&quot; &#39;label&#39;');
    expect(html).not.toContain('<script>');
  });

  for (const reportFile of [undefined, 'playwright-odhin.html', 'playwright-odhin-integration.html', 'playwright-odhin-integration-nightly.html']) {
    test(`retains the ${reportFile ?? 'legacy default'} filename and existing bytes`, () => {
      const options = { reportDir, reportFile, suiteName: 'Neighbouring suite' };
      const result = ensureReport.ensureOdhinReport(options);
      expect(result).toEqual({ created: true, reportPath: path.join(reportDir, reportFile ?? 'xui-playwright-integration.html') });
      const bytes = fs.readFileSync(result.reportPath);
      expect(bytes.toString()).toContain('Test results are unavailable in this report');
      expect(ensureReport.ensureOdhinReport(options)).toEqual({ created: false, reportPath: result.reportPath });
      expect(fs.readFileSync(result.reportPath)).toEqual(bytes);
    });
  }

  test('CLI options override environment, which overrides the legacy defaults', () => {
    const script = require.resolve('../../../../scripts/ensure-odhin-report.cjs');
    const cases = [
      { name: 'default', env: {}, args: [], file: 'xui-playwright-integration.html', label: 'Playwright Integration Test' },
      { name: 'environment', env: { PLAYWRIGHT_REPORT_INDEX_FILENAME: 'environment.html', PW_ODHIN_FALLBACK_SUITE_NAME: 'Environment suite' }, args: [], file: 'environment.html', label: 'Environment suite' },
      { name: 'cli', env: { PLAYWRIGHT_REPORT_INDEX_FILENAME: 'environment.html', PW_ODHIN_FALLBACK_SUITE_NAME: 'Environment suite' }, args: ['--report-file', 'cli.html', '--suite-name', 'CLI suite'], file: 'cli.html', label: 'CLI suite' },
    ];
    for (const scenario of cases) {
      const target = path.join(reportDir, scenario.name);
      const result = spawnSync(process.execPath, [script, '--report-dir', target, ...scenario.args], {
        cwd: reportDir,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, PLAYWRIGHT_REPORT_FOLDER: path.join(reportDir, 'unused-env-directory'), ...scenario.env },
      });
      expect(result.status, result.stderr).toBe(0);
      const html = fs.readFileSync(path.join(target, scenario.file), 'utf8');
      expect(html).toContain(`<h1>${scenario.label}</h1>`);
      expect(fs.existsSync(path.join(reportDir, 'unused-env-directory'))).toBe(false);
    }
  });

  test('parses Jenkins CLI arguments', () => {
    expect(
      ensureReport.parseArgs([
        '--report-dir',
        'functional-output/tests/playwright-integration/odhin-report/aat-workers-4',
        '--report-file',
        'xui-playwright-integration.html',
        '--suite-name',
        'AAT Playwright Integration Test (4 workers)',
      ])
    ).toEqual({
      reportDir: 'functional-output/tests/playwright-integration/odhin-report/aat-workers-4',
      reportFile: 'xui-playwright-integration.html',
      suiteName: 'AAT Playwright Integration Test (4 workers)',
    });
  });
});
