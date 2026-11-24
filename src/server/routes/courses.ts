import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { courseTopics, courses, type CourseRow } from '../db/schema';
import {
  COURSE_CATEGORIES,
  COURSE_STATUSES,
  type CourseCategory,
  type CourseStatus,
} from '../../shared/types';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import { assertCourseExists, getCourseDetail, getCourseSummaries } from '../services/courses';
import { courseCreateSchema, courseUpdateSchema, topicCreateSchema, topicUpdateSchema } from './schemas';
import { idParam, optionalQueryString, toDate } from './helpers';
import { serializeTopic } from '../services/serializers';

async function countTopics(db: AppDb, courseId: number): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(courseTopics)
    .where(eq(courseTopics.courseId, courseId));
  return Number(row?.value ?? 0);
}

export function coursesRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const category = optionalQueryString(req.query.category);
      const status = optionalQueryString(req.query.status);
      const q = optionalQueryString(req.query.q)?.toLowerCase();

      let list = await getCourseSummaries(db);
      if (category && (COURSE_CATEGORIES as readonly string[]).includes(category)) {
        list = list.filter((course) => course.category === (category as CourseCategory));
      }
      if (status && (COURSE_STATUSES as readonly string[]).includes(status)) {
        list = list.filter((course) => course.status === (status as CourseStatus));
      }
      if (q) {
        list = list.filter(
          (course) =>
            course.title.toLowerCase().includes(q) ||
            course.description.toLowerCase().includes(q),
        );
      }
      res.json({ courses: list });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const course = await getCourseDetail(db, idParam(req.params.id));
      res.json(course);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parseInput(courseCreateSchema, req.body);
      const { topics, ...courseInput } = input;

      if (courseInput.progressManual != null && topics && topics.length > 0) {
        throw new AppError(
          422,
          'VALIDATION_ERROR',
          'Không dùng tiến độ thủ công khi khóa học đã có checklist.',
        );
      }

      const created = await db.transaction(async (tx) => {
        let startedAt = toDate(courseInput.startedAt);
        if (courseInput.status === 'in_progress' && !startedAt) startedAt = new Date();
        let completedAt = toDate(courseInput.completedAt);
        if (courseInput.status === 'completed' && !completedAt) completedAt = new Date();
        if (completedAt && courseInput.status !== 'completed') {
          throw new AppError(
            422,
            'VALIDATION_ERROR',
            'Chỉ khóa học ở trạng thái Hoàn thành mới có completedAt.',
          );
        }
        const [row] = await tx
          .insert(courses)
          .values({
            title: courseInput.title,
            category: courseInput.category,
            priority: courseInput.priority,
            durationHours: courseInput.durationHours,
            description: courseInput.description,
            objectives: courseInput.objectives,
            status: courseInput.status,
            progressManual: courseInput.progressManual,
            weight: courseInput.weight,
            sortOrder: courseInput.sortOrder,
            link: courseInput.link,
            notes: courseInput.notes,
            startedAt,
            completedAt,
            isSeeded: false,
          })
          .returning();
        if (!row) throw new Error('Failed to insert course');

        if (topics && topics.length > 0) {
          await tx.insert(courseTopics).values(
            topics.map((topic, index) => ({
              courseId: row.id,
              title: topic.title,
              description: topic.description ?? '',
              kind: topic.kind,
              isCompleted: topic.isCompleted ?? false,
              sortOrder: topic.sortOrder ?? index * 10,
            })),
          );
        }
        return row;
      });

      res.status(201).json(await getCourseDetail(db, created.id));
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const existing = await assertCourseExists(db, id);
      const input = parseInput(courseUpdateSchema, req.body);

      if (input.progressManual != null && (await countTopics(db, id)) > 0) {
        throw new AppError(
          422,
          'VALIDATION_ERROR',
          'Khóa học đã có checklist nên tiến độ được tính từ checklist. Xóa checklist trước nếu muốn nhập tiến độ thủ công.',
        );
      }

      const updates: Partial<typeof courses.$inferInsert> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.category !== undefined) updates.category = input.category;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.durationHours !== undefined) updates.durationHours = input.durationHours;
      if (input.description !== undefined) updates.description = input.description;
      if (input.objectives !== undefined) updates.objectives = input.objectives;
      if (input.progressManual !== undefined) updates.progressManual = input.progressManual;
      if (input.weight !== undefined) updates.weight = input.weight;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.link !== undefined) updates.link = input.link;
      if (input.notes !== undefined) updates.notes = input.notes;

      if (input.status !== undefined && input.status !== existing.status) {
        updates.status = input.status;
        if (input.status === 'in_progress' && !existing.startedAt) {
          updates.startedAt = new Date();
        }
        if (input.status === 'completed') {
          updates.completedAt = input.completedAt ? new Date(input.completedAt) : existing.completedAt ?? new Date();
        } else if (input.completedAt === undefined) {
          updates.completedAt = null;
        }
      }

      if (input.startedAt !== undefined) updates.startedAt = toDate(input.startedAt);
      if (input.completedAt !== undefined) updates.completedAt = toDate(input.completedAt);

      const finalStatus = updates.status ?? existing.status;
      if (updates.completedAt === null && finalStatus === 'completed') {
        throw new AppError(422, 'VALIDATION_ERROR', 'Khóa học hoàn thành phải có thời điểm hoàn thành.');
      }
      if (updates.completedAt != null && finalStatus !== 'completed') {
        throw new AppError(
          422,
          'VALIDATION_ERROR',
          'Chỉ khóa học ở trạng thái Hoàn thành mới có completedAt.',
        );
      }

      await db.update(courses).set(updates).where(eq(courses.id, id));
      res.json(await getCourseDetail(db, id));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      await assertCourseExists(db, id);
      await db.delete(courses).where(eq(courses.id, id));
      res.status(204).end();
    }),
  );

  router.post(
    '/:id/topics',
    asyncHandler(async (req, res) => {
      const courseId = idParam(req.params.id);
      const course: CourseRow = await assertCourseExists(db, courseId);
      const input = parseInput(topicCreateSchema, req.body);
      const [row] = await db
        .insert(courseTopics)
        .values({
          courseId,
          title: input.title,
          description: input.description ?? '',
          kind: input.kind,
          isCompleted: input.isCompleted ?? false,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      if (!row) throw new Error('Failed to insert topic');
      if (course.progressManual !== null) {
        await db
          .update(courses)
          .set({ progressManual: null, updatedAt: new Date() })
          .where(eq(courses.id, courseId));
      }
      res.status(201).json(serializeTopic(row));
    }),
  );

  return router;
}

export function topicsRouter(db: AppDb): Router {
  const router = Router();

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const input = parseInput(topicUpdateSchema, req.body);
      const updates: Partial<typeof courseTopics.$inferInsert> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.kind !== undefined) updates.kind = input.kind;
      if (input.isCompleted !== undefined) updates.isCompleted = input.isCompleted;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (Object.keys(updates).length === 0) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Không có trường nào để cập nhật.');
      }
      const [row] = await db
        .update(courseTopics)
        .set(updates)
        .where(eq(courseTopics.id, id))
        .returning();
      if (!row) throw AppError.notFound('Không tìm thấy mục checklist.');
      res.json(serializeTopic(row));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      await db.delete(courseTopics).where(eq(courseTopics.id, id));
      res.status(204).end();
    }),
  );

  return router;
}
