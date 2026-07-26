# O1 - Multi-architecture one-command installation

Status: ACCEPTED
Branch: dev only
Depends on: command-line-only container operations

## Decisions

- Supported hosts: Alpine 3.20+, Debian 12+, Ubuntu 22.04+.
- Supported architectures: linux/amd64 and linux/arm64.
- ProxyHub and Sub-Store remain independently updateable and rollbackable.
- No web container controls, host agent, Docker Socket mount or automatic
  scheduled update.
- Stable installs use immutable GitHub Release assets and resolved image
  digests.
- Dev acceptance may use an explicit `dev-<sha>` image and commit archive.
- Default uninstall retains configuration, backups and Docker volumes.
- `--purge` requires exact `DELETE` confirmation and permanently removes data.
- Docker is never uninstalled by ProxyHub.

## O1.1 - Multi-architecture images

ProxyHub publishing:

- configure QEMU and Buildx;
- publish one manifest list containing `linux/amd64` and `linux/arm64`;
- keep `dev`, `dev-<sha>` and later release tags;
- record per-platform digests and the manifest-list digest;
- scan the published manifest/images without lowering High/Critical gates.

Sub-Store prerequisite:

- verify the pinned official image contains both amd64 and arm64 manifests;
- fail installation before mutation when the selected image lacks host support;
- do not emulate Sub-Store at runtime.

Acceptance:

- `docker buildx imagetools inspect` lists amd64 and arm64;
- native arm64 VM pulls and starts both images without `platform` emulation;
- `/healthz`, SQLite and Sub-Store health pass on arm64;
- amd64 behavior remains unchanged.

## O1.2 - Release deployment asset

Release contents:

```text
proxyhub-deploy-<version>.tar.gz
SHA256SUMS
install.sh
```

Implementation sequence:

- O1.2 builds the deployment archive and `SHA256SUMS` as a short-lived
  Actions Artifact on `dev`;
- O1.3 adapts the packaged Compose and CLI to the fixed host layout;
- O1.4 adds the fully functional `install.sh` to the same asset set;
- no incomplete installer is published as an artifact.

Deployment archive contains only runtime host files:

```text
compose.yaml
.env.example
ops/proxyhub
VERSION
```

Rules:

- build assets in CI from the exact tagged commit;
- generate SHA256 checksums in CI;
- attach assets only for an explicitly approved release tag;
- never publish a stable/latest Release from `dev`;
- before P9, exercise the packaging job as an Actions artifact only;
- installer verifies checksum and archive contents before installation.

## O1.3 - Host layout

```text
/opt/proxyhub/                 deployment files
/etc/proxyhub/proxyhub.env    mode 0600
/var/lib/proxyhub/backups/    retained backups
/var/lib/proxyhub/state/      rollback/update state
/var/log/proxyhub/            install/operation logs
/usr/local/bin/proxyhub       fixed CLI entry
```

Docker named volumes:

```text
proxyhub-data
proxyhub-substore-data
```

Compose must read the external env/config paths without storing secrets in the
release archive.

## O1.4 - Installer interface

Stable:

```sh
curl -fsSL https://github.com/Vonzhen/proxyhub/releases/latest/download/install.sh \
  -o /tmp/proxyhub-install.sh
sh /tmp/proxyhub-install.sh
```

Explicit version:

```sh
sh /tmp/proxyhub-install.sh --version 0.1.0
```

Dev acceptance:

```sh
sh /tmp/proxyhub-install.sh \
  --channel dev \
  --ref <commit-sha> \
  --image ghcr.io/vonzhen/proxyhub:dev-<sha>
```

Supported options:

```text
--channel stable|dev
--version <semver>
--ref <commit-sha>
--image <approved ProxyHub image>
--substore-version <semver>
--port <1-65535>
--yes
```

Installer steps:

1. require root and detect OS/architecture;
2. check disk, DNS/network and port availability;
3. install Docker/Compose only after confirmation when missing;
4. download an immutable deployment archive and checksum;
5. validate files before writing host paths;
6. preserve existing secrets/configuration on reinstall;
7. generate new secrets only on a clean install;
8. validate Compose;
9. verify both image manifests support the host architecture;
10. pull and start both services;
11. verify health, volume creation and Sub-Store port isolation;
12. print LAN/loopback URLs, paths and recovery commands.

Idempotency:

- repeated execution does not rotate keys, delete data or recreate the owner;
- an interrupted install can be rerun;
- pre-existing config/volumes require explicit reuse confirmation;
- failure removes only objects created by that failed clean-install attempt.

## O1.5 - Component updates

Daily commands:

```text
proxyhub check-updates [proxyhub|sub-store]
proxyhub update proxyhub
proxyhub update sub-store
```

Behavior:

- discover the newest stable version from the approved upstream only;
- show current version, target version and resolved digest;
- require confirmation, with `--yes` for automation;
- snapshot only the selected component;
- deploy the resolved immutable digest;
- health-check and automatically rollback on failure;
- never pull or recreate the other component.

Explicit selection:

```text
proxyhub update proxyhub --version <semver>
proxyhub update sub-store --version <semver>
proxyhub update proxyhub --image ghcr.io/vonzhen/proxyhub:<approved-tag-or-digest>
proxyhub update sub-store --image xream/sub-store:<approved-tag-or-digest>
```

No periodic auto-update is included.

## O1.6 - Uninstall

Default:

```text
proxyhub uninstall
```

- remove containers, network, deployment files and CLI entry;
- retain `/etc/proxyhub`, `/var/lib/proxyhub`, backups and named volumes;
- print the reinstall/recovery command;
- do not uninstall Docker.

Purge:

```text
proxyhub uninstall --purge
```

- list exact deletion targets;
- require interactive `DELETE` or `PROXYHUB_PURGE_CONFIRM=DELETE`;
- remove deployment, config, state, backups, logs and both named volumes;
- verify resolved paths before recursive deletion.

## O1.7 - Test matrix

Automated:

- shell syntax and installer option validation;
- archive/checksum and path-traversal rejection;
- OS/architecture detection fixtures;
- Docker-present and Docker-missing flows;
- port conflict, download failure and checksum failure;
- reinstall preserves secrets;
- default uninstall retains data;
- purge refuses missing confirmation;
- component update isolation and rollback;
- amd64/arm64 manifest assertions.

Real hosts:

- Alpine arm64 (required user target);
- Alpine amd64;
- Debian 12 amd64 or arm64;
- Ubuntu 22.04/24.04 amd64;
- clean install, owner initialization, restart persistence;
- uninstall/reinstall reuse;
- purge;
- ProxyHub and Sub-Store independent update/rollback.

## Hard stops

- no master change, release, stable tag or latest tag before explicit P9 approval;
- no Docker Socket in the application container;
- no arbitrary image repositories or shell input;
- no destructive purge without exact confirmation;
- no claim of arm64 support until native arm64 acceptance passes.

## Acceptance result

O1.1-O1.7 are accepted on 2026-07-26. Native Ubuntu ARM64 installation,
health, isolation, component updates, component rollbacks, normal uninstall and
retained-data reinstall passed. Exact artifacts and deferred compatibility
coverage are recorded in `O1_ACCEPTANCE_EVIDENCE.md`.
