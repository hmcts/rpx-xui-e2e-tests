import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { reportTests } from './benchmark-harness-transform.mjs';

assert.equal(process.versions.node, '24.22.2');
const output = mkdtempSync(path.join(tmpdir(), 'harness-reporting-'));
let ids;
const observations = [];
for (const namedFailure of [false, true]) {
  const directory = path.join(output, namedFailure ? 'named-failure' : 'passing');
  const command = ['node_modules/@playwright/test/cli.js', 'test', '-c', 'playwright.harness-reporting.config.ts'];
  const child = spawnSync(process.execPath, command, {
    encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env, EXUI_REPORTING_OUTPUT: directory, EXUI_REPORTING_NAMED_FAILURE: namedFailure ? 'on' : 'off',
      PLAYWRIGHT_JSON_OUTPUT_FILE: `${directory}/playwright.json`, PLAYWRIGHT_JUNIT_OUTPUT_FILE: `${directory}/junit.xml`,
      PLAYWRIGHT_JSON_ONLY_FAILURES: 'false', PLAYWRIGHT_JUNIT_ONLY_FAILURES: 'false'
    }
  });
  const terminal = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  writeFileSync(`${directory}/terminal.log`, terminal);
  assert.equal(child.status, namedFailure ? 1 : 0, terminal);
  const tests = reportTests(JSON.parse(readFileSync(`${directory}/playwright.json`)));
  assert.equal(tests.length, 2, 'JSON must retain the passing test as well as the failure');
  const observedIds = tests.map(test => test.id);
  if (ids) assert.deepEqual(observedIds, ids); else ids = observedIds;
  assert.equal(new Set(ids).size, 2);
  const xml = parse(readFileSync(`${directory}/junit.xml`, 'utf8'), { lowerCaseTagName: true });
  const junitTests = xml.querySelectorAll('testcase');
  assert.equal(junitTests.length, 2);
  const html = parse(readFileSync(`${directory}/odhin-report/reporting.html`, 'utf8'));
  const rows = html.querySelectorAll('tr').filter(row => /result-status-(passed|failed)/.test(row.getAttribute('class') ?? ''));
  assert.equal(rows.length, 2, 'Odhin must retain all outcomes');
  for (const title of ['REPORTING_PASS_ID', 'REPORTING_NAMED_FAILURE_ID']) {
    const expected = namedFailure && title === 'REPORTING_NAMED_FAILURE_ID' ? 'failed' : 'passed';
    assert.equal(tests.find(test => test.title === title)?.status, expected);
    const junit = junitTests.find(test => test.getAttribute('name') === title);
    assert.ok(junit, `JUnit missing ${title}`);
    assert.equal(Boolean(junit.querySelector('failure')), expected === 'failed');
    const row = rows.find(row => row.text.includes(title));
    assert.ok(row, `Odhin missing ${title}`);
    assert.ok(row.classList.contains(`result-status-${expected}`));
  }
  if (namedFailure) assert.match(terminal, /REPORTING_NAMED_FAILURE_ID/);
  observations.push({ namedFailure, exitCode: child.status, tests, command, output: directory });
}
writeFileSync(`${output}/proof.json`, `${JSON.stringify(observations, null, 2)}\n`);
console.log(`${output}/proof.json`);
