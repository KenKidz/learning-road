import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { projectFeatures, projects } from '../db/schema';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import { serializeFeature, serializeProject } from '../services/serializers';
import {
  featureCreateSchema,
  featureUpdateSchema,
  projectCreateSchema,
  projectUpdateSchema,
} from './schemas';
import { idParam, toDate } from './helpers';

async function assertProjectExists(db: AppDb, id: number): Promise<void> {
  const rows = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1);
  if (rows.length === 0) throw AppError.notFound('Không tìm thấy project.');
}

export function projectsRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const projectRows = await db
        .select()
        .from(projects)
        .orderBy(asc(projects.sortOrder), asc(projects.id));
      const featureRows = await db
        .select()
        .from(projectFeatures)
        .orderBy(asc(projectFeatures.sortOrder), asc(projectFeatures.id));
      res.json({
        projects: projectRows.map((project) =>
          serializeProject(
            project,
            featureRows.filter((feature) => feature.projectId === project.id),
          ),
        ),
      });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parseInput(projectCreateSchema, req.body);
      const status = input.status ?? 'planned';
      const completedAt =
        status === 'completed' ? toDate(input.completedAt) ?? new Date() : null;
      const [row] = await db
        .insert(projects)
        .values({
          name: input.name,
          description: input.description,
          status,
          startedAt: toDate(input.startedAt),
          targetDate: input.targetDate,
          completedAt,
          sortOrder: input.sortOrder,
          isSeeded: false,
        })
        .returning();
      if (!row) throw new Error('Failed to insert project');
      res.status(201).json(serializeProject(row, []));
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const existingRows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      const existing = existingRows[0];
      if (!existing) throw AppError.notFound('Không tìm thấy project.');
      const input = parseInput(projectUpdateSchema, req.body);

      const finalStatus = input.status ?? existing.status;
      const updates: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.status !== undefined) updates.status = input.status;
      if (input.startedAt !== undefined) updates.startedAt = toDate(input.startedAt);
      if (input.targetDate !== undefined) updates.targetDate = input.targetDate;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

      if (finalStatus === 'completed') {
        if (input.completedAt === null) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Project hoàn thành phải có thời điểm hoàn thành.');
        }
        updates.completedAt =
          input.completedAt !== undefined ? new Date(input.completedAt) : existing.completedAt ?? new Date();
      } else {
        if (input.completedAt != null) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Chỉ project hoàn thành mới có completedAt.');
        }
        updates.completedAt = null;
      }

      const [row] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
      if (!row) throw new Error('Failed to update project');
      const featureRows = await db
        .select()
        .from(projectFeatures)
        .where(eq(projectFeatures.projectId, id))
        .orderBy(asc(projectFeatures.sortOrder), asc(projectFeatures.id));
      res.json(serializeProject(row, featureRows));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const [deleted] = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
      if (!deleted) throw AppError.notFound('Không tìm thấy project.');
      res.status(204).end();
    }),
  );

  router.post(
    '/:id/features',
    asyncHandler(async (req, res) => {
      const projectId = idParam(req.params.id);
      await assertProjectExists(db, projectId);
      const input = parseInput(featureCreateSchema, req.body);
      const [row] = await db
        .insert(projectFeatures)
        .values({
          projectId,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          checklist: input.checklist ?? [],
          targetDate: input.targetDate,
          notes: input.notes,
          sortOrder: input.sortOrder,
        })
        .returning();
      if (!row) throw new Error('Failed to insert feature');
      res.status(201).json(serializeFeature(row));
    }),
  );

  return router;
}

export function featuresRouter(db: AppDb): Router {
  const router = Router();

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const input = parseInput(featureUpdateSchema, req.body);
      const updates: Partial<typeof projectFeatures.$inferInsert> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.status !== undefined) updates.status = input.status;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.checklist !== undefined) updates.checklist = input.checklist;
      if (input.targetDate !== undefined) updates.targetDate = input.targetDate;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

      const [row] = await db
        .update(projectFeatures)
        .set(updates)
        .where(eq(projectFeatures.id, id))
        .returning();
      if (!row) throw AppError.notFound('Không tìm thấy feature.');
      res.json(serializeFeature(row));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const [deleted] = await db
        .delete(projectFeatures)
        .where(eq(projectFeatures.id, id))
        .returning({ id: projectFeatures.id });
      if (!deleted) throw AppError.notFound('Không tìm thấy feature.');
      res.status(204).end();
    }),
  );

  return router;
}
