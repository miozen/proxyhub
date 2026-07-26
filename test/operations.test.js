import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../ops/proxyhub', import.meta.url), 'utf8');
const imageWorkflow = fs.readFileSync(
  new URL('../.github/workflows/image.yml', import.meta.url),
  'utf8'
);
const checkWorkflow = fs.readFileSync(
  new URL('../.github/workflows/check.yml', import.meta.url),
  'utf8'
);
const assetBuilder = fs.readFileSync(
  new URL('../scripts/build-deployment-assets.sh', import.meta.url),
  'utf8'
);

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

test('O1 publishes and verifies amd64 and arm64 image manifests', () => {
  assert.match(imageWorkflow, /docker\/setup-qemu-action@v3/);
  assert.match(imageWorkflow, /platforms:\s*linux\/amd64,linux\/arm64/);
  assert.match(imageWorkflow, /imagetools inspect ghcr\.io\/vonzhen\/proxyhub:dev/);
  assert.match(imageWorkflow, /imagetools inspect xream\/sub-store:2\.36\.21/);
  assert.match(imageWorkflow, /grep -q 'linux\/amd64'/);
  assert.match(imageWorkflow, /grep -q 'linux\/arm64'/);
});

test('O1 image publishing ignores host-only and documentation changes', () => {
  assert.match(imageWorkflow, /paths:/);
  assert.match(imageWorkflow, /- Dockerfile/);
  assert.match(imageWorkflow, /- package-lock\.json/);
  assert.match(imageWorkflow, /- src\/\*\*/);
  assert.doesNotMatch(imageWorkflow, /- ops\/\*\*/);
  assert.doesNotMatch(imageWorkflow, /- \*\.md/);
});

test('CI vulnerability scan checks the image built by the same job', () => {
  assert.match(checkWorkflow, /load:\s*true/);
  assert.match(checkWorkflow, /image:\s*proxyhub:ci/);
  assert.doesNotMatch(checkWorkflow, /image:\s*ghcr\.io\/vonzhen\/proxyhub:dev/);
});

test('O1.2 creates a minimal checksummed deployment artifact', () => {
  assert.match(assetBuilder, /proxyhub-deploy-\$version\.tar\.gz/);
  assert.match(assetBuilder, /docker-compose\.yml" "\$stage\/compose\.yaml/);
  assert.match(assetBuilder, /\.env\.example" "\$stage\/\.env\.example/);
  assert.match(assetBuilder, /ops\/proxyhub" "\$stage\/proxyhub/);
  assert.match(assetBuilder, /--sort=name/);
  assert.match(assetBuilder, /sha256sum "\$archive_name" >SHA256SUMS/);
  assert.match(checkWorkflow, /sha256sum -c SHA256SUMS/);
  assert.match(checkWorkflow, /diff -u expected\.txt contents\.txt/);
  assert.match(checkWorkflow, /actions\/upload-artifact@v4/);
});
