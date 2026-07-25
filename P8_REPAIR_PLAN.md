# P8 Repair Plan

Status: F6R implemented locally and awaiting dev CI plus Alpine acceptance
Branch: `dev` only  
Baseline runtime: `dev-b4ca063`  
Scope: defects and behavior gaps found during Alpine P8 acceptance

## 1. Decisions

### 1.1 Sub-Store interaction

- Remove the embedded iframe.
- Keep health, sync settings and history in the ProxyHub Sub-Store page.
- Add one explicit `Open Sub-Store` action using a new browser tab.
- Reuse the proven `sub-store-panel` routing model:
  - ProxyHub management UI is served below `/proxyhub/`;
  - the official Sub-Store frontend owns `/` and its root assets;
  - one resettable `/<32 lowercase hex>/` path proxies the Sub-Store backend;
  - `Open Sub-Store` opens `/?api=<origin + random path>` in a new tab.
- Retain only the ProxyHub user, session and owner authorization system.
- Do not restore the old panel user database, JWT authentication or
  `admin/admin`.
- The random backend path is an owner-managed Sub-Store access credential. It
  is stable across restart/update/restore and changes only on explicit reset.

### 1.2 Sub-Store path compatibility

The pinned upstream frontend is a root-path PWA. Proxying it below
`/substore/` breaks dynamic chunks, manifests, service workers and API path
resolution. Stop rewriting it for a subpath.

- Forward `/`, `/css/*`, `/js/*`, `/assets/*`, `/registerSW.js`,
  `/manifests.json` and other frontend-owned root requests unchanged to the
  official frontend service.
- Reserve ProxyHub routes before the frontend catch-all: `/proxyhub/`,
  `/api/*`, `/healthz`, and the active random backend path.
- Move ProxyHub browser assets below `/proxyhub/`; API routes remain `/api/*`.
- Strip the random prefix before proxying to the Sub-Store backend.
- Preserve WebSocket, streaming, request timeout and response-size protection.
- Do not rewrite an already configured API URL and never produce duplicate
  `/<random>/<random>/` prefixes.
- Serve Sub-Store's required CSP only on its frontend responses; retain the
  stricter ProxyHub CSP on `/proxyhub/` and ProxyHub APIs.
- Prevent Sub-Store's service worker from controlling `/proxyhub/`. Prefer a
  scoped worker response/header if supported; otherwise disable registration
  while keeping the frontend functional.
- Add integration fixtures for root HTML, dynamic JS/CSS, manifest,
  `registerSW.js`, API discovery and the random backend path.

### 1.3 Random backend path

- Store one active Sub-Store path in ProxyHub settings because Sub-Store
  administration is owner-only.
- Generate it with cryptographically secure randomness as `/[a-f0-9]{32}`.
- Show and copy the complete backend URL on the owner Sub-Store page.
- Reset requires an explicit warning and takes effect immediately.
- After reset, the old path returns 404 and the new path reaches Sub-Store.
- Never print the path in routine logs, sync history or health responses.
- The path is intentionally usable as the Sub-Store backend credential,
  matching the original panel model; it does not create a second user system.

### 1.4 Client subscription URL

Match `singbox-center` behavior:

- Create a client token when the account becomes active if none exists.
- Return the current token to the authenticated account endpoint.
- Always show the complete client subscription URL after login and refresh.
- Provide copy and reset actions.
- Reset requires an explicit warning and invalidates the old URL immediately.
- Disabled/deleted users remain unable to generate configurations.

Storage change:

- Match `singbox-center`: persist the active raw client token with the account.
- The token remains unchanged across login, logout, restart, update and restore.
- Only an explicit manual reset may replace it.
- Reset deletes/revokes the old token mapping and stores the newly generated
  token.
- Return the token only to its authenticated account; never include it in logs,
  errors, history or administrative user lists.
- Existing hash-only tokens are not changed automatically. If one exists and
  cannot be displayed, the UI asks the user to perform one manual reset.

### 1.5 Independent container operations

`proxyhub` and `sub-store` remain separate containers and must be independently
manageable.

- ProxyHub update pulls/recreates only `proxyhub`.
- Sub-Store update pulls/recreates only `sub-store`.
- Updating one component must not pull or recreate the other.
- Component update snapshots only the affected data volume and image setting.
- Component rollback restores only the affected component.
- Full manual backup/restore continues to cover both volumes.
- Sub-Store update still requires explicit confirmation.
- Automatic updates remain disabled by default.

Command behavior:

```text
proxyhub start [proxyhub|sub-store]
proxyhub stop [proxyhub|sub-store]
proxyhub restart [proxyhub|sub-store]
proxyhub status [proxyhub|sub-store]
proxyhub logs [proxyhub|sub-store]
proxyhub update --proxyhub-image IMAGE
proxyhub update --substore-image IMAGE --confirm-substore
proxyhub rollback [proxyhub|sub-store]
```

No component argument means the existing whole-stack behavior for
start/stop/restart/status/logs. `update` and `rollback` remain component scoped.

### 1.6 UI warning cleanup

- Add stable `id`, `name`, `for` and autocomplete attributes to form controls.
- Add a local favicon to remove the root 404.
- Treat browser console errors as acceptance failures; accessibility hints may
  only remain if documented and non-actionable.

## 2. Implementation sequence

### F1 - Re-baseline and fixtures

- F1.1 record P8.2 functional evidence separately from P8.5 defects.
- F1.2 capture official `xream/sub-store:2.36.21` UI asset paths.
- F1.3 add failing tests for root CSS/JS/manifests and owner authorization.
- F1.4 add failing tests for persistent subscription URL behavior.
- F1.5 add failing lifecycle tests proving component isolation.

Exit: tests reproduce every reported defect before production changes.

### F2 - Sub-Store navigation and gateway

- F2.1 remove iframe and iframe-only CSS.
- F2.2 add new-tab `Open Sub-Store` action with `noopener`.
- F2.3 implement the allowlisted root asset gateway.
- F2.4 scope Sub-Store CSP to gateway/UI responses.
- F2.5 verify UI API target remains `/substore-api/`.
- F2.6 verify anonymous/member requests to UI, assets and API return 401/403.

Exit:

- official UI opens in a new tab;
- no CSS MIME, asset 404, manifest 401 or CSP console errors;
- ProxyHub navigation remains available in the original tab;
- no Sub-Store host port exists.

### F3 - singbox-center client subscription URL

- F3.1 add persistent account token storage matching `singbox-center`.
- F3.2 issue a token on activation/first owner creation.
- F3.3 never rotate an existing token during login, migration or startup.
- F3.4 return the current token only to its authenticated owner.
- F3.5 always render the full URL and copy action.
- F3.6 reset with warning, immediate old-token revocation and refreshed URL.
- F3.7 redact token values from logs/errors/history.

Exit:

- login and refresh preserve the displayed URL;
- restart, update and restore preserve the same URL;
- another user cannot read it;
- old URL returns 401 immediately after reset;
- new URL generates normally;
- the URL changes only after an explicit manual reset.

### F4 - Component-scoped lifecycle

- F4.1 add component argument validation.
- F4.2 split ProxyHub and Sub-Store snapshot metadata.
- F4.3 update ProxyHub with `pull proxyhub` and `up -d --no-deps proxyhub`.
- F4.4 update Sub-Store with `pull sub-store` and
  `up -d --no-deps sub-store`.
- F4.5 implement component-specific health and rollback.
- F4.6 retain full-stack backup/restore and uninstall semantics.
- F4.7 update operations documentation.

Exit:

- ProxyHub update leaves the Sub-Store container ID and start time unchanged;
- Sub-Store update leaves the ProxyHub container ID and start time unchanged;
- failure restores only the selected image/data;
- no Docker socket is mounted.

### F5 - UI and browser closure

- F5.1 add form identifiers and labels.
- F5.2 add favicon.
- F5.3 desktop and mobile owner/member browser runs.
- F5.4 refresh/session and new-tab authentication runs.
- F5.5 zero actionable Console/Network errors on all key pages.

Exit: browser evidence is recorded for ProxyHub and the official Sub-Store UI.

### F6R - Restore the proven Sub-Store routing model

- F6R.1 replace `/substore/` and `/substore-api/` compatibility gateways with
  root frontend plus random backend routing.
- F6R.2 move the ProxyHub dashboard and its browser assets to `/proxyhub/`.
- F6R.3 add owner APIs and UI for showing/copying/resetting the random path.
- F6R.4 update `Open Sub-Store` to use
  `/?api=<encoded origin + random path>`.
- F6R.5 remove obsolete HTML/API path rewriting and root-asset allowlists.
- F6R.6 isolate or disable the upstream service worker so it cannot control the
  ProxyHub management path.
- F6R.7 diagnose sync separately using the recorded upstream HTTP status/error;
  do not treat frontend routing as proof of sync success.
- F6R.8 publish and pin one replacement `dev-<sha>` image.
- F6R.9 update only ProxyHub on Alpine and repeat P8.2-P8.5.
- F6R.10 repeat component update/rollback, persistence and restore gates.

Exit: resume the normal P8 plan only after all repair gates pass.

## 3. Commit boundaries

```text
test: reproduce P8 UI and lifecycle defects
fix: restore root Sub-Store frontend routing
feat: add resettable Sub-Store backend path
feat: restore persistent client subscription URLs
fix: isolate component lifecycle operations
fix: complete dashboard form metadata
docs: record repaired Alpine acceptance
```

## 4. Hard stops

- No implementation before explicit approval of this plan.
- No direct Sub-Store host port.
- No restored independent panel authentication.
- No `/substore/` PWA compatibility rewrite or growing root-asset allowlist.
- No global `unsafe-inline` CSP.
- No automatic client-token rotation.
- No `master` change, PR, merge, tag or release.
