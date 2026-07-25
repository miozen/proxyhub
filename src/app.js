import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHealthRouter } from './modules/health/routes.js';
import { createAuth } from './modules/auth/service.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { createUserRouter } from './modules/users/routes.js';
import { createSingboxService } from './modules/singbox/service.js';
import { createSingboxRouter } from './modules/singbox/routes.js';
import { createSubstoreService } from './modules/substore/service.js';
import { createSubstoreRouter } from './modules/substore/routes.js';
import { mountSubstoreProxy } from './modules/substore/proxy.js';

export function createApp({
  config, database, probeSubstore, singboxFetch, substoreTransport,
  substoreSchedulerIntervalMs, substoreNow
}) {
  const app = express();
  const webRoot = fileURLToPath(new URL('./web/', import.meta.url));

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  const auth = createAuth({ database, config });
  const singbox = createSingboxService({ database, config, fetchJson: singboxFetch });
  const substore = createSubstoreService({
    database, config, transport: substoreTransport,
    schedulerIntervalMs: substoreSchedulerIntervalMs, now: substoreNow
  });
  mountSubstoreProxy(app, { auth, config });
  app.use(express.json({ limit: '1mb' }));

  app.use('/healthz', createHealthRouter({ database, config, probeSubstore }));
  app.use('/api/auth', createAuthRouter({ database, config, auth }));
  app.use('/api', createSingboxRouter({ database, config, auth, service: singbox }));
  app.use('/api', createUserRouter({ database, config, auth }));
  app.use('/api/admin/substore', createSubstoreRouter({ database, auth, service: substore }));
  app.locals.stopBackgroundTasks = () => substore.stop();
  app.locals.runSubstoreScheduler = () => substore.runScheduled();

  app.get('/vendor/vue.js', (_request, response) => {
    response.sendFile(path.resolve('node_modules/vue/dist/vue.global.prod.js'));
  });
  app.use(express.static(webRoot));
  app.get('/', (_request, response) => response.sendFile(path.join(webRoot, 'index.html')));

  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found' });
  });

  return app;
}






