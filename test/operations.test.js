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
const deploymentCompose = fs.readFileSync(
  new URL('../deploy/compose.yaml', import.meta.url),
  'utf8'
);
const installer = fs.readFileSync(new URL('../install.sh', import.meta.url), 'utf8');

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
  assert.match(imageWorkflow, /image=ghcr\.io\/miozen\/proxyhub:dev/);
  assert.match(imageWorkflow, /image="ghcr\.io\/miozen\/proxyhub:\$GITHUB_REF_NAME"/);
  assert.match(imageWorkflow, /imagetools inspect "\$image"/);
  assert.match(imageWorkflow, /imagetools inspect xream\/sub-store:2\.36\.21/);
  assert.match(imageWorkflow, /grep -q 'linux\/amd64'/);
  assert.match(imageWorkflow, /grep -q 'linux\/arm64'/);
});

test('S3 publishes dev images manually and reserves automatic builds for release tags', () => {
  assert.match(imageWorkflow, /workflow_dispatch:/);
  assert.match(imageWorkflow, /tags:\s*\['v\*'\]/);
  assert.doesNotMatch(imageWorkflow, /branches:\s*\[dev\]/);
  assert.match(imageWorkflow, /github\.ref == 'refs\/heads\/dev'/);
  assert.match(imageWorkflow, /type=raw,value=dev,enable=/);
  assert.match(imageWorkflow, /type=ref,event=tag,enable=/);
  assert.match(imageWorkflow, /type=raw,value=latest,enable=/);
});

test('S4 publishes checksummed stable assets only after the tagged image succeeds', () => {
  assert.match(imageWorkflow, /release-assets:/);
  assert.match(imageWorkflow, /needs:\s*publish/);
  assert.match(imageWorkflow, /version="\$\{GITHUB_REF_NAME#v\}"/);
  assert.match(imageWorkflow, /scripts\/build-deployment-assets\.sh "\$version" dist/);
  assert.match(imageWorkflow, /sha256sum -c SHA256SUMS/);
  assert.match(imageWorkflow, /proxyhub-deploy-\$version\.tar\.gz/);
  assert.match(imageWorkflow, /gh release create "\$GITHUB_REF_NAME"/);
  assert.match(imageWorkflow, /dist\/install\.sh/);
  assert.match(imageWorkflow, /dist\/SHA256SUMS/);
  assert.match(imageWorkflow, /contents:\s*write/);
});

test('S3 keeps CI on dev and master while targeting expensive checks by changed paths', () => {
  assert.match(checkWorkflow, /branches:\s*\[dev, master\]/);
  assert.match(checkWorkflow, /Select targeted checks/);
  assert.match(checkWorkflow, /docker:\s*\$\{\{ steps\.scope\.outputs\.docker \}\}/);
  assert.match(checkWorkflow, /operations:\s*\$\{\{ steps\.scope\.outputs\.operations \}\}/);
  assert.match(checkWorkflow, /if: needs\.changes\.outputs\.docker == 'true'/);
  assert.match(checkWorkflow, /if: needs\.changes\.outputs\.operations == 'true'/);
  assert.doesNotMatch(checkWorkflow, /\*\.md/);
});

test('CI vulnerability scan checks the image built by the same job', () => {
  assert.match(checkWorkflow, /load:\s*true/);
  assert.match(checkWorkflow, /image:\s*proxyhub:ci/);
  assert.doesNotMatch(checkWorkflow, /image:\s*ghcr\.io\/miozen\/proxyhub:dev/);
});

test('O1.2 creates a minimal checksummed deployment artifact', () => {
  assert.match(assetBuilder, /proxyhub-deploy-\$version\.tar\.gz/);
  assert.match(assetBuilder, /deploy\/compose\.yaml" "\$stage\/compose\.yaml/);
  assert.match(assetBuilder, /\.env\.example" "\$stage\/\.env\.example/);
  assert.match(assetBuilder, /ops\/proxyhub" "\$stage\/proxyhub/);
  assert.match(assetBuilder, /--sort=name/);
  assert.match(assetBuilder, /sha256sum "\$archive_name" install\.sh >SHA256SUMS/);
  assert.match(checkWorkflow, /sha256sum -c SHA256SUMS/);
  assert.match(checkWorkflow, /diff -u expected\.txt contents\.txt/);
  assert.match(checkWorkflow, /actions\/upload-artifact@v4/);
});

test('O1.3 CLI selects fixed installed paths without breaking repository use', () => {
  assert.match(source, /DEFAULT_DEPLOY_DIR=\$SCRIPT_DIR/);
  assert.match(source, /ENV_FILE=\/etc\/proxyhub\/proxyhub\.env/);
  assert.match(source, /DATA_DIR=\$\{PROXYHUB_DATA_DIR:-\/var\/lib\/proxyhub\}/);
  assert.match(source, /LOG_DIR=\$\{PROXYHUB_LOG_DIR:-\/var\/log\/proxyhub\}/);
  assert.match(source, /--project-directory "\$DEPLOY_DIR"/);
  assert.match(source, /--env-file "\$ENV_FILE"/);
  assert.match(source, /-f "\$COMPOSE_FILE"/);
  assert.match(source, /ENV_FILE="\$DEPLOY_DIR\/\.env"/);
});

test('O1.3 deployment Compose pulls images and exposes only ProxyHub', () => {
  assert.doesNotMatch(deploymentCompose, /^\s+build:/m);
  assert.match(deploymentCompose, /image: \$\{PROXYHUB_IMAGE:\?PROXYHUB_IMAGE is required\}/);
  assert.match(deploymentCompose, /image: \$\{SUBSTORE_IMAGE:\?SUBSTORE_IMAGE is required\}/);
  assert.match(deploymentCompose, /"\$\{PORT:-3000\}:3000"/);
  const portDeclarations = deploymentCompose.match(/^\s+ports:/gm) || [];
  assert.equal(portDeclarations.length, 1);
  assert.match(checkWorkflow, /-f deploy\/compose\.yaml/);
});

test('O1.4 installer validates hosts, channels and immutable inputs', () => {
  assert.match(installer, /alpine\) HOST_OS=alpine/);
  assert.match(installer, /debian\) HOST_OS=debian/);
  assert.match(installer, /ubuntu\) HOST_OS=ubuntu/);
  assert.match(installer, /x86_64\|amd64\) HOST_ARCH=amd64/);
  assert.match(installer, /aarch64\|arm64\) HOST_ARCH=arm64/);
  assert.match(installer, /sha256sum -c archive\.sha256/);
  assert.match(installer, /valid_version\(\)/);
  assert.match(installer, /grep -Eq '\^\[A-Za-z0-9\._-\]\+\$'/);
  assert.match(installer, /valid_version "\$RELEASE_TAG" \|\| die "invalid release version"/);
  assert.doesNotMatch(installer, /\[\!\[:alnum:\]\._-\]/);
  assert.match(installer, /^RELEASE_VERSION=$/m);
  assert.doesNotMatch(installer, /^VERSION=$/m);
  assert.match(installer, /--version\) RELEASE_VERSION=/);
  assert.match(installer, /--ref is required for the dev channel/);
  assert.match(installer, /--image is required for the dev channel/);
  assert.match(installer, /port \$PORT is already in use/);
  assert.match(installer, /at least 512 MiB of free disk space is required/);
});

test('O1.4 installer preserves secrets and writes the fixed host layout', () => {
  assert.match(installer, /DEPLOY_DIR=\/opt\/proxyhub/);
  assert.match(installer, /ENV_FILE=\$CONFIG_DIR\/proxyhub\.env/);
  assert.match(installer, /DATA_DIR=\/var\/lib\/proxyhub/);
  assert.match(installer, /if \[ ! -f "\$ENV_FILE" \]; then/);
  assert.match(installer, /openssl rand -hex 32/);
  assert.match(installer, /legacy_env_file\(\)/);
  assert.match(installer, /com\.docker\.compose\.project\.working_dir/);
  assert.match(installer, /existing ProxyHub data requires its original SESSION_SECRET and DATA_ENCRYPTION_KEY/);
  assert.match(installer, /set_env SESSION_SECRET "\$legacy_session"/);
  assert.match(installer, /set_env DATA_ENCRYPTION_KEY "\$legacy_data_key"/);
  assert.match(installer, /PORT_EXPLICIT=false/);
  assert.match(installer, /SUBSTORE_VERSION_EXPLICIT=false/);
  assert.match(installer, /PORT=\$\(read_env PORT "\$PORT"\)/);
  assert.match(installer, /SUBSTORE_IMAGE=\$\(read_env SUBSTORE_IMAGE/);
  assert.match(installer, /ln -sf "\$DEPLOY_DIR\/proxyhub" "\$CLI_PATH"/);
  assert.match(installer, /"\$CLI_PATH" install/);
});

test('O1.4 release artifact includes the executable installer', () => {
  assert.match(assetBuilder, /install -m 0755 "\$root\/install\.sh"/);
  assert.match(assetBuilder, /sha256sum "\$archive_name" install\.sh/);
  assert.match(checkWorkflow, /dist\/install\.sh/);
  assert.match(checkWorkflow, /\.\/install\.sh --help/);
});

test('O1.5 discovers approved component images and pins digests', () => {
  assert.match(source, /latest_proxyhub_tag\(\)/);
  assert.match(source, /repos\/miozen\/proxyhub\/releases\/latest/);
  assert.match(source, /xream\/sub-store:\$tag/);
  assert.match(source, /resolve_image_digest\(\)/);
  assert.match(source, /docker image inspect "\$image"/);
  assert.match(source, /@sha256:/);
  assert.match(source, /image repository is not approved for \$component/);
  assert.match(source, /ghcr\.io\/miozen\/proxyhub/);
  assert.match(source, /ghcr\.io\/vonzhen\/proxyhub/);
});

test('O1.5 supports confirmed automatic and explicit component updates', () => {
  assert.match(source, /update_cmd\(\)/);
  assert.match(source, /--version\) version=/);
  assert.match(source, /--image\) image=/);
  assert.match(source, /--yes\) assume_yes=true/);
  assert.match(source, /confirmation required; rerun with --yes/);
  assert.match(source, /perform_update "\$component" "\$target"/);
  assert.match(source, /for component in proxyhub sub-store/);
});

test('O1.6 uninstall preserves data unless exact purge is confirmed', () => {
  assert.match(source, /Permanent deletion targets:/);
  assert.match(source, /Type DELETE to continue:/);
  assert.match(source, /PROXYHUB_PURGE_CONFIRM:-.*DELETE/);
  assert.match(source, /refusing purge: unexpected deployment path/);
  assert.match(source, /dc down --volumes --remove-orphans/);
  assert.match(source, /Configuration, backups, state, logs and Docker volumes retained/);
  assert.match(source, /Docker was retained/);
});

test('O1.6 failed clean install removes only newly created fixed-layout files', () => {
  assert.match(installer, /CLEAN_INSTALL=false/);
  assert.match(installer, /INSTALL_COMPLETE=false/);
  assert.match(installer, /\[ "\$status" -ne 0 \]/);
  assert.match(installer, /down --volumes --remove-orphans/);
  assert.match(installer, /Clean installation failed; newly created ProxyHub files were removed/);
  assert.match(installer, /INSTALL_COMPLETE=true/);
});

test('O1.6 CI covers retained reinstall and confirmed purge', () => {
  assert.match(checkWorkflow, /env_checksum=/);
  assert.match(checkWorkflow, /\/tmp\/proxyhub install/);
  assert.match(checkWorkflow, /PROXYHUB_PURGE_CONFIRM=DELETE/);
  assert.match(checkWorkflow, /Purged volumes unexpectedly remain/);
});
