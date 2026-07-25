# P8 Repair Evidence

Plan: `P8_REPAIR_PLAN.md`
Baseline runtime: `dev-b4ca063`
Target: Alpine 3.24.1 amd64, Docker 29.5.3, Compose 5.1.4

## F1

### F1.1 P8.2 separation

Owner registration, login, owner navigation and session refresh work on the
Alpine target. Sub-Store browser failures are tracked under P8.5/F2 rather than
P8.2. Final browser-warning cleanup remains F5.

### F1.2 pinned upstream assets

`baseline/substore-2.36.21-assets.json` records the root CSS, JavaScript and
manifest requests observed from the pinned official UI. These requests bypass
the `/substore/` body rewrite and currently hit ProxyHub routes.

### F1.3-F1.5 reproduction

Run:

```sh
node --test baseline/p8-repair-baseline.test.js
```

Expected result on `dev-b4ca063`: three failures.

1. Owner-authenticated `/css/main.css` returns ProxyHub JSON 404 rather than
   upstream `text/css`.
2. `/api/me` has no persistent `client_token`.
3. `ops/proxyhub` uses whole-stack `dc pull` rather than component pulls.

Observed result on 2026-07-25: 0 passed, 3 failed with the exact expected
assertions above.

The default `npm test` entry is explicitly limited to `test/`; the baseline
suite runs only through the command above. F2-F4 must make each case pass and
move the corresponding assertion into the enforced test/CI suite.

### F1 exit

- baseline reproduction: PASS, expected 0/3 with all three defects reproduced;
- enforced local suite: PASS, 22/22;
- syntax and `git diff --check`: PASS;
- F1.1-F1.5: complete;
- next phase: F2.1-F2.6 only after explicit user start.

## F2

### F2.1-F2.6 implementation

- Removed the embedded iframe and its dedicated CSS.
- Added an owner-only new-tab link with `noopener noreferrer`.
- Kept the official UI at `/substore/` and passed `/substore-api` as its API
  target.
- Added an owner-authenticated gateway limited to the recorded root asset
  families and manifest/favicon paths.
- Root assets retain their upstream content type; anonymous and member access
  returns 401 and 403 respectively.
- ProxyHub application routes and its default CSP remain unchanged.

### Local verification

Observed on 2026-07-25:

- enforced local suite: PASS, 23/23;
- syntax and `git diff --check`: PASS;
- repair baseline: 1 passed, 2 failed;
- the F2 root-asset case now passes;
- the remaining failures are the intentionally pending F3 token and F4
  lifecycle cases.

### F2 remaining acceptance

GitHub CI/image publication and the Alpine browser run must still prove:

- the pinned official UI loads with no CSS MIME, missing asset, manifest or CSP
  errors;
- the UI calls `/substore-api/`;
- no Sub-Store host port is exposed.

## F3

### F3.1-F3.7 implementation

- Migration 004 adds the persistent raw client token while retaining the token
  hash used by the public generation endpoint.
- The first owner receives a token at creation; approved/enabled accounts
  receive one when no active token exists.
- `/api/me` returns only the authenticated account's current token.
- Login restoration and page refresh rebuild the complete subscription URL.
- Reset requires an explicit browser confirmation, revokes the old token
  immediately and displays the new URL.
- Existing active hash-only rows remain unchanged and return
  `client_token_reset_required`; the UI asks for one manual reset.
- Administrative user lists, logs, errors and history do not expose raw tokens.

### Local verification

Observed on 2026-07-25:

- enforced local suite: PASS, 25/25;
- migration 004 apply/reopen/idempotency assertions: PASS;
- owner creation, member approval, authenticated isolation and manual reset:
  PASS;
- old-token rejection after reset: PASS;
- database reopen preserves the token: PASS;
- existing hash-only token is not automatically replaced: PASS;
- repair baseline: 2 passed, 1 failed;
- only the intentionally pending F4 component-lifecycle case still fails.

### F3 remaining acceptance

The Alpine replacement-image run must still prove that the displayed URL stays
identical across refresh, logout/login, container restart, ProxyHub update and
backup/restore, and changes only after an explicit manual reset.
