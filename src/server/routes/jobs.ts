import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { jobApplications } from '../db/schema';
import { JOB_STATUSES, type JobStatus } from '../../shared/types';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import { serializeJobApplication } from '../services/serializers';
import { jobCreateSchema, jobUpdateSchema } from './schemas';
import { idParam, optionalQueryString } from './helpers';

const ALL_STATUSES: Record<JobStatus, number> = {
  saved: 0,
  applied: 0,
  interviewing: 0,
  offer: 0,
  rejected: 0,
  withdrawn: 0,
};

export function jobsRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const status = optionalQueryString(req.query.status);
      const rows = await db.select().from(jobApplications).orderBy(asc(jobApplications.createdAt));
      const filtered =
        status && (JOB_STATUSES as readonly string[]).includes(status)
          ? rows.filter((row) => row.status === status)
          : rows;

      const summary = { ...ALL_STATUSES };
      for (const row of rows) summary[row.status] += 1;

      res.json({ applications: filtered.map(serializeJobApplication), summary });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parseInput(jobCreateSchema, req.body);
      const [row] = await db
        .insert(jobApplications)
        .values({
          company: input.company,
          position: input.position,
          jobUrl: input.jobUrl,
          appliedAt: input.appliedAt,
          status: input.status,
          contactPerson: input.contactPerson,
          followUpAt: input.followUpAt,
          notes: input.notes,
          cvVersion: input.cvVersion,
        })
        .returning();
      if (!row) throw new Error('Failed to insert job application');
      res.status(201).json(serializeJobApplication(row));
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const input = parseInput(jobUpdateSchema, req.body);
      const updates: Partial<typeof jobApplications.$inferInsert> = { updatedAt: new Date() };
      if (input.company !== undefined) updates.company = input.company;
      if (input.position !== undefined) updates.position = input.position;
      if (input.jobUrl !== undefined) updates.jobUrl = input.jobUrl;
      if (input.appliedAt !== undefined) updates.appliedAt = input.appliedAt;
      if (input.status !== undefined) updates.status = input.status;
      if (input.contactPerson !== undefined) updates.contactPerson = input.contactPerson;
      if (input.followUpAt !== undefined) updates.followUpAt = input.followUpAt;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.cvVersion !== undefined) updates.cvVersion = input.cvVersion;

      const [row] = await db
        .update(jobApplications)
        .set(updates)
        .where(eq(jobApplications.id, id))
        .returning();
      if (!row) throw AppError.notFound('Không tìm thấy hồ sơ ứng tuyển.');
      res.json(serializeJobApplication(row));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id);
      const [deleted] = await db
        .delete(jobApplications)
        .where(eq(jobApplications.id, id))
        .returning({ id: jobApplications.id });
      if (!deleted) throw AppError.notFound('Không tìm thấy hồ sơ ứng tuyển.');
      res.status(204).end();
    }),
  );

  return router;
}
