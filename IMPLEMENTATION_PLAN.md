# ProxyHub v0.1 Execution Plan

Status: authoritative  
Branch policy: implement on `dev`; never modify/merge `master` without explicit user approval  
Scope baseline: user-approved P0-P9 plan  
Compatibility migration: out of scope

Post-release lifecycle amendment:

- `STABILITY_LIFECYCLE_DESIGN.md` supersedes P6.4, P6.9-P6.13 and any older
  install/uninstall retention wording;
- install is fresh-only unless explicitly invoked with destructive
  `--replace`;
- update is the only data-preserving version-change path;
- uninstall deletes all managed ProxyHub and Sub-Store state after exact
  confirmation;
- Sub-Store stable discovery, bounded logs/history/backups and their L1-L6
  acceptance gates are authoritative.

## 1. Execution protocol

This file is the single source of truth for phase numbers, scope and acceptance.
`TECHSPEC.md` defines architecture; it must not redefine delivery phases.

Phase states:

```text
NOT_STARTED -> IN_PROGRESS -> CODE_COMPLETE -> ACCEPTED
                         \-> BLOCKED
```

Rules:

1. Start one phase only after reporting its exact task IDs.
2. Keep each implementation commit limited to one coherent task group.
3. Push only to `dev`.
4. `CODE_COMPLETE` requires local checks and both GitHub workflows green.
5. `ACCEPTED` requires every phase acceptance item and explicit user confirmation.
6. Green CI proves the commit passed CI; it does not by itself prove phase acceptance.
7. Never silently move, merge, remove or renumber requirements.
8. Any deviation requires a written change record containing reason, impact and user approval.
9. At every checkpoint report:
   - completed task IDs;
   - commit SHA;
   - local and CI evidence;
   - remaining/blocked items;
   - exact next task IDs.
10. No `dev -> master` PR before P8 is accepted and the user explicitly starts P9.

Required evidence labels:

```text
UT  unit test
IT  API/integration test
BT  browser test
DT  Docker/Compose test
ST  security test
VT  VPS/VM test
CI  GitHub Actions
UA  explicit user acceptance
```

## 2. Current re-baseline

The earlier `TECHSPEC.md` phase list merged templates into P2 and shifted later
phase numbers. Existing commits remain valid, but are reassigned below.

| Phase | State | Existing implementation | Required closure |
|---|---|---|---|
| P0 | CODE_COMPLETE | runtime, DB, Docker, Compose, CI, GHCR | DT persistence and port evidence |
| P1 | ACCEPTED | auth, users, settings, sessions, CSRF, login limiting | accepted 2026-07-25 |
| P2 | ACCEPTED | subscriptions and generation engine | accepted 2026-07-25 |
| P3 | ACCEPTED | complete immutable template lifecycle | accepted 2026-07-25 |
| P4 | ACCEPTED | unified Vue dashboard/navigation | accepted 2026-07-25 |
| P5 | ACCEPTED | owner proxy, health, sync scheduler/history | accepted 2026-07-25 |
| P6 | CODE_COMPLETE | host lifecycle, backup/update/rollback command | real VM evidence deferred to P8 |
| P7 | CODE_COMPLETE | test/security matrix, platform CI and vulnerability gates | recovery guide VM execution deferred to P8 |
| P8 | IN_PROGRESS | immutable dev images and acceptance procedure | P8.1-P8.10 real-host evidence |
| P9 | NOT_STARTED | none | PR/release only by explicit approval |

Existing commit mapping:

```text
61ad942 -> P0
a0f35f8 -> P1
05086fb + f219598 -> P2 plus partial P3
368e66d -> P4 plus partial P3 UI
01f1a2c -> partial P5
```

## 3. P0 - Engineering foundation

Goal: reproducible, persistent runtime with only ProxyHub exposed.

Tasks:

- P0.1 Node.js 22 ESM project and Express bootstrap.
- P0.2 validated environment configuration and production secret checks.
- P0.3 SQLite initialization, WAL, foreign keys and idempotent migrations.
- P0.4 Dockerfile using Node.js 22.
- P0.5 Compose services for ProxyHub and official Sub-Store.
- P0.6 private internal network; only `${PORT:-3000}:3000` published.
- P0.7 persistent ProxyHub and Sub-Store volumes.
- P0.8 `/healthz` database and Sub-Store checks.
- P0.9 `.env.example`.
- P0.10 CI for install, syntax, tests, Docker build and Compose validation.
- P0.11 GHCR `dev` and `dev-<sha>` publishing.

Acceptance:

- P0.A1 fresh `docker compose up -d` succeeds. `[DT]`
- P0.A2 only host port 3000 is exposed. `[DT,ST]`
- P0.A3 direct host access to Sub-Store ports fails. `[DT,ST]`
- P0.A4 restart preserves both data stores. `[DT]`
- P0.A5 both workflows are green. `[CI]`

Exit: all P0.A items recorded, then user confirms P0.

## 4. P1 - Users and authorization

Goal: one shared ProxyHub identity system with owner approval.

Tasks:

- P1.1 first registered user becomes active owner atomically.
- P1.2 later registrations become pending members.
- P1.3 login/logout/session expiry and secure cookie modes.
- P1.4 owner approve/reject/disable/enable/delete.
- P1.5 username change without changing internal user ID.
- P1.6 password change requiring current password.
- P1.7 global registration switch.
- P1.8 per-user generation switch.
- P1.9 client token issue/reset; store hashes only.
- P1.10 revoke sessions/tokens on password change, disable and delete.
- P1.11 CSRF on cookie-authenticated mutations.
- P1.12 login rate limiting and safe authentication errors.
- P1.13 owner/member backend authorization tests.

Acceptance:

- P1.A1 first owner and pending-member flow passes. `[IT]`
- P1.A2 username change preserves owned data. `[IT]`
- P1.A3 password change invalidates old sessions. `[IT,ST]`
- P1.A4 disabled user cannot log in or generate. `[IT,ST]`
- P1.A5 registration and generation switches work. `[IT]`
- P1.A6 CSRF, cookie and login-limit tests pass. `[ST]`
- P1.A7 both workflows are green. `[CI]`

Exit: all P1.A items recorded, then user confirms P1.

## 5. P2 - singbox-center core port

Goal: preserve core generation behavior while isolating user data.

Tasks:

- P2.1 per-user subscription CRUD and enable switch.
- P2.2 per-subscription region authorization.
- P2.3 subscription test endpoint.
- P2.4 timeout, response-size and SSRF protection.
- P2.5 node parsing, cleaning and tag de-duplication.
- P2.6 airport-by-region URLTest groups.
- P2.7 `x_rule` injection and invalid-reference cleanup.
- P2.8 sing-box JSON output.
- P2.9 client-token subscription endpoint.
- P2.10 generation run status/error records.
- P2.11 last-success cache with owner-configurable fallback switch.
- P2.12 isolate one failed subscription from other successful sources.
- P2.13 strict cross-user isolation.
- P2.14 fixture-based comparison with original `singbox-center`.

Acceptance:

- P2.A1 fixed old/new fixtures have equivalent core structure. `[UT]`
- P2.A2 one source failure retains other source output. `[IT]`
- P2.A3 cache fallback obeys its setting. `[IT]`
- P2.A4 cross-user read/write/generation attempts fail. `[IT,ST]`
- P2.A5 SSRF, timeout and size-limit tests pass. `[UT,IT,ST]`
- P2.A6 both workflows are green. `[CI]`

Exit: all P2.A items recorded, then user confirms P2.

## 6. P3 - Template management

Goal: safe editable, cached and reversible template versions.

Tasks:

- P3.1 create from remote URL.
- P3.2 create from local/built-in JSON.
- P3.3 JSON structure validation.
- P3.4 outbound tag uniqueness and reference validation.
- P3.5 remote refresh with bounded safe fetch.
- P3.6 retain last successful remote content when refresh fails.
- P3.7 edit template and save as a new immutable version.
- P3.8 version list, hash, source and active status.
- P3.9 transactional activation.
- P3.10 explicit rollback to a selected history version.
- P3.11 verify generation uses the selected version.

Acceptance:

- P3.A1 invalid JSON/reference graph cannot activate. `[UT,IT]`
- P3.A2 remote failure retains usable cached content. `[IT]`
- P3.A3 editing creates a new version and preserves history. `[IT]`
- P3.A4 rollback changes generation to the chosen version. `[IT]`
- P3.A5 both workflows are green. `[CI]`

Exit: all P3.A items recorded, then user confirms P3.

## 7. P4 - Unified management UI

Goal: one responsive UI using singbox-center visual conventions.

Navigation:

```text
member: dashboard, subscriptions, generation, account
owner:  dashboard, subscriptions, generation, substore, templates, users, system, account
```

Tasks:

- P4.1 shared login/register shell and session restoration.
- P4.2 dashboard.
- P4.3 subscriptions.
- P4.4 generation and history.
- P4.5 Sub-Store shell entry.
- P4.6 template management.
- P4.7 user management.
- P4.8 system settings.
- P4.9 account settings.
- P4.10 responsive desktop/mobile navigation and forms.
- P4.11 frontend visibility plus independent backend authorization.
- P4.12 consistent loading, empty, success and error states.

Acceptance:

- P4.A1 desktop viewport workflow passes. `[BT]`
- P4.A2 mobile viewport workflow passes. `[BT]`
- P4.A3 member cannot see or call owner functions. `[BT,IT,ST]`
- P4.A4 refresh preserves authenticated session. `[BT]`
- P4.A5 key pages have no console/runtime errors. `[BT]`
- P4.A6 both workflows are green. `[CI]`

Exit: all P4.A items recorded, then user confirms P4.

## 8. P5 - Sub-Store integration

Goal: privately run the official Sub-Store and expose it only through ProxyHub.

F6S final-boundary amendment: the original P5 subpath adaptation and sync
management were removed after real-image testing. The authoritative design is
the official root frontend plus resettable random backend path.

Tasks:

- P5.1 Compose uses official configurable Sub-Store image.
- P5.2 no Sub-Store host port and no Docker socket.
- P5.3 owner-only official frontend entry at `/?api=<random backend URL>`.
- P5.4 resettable random backend path with prefix stripping.
- P5.5 transparent official frontend assets and backend streams.
- P5.6 WebSocket upgrade support if used by the pinned upstream; otherwise record verified not-applicable evidence.
- P5.7 preserve binary/stream responses without buffering.
- P5.8 no textual, CSP, cookie, manifest or service-worker rewriting.
- P5.9 backend/UI health status and useful error details.
- P5.10 Sub-Store owns sync, import/export and native backup/restore.
- P5.11 real pinned-image integration tests.

Principles:

- no independent `sub-store-panel` user system;
- no `admin/admin`;
- one resettable random backend access path;
- no direct public Sub-Store port;
- no Docker socket in ProxyHub;
- transparent proxying is preferred over application adaptation.

Acceptance:

- P5.A1 member and anonymous official frontend entry access fail. `[IT,ST]`
- P5.A2 official pinned image UI/API/assets work through ProxyHub. `[DT,BT]`
- P5.A3 stream/WebSocket behavior is tested or proven not applicable. `[IT,DT]`
- P5.A4 native backup restore bodies and large uploads pass unchanged. `[IT,DT]`
- P5.A5 reset invalidates the previous backend path. `[IT]`
- P5.A6 direct host access remains impossible. `[DT,ST]`
- P5.A7 both workflows are green. `[CI]`

Exit: all P5.A items recorded, then user confirms P5.

## 9. P6 - Installation, backup and updates

Goal: recoverable lifecycle management without Docker socket access.

Tasks:

- P6.1 installation-side `proxyhub` command.
- P6.2 commands: `install`, `start`, `stop`, `restart`, `status`, `logs`.
- P6.3 commands: `backup`, `restore`, `update`, `rollback`, `uninstall`.
- P6.4 uninstall preserves data; only `--purge` deletes after explicit confirmation.
- P6.5 fixed ProxyHub version image selection.
- P6.6 pre-update SQLite and data backup.
- P6.7 pull/recreate/migrate/health sequence.
- P6.8 automatic ProxyHub image rollback on failure.
- P6.9 fixed Sub-Store tag or digest.
- P6.10 default Sub-Store check-and-notify.
- P6.11 owner-confirmed Sub-Store update.
- P6.12 Sub-Store data backup and image rollback.
- P6.13 optional auto-update, default disabled.
- P6.14 no arbitrary application-side shell execution.

Acceptance:

- P6.A1 clean install and all lifecycle commands work. `[VT]`
- P6.A2 backup/restore reproduces both data stores. `[DT,VT]`
- P6.A3 injected ProxyHub update failure restores old image/data. `[DT]`
- P6.A4 injected Sub-Store update failure restores old image/data. `[DT]`
- P6.A5 uninstall and `--purge` semantics are verified. `[DT]`
- P6.A6 both workflows are green. `[CI]`

Exit: all P6.A items recorded, then user confirms P6.

## 10. P7 - Test and security closure

Goal: complete the release test matrix and close security gaps.

Tasks:

- P7.1 unit, API, migration and authorization suites.
- P7.2 sing-box fixture/parity suite.
- P7.3 Sub-Store proxy suite.
- P7.4 Docker persistence suite.
- P7.5 update/rollback suite.
- P7.6 Debian and Ubuntu clean-install tests.
- P7.7 HTTP and HTTPS reverse-proxy/cookie tests.
- P7.8 CSRF, cookie and login-limit review.
- P7.9 token hashing and subscription encryption review.
- P7.10 log redaction.
- P7.11 SSRF, upload/request/response bounds.
- P7.12 dependency and container vulnerability scanning.
- P7.13 port/network exposure scan.
- P7.14 operations and recovery documentation.

Acceptance:

- P7.A1 entire automated matrix passes. `[UT,IT,DT,ST,CI]`
- P7.A2 Debian and Ubuntu tests pass. `[VT]`
- P7.A3 no unresolved critical/high vulnerability without approved exception. `[ST]`
- P7.A4 recovery guide is executed once successfully. `[VT]`
- P7.A5 user confirms security/test closure. `[UA]`

## 11. P8 - Dev deployment acceptance

Goal: validate the exact GHCR dev artifact in a real target environment.

Artifact:

```text
ghcr.io/miozen/proxyhub:dev
ghcr.io/miozen/proxyhub:dev-<sha>
```

Tasks:

- P8.1 deploy exact SHA image to test VPS/internal VM.
- P8.2 first install and owner initialization.
- P8.3 registration/approval and account operations.
- P8.4 sing-box configuration workflow.
- P8.5 Sub-Store UI and synchronization workflow.
- P8.6 restart and simulated power-loss recovery.
- P8.7 backup and restore.
- P8.8 ProxyHub update and rollback.
- P8.9 Sub-Store update and rollback.
- P8.10 record versions, commands and results.

Acceptance:

- P8.A1 all P8 tasks pass on the target host. `[VT]`
- P8.A2 defects are fixed on `dev` and the exact replacement SHA is retested. `[CI,VT]`
- P8.A3 user explicitly accepts dev deployment. `[UA]`

## 12. P9 - Formal release

Precondition: P0-P8 are `ACCEPTED`.

Tasks:

- P9.1 request explicit approval to create `dev -> master` PR.
- P9.2 review complete diff and required checks.
- P9.3 merge only after explicit approval.
- P9.4 create `v0.1.0` directly; no release-candidate series.
- P9.5 publish fixed GHCR version tags.
- P9.6 redeploy using the fixed image and repeat smoke/recovery tests.
- P9.7 stabilize before considering `v1.0.0`.

Hard stops:

- no direct push to `master`;
- no PR creation without explicit approval;
- no merge, tag or release without explicit approval.

Release execution details and the simplified Actions policy are maintained in
`RELEASE_COMPLETION_PLAN.md`.

## 13. Immediate execution sequence

The next work is not P6. It is controlled closure of P0-P5:

```text
R1  record P0/P1 missing acceptance evidence
R2  finish and accept P2
R3  finish and accept P3
R4  browser/security acceptance for P4
R5  finish and accept P5
R6  start P6 only after P0-P5 are accepted
```

Current checkpoint: `L6.1-L6.3` code complete with GitHub checks green.
`L6.4` documentation is being prepared; its Alpine amd64 and Ubuntu arm64
destructive host gates remain pending. No release is authorized until both
host checklists in `HOST_ACCEPTANCE.md` pass.




