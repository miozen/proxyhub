import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';

async function json(base, route, options = {}) {
  const response = await fetch(base + route, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return {
    response,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';', 1)[0]
  };
}

test('P3 acceptance: validates, versions, refreshes, caches and rolls back templates', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-p3-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  let remoteContent = { outbounds: [{ type: 'direct', tag: 'DIRECT-V1' }] };
  let remoteFailure = false;
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    singboxFetch: async () => {
      if (remoteFailure) throw new Error('remote_fixture_failed');
      return structuredClone(remoteContent);
    }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => {
    app.locals.stopBackgroundTasks?.();
    server.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  const owner = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  const headers = { cookie: owner.cookie, 'x-csrf-token': owner.body.csrf_token };

  let result = await json(base, '/api/admin/templates', {
    method: 'POST',
    headers,
    body: {
      source_type: 'local',
      content: {
        outbounds: [
          { type: 'direct', tag: 'DIRECT' },
          { type: 'selector', tag: 'BROKEN', outbounds: ['MISSING'] }
        ]
      }
    }
  });
  assert.equal(result.response.status, 400);
  assert.match(result.body.error, /template_reference_missing/);

  result = await json(base, '/api/admin/templates', {
    method: 'POST',
    headers,
    body: { source_type: 'remote', source_url: 'https://templates.example/config.json' }
  });
  assert.equal(result.response.status, 201);
  const v1 = result.body.id;
  await json(base, `/api/admin/templates/${v1}/activate`, { method: 'POST', headers });

  const token = await json(base, '/api/me/token/reset', { method: 'POST', headers });
  result = await json(base, `/api/generate?token=${encodeURIComponent(token.body.token)}`);
  assert.ok(result.body.outbounds.some((outbound) => outbound.tag === 'DIRECT-V1'));

  remoteFailure = true;
  result = await json(base, `/api/admin/templates/${v1}/refresh`, { method: 'POST', headers });
  assert.equal(result.response.status, 502);
  let detail = await json(base, `/api/admin/templates/${v1}`, { headers });
  assert.equal(detail.body.template.active, true);
  assert.equal(detail.body.template.status, 'error');
  assert.equal(detail.body.template.content.outbounds[0].tag, 'DIRECT-V1');
  result = await json(base, `/api/generate?token=${encodeURIComponent(token.body.token)}`);
  assert.ok(result.body.outbounds.some((outbound) => outbound.tag === 'DIRECT-V1'));

  remoteFailure = false;
  remoteContent = { outbounds: [{ type: 'direct', tag: 'DIRECT-V2' }] };
  result = await json(base, `/api/admin/templates/${v1}/refresh`, { method: 'POST', headers });
  assert.equal(result.response.status, 201);
  const v2 = result.body.id;
  assert.equal(result.body.parent_id, v1);
  detail = await json(base, `/api/admin/templates/${v1}`, { headers });
  assert.equal(detail.body.template.content.outbounds[0].tag, 'DIRECT-V1');

  result = await json(base, `/api/admin/templates/${v2}/versions`, {
    method: 'POST',
    headers,
    body: {
      source_type: 'local',
      content: { outbounds: [{ type: 'direct', tag: 'DIRECT-V3' }] }
    }
  });
  assert.equal(result.response.status, 201);
  const v3 = result.body.id;
  assert.equal(result.body.parent_id, v2);
  await json(base, `/api/admin/templates/${v3}/activate`, { method: 'POST', headers });
  result = await json(base, `/api/generate?token=${encodeURIComponent(token.body.token)}`);
  assert.ok(result.body.outbounds.some((outbound) => outbound.tag === 'DIRECT-V3'));

  result = await json(base, `/api/admin/templates/${v1}/rollback`, { method: 'POST', headers });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.rollback, true);
  assert.equal(result.body.previous_id, v3);
  result = await json(base, `/api/generate?token=${encodeURIComponent(token.body.token)}`);
  assert.ok(result.body.outbounds.some((outbound) => outbound.tag === 'DIRECT-V1'));
  assert.ok(!result.body.outbounds.some((outbound) => outbound.tag === 'DIRECT-V3'));

  const versions = await json(base, '/api/admin/templates', { headers });
  assert.equal(versions.body.templates.length, 3);
  assert.equal(new Set(versions.body.templates.map((item) => item.content_hash)).size, 3);
  assert.equal(versions.body.templates.find((item) => item.id === v1).active, 1);
  assert.equal(versions.body.templates.find((item) => item.id === v2).parent_id, v1);
  assert.equal(versions.body.templates.find((item) => item.id === v3).parent_id, v2);
});

