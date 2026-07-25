import path from 'node:path';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function asBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function asInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid integer configuration: ${value}`);
  }
  return parsed;
}

function requireProductionSecret(name, value, nodeEnv) {
  if (nodeEnv !== 'production') return;
  if (!value || value.length < 32 || value.startsWith('replace-with-')) {
    throw new Error(`${name} must contain at least 32 non-placeholder characters in production`);
  }
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const sessionSecret = env.SESSION_SECRET || 'development-session-secret-not-for-production';
  const dataEncryptionKey = env.DATA_ENCRYPTION_KEY || 'development-encryption-key-not-for-production';

  requireProductionSecret('SESSION_SECRET', sessionSecret, nodeEnv);
  requireProductionSecret('DATA_ENCRYPTION_KEY', dataEncryptionKey, nodeEnv);

  return Object.freeze({
    nodeEnv,
    host: env.HOST || '0.0.0.0',
    port: asInteger(env.PORT, 3000, { min: 1, max: 65535 }),
    cookieSecure: asBoolean(env.COOKIE_SECURE),
    trustProxy: asBoolean(env.TRUST_PROXY),
    registrationEnabled: asBoolean(env.REGISTRATION_ENABLED, true),
    sessionSecret,
    dataEncryptionKey,
    databasePath: path.resolve(env.DATABASE_PATH || 'data/proxyhub.db'),
    substoreOrigin: new URL(env.SUBSTORE_ORIGIN || 'http://sub-store:3000').origin,
    substoreUiOrigin: new URL(env.SUBSTORE_UI_ORIGIN || 'http://sub-store:3001').origin,
    autoSyncEnabled: asBoolean(env.AUTO_SYNC_ENABLED),
    autoSyncIntervalHours: asInteger(env.AUTO_SYNC_INTERVAL_HOURS, 12, { min: 1, max: 8760 })
  });
}




