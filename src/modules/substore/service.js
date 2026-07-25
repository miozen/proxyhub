import { randomUUID } from 'node:crypto';
import { redact } from '../../security/redact.js';

async function request(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'ProxyHub/0.1' } });
    const text = await response.text();
    if (!response.ok) throw new Error(`substore_http_${response.status}`);
    return { status: response.status, body: text.slice(0, 20_000) };
  } finally { clearTimeout(timer); }
}

export function createSubstoreService({
  database, config, transport = request, schedulerIntervalMs = 60_000, now = () => Date.now()
}) {
  let running = false;
  database.prepare(`UPDATE jobs SET status='error',error_text='interrupted_by_restart',finished_at=?
    WHERE type='substore_sync' AND status='running'`).run(new Date(now()).toISOString());

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
        backend: checks[0].status === 'rejected' ? checks[0].reason?.message || 'unavailable' : null,
        frontend: checks[1].status === 'rejected' ? checks[1].reason?.message || 'unavailable' : null
      }
    };
  }

  async function sync(triggerType = 'manual') {
    if (running) throw new Error('sync_already_running');
    running = true;
    const id = randomUUID();
    const started = new Date(now()).toISOString();
    database.prepare(`INSERT INTO jobs(id,type,status,trigger_type,started_at)
      VALUES(?,'substore_sync','running',?,?)`).run(id, triggerType, started);
    try {
      const result = await transport(`${config.substoreOrigin}/api/sync`, 60_000);
      database.prepare(`UPDATE jobs SET status='success',result_json=?,finished_at=? WHERE id=?`)
        .run(JSON.stringify(result), new Date(now()).toISOString(), id);
      return { id, success: true };
    } catch (error) {
      database.prepare(`UPDATE jobs SET status='error',error_text=?,finished_at=? WHERE id=?`)
        .run(redact(error.message), new Date(now()).toISOString(), id);
      throw error;
    } finally { running = false; }
  }

  function setting(key, fallback) {
    const row = database.prepare('SELECT value_json FROM app_settings WHERE key=?').get(key);
    return row ? JSON.parse(row.value_json) : fallback;
  }

  function settings() {
    return {
      auto_sync_enabled: setting('auto_sync_enabled', config.autoSyncEnabled),
      auto_sync_interval_hours: setting('auto_sync_interval_hours', config.autoSyncIntervalHours)
    };
  }

  async function runScheduled() {
    if (!setting('auto_sync_enabled', config.autoSyncEnabled) || running) return;
    const hours = Number(setting('auto_sync_interval_hours', config.autoSyncIntervalHours));
    const last = database.prepare(`SELECT COALESCE(finished_at,started_at) last_at FROM jobs
      WHERE type='substore_sync' ORDER BY started_at DESC LIMIT 1`).get();
    if (!last || now() - Date.parse(last.last_at) >= hours * 3_600_000) {
      try { await sync('schedule'); } catch (error) { console.error('[substore] scheduled sync failed:', redact(error.message)); }
    }
  }

  const timer = setInterval(runScheduled, schedulerIntervalMs);
  timer.unref();

  return { health, sync, settings, runScheduled, stop: () => clearInterval(timer), isRunning: () => running };
}

