import { Router } from 'express';
import { hashPassword, verifyPassword } from './service.js';

const attempts = new Map();
const USERNAME = /^[a-zA-Z0-9_.-]{3,32}$/;

function limited(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() > entry.until) return false;
  return entry.count >= 5;
}

function failure(ip) {
  const current = attempts.get(ip) || { count: 0, until: Date.now() + 900_000 };
  current.count += 1;
  attempts.set(ip, current);
}

export function createAuthRouter({ database, config, auth }) {
  const router = Router();

  router.post('/register', (request, response) => {
    const { username, password } = request.body || {};
    if (!USERNAME.test(username || '') || typeof password !== 'string' || password.length < 10) {
      return response.status(400).json({ error: 'invalid_credentials' });
    }
    const count = database.prepare('SELECT COUNT(*) count FROM users').get().count;
    const setting = database.prepare("SELECT value_json FROM app_settings WHERE key='registration_enabled'").get();
    if (count > 0 && !(setting ? JSON.parse(setting.value_json) : config.registrationEnabled)) {
      return response.status(403).json({ error: 'registration_disabled' });
    }
    const now = new Date().toISOString();
    try {
      const id = auth.newId();
      database.transaction(() => {
        database.prepare(`
          INSERT INTO users(id,username,password_hash,role,status,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?)
        `).run(id, username, hashPassword(password), count === 0 ? 'owner' : 'member', count === 0 ? 'active' : 'pending', now, now);
        if (count === 0) auth.ensureClientToken(id);
      })();
      return response.status(201).json({ status: count === 0 ? 'active' : 'pending' });
    } catch (error) {
      if (String(error.code).includes('CONSTRAINT')) return response.status(409).json({ error: 'username_exists' });
      throw error;
    }
  });

  router.post('/login', (request, response) => {
    if (limited(request.ip)) return response.status(429).json({ error: 'rate_limited' });
    const user = database.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(request.body?.username);
    if (!user || !verifyPassword(request.body?.password || '', user.password_hash)) {
      failure(request.ip);
      return response.status(401).json({ error: 'invalid_credentials' });
    }
    if (user.status !== 'active') return response.status(403).json({ error: `account_${user.status}` });
    attempts.delete(request.ip);
    const raw = auth.createSession(user.id);
    response.setHeader('Set-Cookie', auth.cookie(raw));
    return response.json({
      user: {
        id: user.id, username: user.username, role: user.role,
        status: user.status, generation_enabled: !!user.generation_enabled
      },
      csrf_token: auth.csrfToken(raw)
    });
  });

  router.post('/logout', auth.requireUser, auth.requireCsrf, (request, response) => {
    auth.revokeSession(request.auth.raw);
    response.setHeader('Set-Cookie', auth.cookie('', 0));
    response.json({ success: true });
  });

  return router;
}




