import { Router } from 'express';
import { hashPassword, verifyPassword } from '../auth/service.js';

const USERNAME = /^[a-zA-Z0-9_.-]{3,32}$/;

function publicUser(user) {
  return {
    id: user.id, username: user.username, role: user.role, status: user.status,
    generation_enabled: !!user.generation_enabled, created_at: user.created_at
  };
}

export function createUserRouter({ database, auth }) {
  const router = Router();
  router.use(auth.requireUser);

  router.get('/me', (request, response) => response.json({
    user: publicUser(request.auth.user),
    csrf_token: auth.csrfToken(request.auth.raw)
  }));

  router.put('/me/username', auth.requireCsrf, (request, response) => {
    const username = request.body?.username;
    if (!USERNAME.test(username || '')) return response.status(400).json({ error: 'invalid_username' });
    try {
      database.prepare('UPDATE users SET username=?,updated_at=? WHERE id=?').run(username, new Date().toISOString(), request.auth.user.id);
      response.json({ success: true, username });
    } catch {
      response.status(409).json({ error: 'username_exists' });
    }
  });

  router.put('/me/password', auth.requireCsrf, (request, response) => {
    const { current_password: current, new_password: next } = request.body || {};
    if (!verifyPassword(current || '', request.auth.user.password_hash)) return response.status(403).json({ error: 'password_incorrect' });
    if (typeof next !== 'string' || next.length < 10) return response.status(400).json({ error: 'password_weak' });
    database.transaction(() => {
      database.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(hashPassword(next), new Date().toISOString(), request.auth.user.id);
      auth.revokeUser(request.auth.user.id);
    })();
    response.setHeader('Set-Cookie', auth.cookie('', 0));
    response.json({ success: true, reauthentication_required: true });
  });

  router.post('/me/token/reset', auth.requireCsrf, (request, response) => {
    const raw = auth.newClientToken();
    database.transaction(() => {
      database.prepare('UPDATE client_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(new Date().toISOString(), request.auth.user.id);
      database.prepare('INSERT INTO client_tokens(id,token_hash,user_id,created_at) VALUES(?,?,?,?)')
        .run(auth.newId(), auth.tokenHash(raw), request.auth.user.id, new Date().toISOString());
    })();
    response.json({ token: raw });
  });

  router.get('/admin/users', auth.requireOwner, (_request, response) => {
    response.json({ users: database.prepare('SELECT * FROM users ORDER BY created_at').all().map(publicUser) });
  });

  for (const [action, status] of [['approve', 'active'], ['reject', 'rejected'], ['enable', 'active'], ['disable', 'disabled']]) {
    router.post(`/admin/users/:id/${action}`, auth.requireOwner, auth.requireCsrf, (request, response) => {
      if (request.params.id === request.auth.user.id && status !== 'active') return response.status(400).json({ error: 'owner_self_action' });
      const result = database.prepare('UPDATE users SET status=?,updated_at=? WHERE id=?').run(status, new Date().toISOString(), request.params.id);
      if (!result.changes) return response.status(404).json({ error: 'user_not_found' });
      if (status !== 'active') auth.revokeUserAccess(request.params.id);
      response.json({ success: true, status });
    });
  }

  router.put('/admin/users/:id/generation', auth.requireOwner, auth.requireCsrf, (request, response) => {
    const enabled = request.body?.enabled === true ? 1 : 0;
    const result = database.prepare('UPDATE users SET generation_enabled=?,updated_at=? WHERE id=?').run(enabled, new Date().toISOString(), request.params.id);
    response.status(result.changes ? 200 : 404).json(result.changes ? { success: true, enabled: !!enabled } : { error: 'user_not_found' });
  });

  router.delete('/admin/users/:id', auth.requireOwner, auth.requireCsrf, (request, response) => {
    if (request.params.id === request.auth.user.id) return response.status(400).json({ error: 'owner_self_action' });
    const result = database.prepare('DELETE FROM users WHERE id=?').run(request.params.id);
    response.status(result.changes ? 200 : 404).json(result.changes ? { success: true } : { error: 'user_not_found' });
  });

  router.put('/admin/settings/registration', auth.requireOwner, auth.requireCsrf, (request, response) => {
    const enabled = request.body?.enabled === true;
    database.prepare(`
      INSERT INTO app_settings(key,value_json,updated_at) VALUES('registration_enabled',?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at
    `).run(JSON.stringify(enabled), new Date().toISOString());
    response.json({ success: true, enabled });
  });

  router.put('/admin/settings/generation-cache', auth.requireOwner, auth.requireCsrf, (request, response) => {
    const enabled = request.body?.enabled === true;
    database.prepare(`
      INSERT INTO app_settings(key,value_json,updated_at) VALUES('generation_cache_fallback_enabled',?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at
    `).run(JSON.stringify(enabled), new Date().toISOString());
    response.json({ success: true, enabled });
  });

  router.get('/admin/settings', auth.requireOwner, (_request, response) => {
    const rows = database.prepare('SELECT key,value_json FROM app_settings ORDER BY key').all();
    response.json({ settings: Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value_json)])) });
  });

  return router;
}





