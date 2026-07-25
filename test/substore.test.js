import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
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

test('owner manages Sub-Store health, sync and scheduling while members are denied', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-substore-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  const calls = [];
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    substoreTransport: async (url) => {
      calls.push(url);
      return { status: 200, body: 'ok' };
    }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => {
    app.locals.stopBackgroundTasks();
    server.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  await json(base, '/api/auth/register', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  await json(base, '/api/auth/register', { method: 'POST', body: { username: 'member', password: 'member-password-123' } });
  database.prepare("UPDATE users SET status='active' WHERE username='member'").run();

  const owner = await json(base, '/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  const ownerHeaders = { cookie: owner.cookie, 'x-csrf-token': owner.body.csrf_token };
  let result = await json(base, '/api/admin/substore/status', { headers: ownerHeaders });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.health, { backend: true, frontend: true, healthy: true });

  result = await json(base, '/api/admin/substore/settings', {
    method: 'PUT', headers: ownerHeaders, body: { enabled: true, interval_hours: 6 }
  });
  assert.equal(result.response.status, 200);
  result = await json(base, '/api/admin/substore/sync', { method: 'POST', headers: ownerHeaders });
  assert.equal(result.response.status, 200);
  assert.ok(calls.some((url) => url.endsWith('/api/sync')));

  result = await json(base, '/api/admin/substore/status', { headers: ownerHeaders });
  assert.equal(result.body.auto_sync_enabled, true);
  assert.equal(result.body.auto_sync_interval_hours, 6);
  assert.equal(result.body.jobs[0].status, 'success');
  assert.equal(result.body.jobs[0].trigger_type, 'manual');

  const member = await json(base, '/api/auth/login', { method: 'POST', body: { username: 'member', password: 'member-password-123' } });
  result = await json(base, '/api/admin/substore/status', { headers: { cookie: member.cookie } });
  assert.equal(result.response.status, 403);
  result = await json(base, '/substore/', { headers: { cookie: member.cookie } });
  assert.equal(result.response.status, 403);
});

test('owner proxy rewrites the Sub-Store UI and preserves API paths', async (context) => {
  const upstream = http.createServer((request, response) => {
    if (request.url.startsWith('/api/')) {
      response.setHeader('content-type', 'application/json');
      return response.end(JSON.stringify({ path: request.url }));
    }
    response.setHeader('content-type', 'text/html');
    response.end('<a href="/assets/app.js">app</a><script>fetch("/api/data")</script>');
  });
  upstream.listen(0, '127.0.0.1');
  await new Promise((resolve) => upstream.once('listening', resolve));

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-substore-proxy-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  const origin = `http://127.0.0.1:${upstream.address().port}`;
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development', SUBSTORE_ORIGIN: origin, SUBSTORE_UI_ORIGIN: origin }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 })
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => {
    app.locals.stopBackgroundTasks();
    server.close();
    upstream.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  await json(base, '/api/auth/register', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  const owner = await json(base, '/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });

  let response = await fetch(`${base}/substore/`, { headers: { cookie: owner.cookie } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /href="\/substore\/assets\/app.js"/);
  assert.match(html, /fetch\("\/substore-api\/api\/data"\)/);

  response = await fetch(`${base}/substore-api/api/data?name=test`, { headers: { cookie: owner.cookie } });
  assert.deepEqual(await response.json(), { path: '/api/data?name=test' });
});

