import { Router } from 'express';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  courses,
  interviewTopics,
  learningNotes,
  projects,
  tasks,
} from '../db/schema';
import { NOTE_RELATED_TYPES, type NoteRelatedType } from '../../shared/types';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import { serializeLearningNote } from '../services/serializers';
import { noteCreateSchema, noteUpdateSchema } from './schemas';
import { idParam, optionalQueryInt, optionalQueryString } from './helpers';

async function assertRelatedExists(
  db: AppDb,
  relatedType: NoteRelatedType,
  relatedId: number | null,
): Promise<void> {
  if (relatedType === 'general') return;
  if (relatedId === null) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Ghi chú liên kết cần relatedId.');
  }
  const map = {
    course: courses,
    task: tasks,
    project: projects,
    interview_topic: interviewTopics,
  } as const;
  const table = map[relatedType];
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, relatedId)).limit(1);
  if (rows.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Đối tượng liên kết không tồn tại.');
  }
}

export function notesRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const relatedType = optionalQueryString(req.query.relatedType);
      const relatedId = optionalQueryInt(req.query.relatedId);
      const q = optionalQueryString(req.query.q);

      const conditions: SQL[] = [];
      if (relatedType && (NOTE_RELATED_TYPES as readonly string[]).includes(relatedType)) {
        conditions.push(eq(learningNotes.relatedType, relatedType as NoteRelatedType));
      }
      if (relatedId) conditions.push(eq(learningNotes.relatedId, relatedId));
      if (q) {
        conditions.push(
          or(
            ilike(learningNotes.title, `%${q}%`),
            ilike(learningNotes.contentMarkdown, `%${q}%`),
          ) as SQL,
        );
      }

      const query = db.select().from(learningNotes).orderBy(desc(learningNotes.updatedAt));
      const rows = conditions.length ? await query.where(and(...conditions)) : await query;
      res.json({ notes: rows.map(serializeLearningNote) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parseInput(noteCreateSchema, req.body);
      const relatedType = input.relatedType ?? 'general';
      const relatedId = input.relatedId ?? null;
      await assertRelatedExists(db, relatedType, relatedId);

      const [row] = await db
        .insert(learningNotes)
        .values({
          title: input.title,
          contentMarkdown: input.contentMarkdown ?? '',
          relatedType,
          relatedId,
        })
        .returning();
      if (!row) throw new Error('Failed to insert note');
      res.status(201).json(serializeLearningNote(row));
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const existingRows = await db
        .select()
        .from(learningNotes)
        .where(eq(learningNotes.id, id))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) throw AppError.notFound('Không tìm thấy ghi chú.');
      const input = parseInput(noteUpdateSchema, req.body);

      const relatedType = input.relatedType ?? existing.relatedType;
      const relatedId = input.relatedId !== undefined ? input.relatedId : existing.relatedId;
      if (input.relatedType !== undefined || input.relatedId !== undefined) {
        await assertRelatedExists(db, relatedType, relatedId ?? null);
      }

      const updates: Partial<typeof learningNotes.$inferInsert> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.contentMarkdown !== undefined) updates.contentMarkdown = input.contentMarkdown;
      if (input.relatedType !== undefined) updates.relatedType = input.relatedType;
      if (input.relatedId !== undefined) updates.relatedId = input.relatedId;

      const [row] = await db
        .update(learningNotes)
        .set(updates)
        .where(eq(learningNotes.id, id))
        .returning();
      if (!row) throw new Error('Failed to update note');
      res.json(serializeLearningNote(row));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const [deleted] = await db
        .delete(learningNotes)
        .where(eq(learningNotes.id, id))
        .returning({ id: learningNotes.id });
      if (!deleted) throw AppError.notFound('Không tìm thấy ghi chú.');
      res.status(204).end();
    }),
  );

  return router;
}
