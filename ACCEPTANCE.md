# ProxyHub Acceptance Record

Plan source: `IMPLEMENTATION_PLAN.md`  
Branch: `dev`

Evidence states:

```text
PASS    verified with recorded evidence
PENDING requires a later CI/user/environment result
BLOCKED cannot run in the current environment
```

## R1 - P0/P1 evidence

Local evidence on 2026-07-25:

- Node syntax check: PASS.
- complete local test suite: PASS, 14/14.
- `git diff --check`: PASS.
- Docker runtime: unavailable (`docker` executable not installed).

### P0

| Gate | State | Evidence |
|---|---|---|
| P0.A1 fresh Compose start | PASS | Alpine 3.24.1 VM pulled both pinned images and started healthy |
| P0.A2 only port 3000 exposed | PASS | VM `docker ps` shows only ProxyHub mapped at host port 3000 |
| P0.A3 Sub-Store host ports inaccessible | PASS | VM `docker ps` shows no Sub-Store host port mapping |
| P0.A4 restart preserves both stores | PENDING | user deferred persistence exercise to P8 |
| P0.A5 workflows green | PASS | R1 commit `16273c0`, check `#8`, both workflows green |

Static evidence:

- `Dockerfile` uses Node.js 22 and a non-root runtime user.
- Compose exposes ProxyHub only and keeps Sub-Store on the internal network.
- both services use persistent bind mounts.
- CI builds the image and validates Compose.
- the dev-image workflow publishes `dev` and `dev-<sha>`.

P0 remains `CODE_COMPLETE`. On 2026-07-25 the user explicitly deferred
P0.A1-P0.A4 real-machine evidence to P8. P0 cannot move to `ACCEPTED` until
that evidence is recorded.

### P1

| Gate | State | Evidence |
|---|---|---|
| P1.A1 owner/pending-member flow | PASS | `test/auth.test.js`, `test/p1-acceptance.test.js` |
| P1.A2 username preserves owned data | PASS | stable user ID and token ownership test |
| P1.A3 password revokes old sessions | PASS | old cookie/password rejection test |
| P1.A4 disabled user denied | PASS | session denial and token revocation test |
| P1.A5 registration/generation switches | PASS | switch behavior integration test |
| P1.A6 CSRF/cookie/login limit | PASS | mutation, cookie flags and rate-limit tests |
| P1.A7 workflows green | PASS | R1 commit `16273c0`, check `#8`, both workflows green |

P1 state: `ACCEPTED` on 2026-07-25 after local suite, green CI and user review.

## Next checkpoint

R1 is complete.

1. Start R2 at P2.11-P2.14 gap audit.
2. Implement configurable cache fallback.
3. Add failed-source, isolation, SSRF/bounds and legacy fixture evidence.
4. Do not enter R3 until P2 acceptance is complete and confirmed.

## R2 - P2 evidence

Baseline:

- original repository: `Vonzhen/singbox-center`;
- source: `src/engine.js`;
- fixed commit: `badfd389436ed51450ebad6c9fc9c1c2cc717784`.

Local evidence on 2026-07-25:

- Node syntax check: PASS.
- complete local test suite: PASS, 17/17.
- `git diff --check`: PASS.
- npm high-severity audit: PASS, 0 vulnerabilities.

| Gate | State | Evidence |
|---|---|---|
| P2.A1 old/new core fixture parity | PASS | fixed source commit and `matches the original singbox-center core fixture` |
| P2.A2 one source failure isolation | PASS | P2 API acceptance test retains successful owner source |
| P2.A3 configurable cache fallback | PASS | enabled returns stale success; disabled returns 502 |
| P2.A4 cross-user isolation | PASS | output/read/update isolation assertions |
| P2.A5 SSRF/timeout/size bounds | PASS | private target, abort and declared/streamed size tests |
| P2.A6 workflows green | PASS | R2 commit `bcd4fd7`, check `#10`, both workflows green |

Compatibility corrections made during R2:

- restored flag-prefixed airport-region group tags;
- restored `main`, `all_regions`, `region+direct` and selector fallback behavior;
- restored TLS scalar normalization;
- remove invalid generated outbound/DNS references;
- preserve arbitrary direct outbound tag used by the active template.

P2 state: `ACCEPTED` on 2026-07-25 after 17/17 local tests, green CI and
explicit user confirmation.

## Next checkpoint

R2 is complete. R3 is limited to P3.1-P3.11 template management and its
acceptance gates. No P4/P5 work may be mixed into R3.

## R3 - P3 evidence

Local evidence on 2026-07-25:

- Node syntax check: PASS.
- complete local test suite: PASS, 18/18.
- `git diff --check`: PASS.
- npm high-severity audit: PASS, 0 vulnerabilities.

| Gate | State | Evidence |
|---|---|---|
| P3.A1 invalid JSON/reference graph blocked | PASS | strict outbound, DNS and route reference validation test |
| P3.A2 remote failure retains cached content | PASS | failed refresh leaves active V1 content usable |
| P3.A3 editing creates immutable new version | PASS | V1/V2/V3 content, parent and hash assertions |
| P3.A4 rollback selects requested generation version | PASS | V3 generation then explicit rollback to V1 |
| P3.A5 workflows green | PASS | R3 commit `afed3c5`, check `#12`, both workflows green |

Implementation evidence:

- migration `003_template_lifecycle.sql` adds parent/status/check/error metadata;
- local and remote creation share strict validation;
- refresh success creates a child version;
- refresh failure records the error without replacing content;
- edit saves a child version instead of mutating its parent;
- activation and rollback switch the unique active version transactionally;
- owner UI exposes edit, refresh, activate, rollback, hash and state.

P3 state: `ACCEPTED` on 2026-07-25 after 18/18 local tests, green CI and
explicit user confirmation.

## Next checkpoint

R3 is complete. R4 is limited to P4.1-P4.12 browser, responsive-layout,
session-restoration and authorization acceptance. No P5 work may be mixed into
R4.

## R4 - P4 evidence

Local evidence on 2026-07-25:

- Node syntax check: PASS.
- complete local test suite: PASS, 18/18.
- `git diff --check`: PASS.
- real browser desktop viewport: 1440x900.
- real browser mobile viewport: 390x844.
- browser console warnings/errors after final verification: 0.

| Gate | State | Evidence |
|---|---|---|
| P4.A1 desktop workflow | PASS | owner/member dashboard and all navigation pages; no horizontal overflow |
| P4.A2 mobile workflow | PASS | responsive cards, off-canvas menu, navigation closes menu, no horizontal overflow |
| P4.A3 member UI/API authorization | PASS | member sees four allowed tabs; owner sections hidden; owner APIs return 403 |
| P4.A4 refresh preserves session | PASS | owner and member remain authenticated after reload |
| P4.A5 no key-page runtime errors | PASS | navigation and role-switch run; final browser log is empty |
| P4.A6 workflows green | PASS | R4 commit `a99f14f`, check `#16`, both workflows green |

Browser defects found and fixed:

- login response now includes `status` and `generation_enabled`;
- login and logout reset the current page to dashboard;
- login and logout reset the mobile menu state;
- role switching no longer leaves a blank owner-only page visible to a member.

P4 state: `ACCEPTED` on 2026-07-25 after browser/API evidence, green CI and
explicit user confirmation.

## Next checkpoint

R4 is complete. R5 is limited to P5.1-P5.14 Sub-Store integration and its
acceptance gates. No P6 lifecycle/update work may be mixed into R5.

## R5 - P5 evidence

Local evidence on 2026-07-25:

- Node syntax check: PASS.
- complete local test suite: PASS, 20/20.
- `git diff --check`: PASS.
- Docker runtime: unavailable (`docker` executable not installed).
- upstream image selected: `xream/sub-store:2.36.21`.
- first R5 Docker run exposed bind-mount write risk and missing failure-step
  environment; named volumes and job-level CI secrets now cover both cases.
- second R5 Docker run passed the real-image smoke; its final failure was a
  Compose CLI port-query assertion, replaced with container PortBindings inspection.

| Gate | State | Evidence |
|---|---|---|
| P5.A1 anonymous/member UI/API denied | PASS | proxy and admin API return 401/403 integration assertions |
| P5.A2 pinned official UI/API/assets | PASS | pinned `2.36.21` real-image Compose smoke through authenticated ProxyHub UI/API |
| P5.A3 stream/WebSocket | PASS | binary stream integration passes; upstream has no WebSocket dependency, recorded N/A after source and real-image verification |
| P5.A4 manual/scheduled result history | PASS | manual success plus scheduled success/failure persistence assertions |
| P5.A5 concurrent sync rejected | PASS | held first request causes second request to return 409 |
| P5.A6 no direct host access | PASS | Docker `HostConfig.PortBindings` count is zero |
| P5.A7 workflows green | PASS | R5 commit `9598750`, both workflows green |

Implementation evidence:

- owner-only same-origin UI and API mounts remain `/substore/` and `/substore-api/`;
- redirects, cookie Domain/Path and root-relative HTML/JS paths are adapted;
- non-text bodies stream without buffering;
- textual rewriting is bounded at 2 MiB;
- proxy connection timeout and stable upstream error codes are returned;
- component health includes backend/frontend error details;
- manual and scheduled sync share one overlap lock;
- success/error history persists in SQLite;
- stale running jobs are closed as interrupted after restart;
- official image is configurable and defaults to fixed tag `2.36.21`;
- Docker-managed named volumes preserve data while allowing the non-root
  ProxyHub image to initialize SQLite safely;
- Compose exposes internal ports only and mounts no Docker socket.

P5 state: `ACCEPTED` on 2026-07-25 after 20/20 local tests, pinned-image
Docker smoke, runtime port-isolation evidence, green CI and explicit user
confirmation.

## Next checkpoint

R5 is complete. R6 is limited to P6.1-P6.14 installation, lifecycle, backup,
update and rollback work. P0 real-machine gates remain deferred to P8 by the
user; they are not treated as accepted or removed.

## R6 - P6 evidence

Local evidence on 2026-07-25:

- shell syntax check: PASS.
- Node syntax and complete test suite: PASS, 20/20.
- `git diff --check`: PASS.
- local Docker runtime: unavailable; lifecycle exercise runs in GitHub Docker CI.

| Gate | State | Evidence |
|---|---|---|
| P6.A1 clean install/all commands | PENDING | command syntax passes; clean VM exercise remains for P8 |
| P6.A2 backup/restore both stores | PENDING | Docker archive/restore passes; final VM reproduction remains |
| P6.A3 ProxyHub failure rollback | PASS | invalid registry image fault injection and health recovery |
| P6.A4 Sub-Store failure rollback | PASS | confirmed invalid Sub-Store image fault injection and recovery |
| P6.A5 uninstall/purge semantics | PASS | preserved volumes/restart and refused-unconfirmed-purge |
| P6.A6 workflows green | PASS | R6 commit `3445595`, both workflows green |

Implementation evidence:

- `ops/proxyhub` is installation-side and exposes only fixed lifecycle commands;
- secrets are generated during first install and `.env` is mode 0600;
- backups archive both named volumes plus the active environment;
- update snapshots data and image settings before pull/recreate/health;
- failed updates automatically restore the snapshot;
- Sub-Store image changes require `--confirm-substore`;
- `check-updates` is notify-only and does not mutate containers;
- automatic updates default to disabled;
- uninstall preserves data; purge requires `PROXYHUB_PURGE_CONFIRM=DELETE`;
- the application has no shell endpoint and no Docker socket.

P6 state: `CODE_COMPLETE`. P6.A1 and the VM portion of P6.A2 remain explicitly
deferred to P8; P6 is not yet accepted.

## R7 - P7 evidence

Local evidence on 2026-07-25:

- Node syntax and complete test suite: PASS, 22/22.
- npm high-severity audit: PASS, 0 vulnerabilities.
- shell syntax and `git diff --check`: PASS.

| Gate | State | Evidence |
|---|---|---|
| P7.A1 automated matrix | PASS | 22/22 tests plus security, limits, Docker lifecycle and workflow checks are green |
| P7.A2 Debian and Ubuntu | PASS | Debian 12 and Ubuntu 22.04/24.04 jobs are green |
| P7.A3 no critical/high vulnerability | PASS | npm audit reports 0; Anchore High/Critical gate is green after runtime npm removal |
| P7.A4 recovery guide executed | PENDING | Docker recovery exercise exists; final VM execution remains P8 |
| P7.A5 user security/test closure | PASS | user confirmed both workflows green and authorized the next phase on 2026-07-25 |

Security closure implemented:

- CSP, nosniff, referrer and browser permission headers;
- malformed Cookie input cannot crash authentication;
- Sub-Store request bodies are limited to 5 MiB;
- subscription/template private-target, redirect, timeout and response limits retained;
- credential-like error content is redacted and bounded before logs/history;
- token hashing and AES-256-GCM subscription encryption remain covered;
- npm and container image vulnerability gates;
- Docker network/port assertions and Debian/Ubuntu runtime matrix;
- `SECURITY.md` and `OPERATIONS.md` recovery guidance.

First image scan result:

- Grype found High/Critical packages inside the base image's global npm CLI;
- application `npm audit` remained clean and the reported versions were absent
  from the application lockfile;
- npm/npx/Corepack are removed from the final runtime stage because ProxyHub
  starts directly with Node.js;
- no vulnerability ignore rule or severity downgrade was introduced.

P7 state: `CODE_COMPLETE`. P7.A4 is intentionally executed on the P8 target
host, so P7 is not yet accepted.

## R8 - P8 dev deployment evidence

P8 started on 2026-07-25 after both P7 workflows passed. Use an immutable
`dev-<sha>` GHCR image throughout a complete run; if a defect is fixed, restart
the affected evidence with the replacement SHA and record both versions.

| Task | State | Required evidence |
|---|---|---|
| P8.1 exact SHA deployment | PASS | Alpine 3.24.1 amd64; Docker 29.5.3; Compose 5.1.4; `dev-264107c`; digest `sha256:820016620af1c177fa4e95023f4440dd926149ed43d7dd6733c702455414cb1a`; healthy |
| P8.2 first install/owner | PENDING | clean install, health and owner initialization |
| P8.3 account workflow | PENDING | registration, approval, login, rename, password and disable/restore |
| P8.4 sing-box workflow | PENDING | source test, generation, token URL and cached-failure behavior |
| P8.5 Sub-Store workflow | PENDING | owner-only UI/API, health, manual and scheduled sync |
| P8.6 restart/recovery | PENDING | restart and simulated power-loss persistence; closes P0 VM gates |
| P8.7 backup/restore | PENDING | backup artifact and restored ProxyHub/Sub-Store state |
| P8.8 ProxyHub update/rollback | PENDING | successful update plus injected failure rollback |
| P8.9 Sub-Store update/rollback | PENDING | successful update plus injected failure rollback |
| P8.10 evidence record | PENDING | exact commands, versions, results and defects |

P8 state: `IN_PROGRESS`. P9 remains blocked until all P8 gates pass and the user
explicitly accepts the dev deployment.

P8.1 defects and retest:

- `a5b2db0` exposed a blank UI because its CSP blocked the Vue runtime compiler;
- the global `proxyhub` symlink resolved `/usr/local` instead of the repository;
- Compose started a second init process around the image's Tini;
- `264107c` fixes all three and adds symlink/CSP regression coverage;
- the first update attempt lost its GHCR token connection and automatically
  restored `dev-a5b2db0` with healthy data and services;
- a later pull and update succeeded, the response CSP contains
  `script-src 'self' 'unsafe-eval'`, the UI opens, and logs contain no Tini
  warning.






