import { Router } from 'express';
import { eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { userSettings } from '../db/schema';
import { asyncHandler } from '../lib/async-handler';
import { parseInput } from '../lib/validate';
import { getSettingsRow, serializeSettings } from '../services/settings';
import { settingsUpdateSchema } from './schemas';

export function settingsRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const row = await getSettingsRow(db);
      res.json(serializeSettings(row));
    }),
  );

  router.patch(
    '/',
    asyncHandler(async (req, res) => {
      const existing = await getSettingsRow(db);
      const input = parseInput(settingsUpdateSchema, req.body);
      const updates: Partial<typeof userSettings.$inferInsert> = { updatedAt: new Date() };
      if (input.timezone !== undefined) updates.timezone = input.timezone;
      if (input.roadmapStartDate !== undefined) updates.roadmapStartDate = input.roadmapStartDate;
      if (input.dailyGoalMinutes !== undefined) updates.dailyGoalMinutes = input.dailyGoalMinutes;
      if (input.weeklyGoalMinutes !== undefined) updates.weeklyGoalMinutes = input.weeklyGoalMinutes;
      if (input.preferredStudyDays !== undefined) updates.preferredStudyDays = input.preferredStudyDays;
      if (input.studyWindow !== undefined) updates.studyWindow = input.studyWindow;
      if (input.experienceYears !== undefined) updates.experienceYears = input.experienceYears;
      if (input.level !== undefined) updates.level = input.level;
      if (input.targetRole !== undefined) updates.targetRole = input.targetRole;
      if (input.backendLevel !== undefined) updates.backendLevel = input.backendLevel;
      if (input.typescriptLevel !== undefined) updates.typescriptLevel = input.typescriptLevel;
      if (input.sqlLevel !== undefined) updates.sqlLevel = input.sqlLevel;
      if (input.gitLevel !== undefined) updates.gitLevel = input.gitLevel;

      const [row] = await db
        .update(userSettings)
        .set(updates)
        .where(eq(userSettings.id, existing.id))
        .returning();
      if (!row) throw new Error('Failed to update settings');
      res.json(serializeSettings(row));
    }),
  );

  return router;
}
