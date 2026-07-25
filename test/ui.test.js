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
