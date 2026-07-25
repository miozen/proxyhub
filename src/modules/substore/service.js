import { randomBytes } from 'node:crypto';

const BACKEND_PATH_SETTING = 'substore_backend_path';

async function request(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'ProxyHub/0.1' }
    });
    if (!response.ok) throw new Error(`substore_http_${response.status}`);
    return { status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

export function createSubstoreService({
  database, config, transport = request, now = () => Date.now()
}) {
  function setting() {
    const row = database.prepare('SELECT value_json FROM app_settings WHERE key=?')
      .get(BACKEND_PATH_SETTING);
    return row ? JSON.parse(row.value_json) : null;
  }

  function save(value) {
    database.prepare(`INSERT INTO app_settings(key,value_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`)
      .run(BACKEND_PATH_SETTING, JSON.stringify(value), new Date(now()).toISOString());
  }

  function generateBackendPath() {
    return `/${randomBytes(16).toString('hex')}`;
  }

  function backendPath() {
    const existing = setting();
    if (typeof existing === 'string' && /^\/[a-f0-9]{32}$/.test(existing)) return existing;
    const created = generateBackendPath();
    save(created);
    return created;
  }

  function resetBackendPath() {
    const replacement = generateBackendPath();
    save(replacement);
    return replacement;
  }

  async function health() {
    const checks = await Promise.allSettled([
      transport(config.substoreOrigin, 2_000),
      transport(config.substoreUiOrigin, 2_000)
    ]);
    return {
      backend: checks[0].status === 'fulfilled',
      frontend: checks[1].status === 'fulfilled',
      healthy: checks.every((item) => item.status === 'fulfilled'),
      errors: {
        backend: checks[0].status === 'rejected'
          ? checks[0].reason?.message || 'unavailable'
          : null,
        frontend: checks[1].status === 'rejected'
          ? checks[1].reason?.message || 'unavailable'
          : null
      }
    };
  }

  backendPath();
  return { health, backendPath, resetBackendPath };
}
