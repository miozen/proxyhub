import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../ops/proxyhub', import.meta.url), 'utf8');

test('F4 scopes lifecycle and update commands to one component', () => {
  assert.match(source, /dc up -d --no-deps "\$component"/);
  assert.match(source, /dc pull proxyhub/);
  assert.match(source, /dc pull sub-store/);
  assert.match(source, /dc up -d --no-deps proxyhub/);
  assert.match(source, /dc up -d --no-deps sub-store/);
  assert.doesNotMatch(source, /^\s*if ! dc pull \|\|/m);
  assert.match(source, /update one component at a time/);
  assert.match(source, /component must be proxyhub or sub-store/);
});

test('F4 stores and restores independent rollback points', () => {
  assert.match(source, /\$STATE_DIR\/\$component-last-backup/);
  assert.match(source, /component_restore_cmd "\$component"/);
  assert.match(source, /component_volume "\$component"/);
  assert.match(source, /component_env_key "\$component"/);
  assert.doesNotMatch(source, /\$STATE_DIR\/last-backup/);
});
