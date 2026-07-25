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
  assert.deepEqual(result.body.health, {
    backend: true, frontend: true, healthy: true, errors: { backend: null, frontend: null }
  });

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
  result = await json(base, '/api/admin/substore/status');
  assert.equal(result.response.status, 401);
  result = await json(base, '/substore-api/api/data');
  assert.equal(result.response.status, 401);
});

test('owner proxy adapts UI paths, redirects and cookies and streams binary API bodies', async (context) => {
  const binary = Buffer.from(Array.from({ length: 64 * 1024 }, (_value, index) => index % 251));
  const upstream = http.createServer((request, response) => {
    if (request.url === '/redirect') {
      response.statusCode = 302;
      response.setHeader('location', '/next?from=upstream');
      response.setHeader('set-cookie', ['sid=abc; Domain=127.0.0.1; Path=/; HttpOnly']);
      return response.end();
    }
    if (request.url === '/binary') {
      response.setHeader('content-type', 'application/octet-stream');
      response.write(binary.subarray(0, 1000));
      return response.end(binary.subarray(1000));
    }
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

  response = await fetch(`${base}/substore/redirect`, {
    headers: { cookie: owner.cookie }, redirect: 'manual'
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/substore/next?from=upstream');
  assert.match(response.headers.get('set-cookie'), /Path=\/substore\//);
  assert.doesNotMatch(response.headers.get('set-cookie'), /Domain=/i);

  response = await fetch(`${base}/substore-api/binary`, { headers: { cookie: owner.cookie } });
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), binary);

  response = await fetch(`${base}/substore-api/api/data`, {
    method: 'POST',
    headers: { cookie: owner.cookie },
    body: Buffer.alloc(5 * 1024 * 1024 + 1, 120)
  });
  assert.equal(response.status, 413);
});

test('P5 acceptance: scheduled success/failure history and global overlap lock', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-substore-schedule-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  let clock = Date.parse('2026-07-25T00:00:00.000Z');
  let release;
  let mode = 'hold';
  const transport = async (url) => {
    if (!url.endsWith('/api/sync')) return { status: 200, body: 'healthy' };
    if (mode === 'hold') return new Promise((resolve) => { release = resolve; });
    if (mode === 'fail') throw new Error('upstream_sync_failed');
    return { status: 200, body: 'scheduled-ok' };
  };
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    substoreTransport: transport,
    substoreSchedulerIntervalMs: 86_400_000,
    substoreNow: () => clock
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
  await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  const owner = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  const headers = { cookie: owner.cookie, 'x-csrf-token': owner.body.csrf_token };

  const first = json(base, '/api/admin/substore/sync', { method: 'POST', headers });
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  const overlap = await json(base, '/api/admin/substore/sync', { method: 'POST', headers });
  assert.equal(overlap.response.status, 409);
  assert.equal(overlap.body.error, 'sync_already_running');
  release({ status: 200, body: 'manual-ok' });
  assert.equal((await first).response.status, 200);

  await json(base, '/api/admin/substore/settings', {
    method: 'PUT', headers, body: { enabled: true, interval_hours: 1 }
  });
  clock += 3_600_001;
  mode = 'fail';
  await app.locals.runSubstoreScheduler();
  let jobs = database.prepare(`SELECT status,trigger_type,error_text FROM jobs
    WHERE type='substore_sync' ORDER BY started_at DESC`).all();
  assert.deepEqual(jobs[0], {
    status: 'error', trigger_type: 'schedule', error_text: 'upstream_sync_failed'
  });

  clock += 3_600_001;
  mode = 'success';
  await app.locals.runSubstoreScheduler();
  jobs = database.prepare(`SELECT status,trigger_type,error_text FROM jobs
    WHERE type='substore_sync' ORDER BY started_at DESC`).all();
  assert.equal(jobs[0].status, 'success');
  assert.equal(jobs[0].trigger_type, 'schedule');
  assert.equal(jobs.length, 3);
});

test('P5 acceptance: health exposes useful per-component failures and stale running jobs recover', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-substore-health-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  database.prepare(`INSERT INTO jobs(id,type,status,trigger_type,started_at)
    VALUES('stale','substore_sync','running','schedule','2026-07-24T00:00:00.000Z')`).run();
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    substoreTransport: async (url) => {
      if (url.includes(':3001')) throw new Error('ui_connection_refused');
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
  await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  const owner = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'owner', password: 'owner-password-123' }
  });
  const result = await json(base, '/api/admin/substore/status', { headers: { cookie: owner.cookie } });
  assert.equal(result.body.health.backend, true);
  assert.equal(result.body.health.frontend, false);
  assert.equal(result.body.health.errors.frontend, 'ui_connection_refused');
  assert.equal(result.body.jobs[0].status, 'error');
  assert.equal(result.body.jobs[0].error_text, 'interrupted_by_restart');
});

