import { Router } from 'express';
import { databaseHealth } from '../../db/index.js';

async function probe(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    return { reachable: true, status: response.status };
  } catch {
    return { reachable: false, status: null };
  } finally {
    clearTimeout(timeout);
  }
}

export function createHealthRouter({ database, config, probeSubstore = probe }) {
  const router = Router();

  router.get('/', async (_request, response) => {
    const databaseOk = databaseHealth(database);
    const substore = await probeSubstore(config.substoreOrigin);

    response.json({
      status: databaseOk ? (substore.reachable ? 'ok' : 'degraded') : 'error',
      service: 'proxyhub',
      version: '0.1.0',
      checks: {
        database: databaseOk ? 'ok' : 'error',
        substore
      }
    });
  });

  return router;
}


