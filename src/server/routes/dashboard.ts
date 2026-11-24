import { Router } from 'express';
import type { AppDb } from '../db/client';
import { asyncHandler } from '../lib/async-handler';
import { buildDashboard } from '../services/dashboard';

export function dashboardRouter(db: AppDb): Router {
  const router = Router();
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await buildDashboard(db));
    }),
  );
  return router;
}
