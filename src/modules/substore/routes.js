import { Router } from 'express';

export function createSubstoreRouter({ database, auth, service }) {
  const router = Router();
  router.use(auth.requireUser, auth.requireOwner);

  router.get('/status', async (_request, response) => {
    const health = await service.health();
    const jobs = database.prepare(`SELECT id,status,trigger_type,error_text,started_at,finished_at
      FROM jobs WHERE type='substore_sync' ORDER BY started_at DESC LIMIT 20`).all();
    response.json({
      health,
      syncing: service.isRunning(),
      backend_path: service.backendPath(),
      ...service.settings(),
      jobs
    });
  });

  router.post('/backend-path/reset', auth.requireCsrf, (_request, response) => {
    response.json({ backend_path: service.resetBackendPath() });
  });

  router.post('/sync', auth.requireCsrf, async (_request, response) => {
    try { response.json(await service.sync('manual')); }
    catch (error) { response.status(error.message === 'sync_already_running' ? 409 : 502).json({ error: error.message }); }
  });

  router.put('/settings', auth.requireCsrf, (request, response) => {
    const enabled = request.body?.enabled === true;
    const interval = Number.parseInt(request.body?.interval_hours, 10);
    if (!Number.isInteger(interval) || interval < 1 || interval > 8760) return response.status(400).json({ error: 'invalid_interval' });
    const now = new Date().toISOString();
    const save = database.prepare(`INSERT INTO app_settings(key,value_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`);
    database.transaction(() => {
      save.run('auto_sync_enabled', JSON.stringify(enabled), now);
      save.run('auto_sync_interval_hours', JSON.stringify(interval), now);
    })();
    response.json({ success: true, enabled, interval_hours: interval });
  });
  return router;
}

