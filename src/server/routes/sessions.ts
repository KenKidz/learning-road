import { Router } from 'express';
import { eq, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { courses, studySessions, tasks } from '../db/schema';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import { dateInTimezone } from '../lib/dates';
import { getSettingsRow } from '../services/settings';
import { loadSessionDtos } from '../services/tasks';
import { sessionCreateSchema, sessionUpdateSchema } from './schemas';
import { idParam, optionalQueryInt, queryDate, toDate } from './helpers';

async function assertRefs(
  db: AppDb,
  courseId: number | null | undefined,
  taskId: number | null | undefined,
): Promise<void> {
  if (courseId != null) {
    const rows = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
    if (rows.length === 0) throw AppError.notFound('Không tìm thấy khóa học được liên kết.');
  }
  if (taskId != null) {
    const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (rows.length === 0) throw AppError.notFound('Không tìm thấy task được liên kết.');
  }
}

function resolveDuration(
  startedAt: Date,
  endedAt: Date | null | undefined,
  provided: number | undefined,
): number {
  if (endedAt) {
    const diff = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
    if (diff <= 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Thời điểm kết thúc phải sau thời điểm bắt đầu.');
    }
    if (diff > 1440) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Một study session không thể dài quá 24 giờ.');
    }
    return diff;
  }
  if (provided === undefined) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cần nhập thời lượng hoặc thời điểm kết thúc.');
  }
  return provided;
}

export function sessionsRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const settings = await getSettingsRow(db);
      const from = queryDate(req.query.from, 'from');
      const to = queryDate(req.query.to, 'to');
      const courseId = optionalQueryInt(req.query.courseId);
      const taskId = optionalQueryInt(req.query.taskId);

      const conditions: SQL[] = [];
      if (courseId) conditions.push(eq(studySessions.courseId, courseId));
      if (taskId) conditions.push(eq(studySessions.taskId, taskId));

      let items = await loadSessionDtos(db, conditions);
      if (from) {
        items = items.filter(
          (session) => dateInTimezone(new Date(session.startedAt), settings.timezone) >= from,
        );
      }
      if (to) {
        items = items.filter(
          (session) => dateInTimezone(new Date(session.startedAt), settings.timezone) <= to,
        );
      }
      res.json({
        sessions: items,
        totalMinutes: items.reduce((total, session) => total + session.durationMinutes, 0),
      });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parseInput(sessionCreateSchema, req.body);
      await assertRefs(db, input.courseId, input.taskId);
      const startedAt = new Date(input.startedAt);
      const endedAt = toDate(input.endedAt) ?? null;
      const durationMinutes = resolveDuration(startedAt, endedAt, input.durationMinutes);

      const [row] = await db
        .insert(studySessions)
        .values({
          courseId: input.courseId ?? null,
          taskId: input.taskId ?? null,
          startedAt,
          endedAt,
          durationMinutes,
          notes: input.notes ?? '',
        })
        .returning();
      if (!row) throw new Error('Failed to insert study session');
      const items = await loadSessionDtos(db, [eq(studySessions.id, row.id)]);
      res.status(201).json(items[0]);
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const rows = await db.select().from(studySessions).where(eq(studySessions.id, id)).limit(1);
      const existing = rows[0];
      if (!existing) throw AppError.notFound('Không tìm thấy study session.');
      const input = parseInput(sessionUpdateSchema, req.body);
      await assertRefs(db, input.courseId, input.taskId);

      const startedAt = input.startedAt ? new Date(input.startedAt) : existing.startedAt;
      const endedAt =
        input.endedAt !== undefined ? toDate(input.endedAt) ?? null : existing.endedAt;
      const needsRecompute =
        input.durationMinutes === undefined && (input.startedAt !== undefined || input.endedAt !== undefined);
      const durationMinutes = needsRecompute
        ? resolveDuration(startedAt, endedAt, undefined)
        : input.durationMinutes ?? existing.durationMinutes;

      const updates: Partial<typeof studySessions.$inferInsert> = {
        startedAt,
        endedAt,
        durationMinutes,
      };
      if (input.courseId !== undefined) updates.courseId = input.courseId;
      if (input.taskId !== undefined) updates.taskId = input.taskId;
      if (input.notes !== undefined) updates.notes = input.notes;

      const [row] = await db.update(studySessions).set(updates).where(eq(studySessions.id, id)).returning();
      if (!row) throw new Error('Failed to update study session');
      const items = await loadSessionDtos(db, [eq(studySessions.id, id)]);
      res.json(items[0]);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const [deleted] = await db
        .delete(studySessions)
        .where(eq(studySessions.id, id))
        .returning({ id: studySessions.id });
      if (!deleted) throw AppError.notFound('Không tìm thấy study session.');
      res.status(204).end();
    }),
  );

  return router;
}
