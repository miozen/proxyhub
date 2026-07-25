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
| P0.A1 fresh Compose start | BLOCKED | local environment has no Docker executable |
| P0.A2 only port 3000 exposed | PENDING | Compose declares only `${PORT:-3000}:3000`; runtime evidence required |
| P0.A3 Sub-Store host ports inaccessible | PENDING | no `ports` entry exists; runtime evidence required |
| P0.A4 restart preserves both stores | BLOCKED | requires Docker with persistent-volume exercise |
| P0.A5 workflows green | PENDING | record after R1 commit workflows finish |

Static evidence:

- `Dockerfile` uses Node.js 22 and a non-root runtime user.
- Compose exposes ProxyHub only and keeps Sub-Store on the internal network.
- both services use persistent bind mounts.
- CI builds the image and validates Compose.
- the dev-image workflow publishes `dev` and `dev-<sha>`.

P0 cannot move to `ACCEPTED` until P0.A1-P0.A5 have runtime evidence.

### P1

| Gate | State | Evidence |
|---|---|---|
| P1.A1 owner/pending-member flow | PASS | `test/auth.test.js`, `test/p1-acceptance.test.js` |
| P1.A2 username preserves owned data | PASS | stable user ID and token ownership test |
| P1.A3 password revokes old sessions | PASS | old cookie/password rejection test |
| P1.A4 disabled user denied | PASS | session denial and token revocation test |
| P1.A5 registration/generation switches | PASS | switch behavior integration test |
| P1.A6 CSRF/cookie/login limit | PASS | mutation, cookie flags and rate-limit tests |
| P1.A7 workflows green | PENDING | record after R1 commit workflows finish |

P1 becomes `CODE_COMPLETE` after local suite and CI pass. It becomes `ACCEPTED`
only after the user reviews this evidence and explicitly confirms P1.

## Next checkpoint

1. Push one R1 evidence/test commit to `dev`.
2. Wait for both workflows.
3. Record CI result.
4. Ask the user whether Docker evidence will be collected now or deferred to P8.

