import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
const command = new URL('../ops/proxyhub', import.meta.url);
const buildCommand = new URL(
  '../scripts/build-deployment-assets.sh',
  import.meta.url
);

function managedUpdateFixture(context, {
  failInstallOnce = false,
  failHealthOnce = false,
  incompleteArchive = false,
  legacyAssets = false
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-i5-update-'));
  const deploy = path.join(root, 'deploy');
  const bin = path.join(root, 'bin');
  const data = path.join(root, 'data');
  const release = path.join(root, 'release');
  const envFile = path.join(root, 'proxyhub.env');
  const dockerLog = path.join(root, 'docker.log');
  fs.mkdirSync(deploy, { recursive: true });
  fs.mkdirSync(bin);
  fs.mkdirSync(release);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const build = spawnSync('sh', [buildCommand.pathname, '0.2.0', release], {
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, build.stderr);
  if (incompleteArchive) {
    const archive = path.join(release, 'proxyhub-deploy-0.2.0.tar.gz');
    const incomplete = path.join(root, 'incomplete');
    fs.mkdirSync(incomplete);
    let archiveResult = spawnSync(
      'tar', ['-xzf', archive, '-C', incomplete], { encoding: 'utf8' }
    );
    assert.equal(archiveResult.status, 0, archiveResult.stderr);
    fs.rmSync(path.join(incomplete, 'compatibility.json'));
    archiveResult = spawnSync('tar', [
      '-czf', archive, '-C', incomplete,
      '.env.example', 'VERSION', 'compose.yaml', 'proxyhub'
    ], { encoding: 'utf8' });
    assert.equal(archiveResult.status, 0, archiveResult.stderr);
    const digest = createHash('sha256')
      .update(fs.readFileSync(archive))
      .digest('hex');
    fs.writeFileSync(
      path.join(release, 'SHA256SUMS'),
      `${digest}  proxyhub-deploy-0.2.0.tar.gz\n`
    );
  }
  fs.writeFileSync(path.join(deploy, 'compose.yaml'), 'services: {}\n');
  fs.writeFileSync(path.join(deploy, '.env.example'), 'PORT=3000\n', { mode: 0o600 });
  fs.writeFileSync(path.join(deploy, 'VERSION'), '0.1.5\n');
  if (!legacyAssets) {
    fs.writeFileSync(path.join(deploy, 'compatibility.json'), JSON.stringify({
      schema: 1,
      proxyhub_version: '0.1.5',
      manager_min_version: '0.1.5',
      compose_revision: 1,
      environment_revision: 1,
      substore_min_version: null,
      substore_max_version_exclusive: null
    }, null, 2));
  }
  const cli = path.join(deploy, 'proxyhub');
  fs.copyFileSync(command, cli);
  fs.chmodSync(cli, 0o755);
  fs.writeFileSync(envFile, [
    'PORT=3000',
    'PROXYHUB_IMAGE=ghcr.io/miozen/proxyhub@sha256:old',
    'SUBSTORE_IMAGE=xream/sub-store@sha256:unchanged',
    'SESSION_SECRET=keep-this-secret',
    ''
  ].join('\n'), { mode: 0o600 });

  fs.writeFileSync(path.join(bin, 'curl'), `#!/bin/sh
url=
output=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output=$2; shift 2 ;;
    http*) url=$1; shift ;;
    *) shift ;;
  esac
done
case "$url" in
  */SHA256SUMS) cp "$RELEASE_DIR/SHA256SUMS" "$output" ;;
  */proxyhub-deploy-0.2.0.tar.gz)
    cp "$RELEASE_DIR/proxyhub-deploy-0.2.0.tar.gz" "$output"
    ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'wget'), `#!/bin/sh
if [ "$FAIL_HEALTH_ONCE" = 1 ]; then
  count=0
  [ ! -f "$HEALTH_COUNT" ] || count=$(cat "$HEALTH_COUNT")
  count=$((count + 1))
  echo "$count" >"$HEALTH_COUNT"
  [ "$count" -ne 3 ] || exit 1
fi
printf '%s\\n' '{"status":"ok","checks":{"database":"ok","substore":{"reachable":true}}}'
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >>"$DOCKER_LOG"
if [ "$1" = image ] && [ "$2" = inspect ]; then
  case "$*" in
    *RepoDigests*) echo ghcr.io/miozen/proxyhub@sha256:new ;;
    *'{{.Os}}'*) echo linux ;;
    *'{{.Architecture}}'*) echo "$HOST_IMAGE_ARCH" ;;
    *'{{.Id}}'*) echo new-image-id ;;
  esac
  exit 0
fi
if [ "$1" = inspect ]; then echo old-image-id; exit 0; fi
if [ "$1" = compose ]; then
  shift
  while [ "$#" -gt 0 ]; do
    case "$1" in --project-directory|--env-file|-f) shift 2 ;; *) break ;; esac
  done
  if [ "$1" = ps ] && [ "$2" = -q ]; then
    case "\${3:-}" in
      proxyhub) echo proxyhub-id ;;
      sub-store) echo substore-id ;;
    esac
  fi
  exit 0
fi
if [ "$1" = run ]; then
  backup_dir=
  for argument in "$@"; do
    case "$argument" in *:/backup) backup_dir=\${argument%:/backup} ;; esac
  done
  case "$*" in
    *proxyhub-data.tgz*) [ -z "$backup_dir" ] || : >"$backup_dir/proxyhub-data.tgz" ;;
  esac
  exit 0
fi
exit 0
`, { mode: 0o755 });
  if (failInstallOnce) {
    fs.writeFileSync(path.join(bin, 'install'), `#!/bin/sh
if [ ! -f "$INSTALL_FAILED_MARKER" ]; then
  : >"$INSTALL_FAILED_MARKER"
  exit 1
fi
exec /usr/bin/install "$@"
`, { mode: 0o755 });
  }

  return {
    deploy,
    data,
    envFile,
    dockerLog,
    run() {
      return spawnSync(cli, ['update', 'proxyhub', '--version', '0.2.0', '--yes'], {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RELEASE_DIR: release,
          DOCKER_LOG: dockerLog,
          HOST_IMAGE_ARCH: process.arch === 'arm64' ? 'arm64' : 'amd64',
          FAIL_HEALTH_ONCE: failHealthOnce ? '1' : '0',
          HEALTH_COUNT: path.join(root, 'health-count'),
          INSTALL_FAILED_MARKER: path.join(root, 'install-failed'),
          PROXYHUB_ENV_FILE: envFile,
          PROXYHUB_DATA_DIR: data,
          PROXYHUB_LOG_DIR: path.join(root, 'logs'),
          PROXYHUB_LOCK_DIR: path.join(data, 'state', 'lock'),
          PROXYHUB_HEALTH_ATTEMPTS: '1'
        }
      });
    }
  };
}

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

test('I5 installed ProxyHub backup captures assets without stopping Sub-Store', {
  skip: process.platform === 'win32'
}, (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-i5-backup-'));
  const deploy = path.join(root, 'deploy');
  const bin = path.join(root, 'bin');
  const data = path.join(root, 'data');
  const envFile = path.join(root, 'proxyhub.env');
  const dockerLog = path.join(root, 'docker.log');
  fs.mkdirSync(deploy, { recursive: true });
  fs.mkdirSync(bin);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.writeFileSync(path.join(deploy, 'compose.yaml'), 'services: {}\n');
  fs.writeFileSync(path.join(deploy, '.env.example'), 'PORT=3000\n', { mode: 0o600 });
  fs.writeFileSync(path.join(deploy, 'VERSION'), '0.1.5\n');
  fs.writeFileSync(path.join(deploy, 'compatibility.json'), JSON.stringify({
    schema: 1,
    proxyhub_version: '0.1.5',
    manager_min_version: '0.1.5',
    compose_revision: 1,
    environment_revision: 1,
    substore_min_version: null,
    substore_max_version_exclusive: null
  }, null, 2));
  const cli = path.join(deploy, 'proxyhub');
  fs.writeFileSync(cli, source, { mode: 0o755 });
  fs.writeFileSync(envFile, [
    'PORT=3000',
    'PROXYHUB_IMAGE=ghcr.io/miozen/proxyhub@sha256:abc',
    'SUBSTORE_IMAGE=xream/sub-store@sha256:def',
    'SESSION_SECRET=secret-not-for-output',
    ''
  ].join('\n'), { mode: 0o600 });
  fs.writeFileSync(path.join(bin, 'wget'), `#!/bin/sh
printf '%s\\n' '{"status":"ok","checks":{"database":"ok","substore":{"reachable":true}}}'
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >>"$DOCKER_LOG"
if [ "$1" = compose ]; then
  shift
  while [ "$#" -gt 0 ]; do
    case "$1" in --project-directory|--env-file|-f) shift 2 ;; *) break ;; esac
  done
  if [ "$1" = ps ] && [ "$2" = -q ]; then echo proxyhub-id; fi
  exit 0
fi
if [ "$1" = run ]; then
  for argument in "$@"; do
    case "$argument" in *:/backup) backup_dir=\${argument%:/backup} ;; esac
  done
  : >"$backup_dir/proxyhub-data.tgz"
fi
`, { mode: 0o755 });

  const result = spawnSync(cli, ['backup', 'proxyhub', 'asset-point'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      DOCKER_LOG: dockerLog,
      PROXYHUB_ENV_FILE: envFile,
      PROXYHUB_DATA_DIR: data,
      PROXYHUB_LOG_DIR: path.join(root, 'logs'),
      PROXYHUB_LOCK_DIR: path.join(data, 'state', 'lock')
    }
  });
  assert.equal(result.status, 0, result.stderr);
  const backup = path.join(
    data, 'backups', 'components', 'proxyhub', 'asset-point'
  );
  assert.ok(fs.existsSync(path.join(backup, 'deployment-assets.tgz')));
  assert.equal(
    fs.readFileSync(path.join(backup, 'proxyhub.env'), 'utf8'),
    fs.readFileSync(envFile, 'utf8')
  );
  const listing = spawnSync(
    'tar',
    ['-tzf', path.join(backup, 'deployment-assets.tgz')],
    { encoding: 'utf8' }
  );
  assert.equal(listing.status, 0, listing.stderr);
  assert.match(listing.stdout, /\.\/compatibility\.json/);
  const calls = fs.readFileSync(dockerLog, 'utf8');
  assert.match(calls, /stop proxyhub/);
  assert.doesNotMatch(calls, /stop sub-store/);
});

test('I5 asset revision update switches assets and recreates only ProxyHub', {
  skip: process.platform === 'win32'
}, (context) => {
  const fixture = managedUpdateFixture(context);
  const result = fixture.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(fixture.deploy, 'VERSION'), 'utf8').trim(), '0.2.0');
  const environment = fs.readFileSync(fixture.envFile, 'utf8');
  assert.match(environment, /PROXYHUB_IMAGE=ghcr\.io\/miozen\/proxyhub@sha256:new/);
  assert.match(environment, /SUBSTORE_IMAGE=xream\/sub-store@sha256:unchanged/);
  assert.match(environment, /SESSION_SECRET=keep-this-secret/);
  const calls = fs.readFileSync(fixture.dockerLog, 'utf8');
  assert.match(calls, /up -d --no-deps proxyhub/);
  assert.doesNotMatch(calls, /up -d --no-deps sub-store/);
  assert.doesNotMatch(calls, /stop sub-store/);
});

test('I5 incomplete release records a completed asset-stage failure', {
  skip: process.platform === 'win32'
}, (context) => {
  const fixture = managedUpdateFixture(context, { incompleteArchive: true });
  const result = fixture.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /deployment archive contains unexpected files/);
  const operations = fs.readdirSync(
    path.join(fixture.data, 'state', 'operations')
  );
  const operation = fs.readFileSync(
    path.join(fixture.data, 'state', 'operations', operations.at(-1)),
    'utf8'
  );
  assert.match(operation, /phase=asset_stage/);
  assert.match(operation, /result=failed/);
  assert.match(operation, /failed_phase=asset_stage/);
  assert.match(operation, /backup=none/);
  assert.doesNotMatch(fs.readFileSync(fixture.dockerLog, 'utf8'), /stop proxyhub/);
});

test('I5 injected asset-apply failure restores image, environment and assets', {
  skip: process.platform === 'win32'
}, (context) => {
  const fixture = managedUpdateFixture(context, { failInstallOnce: true });
  const result = fixture.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /asset switch failed; rolling back/);
  assert.equal(fs.readFileSync(path.join(fixture.deploy, 'VERSION'), 'utf8').trim(), '0.1.5');
  const environment = fs.readFileSync(fixture.envFile, 'utf8');
  assert.match(environment, /PROXYHUB_IMAGE=ghcr\.io\/miozen\/proxyhub@sha256:old/);
  assert.match(environment, /SUBSTORE_IMAGE=xream\/sub-store@sha256:unchanged/);
  const operations = fs.readdirSync(path.join(fixture.data, 'state', 'operations'));
  const operation = fs.readFileSync(
    path.join(fixture.data, 'state', 'operations', operations.at(-1)),
    'utf8'
  );
  assert.match(operation, /failed_phase=asset_apply/);
  assert.match(operation, /rollback=rolled_back/);
  assert.doesNotMatch(fs.readFileSync(fixture.dockerLog, 'utf8'), /stop sub-store/);
});

test('I5 injected ProxyHub health failure restores the complete rollback point', {
  skip: process.platform === 'win32'
}, (context) => {
  const fixture = managedUpdateFixture(context, { failHealthOnce: true });
  const result = fixture.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /update failed; rolling back/);
  assert.equal(fs.readFileSync(path.join(fixture.deploy, 'VERSION'), 'utf8').trim(), '0.1.5');
  const environment = fs.readFileSync(fixture.envFile, 'utf8');
  assert.match(environment, /PROXYHUB_IMAGE=ghcr\.io\/miozen\/proxyhub@sha256:old/);
  assert.match(environment, /SUBSTORE_IMAGE=xream\/sub-store@sha256:unchanged/);
});

test('I5 rollback preserves absence of compatibility manifest in legacy assets', {
  skip: process.platform === 'win32'
}, (context) => {
  const fixture = managedUpdateFixture(context, {
    failHealthOnce: true,
    legacyAssets: true
  });
  assert.equal(
    fs.existsSync(path.join(fixture.deploy, 'compatibility.json')),
    false
  );
  const result = fixture.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /update failed; rolling back/);
  assert.equal(
    fs.existsSync(path.join(fixture.deploy, 'compatibility.json')),
    false
  );
  assert.equal(
    fs.readFileSync(path.join(fixture.deploy, 'VERSION'), 'utf8').trim(),
    '0.1.5'
  );
});

