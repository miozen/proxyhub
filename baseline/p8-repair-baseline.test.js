import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
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

async function fixture(context) {
  const upstream = http.createServer((request, response) => {
    if (request.url === '/css/main.css') {
      response.setHeader('content-type', 'text/css');
      return response.end('body{color:green}');
    }
    response.statusCode = 404;
    response.setHeader('content-type', 'application/json');
    return response.end('{"error":"upstream_not_found"}');
  });
  upstream.listen(0, '127.0.0.1');
  await new Promise((resolve) => upstream.once('listening', resolve));

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-p8-baseline-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  const origin = `http://127.0.0.1:${upstream.address().port}`;
  const app = createApp({
    config: loadConfig({
      NODE_ENV: 'development',
      SUBSTORE_ORIGIN: origin,
      SUBSTORE_UI_ORIGIN: origin
    }),
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
  return { base: `http://127.0.0.1:${server.address().port}` };
}

test('F1 reproduces missing owner-only root asset gateway', async (context) => {
  const { base } = await fixture(context);
  await json(base, '/api/auth/register', {
    method: 'POST',
    body: { username: 'owner', password: 'owner-password-123' }
  });
  const owner = await json(base, '/api/auth/login', {
    method: 'POST',
    body: { username: 'owner', password: 'owner-password-123' }
  });

  const response = await fetch(`${base}/css/main.css`, {
    headers: { cookie: owner.cookie }
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/css/);
  assert.equal(await response.text(), 'body{color:green}');
});

test('F1 reproduces non-persistent client subscription URL', async (context) => {
  const { base } = await fixture(context);
  await json(base, '/api/auth/register', {
    method: 'POST',
    body: { username: 'owner', password: 'owner-password-123' }
  });
  const owner = await json(base, '/api/auth/login', {
    method: 'POST',
    body: { username: 'owner', password: 'owner-password-123' }
  });

  const me = await json(base, '/api/me', {
    headers: { cookie: owner.cookie }
  });
  assert.match(me.body.user.client_token, /^[A-Za-z0-9_-]{32,}$/);

  const refreshed = await json(base, '/api/me', {
    headers: { cookie: owner.cookie }
  });
  assert.equal(refreshed.body.user.client_token, me.body.user.client_token);
});

test('F1 reproduces non-isolated component update commands', () => {
  const source = fs.readFileSync(new URL('../ops/proxyhub', import.meta.url), 'utf8');
  assert.match(source, /dc pull proxyhub/);
  assert.match(source, /dc pull sub-store/);
  assert.doesNotMatch(source, /^\s*if ! dc pull \|\|/m);
});
