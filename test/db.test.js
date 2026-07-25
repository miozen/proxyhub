import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../src/db/index.js';

test('applies initial migration idempotently with WAL and foreign keys', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-db-'));
  const databasePath = path.join(directory, 'proxyhub.db');

  const database = openDatabase(databasePath);
  const tables = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  ).all().map(({ name }) => name);

  assert.ok(tables.includes('users'));
  assert.ok(tables.includes('schema_migrations'));
  assert.equal(database.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(database.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1);
  database.close();

  const reopened = openDatabase(databasePath);
  assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1);
  reopened.close();

  fs.rmSync(directory, { recursive: true, force: true });
});

