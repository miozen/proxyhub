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

## F4

### F4.1-F4.7 implementation

- `start`, `stop`, `restart` and `status` accept no component for the complete
  stack or exactly one of `proxyhub` and `sub-store`.
- `logs` accepts the same optional component and retains Compose log options.
- ProxyHub update explicitly runs `pull proxyhub` and
  `up -d --no-deps proxyhub`; Sub-Store uses the equivalent `sub-store`
  commands.
- Each component update snapshots only its own named volume and current image
  setting.
- Rollback points and restore paths are independent for both components.
- ProxyHub and Sub-Store have separate post-update health checks.
- Full backup/restore and uninstall behavior remains unchanged.
- Component-less rollback and unknown components fail before Docker mutation.

### Local verification

Observed on 2026-07-25:

- enforced local suite: PASS, 27/27;
- Git Bash POSIX syntax check: PASS;
- `git diff --check`: PASS;
- repair baseline: PASS, 3/3;
- static isolation, rollback-point and validation assertions: PASS.

### CI and Alpine verification

The Docker workflow now records both container IDs, independently restarts
each service, injects both component update failures, and asserts that the
other component ID stays unchanged. Alpine F6 must repeat successful update
and rollback with fixed replacement images and record container IDs, start
times and data persistence.

## Deferred web operations

`POST_V1_PLAN.md` records owner web control as a post-v1 feature using a
restricted host-side agent. F4 does not mount the Docker socket or add web
container controls.

## F5

### F5.1-F5.2 implementation

- Every input, select and textarea has a stable `id` or Vue-bound `:id` plus a
  `name`.
- Every label targets its control with `for` or `:for`.
- Login and account credential fields declare the appropriate autocomplete
  values.
- A local SVG favicon is declared and served with the correct MIME type.

### Local browser verification

Observed on 2026-07-25 using the local application:

- desktop login, owner dashboard and account settings: PASS;
- 390x844 mobile account, template and Sub-Store status pages: PASS;
- all visible fields resolved to their expected labels and identifiers: PASS;
- mobile document width equals its scroll width: PASS;
- favicon request and declaration: PASS;
- final browser warning/error log: empty.

The accepted R4 evidence in `ACCEPTANCE.md` remains valid for the member desktop
and mobile navigation, hidden owner sections, 403 API enforcement and session
refresh behavior.

### Automated verification

- enforced local suite: PASS, 29/29;
- form metadata and label targeting assertions: PASS;
- favicon HTTP status and MIME assertion: PASS;
- syntax and `git diff --check`: PASS.

### F5 remaining external verification

F6 must run the replacement image on Alpine and confirm zero actionable
Console/Network errors in both ProxyHub and the official Sub-Store new-tab UI.

## F6 defect 1 - official frontend route composition

Alpine image `dev-477a49b` passed the isolated ProxyHub update gate: ProxyHub
was recreated and Sub-Store retained the same container ID and start time.
`/healthz` reported database and Sub-Store checks as healthy.

The official UI browser run then reproduced:

- duplicated `/substore-api/substore-api/api/...`;
- dynamic JavaScript chunk 404 responses;
- manifest 401 responses.

Root cause:

- the official frontend already composes its backend calls from the `?api=`
  value, while ProxyHub was also rewriting `/api` literals in its JavaScript;
- static asset rewriting conflicted with the frontend's root-based dynamic
  chunks;
- manifest fetches did not include the owner session cookie.

Replacement behavior:

- preserve official JavaScript, JSON and absolute asset paths unchanged;
- use the owner-only root allowlist gateway for recorded assets;
- pass exactly one backend base: `/substore-api`;
- add `crossorigin="use-credentials"` to the manifest declaration;
- retain the Sub-Store-only CSP and all proxy authorization/size protections.

Local enforced suite after the fix: PASS, 29/29. A new fixed SHA image is
required before F6 browser acceptance can resume.

## F6R - restored original routing model

The allowlisted `/substore/` compatibility approach was retired after Alpine
proved that the pinned upstream frontend is a root-path PWA.

Implemented behavior:

- ProxyHub dashboard and browser assets moved to `/proxyhub/`;
- ProxyHub API and health routes remain `/api/*` and `/healthz`;
- the official Sub-Store frontend owns `/` and its root static assets;
- an owner-only root entry opens with
  `/?api=<encoded origin + random backend path>`;
- one `/[a-f0-9]{32}` setting proxies the backend with its prefix stripped;
- the random path persists in SQLite and changes only after an explicit,
  CSRF-protected owner reset;
- the old random path returns 404 immediately after reset;
- frontend static assets are served like the original panel so manifest and
  dynamic chunk requests do not depend on cookies;
- a no-cache cleanup service worker replaces the upstream worker to prevent
  cached Sub-Store handlers from intercepting `/proxyhub/`;
- no Sub-Store host port, second user database or Docker socket was added.

Local verification:

- enforced suite: PASS, 29/29;
- root HTML, CSS, JavaScript, manifest-compatible static routing: PASS;
- owner-only frontend entry and member denial: PASS;
- random backend query, binary streaming, redirect and cookie rewriting: PASS;
- reset persistence boundary and old-path 404: PASS;
- ProxyHub `/proxyhub/` assets and root redirect: PASS;
- syntax and `git diff --check`: PASS.

The existing sync implementation uses the upstream documented `GET /api/sync`
route. The exact Alpine failure still requires recording its returned HTTP
status/error after the replacement image is deployed; frontend routing success
must not be treated as sync success.

## F6R.1 - Compose smoke and generation settings

The first F6R Docker workflow built and started both containers successfully.
Its failure was a stale smoke assertion: the script requested the removed
`/substore-api/api/utils/env` route and received root frontend HTML, then
incorrectly asserted a JSON content type.

Replacement smoke behavior:

- authenticate the owner;
- read the active random backend path from the owner status endpoint;
- open `/?api=<encoded random backend URL>`;
- request `/<random>/api/utils/env` and require JSON;
- verify the same root frontend entry is denied without an owner session.

The audit against `singbox-center` also found three global settings that had
been reduced to hard-coded defaults. ProxyHub now restores owner-managed,
SQLite-persisted region keywords, invalid-node filtering regex, and UrlTest
URL/interval/tolerance. Subscription tests and normal generation read the
current values. API validation and member-denial coverage were added.

Local enforced suite after F6R.1: PASS, 29/29.

## F6R.2 - Sub-Store restore body preservation

Alpine reached the official restore API but Sub-Store rejected a known backup
with `INVALID_BACKUP_DATA`. The random backend proxy was mounted after the
global Express JSON parser. JSON restore bodies were parsed and consumed by
ProxyHub before the request stream was forwarded, so Sub-Store received an
empty body.

The JSON parser is now scoped to ProxyHub `/api/*` only. Requests under the
random Sub-Store backend path remain raw streams. A proxy integration test
asserts that a Unicode JSON backup body and its content type reach the upstream
byte-for-byte unchanged.
