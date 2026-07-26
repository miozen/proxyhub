INSERT INTO app_settings (key, value_json, updated_at)
VALUES ('generation_cache_fallback_enabled', 'true', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO NOTHING;

