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
    cookie: response.headers.get('set-cookie')?.split(';', 1)[0],
    setCookie: response.headers.get('set-cookie')
  };
}

async function fixture(context, env = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-p1-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development', ...env }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 })
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => {
    app.locals.stopBackgroundTasks();
    server.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, database };
}

test('P1 acceptance: identity, switches, revocation and authorization', async (context) => {
  const { base, database } = await fixture(context);
  let result = await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  assert.equal(result.body.status, 'active');
  await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });

  const owner = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  const ownerHeaders = { cookie: owner.cookie, 'x-csrf-token': owner.body.csrf_token };
  const memberId = database.prepare("SELECT id FROM users WHERE username='member'").get().id;

  result = await json(base, `/api/admin/users/${memberId}/approve`, {
    method: 'POST', headers: { cookie: owner.cookie }
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.body.error, 'csrf_invalid');
  await json(base, `/api/admin/users/${memberId}/approve`, { method: 'POST', headers: ownerHeaders });

  const member = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });
  let memberHeaders = { cookie: member.cookie, 'x-csrf-token': member.body.csrf_token };
  result = await json(base, '/api/admin/users', { headers: memberHeaders });
  assert.equal(result.response.status, 403);
  for (const ownerRoute of [
    '/api/admin/templates', '/api/admin/settings', '/api/admin/singbox-settings',
    '/api/admin/substore/status'
  ]) {
    result = await json(base, ownerRoute, { headers: memberHeaders });
    assert.equal(result.response.status, 403, ownerRoute);
  }

  const token = await json(base, '/api/me/token/reset', { method: 'POST', headers: memberHeaders });
  const originalId = database.prepare("SELECT id FROM users WHERE username='member'").get().id;
  await json(base, '/api/me/username', {
    method: 'PUT', headers: memberHeaders, body: { username: 'member-renamed' }
  });
  const renamed = database.prepare("SELECT id FROM users WHERE username='member-renamed'").get();
  assert.equal(renamed.id, originalId);
  assert.equal(database.prepare('SELECT user_id FROM client_tokens WHERE user_id=?').get(originalId).user_id, originalId);

  await json(base, `/api/admin/users/${memberId}/generation`, {
    method: 'PUT', headers: ownerHeaders, body: { enabled: false }
  });
  result = await json(base, `/api/generate?token=${encodeURIComponent(token.body.token)}`);
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error, 'token_invalid');

  await json(base, '/api/admin/settings/registration', {
    method: 'PUT', headers: ownerHeaders, body: { enabled: false }
  });
  result = await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'blocked', password: 'blocked-password-123' }
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.body.error, 'registration_disabled');

  await json(base, '/api/me/password', {
    method: 'PUT',
    headers: memberHeaders,
    body: { current_password: 'member-password-123', new_password: 'member-password-456' }
  });
  result = await json(base, '/api/me', { headers: memberHeaders });
  assert.equal(result.response.status, 401);
  result = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'member-renamed', password: 'member-password-123' }
  });
  assert.equal(result.response.status, 401);
  const relogin = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'member-renamed', password: 'member-password-456' }
  });
  assert.equal(relogin.response.status, 200);
  memberHeaders = { cookie: relogin.cookie, 'x-csrf-token': relogin.body.csrf_token };

  await json(base, `/api/admin/users/${memberId}/disable`, { method: 'POST', headers: ownerHeaders });
  result = await json(base, '/api/me', { headers: memberHeaders });
  assert.equal(result.response.status, 401);
  assert.ok(database.prepare('SELECT revoked_at FROM client_tokens WHERE user_id=?').get(memberId).revoked_at);
});

test('P1 acceptance: secure cookie flags and login rate limit', async (context) => {
  const { base } = await fixture(context, { COOKIE_SECURE: 'true' });
  await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  const login = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  assert.match(login.setCookie, /HttpOnly/);
  assert.match(login.setCookie, /SameSite=Lax/);
  assert.match(login.setCookie, /Secure/);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await json(base, '/api/auth/login', {
      method: 'POST', body: { username: 'missing', password: 'wrong-password' }
    });
    assert.equal(failed.response.status, 401);
  }
  const limited = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'missing', password: 'wrong-password' }
  });
  assert.equal(limited.response.status, 429);
  assert.equal(limited.body.error, 'rate_limited');
});

