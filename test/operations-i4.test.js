import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const source = fs.readFileSync(new URL('../ops/proxyhub', import.meta.url), 'utf8');
const isPosix = process.platform !== 'win32';

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyhub-i4-'));
  const bin = path.join(root, 'bin');
  const deploy = path.join(root, 'deploy');
  const ops = path.join(deploy, 'ops');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(ops, { recursive: true });
  fs.writeFileSync(path.join(deploy, '.env'), [
    'PROXYHUB_IMAGE=ghcr.io/miozen/proxyhub@sha256:proxy',
    'SUBSTORE_IMAGE=xream/sub-store@sha256:substore',
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(deploy, 'docker-compose.yml'), 'services: {}\n');
  const cli = path.join(ops, 'proxyhub');
  fs.writeFileSync(cli, source, { mode: 0o755 });
  const dockerLog = path.join(root, 'docker.log');
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >>"$DOCKER_LOG"
case "$*" in
  *" ps -q proxyhub") echo proxyhub-id ;;
  *" ps -q sub-store") echo substore-id ;;
esac
`, { mode: 0o755 });
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    cli,
    dockerLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      DOCKER_LOG: dockerLog,
      NO_COLOR: '1'
    }
  };
}

test('I4 bare non-TTY invocation prints help and never waits for input', {
  skip: !isPosix
}, (context) => {
  const { cli, env } = fixture(context);
  const result = spawnSync(cli, [], { env, encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: proxyhub \[menu\]/);
  assert.match(result.stdout, /proxyhub doctor/);
});

test('I4 explicit menu refuses a non-interactive stream', {
  skip: !isPosix
}, (context) => {
  const { cli, env } = fixture(context);
  const result = spawnSync(cli, ['menu'], {
    env,
    encoding: 'utf8',
    input: '0\n',
    timeout: 3000
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /menu requires an interactive terminal/);
});

test('I4 menu snapshot exits safely and invalid input performs no mutation', {
  skip: !isPosix
}, (context) => {
  const probe = spawnSync('script', ['--version'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') {
    context.skip('script(1) is unavailable');
    return;
  }
  const { cli, dockerLog, env } = fixture(context);
  const result = spawnSync(
    'script',
    ['-qec', `${cli} menu`, '/dev/null'],
    { env, encoding: 'utf8', input: 'invalid\n0\n', timeout: 5000 }
  );
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.replace(/\r/g, '');
  assert.match(output, /ProxyHub management/);
  assert.match(output, /Component\s+State\s+Version \/ image\s+Update/);
  assert.match(output, /proxyhub\s+running.*not checked/);
  assert.match(output, /sub-store\s+running.*not checked/);
  assert.match(output, /1\. ProxyHub/);
  assert.match(output, /4\. Backup and restore/);
  assert.match(output, /6\. Diagnostics/);
  assert.match(output, /Invalid selection; no action was run\./);
  assert.doesNotMatch(output, /\u001b\[/);

  const dockerCalls = fs.readFileSync(dockerLog, 'utf8');
  assert.match(dockerCalls, /ps -q proxyhub/);
  assert.match(dockerCalls, /ps -q sub-store/);
  assert.doesNotMatch(
    dockerCalls,
    /(?:^| )(?:up|stop|restart|pull|down|rm)(?: |$)/
  );
});

test('I4 menu routes actions through the public CLI command surface', () => {
  assert.match(source, /Command: proxyhub/);
  assert.match(source, /"\$SCRIPT" "\$@"/);
  assert.match(source, /menu_command update "\$menu_component"/);
  assert.match(source, /menu_command backup "\$menu_component"/);
  assert.match(source, /menu_command rollback "\$menu_component"/);
  assert.doesNotMatch(source, /eval /);
});

test('I4 input, signal and output rules are explicit', () => {
  assert.match(source, /\[ -t 0 \] && \[ -t 1 \]/);
  assert.match(source, /IFS= read -r MENU_REPLY \|\| return 1/);
  assert.match(source, /trap 'printf "\\n"; exit 0' HUP INT TERM/);
  assert.match(source, /Invalid selection; no action was run\./);
  assert.match(source, /NO_COLOR/);
  assert.match(
    source,
    /menu_image=\$\(get_env "\$\(component_env_key "\$menu_component"\)" unknown\)/
  );
});
