const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

// Execute the actual Jenkins shell guard with a controlled browser package.
for (const pipeline of ['Jenkinsfile_CNP', 'Jenkinsfile_nightly']) {
  test(`${pipeline}: unavailable browsers stop the suite; valid browsers permit it`, () => {
    const source = readFileSync(pipeline, 'utf8');
    const line = source.split('\n').find((entry) => !entry.includes('def ') && (entry.includes('${command}') || entry.includes('${shellCommand}')));
    assert.ok(line, 'suite shell command exists');
    const directory = mkdtempSync(join(tmpdir(), 'playwright-preflight-'));
    try {
      mkdirSync(join(directory, 'scripts'));
      mkdirSync(join(directory, 'node_modules/@playwright/test'), { recursive: true });
      writeFileSync(join(directory, 'scripts/verify-playwright-browsers.cjs'), readFileSync('scripts/verify-playwright-browsers.cjs'));
      writeFileSync(join(directory, 'node_modules/@playwright/test/index.js'), `
        const fs = require('node:fs');
        for (const name of ['chromium', 'firefox', 'webkit']) exports[name] = {
          executablePath: () => process.env.FAIL_BROWSER === name && process.env.FAIL_MODE === 'missing' ? '/missing/browser' : process.execPath,
          launch: async () => {
            if (process.env.FAIL_BROWSER === name && process.env.FAIL_MODE === 'launch') throw Error('Browser launch failed');
            fs.appendFileSync('verified', name + '\\n');
            return { close: async () => {} };
          }
        };
      `);
      const browsers = pipeline === 'Jenkinsfile_CNP' ? 'chromium' : 'firefox webkit';
      const shell = line
        .replace('${browsers ? "node scripts/verify-playwright-browsers.cjs ${browsers} &&" : ""}', `node scripts/verify-playwright-browsers.cjs ${browsers} &&`)
        .replace('${browsers}', browsers)
        .replace(/\$\{(?:shellCommand|command)\}/g, 'touch suite-started');
      for (const browser of browsers.split(' ')) {
        for (const mode of ['missing', 'launch']) {
          const result = spawnSync('bash', ['-c', shell], { cwd: directory, env: { ...process.env, FAIL_BROWSER: browser, FAIL_MODE: mode } });
          assert.notEqual(result.status, 0, `${browser} ${mode} must fail`);
          assert.equal(existsSync(join(directory, 'suite-started')), false, 'suite must not execute after failed preflight');
        }
      }
      rmSync(join(directory, 'verified'), { force: true });
      const success = spawnSync('bash', ['-c', shell], { cwd: directory, env: { ...process.env, FAIL_BROWSER: '' } });
      assert.equal(success.status, 0, success.stderr.toString());
      assert.equal(existsSync(join(directory, 'suite-started')), true);
      assert.deepEqual(readFileSync(join(directory, 'verified'), 'utf8').trim().split('\n').sort(), browsers.split(' ').sort());
      const suiteFailure = spawnSync('bash', ['-c', shell.replace('touch suite-started', 'exit 23')], { cwd: directory, env: { ...process.env, FAIL_BROWSER: '' } });
      assert.equal(suiteFailure.status, 23, 'test failure must remain a failure');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
