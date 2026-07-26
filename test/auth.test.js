import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';
import { createAuth } from '../src/modules/auth/service.js';

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
  assert.equal(ownerLogin.body.user.status, 'active');
  assert.equal(ownerLogin.body.user.generation_enabled, true);
  const ownerHeaders = {
    cookie: ownerLogin.cookie,
    'x-csrf-token': ownerLogin.body.csrf_token
  };
  const member = database.prepare("SELECT id FROM users WHERE username='member'").get();

  result = await json(base, '/api/me', { headers: ownerHeaders });
  assert.match(result.body.user.client_token, /^[A-Za-z0-9_-]{32,}$/);
  const ownerToken = result.body.user.client_token;
  result = await json(base, '/api/me', { headers: ownerHeaders });
  assert.equal(result.body.user.client_token, ownerToken);

  result = await json(base, '/api/admin/settings', { headers: ownerHeaders });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.settings.registration_enabled, true);

  result = await json(base, `/api/admin/users/${member.id}/approve`, { method: 'POST', headers: ownerHeaders });
  assert.equal(result.response.status, 200);
  assert.ok(database.prepare(
    'SELECT raw_token FROM client_tokens WHERE user_id=? AND revoked_at IS NULL'
  ).get(member.id).raw_token);

  const memberLogin = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });
  assert.equal(memberLogin.response.status, 200);
  const memberHeaders = {
    cookie: memberLogin.cookie,
    'x-csrf-token': memberLogin.body.csrf_token
  };
  result = await json(base, '/api/me', { headers: memberHeaders });
  const firstMemberToken = result.body.user.client_token;
  assert.match(firstMemberToken, /^[A-Za-z0-9_-]{32,}$/);

  result = await json(base, '/api/me/username', {
    method: 'PUT', headers: memberHeaders, body: { username: 'member-renamed' }
  });
  assert.equal(result.body.username, 'member-renamed');

  result = await json(base, '/api/me/token/reset', { method: 'POST', headers: memberHeaders });
  assert.equal(result.response.status, 200);
  assert.ok(result.body.token.length > 32);
  const activeMemberToken = database.prepare(
    'SELECT raw_token FROM client_tokens WHERE user_id=? AND revoked_at IS NULL'
  ).get(member.id).raw_token;
  assert.equal(activeMemberToken, result.body.token);
  assert.notEqual(
    database.prepare('SELECT token_hash FROM client_tokens WHERE user_id=?').get(member.id).token_hash,
    result.body.token
  );
  const resetMemberToken = result.body.token;
  result = await json(base, '/api/me', { headers: memberHeaders });
  assert.equal(result.body.user.client_token, resetMemberToken);

  result = await json(base, `/api/generate?token=${encodeURIComponent(firstMemberToken)}`);
  assert.equal(result.response.status, 401);

  result = await json(base, '/api/admin/users', { headers: ownerHeaders });
  assert.equal('client_token' in result.body.users.find((user) => user.id === member.id), false);

  result = await json(base, `/api/admin/users/${member.id}/disable`, { method: 'POST', headers: ownerHeaders });
  assert.equal(result.body.status, 'disabled');
  result = await json(base, '/api/me', { headers: memberHeaders });
  assert.equal(result.response.status, 401);
});

test('F3 preserves raw client tokens across database reopen and does not replace legacy hash-only tokens', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-token-persistence-'));
  const databasePath = path.join(directory, 'proxyhub.db');
  let database = openDatabase(databasePath);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO users(id,username,password_hash,role,status,created_at,updated_at)
    VALUES('owner-id','owner','hash','owner','active',?,?)
  `).run(now, now);
  database.prepare(`
    INSERT INTO client_tokens(id,token_hash,raw_token,user_id,created_at)
    VALUES('token-id','token-hash','persistent-raw-token','owner-id',?)
  `).run(now);
  database.close();

  database = openDatabase(databasePath);
  assert.equal(
    database.prepare("SELECT raw_token FROM client_tokens WHERE id='token-id'").get().raw_token,
    'persistent-raw-token'
  );
  database.prepare("UPDATE client_tokens SET revoked_at=? WHERE id='token-id'").run(now);
  database.prepare(`
    INSERT INTO client_tokens(id,token_hash,user_id,created_at)
    VALUES('legacy-id','legacy-hash','owner-id',?)
  `).run(now);
  const auth = createAuth({ database, config: loadConfig({ NODE_ENV: 'development' }) });
  assert.equal(auth.ensureClientToken('owner-id'), null);
  assert.equal(
    database.prepare("SELECT raw_token FROM client_tokens WHERE id='legacy-id'").get().raw_token,
    null
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM client_tokens WHERE user_id='owner-id'").get().count,
    2
  );
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('F3 dashboard restores, copies and explicitly resets the client URL', () => {
  const html = fs.readFileSync(new URL('../src/web/index.html', import.meta.url), 'utf8');
  const javascript = fs.readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');
  assert.match(html, /地址会持续保留并显示/);
  assert.match(html, /现有 Token 无法显示，请手动重置一次/);
  assert.match(javascript, /data\.user\.client_token/);
  assert.match(javascript, /encodeURIComponent\(data\.user\.client_token\)/);
  assert.match(javascript, /confirm\('确认重置客户端 Token/);
});




