# ProxyHub v0.1 Technical Spec

Status: approved baseline  
Target branch: `dev`  
Stable branch: `master`  
Compatibility/migration: none

## 1. Stack

```yaml
runtime: node:22-alpine
language: javascript-esm
http: express
database: sqlite/better-sqlite3
frontend: vue3-browser-build
deployment: docker-compose
registry: ghcr.io/vonzhen/proxyhub
host_port_default: 3000
license: MIT
```

## 2. Runtime topology

```yaml
services:
  proxyhub:
    public_ports: ["${PORT:-3000}:3000"]
    data: ./data/proxyhub:/app/data
    depends_on: [sub-store]
  sub-store:
    image: ${SUBSTORE_IMAGE}
    public_ports: []
    data: ./data/sub-store:/opt/app/data
network:
  sub-store_access: proxyhub-only
```

Rules:

- One Sub-Store instance.
- Sub-Store is system scope, not user scope.
- Only owner accesses Sub-Store.
- No PM2/bare-metal production path.
- First release unifies management only; no automatic data exchange between modules.

## 3. Modules

```text
auth
users
settings
singbox
templates
substore
scheduler
updates
audit
health
web
```

No business code in root server bootstrap.

## 4. Identity and authorization

```yaml
roles: [owner, member]
statuses: [pending, active, disabled, rejected]
first_user: {role: owner, status: active}
later_registration: {role: member, status: pending}
username_mutable: true
internal_user_id_mutable: false
password_change_requires_current_password: true
registration_switch: global
generation_switch: per_user_owner_controlled
substore_access: owner_only
```

Session:

```yaml
type: opaque-random
storage: sqlite
cookie: proxyhub_session
ttl_seconds: 86400
cookie_flags: [HttpOnly, SameSite=Lax]
secure_flag: env/COOKIE_SECURE
password_hash: pbkdf2-sha256-versioned
password_min_length: 10
```

On password change: revoke all sessions except optional current session.  
On username change: update display/login field only; joins use `user_id`.  
On disable/delete: revoke sessions and client tokens immediately.

## 5. Database

Use migrations; enable WAL and foreign keys.

```sql
users(
  id TEXT PK,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  generation_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

sessions(
  id_hash TEXT PK,
  user_id TEXT NOT NULL FK users ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
)

client_tokens(
  id TEXT PK,
  token_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL FK users ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
)

subscriptions(
  id TEXT PK,
  user_id TEXT NOT NULL FK users ON DELETE CASCADE,
  name TEXT NOT NULL,
  url_encrypted TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  allowed_regions_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

app_settings(key TEXT PK, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)

template_versions(
  id TEXT PK,
  source_type TEXT NOT NULL,
  source_url TEXT,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)

generation_runs(
  id TEXT PK,
  user_id TEXT NOT NULL FK users ON DELETE CASCADE,
  status TEXT NOT NULL,
  summary_json TEXT,
  error_text TEXT,
  config_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
)

jobs(
  id TEXT PK,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  result_json TEXT,
  error_text TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
)

audit_logs(
  id TEXT PK,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
)

schema_migrations(version INTEGER PK, applied_at TEXT NOT NULL)
```

Secrets:

- Store subscription URLs encrypted with `DATA_ENCRYPTION_KEY`.
- Store session/client tokens as SHA-256 hashes.
- Never log raw password, token, cookie, or subscription URL.

## 6. HTTP routes

```yaml
public:
  GET  /healthz
  GET  /
  POST /api/auth/register
  POST /api/auth/login
  POST /api/auth/logout
  GET  /api/generate?token=

active_user:
  GET  /api/me
  PUT  /api/me/username
  PUT  /api/me/password
  POST /api/me/token/reset
  CRUD /api/subscriptions
  POST /api/subscriptions/:id/test
  POST /api/generation/test
  GET  /api/generation/status

owner:
  GET  /api/admin/users
  POST /api/admin/users/:id/{approve,reject,enable,disable}
  DELETE /api/admin/users/:id
  PUT  /api/admin/users/:id/generation
  GET|PUT /api/admin/settings
  GET|POST /api/admin/templates/*
  GET|POST /api/admin/substore/*
  GET|POST /api/admin/updates/*
  GET /api/admin/audit

proxy:
  ALL /substore/*
```

Route rules:

- `/substore/*`: authenticated active owner only.
- Strip external prefix only inside proxy adapter.
- Allowlist upstream host/service; reject arbitrary proxy targets.
- Preserve required WebSocket/stream headers.
- Apply CSRF protection to cookie-authenticated mutations.
- Rate-limit login, register, token reset, generation, subscription test.

## 7. sing-box engine

Preserve current `singbox-center` behavior:

- Remote or local template.
- Template cache/version/validation/rollback.
- Per-user subscription list.
- Per-subscription region allowlist.
- Concurrent fetch with timeout.
- Normalize/filter nodes.
- Generate airport-region URLTest groups.
- Apply `x_rule`.
- Remove invalid outbound references.
- Debug result for owner/current user only.
- Cache last successful generated config.

Required hardening:

- SSRF policy: HTTP(S) only; block loopback/link-local/private by default; explicit owner allowlist option.
- Fetch timeout and response-size limit.
- Unique outbound tag validation.
- Atomic generation record writes.
- Cached config fallback configurable.

## 8. Sub-Store

```yaml
instance_count: 1
visibility: owner
direct_host_exposure: false
controls:
  - health
  - start
  - stop
  - restart
  - sync_now
  - auto_sync_enabled
  - sync_interval
  - update_check
  - update_apply
  - rollback
```

Constraint: application container must not mount Docker socket.

Container lifecycle actions (`start/stop/restart/update`) run through an installation-side management command/script, not arbitrary application shell execution. If secure lifecycle control cannot be implemented without Docker socket, v0.1 UI exposes state/instructions only; Compose remains operator-controlled.

Scheduler:

```yaml
scope: global-singleton
overlap: forbidden
success_recorded_only_after_upstream_success: true
default_auto_sync: false
default_interval_hours: 12
```

## 9. Update model

ProxyHub:

```yaml
source: ghcr.io/vonzhen/proxyhub
dev_tags: [dev, dev-sha]
master_tags: [master, master-sha]
release_tags: [vX.Y.Z, X.Y, X, latest]
production_default: fixed-vX.Y.Z
```

Sub-Store:

```yaml
image: env/SUBSTORE_IMAGE
default_policy: check-and-notify
automatic_apply: false
production_default: fixed-tag-or-digest
```

Update invariant:

1. Backup data.
2. Pull candidate.
3. Recreate.
4. Health check.
5. Roll back image on failure.
6. Never delete persistent data during update.

## 10. UI

Single Vue application; preserve existing singbox-center visual language.

```yaml
tabs:
  member: [dashboard, subscriptions, generation, account]
  owner: [dashboard, subscriptions, generation, substore, templates, users, system, account]
```

Sub-Store native UI is served through authenticated same-origin proxy. ProxyHub supplies shell/navigation/status controls; no full Sub-Store UI rewrite in v0.1.

## 11. Configuration

```env
PORT=3000
COOKIE_SECURE=false
TRUST_PROXY=false
REGISTRATION_ENABLED=true
SESSION_SECRET=
DATA_ENCRYPTION_KEY=
DATABASE_PATH=/app/data/proxyhub.db
SUBSTORE_ORIGIN=http://sub-store:3000
SUBSTORE_UI_ORIGIN=http://sub-store:3001
SUBSTORE_IMAGE=
AUTO_SYNC_ENABLED=false
AUTO_SYNC_INTERVAL_HOURS=12
```

Startup fails on missing/weak production secrets. Generate secrets during install; do not commit `.env`.

## 12. Repository layout

```text
src/
  app.js
  server.js
  config/
  db/
    migrations/
    repositories/
  middleware/
  modules/
  web/
profiles/
scripts/
test/
Dockerfile
docker-compose.yml
.env.example
package.json
TECHSPEC.md
README.md
```

## 13. CI/CD

Branches:

```yaml
master:
  direct_push: forbidden
  merge_source: dev
  release_ready: true
dev:
  implementation_branch: true
```

CI required:

- `npm ci`
- syntax/lint
- unit tests
- API integration tests
- migration tests
- Docker build
- Compose config
- dependency/security scan

No workflow publishes release/`latest` from `dev`.

## 14. Test gates

Required before `dev -> master`:

- First owner registration.
- Pending member approval flow.
- Username/password change.
- Disable revokes access/token.
- Registration switch.
- Per-user generation switch.
- Template remote/local/cache/rollback.
- Subscription test and generation.
- Sub-Store owner-only proxy.
- Direct Sub-Store host port absent.
- Restart preserves both data stores.
- Sync lock and failure reporting.
- ProxyHub/Sub-Store fixed-version update rollback.
- Fresh install on Debian/Ubuntu VM.
- HTTP and HTTPS reverse-proxy cookie modes.

## 15. Delivery phases

```yaml
P0: scaffold, compose, db, CI
P1: auth/users/settings
P2: singbox engine/templates/subscriptions
P3: unified UI
P4: substore proxy/health/sync
P5: update/backup/rollback
P6: security/tests/docs
P7: dev deployment acceptance
P8: dev-to-master PR only after explicit approval
```

## 16. Non-goals v0.1

- Old repository data migration.
- Backward-compatible APIs.
- Multi-Sub-Store tenancy.
- Per-user Sub-Store.
- Automatic Sub-Store-to-sing-box data exchange.
- Kubernetes.
- PM2 deployment.
- Direct commits to `master`.






