import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testDirectory = new URL('../test/', import.meta.url);
const files = readdirSync(testDirectory)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => fileURLToPath(new URL(name, testDirectory)));

if (files.length === 0) {
  console.error('No test files found');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
