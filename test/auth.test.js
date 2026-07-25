import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';

async function json(base, route, options = {}) {
  const response = await fetch(`${base}${route}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] };
}

test('owner registration, member approval and account security flow', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-auth-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  const config = loadConfig({ NODE_ENV: 'development' });
  const app = createApp({ config, database, probeSubstore: async () => ({ reachable: true, status: 200 }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => {
    server.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  let result = await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.status, 'active');

  result = await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });
  assert.equal(result.body.status, 'pending');

  result = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });
  assert.equal(result.response.status, 403);

  const ownerLogin = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  assert.equal(ownerLogin.response.status, 200);
  const ownerHeaders = {
    cookie: ownerLogin.cookie,
    'x-csrf-token': ownerLogin.body.csrf_token
  };
  const member = database.prepare("SELECT id FROM users WHERE username='member'").get();

  result = await json(base, '/api/admin/settings', { headers: ownerHeaders });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.settings.registration_enabled, true);

  result = await json(base, `/api/admin/users/${member.id}/approve`, { method: 'POST', headers: ownerHeaders });
  assert.equal(result.response.status, 200);

  const memberLogin = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });
  assert.equal(memberLogin.response.status, 200);
  const memberHeaders = {
    cookie: memberLogin.cookie,
    'x-csrf-token': memberLogin.body.csrf_token
  };

  result = await json(base, '/api/me/username', {
    method: 'PUT', headers: memberHeaders, body: { username: 'member-renamed' }
  });
  assert.equal(result.body.username, 'member-renamed');

  result = await json(base, '/api/me/token/reset', { method: 'POST', headers: memberHeaders });
  assert.equal(result.response.status, 200);
  assert.ok(result.body.token.length > 32);
  assert.notEqual(
    database.prepare('SELECT token_hash FROM client_tokens WHERE user_id=?').get(member.id).token_hash,
    result.body.token
  );

  result = await json(base, `/api/admin/users/${member.id}/disable`, { method: 'POST', headers: ownerHeaders });
  assert.equal(result.body.status, 'disabled');
  result = await json(base, '/api/me', { headers: memberHeaders });
  assert.equal(result.response.status, 401);
});




