# P8 Repair Plan

Status: F1-F3 implemented; F2/F3 await Alpine acceptance; F4-F6 require explicit phase start
Branch: `dev` only  
Baseline runtime: `dev-b4ca063`  
Scope: defects and behavior gaps found during Alpine P8 acceptance

## 1. Decisions

### 1.1 Sub-Store interaction

- Remove the embedded iframe.
- Keep health, sync settings and history in the ProxyHub Sub-Store page.
- Add one explicit `Open Sub-Store` action using a new browser tab.
- Serve the official UI at owner-only `/substore/`.
- Keep the official API at owner-only `/substore-api/`.
- Do not restore the old panel user database, `admin/admin` or random paths.

### 1.2 Sub-Store path compatibility

The pinned upstream UI is not base-path aware. It dynamically requests root
assets such as `/css/*`, `/js/*` and `/manifests.json`; response-body string
rewrites alone are not a stable boundary.

- Add an owner-authenticated, explicit allowlist gateway for required upstream
  UI roots.
- Initial allowlist: `/css/`, `/js/`, `/assets/`, `/fonts/`, `/static/`,
  `/favicon*`, `/manifest*` and `/manifests.json`.
- Never proxy an arbitrary root path.
- Never shadow ProxyHub `/api`, `/healthz`, `/vendor` or application assets.
- Retain redirect, cookie, stream, timeout and size protections.
- Apply the relaxed upstream-compatible CSP only to Sub-Store UI/gateway
  responses; keep the ProxyHub CSP unchanged.
- Capture the pinned image's actual HTML/JS asset requests in a Docker
  integration fixture so upstream path changes fail CI.

### 1.3 Client subscription URL

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

### 1.4 Independent container operations

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

### 1.5 UI warning cleanup

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

### F6 - Alpine replacement-SHA acceptance

- F6.1 publish and pin one replacement `dev-<sha>` image.
- F6.2 update only ProxyHub from `dev-b4ca063`.
- F6.3 repeat P8.2-P8.5 on Alpine 3.24.1.
- F6.4 repeat component update and rollback gates P8.8-P8.9.
- F6.5 continue P8.6-P8.7 persistence and restore tests.
- F6.6 record exact image digest, commands and results.

Exit: resume the normal P8 plan only after all repair gates pass.

## 3. Commit boundaries

```text
test: reproduce P8 UI and lifecycle defects
fix: open Sub-Store through an allowlisted gateway
feat: restore persistent client subscription URLs
fix: isolate component lifecycle operations
fix: complete dashboard form metadata
docs: record repaired Alpine acceptance
```

## 4. Hard stops

- No implementation before explicit approval of this plan.
- No direct Sub-Store host port.
- No restored independent panel authentication or random paths.
- No global `unsafe-inline` CSP.
- No automatic client-token rotation.
- No `master` change, PR, merge, tag or release.
