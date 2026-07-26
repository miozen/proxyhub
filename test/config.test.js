import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/index.js';

test('loads safe development defaults', () => {
  const config = loadConfig({ NODE_ENV: 'development' });
  assert.equal(config.port, 3000);
  assert.equal(config.registrationEnabled, true);
  assert.equal(config.substoreOrigin, 'http://sub-store:3000');
});

test('rejects placeholder secrets in production', () => {
  assert.throws(
    () => loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 'replace-with-at-least-32-random-characters',
      DATA_ENCRYPTION_KEY: 'replace-with-at-least-32-random-characters'
    }),
    /SESSION_SECRET/
  );
});

test('validates integer ranges', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'development', PORT: '70000' }),
    /Invalid integer/
  );
});





