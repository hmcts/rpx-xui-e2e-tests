import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function runHealthSmoke(status: number): Promise<{ exitCode: number; requests: number }> {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/health') requests++;
    if (status === 0) { request.socket.destroy(); return; }
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end('{}');
  });
  const output = await mkdtemp(path.join(tmpdir(), 'health-smoke-contract-'));
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local health server address unavailable');
    const exitCode = await new Promise<number>((resolve, reject) => {
      execFile(process.execPath, [
        'node_modules/@playwright/test/cli.js', 'test', 'src/tests/api/smoke.api.ts',
        '--project=api', '--retries=0', '--workers=1', `--output=${output}`,
      ], {
        cwd: process.cwd(),
        timeout: 20_000,
        env: { ...process.env, TEST_URL: `http://127.0.0.1:${address.port}`, PLAYWRIGHT_REPORTERS: 'list', PW_UI_STORAGE: '0', API_PW_INCLUDE_TAGS: '', API_PW_EXCLUDED_TAGS_OVERRIDE: '@none' },
      }, (error) => {
        if (error && (error.killed || typeof error.code !== 'number')) reject(error);
        else resolve(typeof error?.code === 'number' ? error.code : 0);
      });
    });
    return { exitCode, requests };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(output, { recursive: true, force: true });
  }
}
