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

test('F6R dashboard opens root Sub-Store UI with the resettable backend path', () => {
  const html = fs.readFileSync(new URL('../src/web/index.html', import.meta.url), 'utf8');
  const javascript = fs.readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<iframe/i);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /:href="substoreUiUrl"/);
  assert.match(javascript, /`\/\?api=\$\{encodeURIComponent\(this\.substoreBackendUrl\)\}`/);
  assert.match(javascript, /backend-path\/reset/);
  assert.doesNotMatch(javascript, /\/substore\/\?api=/);
  assert.doesNotMatch(javascript, /\/substore-api/);
});

test('F6S owner manages only Sub-Store health and backend path while members are denied', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-substore-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    substoreTransport: async () => ({ status: 200 })
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

  assert.match(result.body.backend_path, /^\/[a-f0-9]{32}$/);
  assert.deepEqual(Object.keys(result.body).sort(), ['backend_path', 'health']);

  result = await json(base, '/api/admin/substore/sync', {
    method: 'POST', headers: ownerHeaders
  });
  assert.equal(result.response.status, 404);
  result = await json(base, '/api/admin/substore/settings', {
    method: 'PUT', headers: ownerHeaders, body: { enabled: true, interval_hours: 6 }
  });
  assert.equal(result.response.status, 404);

  const member = await json(base, '/api/auth/login', { method: 'POST', body: { username: 'member', password: 'member-password-123' } });
  result = await json(base, '/api/admin/substore/status', { headers: { cookie: member.cookie } });
  assert.equal(result.response.status, 403);
  result = await json(base, '/?api=http%3A%2F%2Fexample.test%2Fbackend', { headers: { cookie: member.cookie } });
  assert.equal(result.response.status, 403);
  result = await json(base, '/api/admin/substore/status');
  assert.equal(result.response.status, 401);
});

test('F6S transparently proxies the root frontend and resettable backend path', async (context) => {
  const binary = Buffer.from(Array.from({ length: 64 * 1024 }, (_value, index) => index % 251));
  const upstream = http.createServer((request, response) => {
    if (request.url === '/api/restore' && request.method === 'POST') {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      return request.on('end', () => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          content_type: request.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf8')
        }));
      });
    }
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
    if (request.url === '/large-upload' && request.method === 'POST') {
      let received = 0;
      request.on('data', (chunk) => { received += chunk.length; });
      return request.on('end', () => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ received }));
      });
    }
    if (request.url === '/registerSW.js') {
      response.setHeader('content-type', 'application/javascript');
      return response.end('upstream-worker');
    }
    if (request.url === '/index.js') {
      response.setHeader('content-type', 'application/javascript');
      return response.end(
        'const api=new URLSearchParams(location.search).get("api");' +
        'fetch(api+"/api/utils/env");import("/js/main-d98772a1.js");'
      );
    }
    if (request.url === '/css/main.css') {
      response.setHeader('content-type', 'text/css');
      return response.end('body{color:green}');
    }
    if (request.url === '/js/main-d98772a1.js') {
      response.setHeader('content-type', 'application/javascript');
      return response.end('export const loaded=true');
    }
    if (request.url === '/manifests.json') {
      response.setHeader('content-type', 'application/json');
      return response.end('{"name":"Sub-Store"}');
    }
    if (request.url.startsWith('/api/')) {
      response.setHeader('content-type', 'application/json');
      return response.end(JSON.stringify({ path: request.url }));
    }
    response.setHeader('content-type', 'text/html');
    response.end(
      '<link rel="manifest" href="/manifests.json">' +
      '<link rel="stylesheet" href="/css/main.css">' +
      '<script src="/index.js"></script>'
    );
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
    app.locals.stopBackgroundTasks?.();
    server.close();
    upstream.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  await json(base, '/api/auth/register', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  const owner = await json(base, '/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });

  let status = await json(base, '/api/admin/substore/status', { headers: { cookie: owner.cookie } });
  const backendPath = status.body.backend_path;
  assert.match(backendPath, /^\/[a-f0-9]{32}$/);

  let response = await fetch(`${base}/?api=${encodeURIComponent(base + backendPath)}`, {
    headers: { cookie: owner.cookie }
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /href="\/css\/main\.css"/);
  assert.match(html, /href="\/manifests\.json"/);
  assert.equal(response.headers.get('content-security-policy'), null);

  response = await fetch(`${base}/index.js`, { headers: { cookie: owner.cookie } });
  assert.equal(response.status, 200);
  const javascript = await response.text();
  assert.match(javascript, /fetch\(api\+"\/api\/utils\/env"\)/);
  assert.match(javascript, /import\("\/js\/main-d98772a1\.js"\)/);
  assert.doesNotMatch(javascript, /substore-api\/substore-api/);
  assert.doesNotMatch(javascript, /fetch\("\/substore-api/);

  response = await fetch(`${base}/css/main.css`, { headers: { cookie: owner.cookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/css/);
  assert.equal(await response.text(), 'body{color:green}');

  response = await fetch(`${base}/js/main-d98772a1.js`, { headers: { cookie: owner.cookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /javascript/);
  assert.equal(await response.text(), 'export const loaded=true');

  response = await fetch(`${base}/manifests.json`, { headers: { cookie: owner.cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { name: 'Sub-Store' });

  response = await fetch(`${base}${backendPath}/api/data?name=test`);
  assert.deepEqual(await response.json(), { path: '/api/data?name=test' });

  const backupBody = JSON.stringify({
    version: 2,
    artifacts: [{ name: 'subscription', content: '保留原始备份正文' }]
  });
  response = await fetch(`${base}${backendPath}/api/restore`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: backupBody
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    content_type: 'application/json',
    body: backupBody
  });

  response = await fetch(`${base}${backendPath}/redirect`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/next?from=upstream');
  assert.match(response.headers.get('set-cookie'), /Path=\//);
  assert.match(response.headers.get('set-cookie'), /Domain=127\.0\.0\.1/i);

  response = await fetch(`${base}${backendPath}/binary`);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), binary);

  const largeBody = Buffer.alloc(6 * 1024 * 1024, 120);
  response = await fetch(`${base}${backendPath}/large-upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: largeBody
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).received, largeBody.length);

  response = await fetch(`${base}/registerSW.js`, { headers: { cookie: owner.cookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /javascript/);
  assert.equal(await response.text(), 'upstream-worker');

  response = await fetch(`${base}/css/main.css`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/css/);

  await json(base, '/api/auth/register', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });
  const memberRow = database.prepare("SELECT id FROM users WHERE username='member'").get();
  database.prepare("UPDATE users SET status='active' WHERE id=?").run(memberRow.id);
  const member = await json(base, '/api/auth/login', {
    method: 'POST', body: { username: 'member', password: 'member-password-123' }
  });
  response = await fetch(`${base}/css/main.css`, { headers: { cookie: member.cookie } });
  assert.equal(response.status, 200);

  const reset = await json(base, '/api/admin/substore/backend-path/reset', {
    method: 'POST',
    headers: { cookie: owner.cookie, 'x-csrf-token': owner.body.csrf_token }
  });
  assert.match(reset.body.backend_path, /^\/[a-f0-9]{32}$/);
  assert.notEqual(reset.body.backend_path, backendPath);
  response = await fetch(`${base}${backendPath}/api/data`);
  assert.equal(response.status, 404);
  response = await fetch(`${base}${reset.body.backend_path}/api/data`);
  assert.equal(response.status, 200);

  response = await fetch(`${base}/proxyhub/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /\/proxyhub\/app\.js/);
  response = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/proxyhub/');
});

test('F6S health exposes useful per-component failures without business jobs', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-substore-health-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
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
  const result = await json(base, '/api/admin/substore/status', { headers: { cookie: owner.cookie } });
  assert.equal(result.body.health.backend, true);
  assert.equal(result.body.health.frontend, false);
  assert.equal(result.body.health.errors.frontend, 'ui_connection_refused');
  assert.equal(result.body.jobs, undefined);
});

