import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptUrl, decryptUrl } from '../src/modules/singbox/crypto.js';
import { buildRegionalGroups, injectTemplate, normalizeNodes, parseRule } from '../src/modules/singbox/engine.js';
import { assertSafeUrl } from '../src/modules/singbox/fetch.js';

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
  assert.deepEqual(result.outbounds[1].outbounds, ['[AUTO] HK-A']);
  assert.equal(result.outbounds.filter((item) => item.tag === 'HK-A').length, 1);
});

test('blocks private subscription targets', async () => {
  await assert.rejects(() => assertSafeUrl('http://127.0.0.1/sub'), /unsafe_subscription_target/);
  await assert.rejects(() => assertSafeUrl('file:///etc/passwd'), /unsafe_subscription_url/);
});

