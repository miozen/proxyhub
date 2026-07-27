import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const source = fs.readFileSync(new URL('../ops/proxyhub', import.meta.url), 'utf8');
const builder = fs.readFileSync(
  new URL('../scripts/build-deployment-assets.sh', import.meta.url),
  'utf8'
);
const installer = fs.readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const checkWorkflow = fs.readFileSync(
  new URL('../.github/workflows/check.yml', import.meta.url),
  'utf8'
);
const imageWorkflow = fs.readFileSync(
  new URL('../.github/workflows/image.yml', import.meta.url),
  'utf8'
);

test('I5 packages a checksummed compatibility manifest in every deployment archive', () => {
  for (const field of [
    '"schema": 1',
    '"proxyhub_version": "$version"',
    '"manager_min_version": "0.1.5"',
    '"compose_revision": 1',
    '"environment_revision": 1',
    '"substore_min_version": null',
    '"substore_max_version_exclusive": null'
  ]) {
    assert.match(builder, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(
    builder,
    /\.env\.example VERSION compatibility\.json compose\.yaml proxyhub/
  );
  assert.match(checkWorkflow, /tar -xOf .* compatibility\.json/);
  assert.match(imageWorkflow, /proxyhub_version/);
  assert.match(installer, /compatibility\.json/);
});

test('I5 stages and validates official release assets before backup or apply', () => {
  assert.match(source, /prepare_proxyhub_assets\(\)/);
  assert.match(source, /proxyhub-deploy-\$release_version\.tar\.gz/);
  assert.match(source, /sha256sum -c archive\.sha256/);
  assert.match(source, /deployment archive contains unexpected files/);
  assert.match(source, /sh -n "\$asset_dir\/proxyhub"/);
  assert.match(source, /candidate Compose configuration is invalid/);
  assert.match(source, /validate_compatibility_manifest/);
  const update = source.slice(
    source.indexOf('perform_update()'),
    source.indexOf('legacy_update_cmd()')
  );
  assert.ok(
    update.indexOf('operation_phase asset_stage') <
      update.indexOf('operation_phase backup')
  );
});

test('I5 blocks incompatible combinations without invoking a Sub-Store update', () => {
  assert.match(source, /manager_min_version/);
  assert.match(source, /version_compare "\$MANAGER_VERSION" ge/);
  assert.match(source, /substore_min_version/);
  assert.match(source, /substore_max_version_exclusive/);
  assert.match(
    source,
    /run proxyhub update sub-store --version <compatible-version> first/
  );
  const compatibility = source.slice(
    source.indexOf('validate_compatibility_manifest()'),
    source.indexOf('validate_asset_directory()')
  );
  assert.doesNotMatch(compatibility, /perform_update|dc up|set_env/);
});

test('I5 includes assets and environment in ProxyHub rollback points only', () => {
  assert.match(source, /backup_proxyhub_assets "\$target"/);
  assert.match(source, /deployment-assets\.tgz/);
  assert.match(source, /proxyhub\.env/);
  assert.match(source, /restore_proxyhub_assets "\$target"/);
  assert.match(source, /merge_environment_template/);
  assert.match(source, /dc up -d --no-deps "\$service"/);
  assert.doesNotMatch(
    source.slice(
      source.indexOf('prepare_proxyhub_assets()'),
      source.indexOf('switch_proxyhub_assets()')
    ),
    /SUBSTORE_IMAGE=|update sub-store --yes/
  );
});

test('I5 records asset phases and rolls back each post-backup asset failure', () => {
  assert.match(source, /OPERATION_FAILED_PHASE=asset_stage/);
  assert.match(source, /OPERATION_FAILED_PHASE=asset_apply/);
  assert.match(source, /OPERATION_FAILED_PHASE=environment_schema/);
  assert.match(source, /OPERATION_FAILED_PHASE=environment_apply/);
  assert.match(source, /component_restore_cmd proxyhub "\$snapshot"/);
  assert.match(source, /source_asset_revision=/);
  assert.match(source, /target_asset_revision=/);
});

test('I5 deployment archive contains the exact managed asset set', {
  skip: process.platform === 'win32'
}, (context) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-i5-assets-'));
  context.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const build = spawnSync(
    'sh',
    [new URL('../scripts/build-deployment-assets.sh', import.meta.url).pathname,
      '0.2.0', output],
    { encoding: 'utf8' }
  );
  assert.equal(build.status, 0, build.stderr);
  const archive = path.join(output, 'proxyhub-deploy-0.2.0.tar.gz');
  const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  assert.equal(listing.status, 0, listing.stderr);
  assert.deepEqual(
    listing.stdout.trim().split('\n').sort(),
    ['.env.example', 'VERSION', 'compatibility.json', 'compose.yaml', 'proxyhub']
  );
  const manifest = spawnSync(
    'tar',
    ['-xOf', archive, 'compatibility.json'],
    { encoding: 'utf8' }
  );
  assert.equal(manifest.status, 0, manifest.stderr);
  assert.equal(JSON.parse(manifest.stdout).proxyhub_version, '0.2.0');
});
