import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';

test('reports healthy database and reachable Sub-Store', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-health-'));
  const database = openDatabase(path.join(directory, 'proxyhub.db'));
  const config = loadConfig({ NODE_ENV: 'development' });
  const app = createApp({
    config,
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 })
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => {
    server.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.checks.database, 'ok');
});



