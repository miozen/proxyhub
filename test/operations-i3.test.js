import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const installer = fs.readFileSync(new URL('../install.sh', import.meta.url), 'utf8');

test('I3 selects semi-interactive mode only when both standard streams are TTYs', () => {
  assert.match(installer, /if \[ -t 0 \] && \[ -t 1 \]; then\s+INTERACTIVE=true/);
  assert.match(
    installer,
    /clean installation confirmation required; rerun with --yes/
  );
  assert.match(installer, /\[ "\$ASSUME_YES" = true \] && return 0/);
  assert.doesNotMatch(installer, /read -r .*\|\| true/);
});

test('I3 asks for an omitted port and gives exact occupied-port automation guidance', () => {
  assert.match(installer, /PORT_EXPLICIT=false/);
  assert.match(installer, /\[ "\$PORT_EXPLICIT" = false \] \|\| return 0/);
  assert.match(installer, /ProxyHub host port \[3000\]:/);
  assert.match(installer, /Choose another host port:/);
  assert.match(
    installer,
    /port \$PORT is already in use; rerun with --port <available-port> --yes/
  );
  assert.match(installer, /validate_port "\$REPLY"/);
});

test('I3 reports preflight and a resolved summary before clean-install confirmation', () => {
  for (const marker of [
    'supported host:',
    'required host utilities',
    'Docker with Compose'
  ]) {
    assert.match(installer, new RegExp(marker));
  }
  for (const field of [
    'Resolved installation',
    'Public URL:',
    'ProxyHub release:',
    'ProxyHub image:',
    'Sub-Store selector:',
    'Sub-Store image:',
    'Containers:',
    'Network:',
    'Volumes:',
    'Configuration:',
    'Data and state:',
    'Backups:',
    'Logs:',
    'Host packages:'
  ]) {
    assert.match(installer, new RegExp(field));
  }
  assert.ok(
    installer.lastIndexOf('show_install_summary') <
      installer.lastIndexOf('confirm_clean_install'),
    'summary call must precede clean-install confirmation'
  );
  assert.match(installer, /Continue with this clean installation\? \[Y\/n\]/);
});

test('I3 keeps exact replacement confirmation and writes installed state atomically', () => {
  assert.match(installer, /PROXYHUB_REPLACE_CONFIRM:-.*DELETE/);
  assert.match(installer, /Type DELETE to replace the existing installation:/);
  assert.match(installer, /INSTALLATION_STATE=\$DATA_DIR\/state\/installation/);
  assert.match(installer, /state_temp=\$INSTALLATION_STATE\.tmp\.\$\$/);
  assert.match(installer, /chmod 600 "\$state_temp"/);
  assert.match(installer, /mv "\$state_temp" "\$INSTALLATION_STATE"/);
  assert.match(installer, /"\$CLI_PATH" install\s+write_installation_state/);
});

test('I3 cancellation occurs before managed directories are created', () => {
  const confirmation = installer.lastIndexOf(
    'confirm_clean_install || die "installation cancelled"'
  );
  const firstManagedWrite = installer.lastIndexOf(
    'mkdir -p "$DEPLOY_DIR" "$CONFIG_DIR"'
  );
  assert.ok(confirmation > -1);
  assert.ok(firstManagedWrite > confirmation);
});

