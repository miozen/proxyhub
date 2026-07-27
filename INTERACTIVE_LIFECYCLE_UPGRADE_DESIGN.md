# Interactive lifecycle upgrade design

Status: DESIGN_APPROVED

Branch policy: implement and accept on `dev`; merge to `master` only after the
gates in this document pass

Depends on: `STABILITY_LIFECYCLE_DESIGN.md`

Goal: default-first installation, an SSH terminal management menu, and
independent ProxyHub/Sub-Store lifecycles without a Docker Socket or a new
management service

## 1. Decision record

The approved operator experience is:

```text
semi-interactive installation
        +
SSH terminal management menu
        +
independent component lifecycles
```

This design adds a terminal interaction layer to the existing host CLI. It
does not add a web container-control API, a custom SSH daemon, an agent, a
scheduled updater, or a Docker Socket mount.

The interaction layer and non-interactive commands must call the same
allow-listed lifecycle functions. A menu is never a second implementation of
install, update, backup or rollback.

Runtime dependency and lifecycle coupling are separate concerns:

- ProxyHub may depend on the Sub-Store API to generate configurations;
- updating ProxyHub must not update or recreate Sub-Store;
- updating Sub-Store must not update ProxyHub deployment assets or recreate
  ProxyHub;
- compatibility checks may block an incompatible update, but they must never
  silently update the other component.

## 2. Current-source audit

Audit baseline: `master` commit `130fb28b37fbdc749e85d4f674f07f1522bee891`.

| Area | Current implementation | Target | Gap |
|---|---|---|---|
| Installation defaults | Port `3000`, stable ProxyHub release and stable Sub-Store discovery already have defaults | Keep safe defaults | No behavioral gap |
| Installation interaction | Prompts only for missing host dependencies and destructive replacement | Ask only decisions that change the deployment, then show one final summary | Missing |
| TTY behavior | `--yes` exists, but TTY/non-TTY modes are not formally separated | TTY gets default-first prompts; non-TTY requires complete defaults or `--yes` | Missing |
| Sub-Store mode | Installer always creates the managed Compose service | First implementation keeps managed Sub-Store; external mode is a later explicit gate | Deferred |
| SSH management | CLI requires explicit subcommands | `proxyhub` or `proxyhub menu` opens a terminal menu on a TTY | Missing |
| Service isolation | Component start uses `--no-deps`; update and restore recreate only the selected service | Preserve this invariant | Implemented |
| Update discovery | ProxyHub uses latest GitHub Release; Sub-Store uses official `latest` only for digest discovery | Preserve independent upstream discovery | Implemented |
| Same-digest update | Running image ID is compared with the resolved target | No container recreation | Implemented |
| Component update backup | Internal component backup/restore exists | Expose safe component-scoped manual backup and restore | Partial |
| Full backup | Stops and archives both services | Keep explicit `all` backup compatibility | Implemented, interface ambiguous |
| Rollback points | Separate state files exist for ProxyHub and Sub-Store | Add validated metadata and an inspectable rollback history | Partial |
| Operation concurrency | No lifecycle lock | Serialize mutating host operations | Missing |
| Update state | Image and last backup path are stored, but no durable transaction/status record exists | Record operation, phase, source/target digest and result | Missing |
| ProxyHub update | Changes `PROXYHUB_IMAGE` and recreates only the ProxyHub service | Also update signed/checksummed CLI, Compose and environment schema when required | Missing |
| Sub-Store update | Changes only `SUBSTORE_IMAGE`, its data backup and its container | Keep image/data-only lifecycle | Implemented |
| Health checks | ProxyHub health includes dependencies; Sub-Store accepts any response below 500 | Separate self-health, dependency health and strict component readiness | Partial |
| Compatibility | No release compatibility manifest | Block known incompatible combinations without automatic cross-component update | Missing |
| Backup validation | Archive presence is checked; metadata and archive checksum are absent | Validate type, component, schema and checksum before restore | Missing |
| Destructive safety | Exact confirmation and fixed targets exist | Preserve exact confirmation and add the lifecycle lock | Implemented, lock missing |
| CI image cost | Path targeting already skips Docker builds for documentation and host-only files | Keep image builds limited to runtime-image changes | Implemented |

## 3. Scope and compatibility

### 3.1 First implementation scope

The first accepted implementation includes:

- semi-interactive fresh installation for the existing managed two-container
  topology;
- a line-oriented terminal menu suitable for an SSH session;
- explicit `all`, `proxyhub` and `sub-store` lifecycle scopes;
- component-scoped manual backup and rollback metadata;
- a host-operation lock and interrupted-operation diagnostics;
- release deployment metadata for safe ProxyHub CLI/Compose upgrades;
- separate self-health and dependency-health reporting;
- tests and documentation for all new behavior.

### 3.2 Deferred scope

Connecting ProxyHub to an externally managed Sub-Store is deferred until a
separate design proves:

- owner UI proxy behavior;
- backend path reset behavior;
- backup ownership;
- health semantics;
- transition between managed and external modes.

The installer may display only the supported managed mode in the first
implementation. It must not present an unimplemented choice.

### 3.3 Existing installations

This is an in-place lifecycle upgrade, not a clean replacement:

- existing secrets and named volumes remain unchanged;
- existing digest-pinned images remain valid;
- missing state metadata is reconstructed from the environment and running
  containers;
- no database or Sub-Store data migration is required for the terminal
  interaction layer;
- destructive `install --replace` and `uninstall` semantics remain governed by
  `STABILITY_LIFECYCLE_DESIGN.md`.

## 4. Semi-interactive installer

## 4.1 Mode selection

```text
TTY + no --yes       default-first semi-interactive flow
TTY + --yes          non-interactive defaults and explicit options
non-TTY + --yes      automation flow
non-TTY without yes  continue only when no confirmation is required;
                      otherwise fail with an exact remediation command
```

`--help` performs no host mutation, image pull or network discovery.

## 4.2 Read-only preflight

Before asking deployment questions or mutating the host:

1. require root;
2. detect supported OS and architecture;
3. check disk space;
4. inspect Docker and Compose availability;
5. detect all managed state;
6. inspect the requested port;
7. resolve and checksum release assets;
8. resolve ProxyHub and Sub-Store candidate images;
9. verify image OS/architecture;
10. report warnings and blocking failures separately.

Display markers:

```text
[OK] supported and ready
[WARN] safe to continue with an explicit note
[FAIL] installation cannot continue
```

## 4.3 Necessary questions

The managed two-container installer asks at most:

1. ProxyHub host port, default `3000`, only when `--port` was not supplied;
2. whether to install missing Docker/Compose;
3. final confirmation after the resolved deployment summary.

ProxyHub and Sub-Store default to their current stable selectors. Advanced
version choices remain flags instead of routine questions:

```text
--version <proxyhub-version>
--substore-version <sub-store-version>
--image <approved-proxyhub-image>
```

If the default port is occupied, the installer asks for another port on a TTY
or fails with `--port` guidance in automation. It never silently chooses a
random port.

## 4.4 Final summary

Before the first host write, show:

```text
host OS and architecture
public URL and selected port
ProxyHub requested version/tag and resolved digest
Sub-Store requested version/tag and resolved digest
container, network and volume names
configuration, data, backup and log paths
whether Docker packages will be installed
```

The confirmation is `[Y/n]` for a clean installation. Exact `DELETE`
confirmation remains mandatory for replacement and cannot be bypassed by
`--yes`.

## 4.5 Transaction boundary

The installer records resources created by the current attempt. Installation
is complete only after:

- both containers are running;
- ProxyHub self-health passes;
- ProxyHub can reach Sub-Store;
- Sub-Store has no published host ports;
- both named volumes exist;
- installed state metadata is atomically written.

Failure removes only resources created by the failed clean-install attempt.

## 5. SSH terminal menu

## 5.1 Entry

```text
proxyhub          open the menu when stdin/stdout are TTYs
proxyhub menu     explicitly open the menu
proxyhub help     always print command help
```

With no TTY, bare `proxyhub` prints concise help and exits. The menu is
line-oriented POSIX shell output; full-screen ncurses and additional runtime
dependencies are out of scope.

## 5.2 Home

```text
ProxyHub management

Component      State       Version       Update
ProxyHub       running     vX.Y.Z        not checked
Sub-Store      running     X.Y.Z         not checked

1. ProxyHub
2. Sub-Store
3. Check updates
4. Backup and restore
5. Logs
6. Diagnostics
0. Exit
```

Opening the menu does not perform remote version checks. The operator selects
that action explicitly.

## 5.3 Component menu

Both component menus expose the same safe lifecycle vocabulary:

```text
status
check update
update latest stable
update selected version
rollback last update
start
stop
restart
logs
manual component backup
```

The menu shows the exact non-interactive command before a mutation and calls
the same underlying function as that command.

## 5.4 Input rules

- empty input accepts only displayed safe defaults;
- unexpected input returns to the same menu without mutation;
- EOF or Ctrl+C exits the current menu safely;
- secrets, tokens, subscription URLs and the full environment file are never
  printed;
- color is optional and `NO_COLOR` is respected;
- narrow or non-ANSI terminals receive plain text.

## 6. Command contract

The target command surface is:

```text
proxyhub [menu]
proxyhub status [all|proxyhub|sub-store]
proxyhub start [all|proxyhub|sub-store]
proxyhub stop [all|proxyhub|sub-store]
proxyhub restart [all|proxyhub|sub-store]
proxyhub logs [all|proxyhub|sub-store] [--tail=N] [-f]
proxyhub check-updates [all|proxyhub|sub-store]
proxyhub update <proxyhub|sub-store> [--version X|--image I] [--yes]
proxyhub rollback <proxyhub|sub-store> [--yes]
proxyhub backup [all|proxyhub|sub-store] [name]
proxyhub restore <backup-path> [--yes]
proxyhub doctor
proxyhub uninstall
```

Compatibility rules:

- omitted scope for `status`, `start`, `stop`, `restart`, `logs`,
  `check-updates` and `backup` remains equivalent to `all`;
- `update` and `rollback` always require one component;
- legacy image update options remain temporarily supported with a deprecation
  notice and are removed only in a later major CLI revision;
- menu labels are not a scripting API; documented commands and exit codes are.

No default `update all` command is introduced. Checking all components is
read-only and remains supported.

## 7. Independent update transactions

## 7.1 Shared phases

Each component update uses:

```text
DISCOVER
  -> RESOLVE
  -> COMPARE
  -> COMPATIBILITY_CHECK
  -> BACKUP
  -> APPLY
  -> HEALTH_CHECK
  -> COMMIT
```

On failure after `BACKUP`:

```text
ROLLBACK
  -> ROLLBACK_HEALTH_CHECK
  -> FAILED_ROLLED_BACK | FAILED_NEEDS_ATTENTION
```

Candidate lookup, pull or validation failure before `APPLY` leaves both
running containers unchanged.

## 7.2 Sub-Store update invariant

Sub-Store update may modify only:

- `SUBSTORE_IMAGE`;
- the Sub-Store data backup;
- the Sub-Store container;
- Sub-Store state and rollback metadata.

It must not replace the CLI, Compose file or environment template, and it must
not recreate ProxyHub. The apply command remains:

```sh
docker compose up -d --no-deps sub-store
```

## 7.3 ProxyHub update invariant

ProxyHub update may modify:

- `PROXYHUB_IMAGE`;
- ProxyHub data backup;
- ProxyHub container;
- checksummed release-managed CLI/Compose/template assets;
- ProxyHub state and rollback metadata.

It must not change `SUBSTORE_IMAGE`, restore the Sub-Store volume or recreate
Sub-Store.

Deployment assets are staged, validated and atomically switched. The previous
asset set is stored in the ProxyHub rollback point. Image-only releases remain
valid when the manifest declares no asset-schema change.

## 7.4 Compatibility manifest

Each future ProxyHub release deployment archive includes a checksummed
manifest:

```json
{
  "schema": 1,
  "proxyhub_version": "0.2.0",
  "manager_min_version": "0.1.5",
  "compose_revision": 1,
  "environment_revision": 1,
  "substore_min_version": null,
  "substore_max_version_exclusive": null
}
```

A compatibility failure prints the required operator action. It never invokes
`update sub-store` automatically.

## 8. State, lock and backup metadata

## 8.1 Operation lock

Mutating commands use one host lock under:

```text
/run/lock/proxyhub.lock
```

The lock records PID, command and start time. Install, update, rollback,
restore, replacement and uninstall are mutually exclusive. Status, logs and
read-only diagnostics remain available.

An abandoned lock is removed only after proving its recorded process no longer
exists. Lock paths and contents are treated as untrusted input.

## 8.2 Component state

State is stored under:

```text
/var/lib/proxyhub/state/installation
/var/lib/proxyhub/state/proxyhub
/var/lib/proxyhub/state/sub-store
/var/lib/proxyhub/state/operations/
```

Portable line-based, allow-listed state is preferred for the POSIX shell
implementation. If JSON is used, parsing must not require `eval` or an
additional package.

Each completed operation records:

- component;
- operation and result;
- start/finish UTC timestamps;
- source and target image digests;
- backup path;
- asset revision when applicable;
- failed phase and rollback result.

State files are mode `0600`, written through a same-directory temporary file
and atomically renamed.

## 8.3 Backup layout

```text
/var/lib/proxyhub/backups/
  full/
  components/proxyhub/
  components/sub-store/
```

Every new backup contains allow-listed metadata and SHA256 checksums. Restore
validates:

- schema;
- backup type;
- target component;
- archive checksum;
- image repository allow-list;
- canonical path remains under the backup root.

Automatic retention remains five pre-update backups per component. Manual
backups are never pruned automatically.

## 9. Health model

Status separates:

```text
container state
component self-health
dependency health
overall readiness
```

ProxyHub update rollback requires ProxyHub self-health. If Sub-Store was
healthy before the update and becomes unreachable only through the new
ProxyHub version, dependency regression also triggers rollback.

Sub-Store health uses a documented expected endpoint/status instead of
accepting every response below HTTP 500. Frontend and backend reachability are
reported separately when useful.

## 10. Implementation plan

These tasks are post-v0.1 work and do not renumber or reopen accepted P0-P9
history.

### I1 - Contract and audit

- I1.1 approve this source-gap record;
- I1.2 freeze the target CLI grammar and compatibility aliases;
- I1.3 add fixtures for TTY, non-TTY and component-scope parsing;
- I1.4 record the no-extra-image-build CI policy.

Acceptance:

- design and command contract are reviewed;
- documentation-only changes run no Docker image build;
- existing local suite remains green.

### I2 - Lifecycle foundation

Status: CODE_COMPLETE on `dev`; automated evidence is recorded in
`I2_ACCEPTANCE_EVIDENCE.md`. Real-host acceptance remains assigned to I6.

- I2.1 add the allow-listed operation lock;
- I2.2 add atomic operation/component state;
- I2.3 expose `all|proxyhub|sub-store` backup scopes;
- I2.4 add backup metadata and checksums;
- I2.5 preserve existing no-other-container update invariants;
- I2.6 improve component health classification.

Acceptance:

- concurrent mutations are refused;
- stale-lock handling is tested;
- each component backup/restore leaves the other container unchanged;
- malformed metadata/checksum restore is refused;
- update failure identifies its phase and rollback result.

### I3 - Semi-interactive installation

- I3.1 formalize TTY/non-TTY mode selection;
- I3.2 add read-only preflight reporting;
- I3.3 use `PORT_EXPLICIT` to ask only when necessary;
- I3.4 add the resolved final summary and clean-install confirmation;
- I3.5 record installed state atomically;
- I3.6 preserve exact replacement confirmation.

Acceptance:

- accepting defaults installs on a clean TTY host;
- `--yes` remains automation-safe;
- non-TTY execution never waits for input;
- occupied default port receives TTY correction or exact automation guidance;
- cancellation before confirmation leaves no managed state.

### I4 - SSH terminal menu

- I4.1 add bare-command TTY detection and `menu`;
- I4.2 add home/component/backup/log/diagnostic menus;
- I4.3 route every action through shared lifecycle functions;
- I4.4 support EOF, Ctrl+C, `NO_COLOR` and plain terminals;
- I4.5 add snapshot tests for menu flows.

Acceptance:

- menu actions and direct commands produce the same mutations and exit codes;
- non-TTY bare invocation does not block;
- invalid menu input performs no mutation;
- no secret appears in menu output.

### I5 - ProxyHub managed-asset update

- I5.1 define and package the compatibility manifest;
- I5.2 stage and validate release CLI/Compose/template assets;
- I5.3 include assets in ProxyHub rollback points;
- I5.4 atomically switch assets and recreate only ProxyHub;
- I5.5 restore assets/image/data on injected failures;
- I5.6 block incompatible Sub-Store combinations without updating Sub-Store.

Acceptance:

- an asset revision update replaces the CLI/Compose and only ProxyHub
  container;
- Sub-Store container ID and data remain unchanged;
- failure at every mutation phase restores the previous usable deployment;
- incompatible combinations print an actionable command and change nothing.

### I6 - Host acceptance and release

- I6.1 clean default-first install on Alpine amd64;
- I6.2 clean default-first install on Ubuntu arm64;
- I6.3 SSH menu lifecycle walkthrough;
- I6.4 independent real ProxyHub update/rollback;
- I6.5 independent real Sub-Store update/rollback;
- I6.6 interruption, lock and recovery walkthrough;
- I6.7 record exact commits, images, digests and evidence;
- I6.8 review `dev -> master`, then merge only after required checks and user
  authorization.

## 11. Validation and image-build policy

Local order:

```text
shell syntax
targeted operation/menu tests
full npm run ci
Compose rendering when Compose changes
Docker smoke only when runtime/Compose behavior changes
real-host gates only for the exact accepted dev commit
```

CI policy:

- Markdown-only design/documentation changes: no image build;
- `install.sh`, `ops/`, deployment assets: host/operations tests, no ProxyHub
  runtime image build;
- Compose-only changes: Compose validation and targeted service smoke where
  required;
- `src/`, runtime dependencies or Dockerfile changes: one cached CI image
  build;
- multi-architecture publishing: manual dev acceptance or approved `v*`
  release only;
- never rebuild an image solely to test menu text or documentation.

## 12. Delivery checkpoints

Every implementation checkpoint reports:

```text
completed I-task IDs
commit SHA
local evidence
GitHub Actions evidence
whether any image was built and why
remaining task IDs
host/user acceptance still required
```

Implementation commits remain coherent and land on `dev`. A `dev -> master`
PR is created only after the implemented scope's automated gates pass. Real
host requirements are never represented as passing from CI alone.
