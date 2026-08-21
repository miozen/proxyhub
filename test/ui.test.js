import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../src/web/index.html', import.meta.url), 'utf8');

test('F5 all form fields have stable identifiers and names', () => {
  const fields = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
  assert.ok(fields.length > 0);
  for (const [, tag, attributes] of fields) {
    assert.match(attributes, /(?:^|\s)(?::?id)=["']/i, `${tag} lacks id: ${attributes}`);
    assert.match(attributes, /(?:^|\s)name=["']/i, `${tag} lacks name: ${attributes}`);
  }
});

test('F5 labels target controls and the local favicon is declared', () => {
  const labels = [...html.matchAll(/<label\b([^>]*)>/g)];
  assert.ok(labels.length > 0);
  for (const [, attributes] of labels) {
    assert.match(attributes, /(?:^|\s)(?::?for)=["']/i, `label lacks for: ${attributes}`);
  }
  assert.match(html, /<link rel="icon" href="\/proxyhub\/favicon\.svg" type="image\/svg\+xml">/);
  assert.ok(fs.existsSync(new URL('../src/web/favicon.svg', import.meta.url)));
});

test('S2 registration errors remain visible before authentication', () => {
  const notice = html.indexOf('v-if="notice"');
  const unauthenticatedShell = html.indexOf('v-if="!user"');
  assert.ok(notice > 0);
  assert.ok(notice < unauthenticatedShell);
  const javascript = fs.readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');
  assert.match(javascript, /registration_disabled:\s*'注册功能已关闭'/);
});


test('templates editor loads Monaco with sing-box schema diagnostics', () => {
  const javascript = fs.readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/web/templates.css', import.meta.url), 'utf8');
  assert.match(html, /monaco-editor@0\.56\.0\/min\/vs\/loader\.js/);
  assert.match(html, /id="template-content-editor"/);
  assert.match(html, /templateValidation\.label/);
  assert.match(javascript, /https:\/\/sing-box\.sagernet\.org\/schema\.json/);
  assert.match(javascript, /jsonDefaults\.setDiagnosticsOptions/);
  assert.match(javascript, /\/api\/templates\/validate/);
  assert.match(css, /\.template-monaco/);
  assert.match(css, /\.template-status\.success/);
});
