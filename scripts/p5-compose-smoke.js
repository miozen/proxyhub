import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3000';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function ready() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) return;
    } catch {}
    await wait(2_000);
  }
  throw new Error('proxyhub_not_ready');
}

async function json(route, options = {}) {
  const response = await fetch(base + route, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return { response, body: await response.json() };
}

await ready();
if (process.env.P5_EXISTING === '1') {
  const response = await fetch(`${base}/?api=${encodeURIComponent(`${base}/invalid`)}`);
  assert.equal(response.status, 401);
  console.log('P5 existing-install smoke passed');
  process.exit(0);
}
const username = `smoke-${Date.now()}`;
let result = await json('/api/auth/register', {
  method: 'POST', body: { username, password: 'compose-smoke-password-123' }
});
assert.equal(result.response.status, 201);
assert.equal(result.body.status, 'active');

const loginResponse = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password: 'compose-smoke-password-123' })
});
assert.equal(loginResponse.status, 200);
const cookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];
assert.ok(cookie);

const status = await json('/api/admin/substore/status', { headers: { cookie } });
assert.equal(status.response.status, 200);
assert.match(status.body.backend_path, /^\/[a-f0-9]{32}$/);

let response = await fetch(
  `${base}/?api=${encodeURIComponent(base + status.body.backend_path)}`,
  { headers: { cookie } }
);
assert.equal(response.status, 200);
assert.match(response.headers.get('content-type') || '', /text\/html/i);
assert.ok((await response.text()).length > 100);

response = await fetch(`${base}${status.body.backend_path}/api/utils/env`);
assert.equal(response.status, 200);
assert.match(response.headers.get('content-type') || '', /json/i);

response = await fetch(`${base}/?api=${encodeURIComponent(base + status.body.backend_path)}`);
assert.equal(response.status, 401);

console.log('P5 real-image Compose smoke passed');
