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
| P0.A1 fresh Compose start | PENDING | user deferred real-machine Docker evidence to P8 |
| P0.A2 only port 3000 exposed | PENDING | static config passes; runtime evidence deferred to P8 |
| P0.A3 Sub-Store host ports inaccessible | PENDING | static config passes; runtime evidence deferred to P8 |
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






