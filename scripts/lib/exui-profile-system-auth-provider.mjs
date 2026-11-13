import { isDeepStrictEqual } from 'node:util';

// Only the existing isolated candidate's fixed synthetic system-user exchange.
// No auth request, token or credential is published to the provider journal.
export async function handleProfileSystemAuth(request, response) {
  if (request.method !== 'POST' || request.url !== '/o/token') return false;
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size <= 4096) chunks.push(bytes);
    }
  } catch { return false; }
  if (size > 4096) return false;
  const actual = [...new URLSearchParams(Buffer.concat(chunks).toString('utf8'))].sort();
  const expected = Object.entries({ grant_type: 'password', password: 'synthetic-password', username: 'synthetic-user', scope: 'openid profile roles manage-user create-user search-user', client_id: 'xuiwebapp', client_secret: 'synthetic-client-value' }).sort();
  if (!isDeepStrictEqual(actual, expected)) return false;
  // The candidate decodes JWT expiry when reusing the system-user credential cache.
  const token = ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify({ sub: 'synthetic-user', exp: 4102444800 })).toString('base64url'), 'synthetic'].join('.');
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ access_token: token }));
  return true;
}
