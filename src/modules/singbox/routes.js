import { Router } from 'express';
import { encryptUrl, decryptUrl } from './crypto.js';
import { assertSafeUrl } from './fetch.js';

const REGIONS = new Set(['HK', 'TW', 'SG', 'JP', 'US']);
const cleanRegions = (value) => [...new Set((Array.isArray(value) ? value : []).filter((item) => REGIONS.has(item)))];
const sendGeneratedConfig = (response, value) => response
  .type('application/json')
  .send(`${JSON.stringify(value, null, 2)}\n`);

export function createSingboxRouter({ database, config, auth, service }) {
  const router = Router();

  router.get('/generate', async (request, response) => {
    const hash = auth.tokenHash(String(request.query.token || ''));
    const user = database.prepare(`SELECT u.* FROM client_tokens t JOIN users u ON u.id=t.user_id
      WHERE t.token_hash=? AND t.revoked_at IS NULL`).get(hash);
    if (!user || user.status !== 'active' || !user.generation_enabled) return response.status(401).json({ error: 'token_invalid' });
    try {
      const result = await service.generate(user);
      service.saveRun(user.id, 'success', result.summary, result.output);
      sendGeneratedConfig(response.set('cache-control', 'no-store'), result.output);
    } catch (error) {
      service.saveRun(user.id, 'error', null, null, error.message);
      const fallback = database.prepare("SELECT value_json FROM app_settings WHERE key='generation_cache_fallback_enabled'").get();
      if (!fallback || JSON.parse(fallback.value_json)) {
        const cached = database.prepare(`SELECT config_json FROM generation_runs
          WHERE user_id=? AND status='success' AND config_json IS NOT NULL ORDER BY finished_at DESC LIMIT 1`).get(user.id);
        if (cached) return sendGeneratedConfig(
          response.set('x-proxyhub-cache', 'stale'),
          JSON.parse(cached.config_json)
        );
      }
      response.status(502).json({ error: 'generation_failed' });
    }
  });

  router.use(auth.requireUser);
  router.get('/subscriptions', (request, response) => {
    const rows = database.prepare('SELECT * FROM subscriptions WHERE user_id=? ORDER BY created_at').all(request.auth.user.id);
    try {
      response.json({ subscriptions: rows.map((row) => ({
        id: row.id,
        name: row.name,
        url: decryptUrl(row.url_encrypted, config.dataEncryptionKey),
        enabled: !!row.enabled,
        allowed_regions: JSON.parse(row.allowed_regions_json)
      })) });
    } catch {
      response.status(409).json({ error: 'subscription_decryption_failed' });
    }
  });
  router.post('/subscriptions', auth.requireCsrf, async (request, response) => {
    const { name, url, enabled = true, allowed_regions: regions } = request.body || {};
    if (!String(name || '').trim() || String(name).length > 80) return response.status(400).json({ error: 'invalid_name' });
    try { await assertSafeUrl(url); } catch { return response.status(400).json({ error: 'invalid_url' }); }
    const allowedRegions = cleanRegions(regions);
    if (enabled && !allowedRegions.length) return response.status(400).json({ error: 'allowed_region_required' });
    const id = auth.newId();
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO subscriptions(id,user_id,name,url_encrypted,enabled,allowed_regions_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(id, request.auth.user.id, name.trim(), encryptUrl(url, config.dataEncryptionKey), enabled ? 1 : 0, JSON.stringify(allowedRegions), now, now);
    response.status(201).json({ id });
  });
  router.put('/subscriptions/:id', auth.requireCsrf, async (request, response) => {
    const current = database.prepare('SELECT * FROM subscriptions WHERE id=? AND user_id=?').get(request.params.id, request.auth.user.id);
    if (!current) return response.status(404).json({ error: 'not_found' });
    const url = request.body?.url || decryptUrl(current.url_encrypted, config.dataEncryptionKey);
    try { await assertSafeUrl(url); } catch { return response.status(400).json({ error: 'invalid_url' }); }
    const name = String(request.body?.name || current.name).trim();
    if (!name || name.length > 80) return response.status(400).json({ error: 'invalid_name' });
    const enabled = request.body?.enabled ?? !!current.enabled;
    const allowedRegions = cleanRegions(request.body?.allowed_regions ?? JSON.parse(current.allowed_regions_json));
    if (enabled && !allowedRegions.length) return response.status(400).json({ error: 'allowed_region_required' });
    database.prepare(`UPDATE subscriptions SET name=?,url_encrypted=?,enabled=?,allowed_regions_json=?,updated_at=? WHERE id=?`)
      .run(name, encryptUrl(url, config.dataEncryptionKey), enabled ? 1 : 0, JSON.stringify(allowedRegions), new Date().toISOString(), current.id);
    response.json({ success: true });
  });
  router.put('/subscriptions/:id/enabled', auth.requireCsrf, (request, response) => {
    if (typeof request.body?.enabled !== 'boolean') return response.status(400).json({ error: 'invalid_enabled' });
    const current = database.prepare('SELECT * FROM subscriptions WHERE id=? AND user_id=?')
      .get(request.params.id, request.auth.user.id);
    if (!current) return response.status(404).json({ error: 'not_found' });
    if (request.body.enabled && !cleanRegions(JSON.parse(current.allowed_regions_json)).length) {
      return response.status(400).json({ error: 'allowed_region_required' });
    }
    database.prepare('UPDATE subscriptions SET enabled=?,updated_at=? WHERE id=?')
      .run(request.body.enabled ? 1 : 0, new Date().toISOString(), current.id);
    response.json({ success: true, enabled: request.body.enabled });
  });
  router.delete('/subscriptions/:id', auth.requireCsrf, (request, response) => {
    const result = database.prepare('DELETE FROM subscriptions WHERE id=? AND user_id=?').run(request.params.id, request.auth.user.id);
    response.status(result.changes ? 200 : 404).json(result.changes ? { success: true } : { error: 'not_found' });
  });
  router.post('/subscriptions/:id/test', auth.requireCsrf, async (request, response) => {
    const row = database.prepare('SELECT * FROM subscriptions WHERE id=? AND user_id=?').get(request.params.id, request.auth.user.id);
    if (!row) return response.status(404).json({ error: 'not_found' });
    response.json(await service.testSubscription({
      name: row.name,
      url: decryptUrl(row.url_encrypted, config.dataEncryptionKey),
      allowed_regions: JSON.parse(row.allowed_regions_json)
    }));
  });
  router.post('/subscription/test', auth.requireCsrf, async (request, response) => {
    response.json(await service.testSubscription(request.body?.subscription));
  });
  router.post('/generation/test', auth.requireCsrf, async (request, response) => {
    try { response.json(await service.generate(request.auth.user)); }
    catch (error) { response.json(error.diagnostics || { success: false, error: error.message, summary: {}, steps: [] }); }
  });
  router.get('/generation/status', (request, response) => {
    response.json({ runs: database.prepare('SELECT id,status,summary_json,error_text,started_at,finished_at FROM generation_runs WHERE user_id=? ORDER BY started_at DESC LIMIT 20').all(request.auth.user.id) });
  });

  router.get('/admin/singbox-settings', auth.requireOwner, (_request, response) => {
    response.json({ settings: service.settings() });
  });
  router.put('/admin/singbox-settings', auth.requireOwner, auth.requireCsrf, (request, response) => {
    try { response.json({ success: true, settings: service.updateSettings(request.body) }); }
    catch (error) { response.status(400).json({ error: error.message }); }
  });

  router.get('/admin/templates', auth.requireOwner, (_request, response) => response.json({
    templates: database.prepare(`SELECT id,source_type,source_url,content_hash,active,created_at,
      parent_id,status,last_checked_at,last_error FROM template_versions ORDER BY created_at DESC`).all()
  }));
  router.get('/admin/templates/:id', auth.requireOwner, (request, response) => {
    const row = service.template(request.params.id);
    if (!row) return response.status(404).json({ error: 'template_not_found' });
    response.json({
      template: {
        id: row.id, source_type: row.source_type, source_url: row.source_url,
        content: JSON.parse(row.content_json), content_hash: row.content_hash,
        active: !!row.active, parent_id: row.parent_id, status: row.status,
        last_checked_at: row.last_checked_at, last_error: row.last_error,
        created_at: row.created_at
      }
    });
  });
  router.post('/admin/templates', auth.requireOwner, auth.requireCsrf, async (request, response) => {
    try {
      const result = await service.createTemplateVersion({
        sourceType: request.body?.source_type,
        sourceUrl: request.body?.source_url,
        content: request.body?.content
      });
      response.status(201).json(result);
    } catch (error) { response.status(400).json({ error: error.message }); }
  });
  router.post('/admin/templates/:id/versions', auth.requireOwner, auth.requireCsrf, async (request, response) => {
    try {
      const result = await service.createTemplateVersion({
        sourceType: request.body?.source_type,
        sourceUrl: request.body?.source_url,
        content: request.body?.content,
        parentId: request.params.id
      });
      response.status(201).json(result);
    } catch (error) {
      response.status(error.message === 'template_not_found' ? 404 : 400).json({ error: error.message });
    }
  });
  router.post('/admin/templates/:id/refresh', auth.requireOwner, auth.requireCsrf, async (request, response) => {
    try { response.status(201).json(await service.refreshTemplate(request.params.id)); }
    catch (error) {
      const status = error.message === 'template_not_found' ? 404 : (error.message === 'template_not_remote' ? 400 : 502);
      response.status(status).json({ error: error.message });
    }
  });
  router.post('/admin/templates/:id/activate', auth.requireOwner, auth.requireCsrf, (request, response) => {
    try {
      const result = service.activateTemplate(request.params.id);
      if (!result) return response.status(404).json({ error: 'template_not_found' });
      response.json({ success: true, ...result });
    } catch (error) { response.status(400).json({ error: error.message }); }
  });
  router.post('/admin/templates/:id/rollback', auth.requireOwner, auth.requireCsrf, (request, response) => {
    try {
      const result = service.activateTemplate(request.params.id);
      if (!result) return response.status(404).json({ error: 'template_not_found' });
      response.json({ success: true, rollback: true, ...result });
    } catch (error) { response.status(400).json({ error: error.message }); }
  });
  return router;
}





