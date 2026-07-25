import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';

async function call(base, route, { body, ...options } = {}) {
  const response = await fetch(base + route, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

test('creates template and subscription then generates config by client token', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-singbox-'));
  const database = openDatabase(path.join(directory, 'db.sqlite'));
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    singboxFetch: async () => ({ outbounds: [{ type: 'vless', tag: 'HK-Node' }] })
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => { server.close(); database.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;

  await call(base, '/api/auth/register', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  const login = await call(base, '/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  const headers = { cookie: login.cookie, 'x-csrf-token': login.body.csrf_token };

  let result = await call(base, '/api/admin/templates', { method: 'POST', headers, body: {
    source_type: 'local',
    content: { outbounds: [{ type: 'direct', tag: 'DIRECT' }, { type: 'selector', tag: 'Select', x_rule: 'region:HK', outbounds: [] }] }
  } });
  assert.equal(result.response.status, 201);
  await call(base, `/api/admin/templates/${result.body.id}/activate`, { method: 'POST', headers });

  result = await call(base, '/api/subscriptions', { method: 'POST', headers, body: {
    name: 'Airport', url: 'https://example.com/sub.json', allowed_regions: ['HK']
  } });
  assert.equal(result.response.status, 201);

  const token = await call(base, '/api/me/token/reset', { method: 'POST', headers });
  result = await call(base, `/api/generate?token=${encodeURIComponent(token.body.token)}`);
  assert.equal(result.response.status, 200);
  assert.ok(result.body.outbounds.some((outbound) => outbound.tag === '[AUTO] HK-Airport'));
  assert.ok(result.body.outbounds.some((outbound) => outbound.tag === 'HK-Node'));
});



