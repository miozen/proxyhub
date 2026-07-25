import {
  createHash, createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual
} from 'node:crypto';

const SESSION_TTL_MS = 86_400_000;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf('=');
    return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
  }));
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  const iterations = 210_000;
  const digest = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2-sha256$${iterations}$${salt.toString('hex')}$${digest.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [algorithm, iterationsRaw, saltHex, digestHex] = String(stored).split('$');
  if (algorithm !== 'pbkdf2-sha256') return false;
  const expected = Buffer.from(digestHex, 'hex');
  const actual = pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), Number(iterationsRaw), expected.length, 'sha256');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createAuth({ database, config }) {
  const userBySession = database.prepare(`
    SELECT u.*, s.id_hash AS session_hash FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id_hash = ? AND s.expires_at > ?
  `);

  function cookie(raw, maxAge = 86400) {
    return [
      `proxyhub_session=${encodeURIComponent(raw)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
      `Max-Age=${maxAge}`, ...(config.cookieSecure ? ['Secure'] : [])
    ].join('; ');
  }

  function createSession(userId) {
    const raw = randomBytes(32).toString('base64url');
    const now = new Date();
    database.prepare(`
      INSERT INTO sessions(id_hash,user_id,expires_at,created_at,last_seen_at)
      VALUES(?,?,?,?,?)
    `).run(sha256(raw), userId, new Date(now.getTime() + SESSION_TTL_MS).toISOString(), now.toISOString(), now.toISOString());
    return raw;
  }

  function csrfToken(raw) {
    return createHmac('sha256', config.sessionSecret).update(raw).digest('base64url');
  }

  function current(request) {
    const raw = parseCookies(request.headers.cookie).proxyhub_session;
    if (!raw) return null;
    const user = userBySession.get(sha256(raw), new Date().toISOString());
    return user ? { user, raw } : null;
  }

  function requireUser(request, response, next) {
    const session = current(request);
    if (!session || session.user.status !== 'active') return response.status(401).json({ error: 'unauthorized' });
    request.auth = session;
    next();
  }

  function requireOwner(request, response, next) {
    if (request.auth.user.role !== 'owner') return response.status(403).json({ error: 'forbidden' });
    next();
  }

  function requireCsrf(request, response, next) {
    const supplied = request.get('x-csrf-token') || '';
    const expected = csrfToken(request.auth.raw);
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return response.status(403).json({ error: 'csrf_invalid' });
    }
    next();
  }

  function revokeUserAccess(id) {
    database.transaction(() => {
      database.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      database.prepare('UPDATE client_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')
        .run(new Date().toISOString(), id);
    })();
  }

  return {
    cookie, createSession, csrfToken, current, requireUser, requireOwner, requireCsrf,
    revokeSession: (raw) => database.prepare('DELETE FROM sessions WHERE id_hash=?').run(sha256(raw)),
    revokeUser: (id) => database.prepare('DELETE FROM sessions WHERE user_id=?').run(id),
    revokeUserAccess,
    newId: () => randomUUID(),
    newClientToken: () => randomBytes(36).toString('base64url'),
    tokenHash: sha256
  };
}

