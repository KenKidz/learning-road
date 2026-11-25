import { Router } from 'express';
import type { AppDb } from '../db/client';
import { asyncHandler } from '../lib/async-handler';
import { buildAnalytics } from '../services/analytics';
import { optionalQueryInt } from './helpers';

export function analyticsRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const days = optionalQueryInt(req.query.days) ?? 180;
      const result = await buildAnalytics(db, days);
      res.json(result);
    }),
  );

  return router;
}
