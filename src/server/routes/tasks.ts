import { Router } from 'express';
import {


  between,
  eq,
  gt,
  ilike,
  inArray,
  lt,
  or,

  type SQL,
} from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { courses, projects, tasks } from '../db/schema';
import {
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from '../../shared/types';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import { todayInTimezone, weekBounds } from '../lib/dates';
import { getSettingsRow } from '../services/settings';
import { loadTaskDtos } from '../services/tasks';
import { serializeTask } from '../services/serializers';
import {
  taskCreateSchema,
  taskRescheduleSchema,
  taskUpdateSchema,
} from './schemas';
import { idParam, optionalQueryInt, optionalQueryString, queryDate, toDate } from './helpers';

async function assertTaskRefs(
  db: AppDb,
  courseId: number | null | undefined,
  projectId: number | null | undefined,
): Promise<void> {
  if (courseId != null) {
    const rows = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
    if (rows.length === 0) throw AppError.notFound('Không tìm thấy khóa học được liên kết.');
  }
  if (projectId != null) {
    const rows = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (rows.length === 0) throw AppError.notFound('Không tìm thấy project được liên kết.');
  }
}

function summarize(items: Task[]): { open: number; done: number; estimatedMinutes: number; actualMinutes: number } {
  return {
    open: items.filter((task) => task.status === 'todo' || task.status === 'in_progress').length,
    done: items.filter((task) => task.status === 'done').length,
    estimatedMinutes: items.reduce((total, task) => total + (task.estimatedMinutes ?? 0), 0),
    actualMinutes: items.reduce((total, task) => total + task.actualMinutes, 0),
  };
}

export function tasksRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const settings = await getSettingsRow(db);
      const today = todayInTimezone(settings.timezone);
      const scope = optionalQueryString(req.query.scope) ?? 'all';
      const date = queryDate(req.query.date) ?? today;
      const from = queryDate(req.query.from, 'from');
      const to = queryDate(req.query.to, 'to');
      const status = optionalQueryString(req.query.status);
      const courseId = optionalQueryInt(req.query.courseId);
      const projectId = optionalQueryInt(req.query.projectId);
      const q = optionalQueryString(req.query.q);

      const conditions: SQL[] = [];
      if (status && (TASK_STATUSES as readonly string[]).includes(status)) {
        conditions.push(eq(tasks.status, status as TaskStatus));
      } else if (status) {
        throw new AppError(400, 'INVALID_QUERY', 'Trạng thái task không hợp lệ.');
      }
      if (courseId) conditions.push(eq(tasks.relatedCourseId, courseId));
      if (projectId) conditions.push(eq(tasks.relatedProjectId, projectId));
      if (q) conditions.push(ilike(tasks.title, `%${q}%`));

      if (scope === 'today') {
        conditions.push(eq(tasks.plannedDate, date));
      } else if (scope === 'week') {
        const { weekStart, weekEnd } = weekBounds(date);
        conditions.push(between(tasks.plannedDate, weekStart, weekEnd));
      } else if (scope === 'overdue') {
        conditions.push(inArray(tasks.status, ['todo', 'in_progress']));
        conditions.push(
          or(
            lt(tasks.plannedDate, today),
            lt(tasks.dueDate, today),
          ) as SQL,
        );
      } else if (scope === 'history') {
        conditions.push(inArray(tasks.status, ['done', 'cancelled']));
      } else if (scope === 'upcoming') {
        conditions.push(gt(tasks.plannedDate, today));
      } else {
        if (from && to) conditions.push(between(tasks.plannedDate, from, to));
        else if (from) conditions.push(gt(tasks.plannedDate, from) as SQL);
        else if (to) conditions.push(lt(tasks.plannedDate, to) as SQL);
      }

      const items = await loadTaskDtos(db, conditions);
      if (scope === 'history') {
        items.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      }
      res.json({ tasks: items, summary: summarize(items) });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const rows = await db.select().from(tasks).where(eq(tasks.id, idParam(req.params.id))).limit(1);
      const row = rows[0];
      if (!row) throw AppError.notFound('Không tìm thấy task.');
      res.json(serializeTask(row));
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parseInput(taskCreateSchema, req.body);
      await assertTaskRefs(db, input.relatedCourseId, input.relatedProjectId);
      const settings = await getSettingsRow(db);
      const today = todayInTimezone(settings.timezone);

      const status = input.status ?? 'todo';
      if (input.completedAt != null && status !== 'done') {
        throw new AppError(422, 'VALIDATION_ERROR', 'Task chưa hoàn thành thì không có completedAt.');
      }
      const completedAt =
        status === 'done' ? toDate(input.completedAt) ?? new Date() : null;

      const [row] = await db
        .insert(tasks)
        .values({
          title: input.title,
          description: input.description ?? '',
          type: input.type,
          relatedCourseId: input.relatedCourseId,
          relatedProjectId: input.relatedProjectId,
          plannedDate: input.plannedDate === undefined ? today : input.plannedDate,
          dueDate: input.dueDate,
          estimatedMinutes: input.estimatedMinutes,
          actualMinutes: input.actualMinutes ?? 0,
          status,
          priority: input.priority,
          completedAt,
        })
        .returning();
      if (!row) throw new Error('Failed to insert task');
      res.status(201).json(serializeTask(row));
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const existingRows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
      const existing = existingRows[0];
      if (!existing) throw AppError.notFound('Không tìm thấy task.');
      const input = parseInput(taskUpdateSchema, req.body);
      await assertTaskRefs(db, input.relatedCourseId, input.relatedProjectId);

      const finalStatus = input.status ?? existing.status;
      const updates: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.type !== undefined) updates.type = input.type;
      if (input.relatedCourseId !== undefined) updates.relatedCourseId = input.relatedCourseId;
      if (input.relatedProjectId !== undefined) updates.relatedProjectId = input.relatedProjectId;
      if (input.plannedDate !== undefined) updates.plannedDate = input.plannedDate;
      if (input.dueDate !== undefined) updates.dueDate = input.dueDate;
      if (input.estimatedMinutes !== undefined) updates.estimatedMinutes = input.estimatedMinutes;
      if (input.actualMinutes !== undefined) updates.actualMinutes = input.actualMinutes;
      if (input.priority !== undefined) updates.priority = input.priority;

      if (input.status !== undefined) updates.status = input.status;

      if (finalStatus === 'done') {
        if (input.completedAt === null) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Task hoàn thành phải có thời điểm hoàn thành.');
        }
        updates.completedAt =
          input.completedAt !== undefined
            ? new Date(input.completedAt)
            : existing.completedAt ?? new Date();
      } else {
        if (input.completedAt != null) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Chỉ task hoàn thành mới có completedAt.');
        }
        updates.completedAt = null;
      }

      const [row] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
      if (!row) throw new Error('Failed to update task');
      res.json(serializeTask(row));
    }),
  );

  router.post(
    '/:id/reschedule',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const input = parseInput(taskRescheduleSchema, req.body);
      const [row] = await db
        .update(tasks)
        .set({ plannedDate: input.plannedDate, updatedAt: new Date() })
        .where(eq(tasks.id, id))
        .returning();
      if (!row) throw AppError.notFound('Không tìm thấy task.');
      res.json(serializeTask(row));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
      if (!deleted) throw AppError.notFound('Không tìm thấy task.');
      res.status(204).end();
    }),
  );

  return router;
}
