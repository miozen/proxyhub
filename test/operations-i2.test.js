import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const command = fileURLToPath(new URL('../ops/proxyhub', import.meta.url));

function executable(file, content) {
  fs.writeFileSync(file, content, { mode: 0o755 });
}

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-i2-'));
  const bin = path.join(root, 'bin');
  const data = path.join(root, 'data');
  const state = path.join(root, '.proxyhub');
  const log = path.join(root, 'docker.log');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(root, '.env'), [
    'PORT=3000',
    'PROXYHUB_IMAGE=ghcr.io/miozen/proxyhub@sha256:abc',
    'SUBSTORE_IMAGE=xream/sub-store@sha256:def'
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'compose.yaml'), 'services: {}\n');

  executable(path.join(bin, 'wget'), `#!/bin/sh
printf '%s\\n' '{"status":"ok","checks":{"database":"ok","substore":{"reachable":true}}}'
`);
  executable(path.join(bin, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
if [ "$1" = compose ]; then
  shift
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --project-directory|--env-file|-f) shift 2 ;;
      *) break ;;
    esac
  done
  if [ "$1" = ps ] && [ "$2" = -q ]; then
    case "\${3:-all}" in
      proxyhub) echo proxyhub-id ;;
      sub-store) echo substore-id ;;
      all) printf '%s\\n' proxyhub-id substore-id ;;
    esac
  fi
  exit 0
fi
if [ "$1" = run ]; then
  backup_dir=
  archive=
  for argument in "$@"; do
    case "$argument" in
      *:/backup|*:/backup:ro) backup_dir=\${argument%%:/backup*} ;;
      *proxyhub-data.tgz*) archive=proxyhub-data.tgz ;;
      *substore-data.tgz*) archive=substore-data.tgz ;;
    esac
  done
  [ -z "$backup_dir" ] || [ -z "$archive" ] ||
    : >"$backup_dir/$archive"
  exit 0
fi
exit 0
`);

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_DOCKER_LOG: log,
    PROXYHUB_DEPLOY_DIR: root,
    PROXYHUB_COMPOSE_FILE: path.join(root, 'compose.yaml'),
    PROXYHUB_ENV_FILE: path.join(root, '.env'),
    PROXYHUB_DATA_DIR: data,
    PROXYHUB_LOG_DIR: path.join(root, 'logs'),
    PROXYHUB_LOCK_DIR: path.join(state, 'lock')
  };
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root, data, state, log, env,
    run(...args) {
      return spawnSync('sh', [command, ...args], {
        cwd: root,
        env,
        encoding: 'utf8'
      });
    }
  };
}

test('I2 refuses a live operation lock and recovers a proven stale lock', {
  skip: process.platform === 'win32'
}, (context) => {
  const f = fixture(context);
  const lock = path.join(f.state, 'lock');
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'pid'), `${process.pid}\n`);
  fs.writeFileSync(path.join(lock, 'command'), 'update sub-store\n');
  fs.writeFileSync(path.join(lock, 'started'), '20260727T000000Z\n');

  let result = f.run('start', 'proxyhub');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /operation locked by PID/);
  assert.equal(fs.readFileSync(path.join(lock, 'command'), 'utf8').trim(), 'update sub-store');

  fs.writeFileSync(path.join(lock, 'pid'), '99999999\n');
  result = f.run('start', 'proxyhub');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(lock), false);
});

test('I2 creates a checksummed component backup without stopping the other service', {
  skip: process.platform === 'win32'
}, (context) => {
  const f = fixture(context);
  const result = f.run('backup', 'proxyhub', 'unit');
  assert.equal(result.status, 0, result.stderr);
  const backup = path.join(f.root, 'backups', 'components', 'proxyhub', 'unit');
  assert.equal(result.stdout.trim(), backup);
  assert.match(fs.readFileSync(path.join(backup, 'metadata'), 'utf8'), /type=component/);
  assert.match(fs.readFileSync(path.join(backup, 'metadata'), 'utf8'), /component=proxyhub/);
  assert.ok(fs.existsSync(path.join(backup, 'SHA256SUMS')));
  assert.ok(fs.existsSync(path.join(backup, 'proxyhub-data.tgz')));
  const dockerLog = fs.readFileSync(f.log, 'utf8');
  assert.match(dockerLog, /stop proxyhub/);
  assert.doesNotMatch(dockerLog, /stop sub-store/);
});

test('I2 refuses a component restore after checksum tampering', {
  skip: process.platform === 'win32'
}, (context) => {
  const f = fixture(context);
  let result = f.run('backup', 'sub-store', 'tamper');
  assert.equal(result.status, 0, result.stderr);
  const backup = path.join(
    f.root, 'backups', 'components', 'sub-store', 'tamper'
  );
  fs.appendFileSync(path.join(backup, 'substore-data.tgz'), 'changed');
  fs.writeFileSync(f.log, '');

  result = f.run('restore', backup);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backup checksum validation failed/);
  assert.doesNotMatch(fs.readFileSync(f.log, 'utf8'), /stop sub-store/);
});
