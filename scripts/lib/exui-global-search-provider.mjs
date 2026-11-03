import fs from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { startProviderSeams, seedSyntheticSession } from './exui-provider-seams.mjs';
import { globalSearchReferenceRows, isGlobalSearchRequest } from './exui-global-search-contract.mjs';

export async function startGlobalSearchProviders(output, { seed = seedSyntheticSession } = {}) {
  const server = await startProviderSeams(output);
  try {
    const persona = seed(undefined, `harness-global-search-${randomUUID()}`);
    const cookie = `s:${persona.id}.${createHmac('sha256', 'synthetic-session-value').update(persona.id).digest('base64').replace(/=+$/, '')}`;
    fs.writeFileSync(`${output}/global-search-session.json`, JSON.stringify({ id: persona.id, seededGlobalSearchServices: false }));
    const original = server.listeners('request')[0];
    server.removeListener('request', original);
    const authGets = new Set(['/o/.well-known/openid-configuration', '/health', '/health/liveness', '/am/role-assignments/actors/harness-supervisor']);
    server.on('request', async (request, response) => {
      const port = request.socket.localPort, url = new URL(request.url, `http://127.0.0.1:${port}`);
      const reject = body => {
        fs.appendFileSync(`${output}/provider-rejections.jsonl`, JSON.stringify({ code: 'UNDECLARED_GLOBAL_SEARCH_REQUEST', port, method: request.method, path: request.url, body }) + '\n');
        response.writeHead(501, { 'content-type': 'application/json' });
        response.end('{"code":"UNDECLARED_GLOBAL_SEARCH_REQUEST"}');
      };
      try {
        if (port === 3101 && !url.search && (request.method === 'GET' && authGets.has(url.pathname) || request.method === 'POST' && url.pathname === '/lease'))
          return await original(request, response);
        let text = '';
        for await (const chunk of request) text += chunk;
        let body;
        try { body = text ? JSON.parse(text) : null; } catch { return reject(text); }
        let value;
        if (port === 3101 && request.method === 'GET' && !url.search && body === null && url.pathname === '/refdata/location/orgServices')
          value = globalSearchReferenceRows();
        else if (port === 3101 && request.method === 'POST' && !url.search && url.pathname === '/globalSearch' && isGlobalSearchRequest(body))
          value = { resultInfo: { casesReturned: 0, caseStartRecord: 1, moreResultsToGo: false }, results: [] };
        else if (port === 3101 && request.method === 'GET' && body === null && url.pathname === '/aggregated/caseworkers/harness-supervisor/jurisdictions' && url.searchParams.size === 1 && url.searchParams.get('access') === 'read')
          value = [];
        else return reject(body);
        fs.appendFileSync(`${output}/global-search-destinations.jsonl`, JSON.stringify({ port, method: request.method, path: url.pathname, query: [...url.searchParams], body }) + '\n');
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(value));
      } catch {
        fs.appendFileSync(`${output}/gateway-errors.jsonl`, '{"code":"GLOBAL_SEARCH_PROVIDER_FAILED"}\n');
        response.writeHead(502); response.end();
      }
    });
    return { server, cookie };
  } catch (error) {
    await new Promise(resolve => server.close(resolve));
    throw error;
  }
}
