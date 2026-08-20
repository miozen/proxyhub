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

test('P3 acceptance: each user manages isolated default templates', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-p3-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    singboxFetch: async (url) => {
      if (url.includes('/member')) return { outbounds: [{ type: 'vless', tag: 'US-Member' }] };
      return { outbounds: [{ type: 'vless', tag: 'HK-Owner' }] };
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
  await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });
  const owner = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  const ownerHeaders = { cookie: owner.cookie, 'x-csrf-token': owner.body.csrf_token };
  const memberId = database.prepare("SELECT id FROM users WHERE username='member'").get().id;
  await json(base, `/api/admin/users/${memberId}/approve`, { method: 'POST', headers: ownerHeaders });
  const member = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });
  const memberHeaders = { cookie: member.cookie, 'x-csrf-token': member.body.csrf_token };

  let result = await json(base, '/api/templates', {
    method: 'POST',
    headers: ownerHeaders,
    body: {
      name: 'Broken',
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

  result = await json(base, '/api/templates', {
    method: 'POST',
    headers: ownerHeaders,
    body: { name: 'Owner HK', content: { outbounds: [{ type: 'direct', tag: 'OWNER-DIRECT' }] } }
  });
  assert.equal(result.response.status, 201);
  const ownerFirst = result.body.id;
  assert.equal(result.body.is_default, true);

  result = await json(base, '/api/templates', {
    method: 'POST',
    headers: ownerHeaders,
    body: { name: 'Owner Alt', content: { outbounds: [{ type: 'direct', tag: 'OWNER-ALT' }] } }
  });
  const ownerSecond = result.body.id;
  assert.equal(result.body.is_default, false);
  await json(base, `/api/templates/${ownerSecond}/default`, { method: 'POST', headers: ownerHeaders });

  result = await json(base, `/api/templates/${ownerFirst}`, {
    method: 'PUT',
    headers: ownerHeaders,
    body: { name: 'Owner Renamed', content: { outbounds: [{ type: 'direct', tag: 'OWNER-RENAMED' }] } }
  });
  assert.equal(result.response.status, 200);

  result = await json(base, `/api/templates/${ownerSecond}`, { headers: memberHeaders });
  assert.equal(result.response.status, 404);
  result = await json(base, `/api/templates/${ownerSecond}`, {
    method: 'PUT', headers: memberHeaders, body: { name: 'Stolen' }
  });
  assert.equal(result.response.status, 404);

  result = await json(base, '/api/templates', {
    method: 'POST',
    headers: memberHeaders,
    body: { name: 'Member US', content: { outbounds: [{ type: 'direct', tag: 'MEMBER-DIRECT' }] } }
  });
  assert.equal(result.response.status, 201);

  await json(base, '/api/subscriptions', {
    method: 'POST', headers: ownerHeaders,
    body: { name: 'OwnerAirport', url: 'https://example.com/owner', allowed_regions: ['HK'] }
  });
  await json(base, '/api/subscriptions', {
    method: 'POST', headers: memberHeaders,
    body: { name: 'MemberAirport', url: 'https://example.com/member', allowed_regions: ['US'] }
  });

  const ownerToken = await json(base, '/api/me/token/reset', { method: 'POST', headers: ownerHeaders });
  result = await json(base, `/api/generate?token=${encodeURIComponent(ownerToken.body.token)}`);
  assert.equal(result.response.status, 200);
  assert.ok(result.body.outbounds.some((outbound) => outbound.tag === 'OWNER-ALT'));
  assert.ok(!result.body.outbounds.some((outbound) => outbound.tag === 'MEMBER-DIRECT'));

  const memberToken = await json(base, '/api/me/token/reset', { method: 'POST', headers: memberHeaders });
  result = await json(base, `/api/generate?token=${encodeURIComponent(memberToken.body.token)}`);
  assert.equal(result.response.status, 200);
  assert.ok(result.body.outbounds.some((outbound) => outbound.tag === 'MEMBER-DIRECT'));
  assert.ok(!result.body.outbounds.some((outbound) => outbound.tag === 'OWNER-ALT'));

  await json(base, `/api/templates/${ownerSecond}`, { method: 'DELETE', headers: ownerHeaders });
  const templates = await json(base, '/api/templates', { headers: ownerHeaders });
  assert.equal(templates.body.templates.length, 1);
  assert.equal(templates.body.templates[0].id, ownerFirst);
  assert.equal(templates.body.templates[0].is_default, true);
});
