import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';

async function call(base, route, { body, ...options } = {}) {
  const response = await fetch(base + route, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : {},
    text,
    cookie: response.headers.get('set-cookie')?.split(';')[0]
  };
}

test('creates template and subscription then generates config by client token', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-singbox-'));
  const database = openDatabase(path.join(directory, 'db.sqlite'));
  const fetchCalls = [];
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    singboxFetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return { outbounds: [
        { type: 'vless', tag: 'CustomRegion-Node' },
        { type: 'vless', tag: 'DROP-Node' }
      ] };
    }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => { server.close(); database.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;

  await call(base, '/api/auth/register', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  const login = await call(base, '/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  const headers = { cookie: login.cookie, 'x-csrf-token': login.body.csrf_token };

  let result = await call(base, '/api/admin/templates', { method: 'POST', headers, body: {
    source_type: 'local',
    content: { outbounds: [{ type: 'direct', tag: 'DIRECT' }, { type: 'selector', tag: 'Select', x_rule: 'region:HK', outbounds: [] }] }
  } });
  assert.equal(result.response.status, 201);
  await call(base, `/api/admin/templates/${result.body.id}/activate`, { method: 'POST', headers });

  result = await call(base, '/api/subscriptions', { method: 'POST', headers, body: {
    name: 'Airport', url: 'http://10.10.10.251/sub.json', allowed_regions: ['HK']
  } });
  assert.equal(result.response.status, 201);

  result = await call(base, '/api/subscription/test', { method: 'POST', headers, body: {
    subscription: { name: 'Draft', url: 'http://127.0.0.1/sub.json', allowed_regions: ['HK'] }
  } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.name, 'Draft');
  assert.equal(result.body.raw_nodes, 2);
  assert.equal(result.body.valid_nodes, 2);
  assert.equal(result.body.regions.HK, 0);
  assert.equal(result.body.regions.unmatched, 2);

  result = await call(base, '/api/admin/singbox-settings', {
    method: 'PUT',
    headers,
    body: {
      region_keywords: { HK: [], TW: ['TW'], SG: ['SG'], JP: ['JP'], US: ['US'] },
      banned_keywords: '[',
      urltest_params: { url: 'file:///tmp/test', interval: 'never', tolerance: -1 }
    }
  });
  assert.equal(result.response.status, 400);

  result = await call(base, '/api/admin/singbox-settings', {
    method: 'PUT',
    headers,
    body: {
      region_keywords: {
        HK: ['CustomRegion'], TW: ['TW'], SG: ['SG'], JP: ['JP'], US: ['US']
      },
      banned_keywords: 'DROP',
      urltest_params: { url: 'https://example.com/generate_204', interval: '5m', tolerance: 275 }
    }
  });
  assert.equal(result.response.status, 200);

  const token = await call(base, '/api/me/token/reset', { method: 'POST', headers });
  result = await call(base, `/api/generate?token=${encodeURIComponent(token.body.token)}`);
  assert.equal(result.response.status, 200);
  assert.match(result.response.headers.get('content-type'), /^application\/json/);
  assert.match(result.text, /^\{\n {2}"/);
  assert.match(result.text, /\n {2}"outbounds": \[/);
  assert.ok(result.text.endsWith('\n'));
  const group = result.body.outbounds.find((outbound) => outbound.tag === '🇭🇰 HK-Airport');
  assert.deepEqual(group.outbounds, ['CustomRegion-Node']);
  assert.equal(group.url, 'https://example.com/generate_204');
  assert.equal(group.interval, '5m');
  assert.equal(group.tolerance, 275);
  assert.ok(!result.body.outbounds.some((outbound) => outbound.tag === 'DROP-Node'));

  result = await call(base, '/api/admin/singbox-settings', { headers });
  assert.equal(result.body.settings.region_keywords.HK[0], 'CustomRegion');
  assert.equal(result.body.settings.banned_keywords, 'DROP');

  result = await call(base, '/api/generation/test', { method: 'POST', headers });
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.steps.map((step) => step.name), [
    '模板来源', '订阅源拉取', '节点清洗', '区域分组', '策略注入', '最终配置'
  ]);
  assert.equal(result.body.summary.raw_nodes, 2);
  assert.equal(result.body.summary.nodes, 1);
  assert.equal(result.body.summary.selectors, 1);
  assert.ok(fetchCalls.some((item) => new URL(item.url).searchParams.has('t')));
  assert.ok(fetchCalls.some((item) => item.options?.headers?.['user-agent'] === 'Mozilla/5.0 (Clash)'));

  result = await call(base, `/api/subscriptions/${(await call(base, '/api/subscriptions', { headers })).body.subscriptions[0].id}/enabled`, {
    method: 'PUT', headers, body: { enabled: false }
  });
  assert.equal(result.body.enabled, false);
  assert.equal((await call(base, '/api/subscriptions', { headers })).body.subscriptions[0].enabled, false);

  database.prepare("UPDATE subscriptions SET url_encrypted='corrupted' WHERE user_id=?")
    .run(login.body.user.id);
  result = await call(base, '/api/subscriptions', { headers });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error, 'subscription_decryption_failed');
});

test('P2 acceptance: isolates failed sources and users and obeys cache fallback', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-p2-'));
  const database = openDatabase(path.join(directory, 'db.sqlite'));
  let failAll = false;
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development' }),
    database,
    probeSubstore: async () => ({ reachable: true, status: 200 }),
    singboxFetch: async (url) => {
      if (failAll || url.includes('/bad')) throw new Error('fixture_upstream_failed');
      if (url.includes('/member')) return { outbounds: [{ type: 'vless', tag: 'US-Member' }] };
      return { outbounds: [{ type: 'vless', tag: 'HK-Owner' }] };
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

  await call(base, '/api/auth/register', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  await call(base, '/api/auth/register', { method: 'POST', body: { username: 'member', password: 'member-password-123' } });
  const owner = await call(base, '/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'owner-password-123' } });
  const ownerHeaders = { cookie: owner.cookie, 'x-csrf-token': owner.body.csrf_token };
  const memberId = database.prepare("SELECT id FROM users WHERE username='member'").get().id;
  await call(base, `/api/admin/users/${memberId}/approve`, { method: 'POST', headers: ownerHeaders });
  const member = await call(base, '/api/auth/login', { method: 'POST', body: { username: 'member', password: 'member-password-123' } });
  const memberHeaders = { cookie: member.cookie, 'x-csrf-token': member.body.csrf_token };

  let result = await call(base, '/api/admin/templates', { method: 'POST', headers: ownerHeaders, body: {
    source_type: 'local',
    content: { outbounds: [
      { type: 'direct', tag: '🎯 全球直连' },
      { type: 'selector', tag: '🗽 节点选择', x_rule: 'main', outbounds: [] }
    ] }
  } });
  await call(base, `/api/admin/templates/${result.body.id}/activate`, { method: 'POST', headers: ownerHeaders });

  const good = await call(base, '/api/subscriptions', { method: 'POST', headers: ownerHeaders, body: {
    name: 'OwnerGood', url: 'https://example.com/good', allowed_regions: ['HK']
  } });
  await call(base, '/api/subscriptions', { method: 'POST', headers: ownerHeaders, body: {
    name: 'OwnerBad', url: 'https://example.com/bad', allowed_regions: ['HK']
  } });
  await call(base, '/api/subscriptions', { method: 'POST', headers: memberHeaders, body: {
    name: 'MemberOnly', url: 'https://example.com/member', allowed_regions: ['US']
  } });

  const ownerToken = await call(base, '/api/me/token/reset', { method: 'POST', headers: ownerHeaders });
  result = await call(base, `/api/generate?token=${encodeURIComponent(ownerToken.body.token)}`);
  assert.equal(result.response.status, 200);
  assert.ok(result.body.outbounds.some((outbound) => outbound.tag === 'HK-Owner'));
  assert.ok(!result.body.outbounds.some((outbound) => outbound.tag === 'US-Member'));
  const runs = await call(base, '/api/generation/status', { headers: ownerHeaders });
  const reports = JSON.parse(runs.body.runs[0].summary_json).reports;
  assert.equal(reports.filter((report) => report.status === 'success').length, 1);
  assert.equal(reports.filter((report) => report.status === 'error').length, 1);

  result = await call(base, `/api/subscriptions/${good.body.id}`, {
    method: 'PUT', headers: memberHeaders, body: { name: 'stolen' }
  });
  assert.equal(result.response.status, 404);
  result = await call(base, `/api/subscriptions/${good.body.id}/enabled`, {
    method: 'PUT', headers: memberHeaders, body: { enabled: false }
  });
  assert.equal(result.response.status, 404);
  result = await call(base, '/api/subscriptions', { headers: memberHeaders });
  assert.deepEqual(result.body.subscriptions.map((subscription) => subscription.name), ['MemberOnly']);

  failAll = true;
  result = await call(base, '/api/generation/test', { method: 'POST', headers: ownerHeaders });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error, 'all_subscriptions_failed');
  assert.equal(result.body.steps[1].name, '订阅源拉取');
  assert.equal(result.body.steps[1].details.items.length, 2);
  database.prepare('UPDATE template_versions SET active=0 WHERE active=1').run();
  result = await call(base, `/api/generate?token=${encodeURIComponent(ownerToken.body.token)}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('x-proxyhub-cache'), 'stale');
  assert.match(result.text, /^\{\n {2}"/);
  assert.ok(result.text.endsWith('\n'));
  await call(base, '/api/admin/settings/generation-cache', {
    method: 'PUT', headers: ownerHeaders, body: { enabled: false }
  });
  result = await call(base, `/api/generate?token=${encodeURIComponent(ownerToken.body.token)}`);
  assert.equal(result.response.status, 502);
  assert.equal(result.body.error, 'generation_failed');
});




