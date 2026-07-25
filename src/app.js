import express from 'express';
import { createHealthRouter } from './modules/health/routes.js';

export function createApp({ config, database, probeSubstore }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(express.json({ limit: '1mb' }));

  app.use('/healthz', createHealthRouter({ database, config, probeSubstore }));

  app.get('/', (_request, response) => {
    response.json({
      name: 'ProxyHub',
      version: '0.1.0',
      phase: 'P0'
    });
  });

  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found' });
  });

  return app;
}

