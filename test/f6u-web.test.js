import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const javascript = fs.readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../src/web/index.html', import.meta.url), 'utf8');

test('F6U provides HTTP clipboard fallback and truthful failure handling', () => {
  assert.match(javascript, /navigator\.clipboard\?\.writeText/);
  assert.match(javascript, /document\.execCommand\('copy'\)/);
  assert.match(javascript, /window\.prompt\('请手动复制地址'/);
  assert.match(javascript, /if \(!document\.execCommand\('copy'\)\) throw/);
});

test('F6U keeps saved tests inline and draft tests in the editor', () => {
  const savedMethod = javascript.match(/async testSubscription\(sub\) \{([\s\S]*?)\n    \},\n    toggleSubscriptionReport/)?.[1] || '';
  assert.match(savedMethod, /\/api\/subscriptions\/\$\{sub\.id\}\/test/);
  assert.doesNotMatch(savedMethod, /editSubscription/);
  assert.match(javascript, /async testSubscriptionDraft\(\)/);
  assert.match(html, /subscriptionTests\[sub\.id\]\?\.expanded/);
  assert.match(html, /source-test-report/);
});

test('F6U exposes subscription enable control and complete generation diagnostics', () => {
  assert.match(javascript, /\/api\/subscriptions\/\$\{sub\.id\}\/enabled/);
  assert.match(html, /toggleSubscription\(sub\)/);
  for (const step of ['模板来源', '订阅源拉取', '节点清洗', '区域分组', '策略注入', '最终配置']) {
    assert.match(html, new RegExp(step));
  }
  assert.match(html, /查看原始诊断报告/);
});

test('F6U exposes user-level template editing actions', () => {
  assert.match(html, /page==='templates'/);
  assert.match(html, /设为默认/);
  assert.match(html, /粘贴 sing-box 模板 JSON/);
  assert.match(javascript, /async setDefaultTemplate\(\)/);
  assert.match(javascript, /\/api\/templates/);
  assert.doesNotMatch(html, /@click="rollbackTemplate\(tpl\)"/);
});

test('refresh keeps authentication when business data loading fails', () => {
  const restore = javascript.match(/async restore\(\) \{([\s\S]*?)\n    \},\n    async authSubmit/)?.[1] || '';
  assert.match(restore, /this\.setAuthenticatedUser\(data\)/);
  assert.match(restore, /await this\.loadCore\(\)/);
  assert.match(restore, /this\.flash\(error\.message, 'error'\)/);
  assert.match(restore, /return;/);
  assert.match(javascript, /subscription_decryption_failed/);
});
