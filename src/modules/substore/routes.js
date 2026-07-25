import { Router } from 'express';

export function createSubstoreRouter({ auth, service }) {
  const router = Router();
  router.use(auth.requireUser, auth.requireOwner);

  router.get('/status', async (_request, response) => {
    response.json({
      health: await service.health(),
      backend_path: service.backendPath()
    });
  });

  router.post('/backend-path/reset', auth.requireCsrf, (_request, response) => {
    response.json({ backend_path: service.resetBackendPath() });
  });

  return router;
}
