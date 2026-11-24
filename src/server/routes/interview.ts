import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { interviewChecklist, interviewQuestions, interviewTopics } from '../db/schema';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import {
  serializeInterviewChecklist,
  serializeInterviewQuestion,
  serializeInterviewTopic,
} from '../services/serializers';
import {
  interviewChecklistCreateSchema,
  interviewChecklistUpdateSchema,
  interviewQuestionCreateSchema,
  interviewQuestionUpdateSchema,
  interviewTopicCreateSchema,
  interviewTopicUpdateSchema,
} from './schemas';
import { idParam, toDate } from './helpers';

async function assertTopicExists(db: AppDb, id: number): Promise<void> {
  const rows = await db
    .select({ id: interviewTopics.id })
    .from(interviewTopics)
    .where(eq(interviewTopics.id, id))
    .limit(1);
  if (rows.length === 0) throw AppError.notFound('Không tìm thấy chủ đề phỏng vấn.');
}

export function interviewRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const [topicRows, questionRows, checklistRows] = await Promise.all([
        db.select().from(interviewTopics).orderBy(asc(interviewTopics.sortOrder), asc(interviewTopics.id)),
        db
          .select()
          .from(interviewQuestions)
          .orderBy(asc(interviewQuestions.id)),
        db
          .select()
          .from(interviewChecklist)
          .orderBy(asc(interviewChecklist.sortOrder), asc(interviewChecklist.id)),
      ]);

      res.json({
        topics: topicRows.map((topic) =>
          serializeInterviewTopic(
            topic,
            questionRows.filter((question) => question.topicId === topic.id),
          ),
        ),
        checklist: checklistRows.map(serializeInterviewChecklist),
      });
    }),
  );

  router.post(
    '/topics',
    asyncHandler(async (req, res) => {
      const input = parseInput(interviewTopicCreateSchema, req.body);
      const [row] = await db
        .insert(interviewTopics)
        .values({
          name: input.name,
          category: input.category,
          status: input.status,
          notes: input.notes,
          lastReviewedAt: toDate(input.lastReviewedAt),
          sortOrder: input.sortOrder,
          isSeeded: false,
        })
        .returning();
      if (!row) throw new Error('Failed to insert interview topic');
      res.status(201).json(serializeInterviewTopic(row, []));
    }),
  );

  router.patch(
    '/topics/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      await assertTopicExists(db, id);
      const input = parseInput(interviewTopicUpdateSchema, req.body);
      const updates: Partial<typeof interviewTopics.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.category !== undefined) updates.category = input.category;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.status !== undefined) {
        updates.status = input.status;
        if (input.status !== 'not_reviewed' && input.lastReviewedAt === undefined) {
          updates.lastReviewedAt = new Date();
        }
      }
      if (input.lastReviewedAt !== undefined) updates.lastReviewedAt = toDate(input.lastReviewedAt);

      const [row] = await db
        .update(interviewTopics)
        .set(updates)
        .where(eq(interviewTopics.id, id))
        .returning();
      if (!row) throw new Error('Failed to update interview topic');
      const questionRows = await db
        .select()
        .from(interviewQuestions)
        .where(eq(interviewQuestions.topicId, id));
      res.json(serializeInterviewTopic(row, questionRows));
    }),
  );

  router.delete(
    '/topics/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const [deleted] = await db
        .delete(interviewTopics)
        .where(eq(interviewTopics.id, id))
        .returning({ id: interviewTopics.id });
      if (!deleted) throw AppError.notFound('Không tìm thấy chủ đề phỏng vấn.');
      res.status(204).end();
    }),
  );

  router.post(
    '/topics/:id/questions',
    asyncHandler(async (req, res) => {
      const topicId = idParam(req.params.id);
      await assertTopicExists(db, topicId);
      const input = parseInput(interviewQuestionCreateSchema, req.body);
      const [row] = await db
        .insert(interviewQuestions)
        .values({
          topicId,
          question: input.question,
          answer: input.answer ?? '',
          confidenceLevel: input.confidenceLevel,
          lastReviewedAt: toDate(input.lastReviewedAt),
        })
        .returning();
      if (!row) throw new Error('Failed to insert interview question');
      res.status(201).json(serializeInterviewQuestion(row));
    }),
  );

  router.patch(
    '/questions/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const input = parseInput(interviewQuestionUpdateSchema, req.body);
      const updates: Partial<typeof interviewQuestions.$inferInsert> = { updatedAt: new Date() };
      if (input.question !== undefined) updates.question = input.question;
      if (input.answer !== undefined) updates.answer = input.answer;
      if (input.confidenceLevel !== undefined) updates.confidenceLevel = input.confidenceLevel;
      if (input.lastReviewedAt !== undefined) updates.lastReviewedAt = toDate(input.lastReviewedAt);

      const [row] = await db
        .update(interviewQuestions)
        .set(updates)
        .where(eq(interviewQuestions.id, id))
        .returning();
      if (!row) throw AppError.notFound('Không tìm thấy câu hỏi.');
      res.json(serializeInterviewQuestion(row));
    }),
  );

  router.delete(
    '/questions/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const [deleted] = await db
        .delete(interviewQuestions)
        .where(eq(interviewQuestions.id, id))
        .returning({ id: interviewQuestions.id });
      if (!deleted) throw AppError.notFound('Không tìm thấy câu hỏi.');
      res.status(204).end();
    }),
  );

  router.post(
    '/checklist',
    asyncHandler(async (req, res) => {
      const input = parseInput(interviewChecklistCreateSchema, req.body);
      const [row] = await db
        .insert(interviewChecklist)
        .values({
          title: input.title,
          category: input.category,
          isCompleted: input.isCompleted ?? false,
          notes: input.notes,
          sortOrder: input.sortOrder,
          isSeeded: false,
        })
        .returning();
      if (!row) throw new Error('Failed to insert checklist item');
      res.status(201).json(serializeInterviewChecklist(row));
    }),
  );

  router.patch(
    '/checklist/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const input = parseInput(interviewChecklistUpdateSchema, req.body);
      const updates: Partial<typeof interviewChecklist.$inferInsert> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.category !== undefined) updates.category = input.category;
      if (input.isCompleted !== undefined) updates.isCompleted = input.isCompleted;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (Object.keys(updates).length === 0) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Không có trường nào để cập nhật.');
      }
      const [row] = await db
        .update(interviewChecklist)
        .set(updates)
        .where(eq(interviewChecklist.id, id))
        .returning();
      if (!row) throw AppError.notFound('Không tìm thấy mục checklist.');
      res.json(serializeInterviewChecklist(row));
    }),
  );

  router.delete(
    '/checklist/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const [deleted] = await db
        .delete(interviewChecklist)
        .where(eq(interviewChecklist.id, id))
        .returning({ id: interviewChecklist.id });
      if (!deleted) throw AppError.notFound('Không tìm thấy mục checklist.');
      res.status(204).end();
    }),
  );

  return router;
}
