import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';
import { redact } from '../src/security/redact.js';

test('P7 log redaction removes URLs and credential-like values', () => {
  const output = redact('failed https://user.example/path?token=abc password=hunter2 secret=xyz');
  assert.doesNotMatch(output, /user\.example|abc|hunter2|xyz/);
  assert.match(output, /\[redacted/);
});

test('P7 security headers and malformed authentication input remain safe', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-security-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    substoreTransport: async () => ({ status: 200, body: 'ok' })
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
  const response = await fetch(`${base}/`, { headers: { cookie: 'broken-cookie' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);

  const denied = await fetch(`${base}/api/me`, { headers: { cookie: 'proxyhub_session=%' } });
  assert.equal(denied.status, 401);
});
