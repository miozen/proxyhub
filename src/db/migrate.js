import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));

export function runMigrations(database, directory = migrationDirectory) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const migrations = fs.readdirSync(directory)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right, 'en'));

  const applied = database.prepare('SELECT version FROM schema_migrations').all();
  const appliedVersions = new Set(applied.map(({ version }) => version));
  const recordMigration = database.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  const apply = database.transaction((version, name, sql) => {
    database.exec(sql);
    recordMigration.run(version, name, new Date().toISOString());
  });

  for (const name of migrations) {
    const version = Number.parseInt(name.split('_', 1)[0], 10);
    if (appliedVersions.has(version)) continue;
    const sql = fs.readFileSync(path.join(directory, name), 'utf8');
    apply(version, name, sql);
  }
}

