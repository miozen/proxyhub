import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptUrl, decryptUrl } from '../src/modules/singbox/crypto.js';
import { buildRegionalGroups, countRegions, injectTemplate, normalizeNodes, parseRule, rawNodes } from '../src/modules/singbox/engine.js';
import { assertSafeUrl, fetchJsonSafe } from '../src/modules/singbox/fetch.js';

test('encrypts subscription URLs with authenticated encryption', () => {
  const secret = 'test-secret';
  const encrypted = encryptUrl('https://example.com/sub?token=secret', secret);
  assert.notEqual(encrypted, 'https://example.com/sub?token=secret');
  assert.equal(decryptUrl(encrypted, secret), 'https://example.com/sub?token=secret');
});

test('filters nodes, builds regional groups and injects x_rule', () => {
  assert.deepEqual(parseRule('region+direct:HK,US'), { mode: 'region', includeDirect: true, regions: ['HK', 'US'] });
  const nodes = normalizeNodes({ outbounds: [
    { type: 'vless', tag: 'HK-A' }, { type: 'vless', tag: 'HK-A' }, { type: 'selector', tag: 'ignore' }
  ] }, 'expired');
  const { groups, byRegion } = buildRegionalGroups(
    [{ name: 'A', nodes, allowed_regions: ['HK'] }], { HK: ['HK'] },
    { url: 'https://example.com/204', interval: '3m', tolerance: 150 }
  );
  const result = injectTemplate({ outbounds: [
    { type: 'direct', tag: 'DIRECT' },
    { type: 'selector', tag: 'Select', x_rule: 'region:HK', outbounds: [] }
  ] }, nodes, groups, byRegion);
  assert.deepEqual(result.outbounds[1].outbounds, ['🇭🇰 HK-A']);
  assert.equal(result.outbounds.filter((item) => item.tag === 'HK-A').length, 1);
});

test('preserves AnyTLS and future protocols while excluding structural outbounds', () => {
  const anytls = {
    type: 'anytls',
    tag: 'US-AnyTLS',
    server: 'anytls.example.com',
    server_port: 443,
    password: 'secret',
    tls: { enabled: true, server_name: 'anytls.example.com' }
  };
  const future = {
    type: 'future-protocol',
    tag: 'HK-Future',
    server: 'future.example.com',
    custom_field: { preserved: true }
  };
  const nodes = normalizeNodes({ outbounds: [
    anytls,
    future,
    { type: 'selector', tag: 'Selector', outbounds: ['US-AnyTLS'] },
    { type: 'urltest', tag: 'URLTest', outbounds: ['US-AnyTLS'] },
    { type: 'direct', tag: 'Direct' },
    { type: 'block', tag: 'Block' },
    { type: 'dns', tag: 'DNS' },
    { tag: 'Missing-Type' }
  ] }, 'expired');

  assert.deepEqual(nodes, [anytls, future]);
});

test('keeps original keyword, multiplier and duplicate-tag cleaning rules', () => {
  const nodes = normalizeNodes({ outbounds: [
    { type: 'anytls', tag: 'US-Keep' },
    { type: 'future-protocol', tag: 'US-Keep' },
    { type: 'vless', tag: 'US-expired' },
    { type: 'trojan', tag: 'US-1.5x' },
    { type: 'hysteria2', tag: 'US-2.0x' },
    { type: 'shadowsocks', tag: 'US-Normal' }
  ] }, 'expired');

  assert.deepEqual(nodes.map((node) => node.tag), ['US-Keep', 'US-Normal']);
});

test('injects AnyTLS and future protocol fields unchanged into generated config', () => {
  const nodes = normalizeNodes({ outbounds: [
    {
      type: 'anytls',
      tag: 'US-AnyTLS',
      server: 'anytls.example.com',
      server_port: 443,
      password: 'secret',
      tls: { enabled: true }
    },
    {
      type: 'future-protocol',
      tag: 'US-Future',
      future_option: 'preserved'
    }
  ] }, 'expired');
  const { groups, byRegion } = buildRegionalGroups(
    [{ name: 'SubStore', nodes, allowed_regions: ['US'] }],
    { US: ['US'] },
    { url: 'https://www.gstatic.com/generate_204', interval: '3m', tolerance: 150 }
  );
  const output = injectTemplate({
    outbounds: [
      { type: 'direct', tag: 'DIRECT' },
      { type: 'selector', tag: 'Select', x_rule: 'region:US', outbounds: [] }
    ]
  }, nodes, groups, byRegion);

  assert.deepEqual(output.outbounds.find((node) => node.tag === 'US-AnyTLS'), nodes[0]);
  assert.deepEqual(output.outbounds.find((node) => node.tag === 'US-Future'), nodes[1]);
  assert.deepEqual(groups[0].outbounds, ['US-AnyTLS', 'US-Future']);
});

test('matches the original singbox-center core fixture', () => {
  // Baseline: Vonzhen/singbox-center src/engine.js at badfd389436ed51450ebad6c9fc9c1c2cc717784.
  const nodes = normalizeNodes({ outbounds: [
    { type: 'vless', tag: 'HK-A' },
    { type: 'vless', tag: 'US-A' },
    { type: 'trojan', tag: 'Other-A' },
    { type: 'vless', tag: '套餐到期' },
    { type: 'selector', tag: 'not-a-node' }
  ] }, '到期');
  const { groups, byRegion } = buildRegionalGroups(
    [{ name: 'Airport', nodes, allowed_regions: ['HK', 'US'] }],
    { HK: ['HK'], US: ['US'] },
    { url: 'https://www.gstatic.com/generate_204', interval: '3m', tolerance: 150 }
  );
  const output = injectTemplate({ outbounds: [
    { type: 'direct', tag: '🎯 全球直连' },
    { type: 'selector', tag: '🗽 节点选择', x_rule: 'main', outbounds: [] },
    { type: 'selector', tag: '🅾️ OpenAI', x_rule: 'region+direct:US', outbounds: [] }
  ] }, nodes, groups, byRegion);
  assert.deepEqual(groups.map((group) => group.tag), ['🇭🇰 HK-Airport', '🇺🇸 US-Airport']);
  assert.deepEqual(output.outbounds[1].outbounds, ['🇭🇰 HK-Airport', '🇺🇸 US-Airport', 'Other-A']);
  assert.deepEqual(output.outbounds[2].outbounds, ['🗽 节点选择', '🎯 全球直连', '🇺🇸 US-Airport']);
  assert.equal(output.outbounds.filter((item) => item.tag === 'HK-A').length, 1);
});

test('accepts HTTP subscription targets including private addresses', async () => {
  assert.equal((await assertSafeUrl('http://127.0.0.1/sub')).hostname, '127.0.0.1');
  assert.equal((await assertSafeUrl('http://10.10.10.251/sub')).hostname, '10.10.10.251');
  await assert.rejects(() => assertSafeUrl('file:///etc/passwd'), /unsafe_subscription_url/);
});

test('enforces subscription timeout and response size limits', async () => {
  await assert.rejects(() => fetchJsonSafe('https://public.example/sub', {
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
  }), /abort|timed out|timeout/i);
  await assert.rejects(() => fetchJsonSafe('https://public.example/sub', {
    maxBytes: 4,
    fetchImpl: async () => new Response('{"ok":true}', { headers: { 'content-length': '11' } })
  }), /upstream_too_large/);
  await assert.rejects(() => fetchJsonSafe('https://public.example/sub', {
    maxBytes: 4,
    fetchImpl: async () => new Response('{"ok":true}')
  }), /upstream_too_large/);
});

test('reports raw, valid and allowed-region node counts', () => {
  const payload = { outbounds: [
    { type: 'vless', tag: 'HK-A' },
    { type: 'vless', tag: 'US-A' },
    { type: 'selector', tag: 'HK-Selector' }
  ] };
  const nodes = normalizeNodes(payload, 'expired');
  assert.equal(rawNodes(payload).length, 3);
  assert.deepEqual(countRegions(nodes, { HK: ['HK'], US: ['US'] }, ['HK']), {
    HK: 1, US: 0, unmatched: 1
  });
});




