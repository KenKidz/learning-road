import { asc } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { userSettings, type UserSettingsRow } from '../db/schema';
import type { UserSettings } from '../../shared/types';
import { iso } from '../lib/dates';

export async function getSettingsRow(db: AppDb): Promise<UserSettingsRow> {
  const rows = await db.select().from(userSettings).orderBy(asc(userSettings.id)).limit(1);
  const existing = rows[0];
  if (existing) return existing;

  const [created] = await db.insert(userSettings).values({}).returning();
  if (!created) throw new Error('Unable to create default settings');
  return created;
}

export function serializeSettings(row: UserSettingsRow): UserSettings {
  return {
    id: row.id,
    timezone: row.timezone,
    roadmapStartDate: row.roadmapStartDate,
    dailyGoalMinutes: row.dailyGoalMinutes,
    weeklyGoalMinutes: row.weeklyGoalMinutes,
    preferredStudyDays: row.preferredStudyDays,
    studyWindow: row.studyWindow,
    experienceYears: row.experienceYears,
    level: row.level,
    targetRole: row.targetRole,
    backendLevel: row.backendLevel,
    typescriptLevel: row.typescriptLevel,
    sqlLevel: row.sqlLevel,
    gitLevel: row.gitLevel,
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
  };
}
