# Stability lifecycle design

Status: DESIGN_APPROVED  
Branch: `dev` only until implementation and host acceptance pass  
Goal: predictable long-running bridge between Sub-Store and sing-box

## 1. Fixed boundaries

```text
install             fresh install only
install --replace   destructive clean replacement
update              only version-changing path that preserves data
rollback            component-scoped image/state rollback
uninstall           destructive removal of all managed state
```

Managed state:

```text
/opt/proxyhub
/etc/proxyhub
/var/lib/proxyhub
/var/log/proxyhub
/usr/local/bin/proxyhub
proxyhub-proxyhub-1
proxyhub-sub-store-1
proxyhub_internal
proxyhub-data
proxyhub-substore-data
```

Docker Engine, Compose, host packages, external backups and image cache are
never removed.

## 2. L1 installer and replacement

### Fresh install

Before mutation:

1. validate host, architecture and arguments;
2. resolve and checksum the ProxyHub release assets;
3. resolve target ProxyHub and Sub-Store images;
4. pull both images and resolve immutable digests;
5. detect every managed-state target.

If no managed state exists, generate new secrets and install.

If any managed state exists, abort with `already_installed` unless
`--replace` is present. No legacy `.env` search, secret adoption, data-volume
reuse or partial overwrite remains in the fresh path.

### Clean replacement

`--replace` is equivalent to confirmed uninstall followed by fresh install.
Assets and images must be validated/pulled before deletion. Destruction
requires literal confirmation:

```text
PROXYHUB_REPLACE_CONFIRM=DELETE
```

`--yes` cannot replace this confirmation. After deletion, installation uses
new volumes, database and secrets. Replacement has no rollback guarantee.

## 3. L2 uninstall

`proxyhub uninstall` always removes every managed-state target. The old
data-retaining mode and `--purge` distinction are removed.

Interactive execution requires typing `DELETE`; automation requires:

```text
PROXYHUB_UNINSTALL_CONFIRM=DELETE
```

Target paths and volume names are checked against the exact allow-list before
deletion. Missing targets are idempotent success. Uninstall never removes
Docker, host packages, external files or image cache.

## 4. L3 Sub-Store stable resolution

Upstream `xream/sub-store:latest` is the stable-channel selector. It is used
only for discovery:

1. pull `xream/sub-store:latest`;
2. resolve its immutable repository digest;
3. verify the pulled manifest supports the current host architecture;
4. persist `xream/sub-store@sha256:...` in the installed environment.

The running Compose file never retains `:latest`.

`--substore-version X` resolves `xream/sub-store:X` instead. A discovery or
digest-resolution failure aborts without changing the current installation.

`proxyhub update sub-store --yes` repeats stable-channel discovery. If current
and target digests match, it exits successfully without stopping or recreating
either container. Explicit `--version` remains available for pin/downgrade.

## 5. L4 bounded runtime storage

### Container logs

Both services use:

```yaml
logging:
  driver: json-file
  options:
    max-size: "5m"
    max-file: "3"
```

Maximum retained container log payload is approximately 15 MiB per service.
Existing `proxyhub logs` behavior remains unchanged.

### Generation history

After each `generation_runs` insert, the same database transaction deletes
older rows for that user and retains exactly the newest 10 by
`started_at DESC, id DESC`.

The last-success configuration cache is independent and never deleted by
history pruning. The status API and dashboard limit are changed from 20 to 10.

### Automatic backups

Pre-update backups are classified by component and automatic prefix. After a
successful backup, retain the newest five automatic backups for that component
and delete older automatic backups only.

Manual named backups are not automatically pruned. Uninstall/replacement
removes all internal backups under `/var/lib/proxyhub/backups`; external
backups are outside scope.

## 6. L5 failure invariants

- Fresh install never consumes pre-existing volumes.
- Update never regenerates secrets or deletes application data.
- A failed version lookup/pull/check leaves running containers unchanged.
- Component update/restart/rollback never recreates the other component.
- Automatic backup pruning runs only after the new backup is verified.
- Log rotation is Docker-owned; no cron or background scheduler is added.
- No Docker Socket is mounted into ProxyHub and no web lifecycle API is added.

## 7. L6 implementation order and acceptance

### L6.1 lifecycle core

- replace installer reuse logic with fresh/refuse/replace state machine;
- make uninstall destructive by default with exact confirmation;
- share one allow-listed destructive cleanup function.

Acceptance:

- fresh install succeeds;
- second install refuses without `--replace`;
- confirmed replacement produces new secrets and empty volumes;
- unconfirmed replacement/uninstall changes nothing;
- confirmed uninstall leaves no managed state.

### L6.2 Sub-Store resolver

- stable discovery via upstream `latest`;
- digest pinning and host-platform verification;
- install/update explicit-version override;
- same-digest no-op.

Acceptance:

- installed environment contains a digest, not `:latest`;
- discovery failure preserves the running service;
- no-op update keeps both container IDs;
- real update changes only the Sub-Store container.

### L6.3 bounded storage

- Compose log rotation for both development and deployment files;
- transactional 10-row generation history retention;
- five automatic pre-update backups per component.

Acceptance:

- Compose rendering contains exact log limits;
- the 11th generation removes only the oldest row for that user;
- cache and other users remain unchanged;
- the sixth automatic backup removes only the oldest matching component
  backup;
- manual/external backups remain unchanged.

### L6.4 documentation and host gates

- update README and operations commands;
- remove all default-retain/`--purge` wording;
- Alpine amd64: clean install, replace, update, uninstall;
- Ubuntu arm64: clean install, replace, update, uninstall;
- verify Sub-Store backup/restore after fresh installation;
- verify logs, health and client generation after restart.

Release only after local tests, GitHub checks and both real-host gates pass.

