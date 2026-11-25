import { Router } from 'express';
import { asc, desc, ilike, or } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  courses,
  interviewQuestions,
  interviewTopics,
  jobApplications,
  learningNotes,
  projectFeatures,
  projects,
  tasks,
} from '../db/schema';
import type { SearchResponse, SearchResultItem } from '../../shared/types';
import { asyncHandler } from '../lib/async-handler';
import { optionalQueryInt, optionalQueryString } from './helpers';

export function searchRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const q = (optionalQueryString(req.query.q) ?? '').slice(0, 100);
      const rawLimit = optionalQueryInt(req.query.limit) ?? 5;
      const limit = Math.min(Math.max(rawLimit, 1), 15);

      if (!q) {
        const empty: SearchResponse = {
          query: '',
          courses: [],
          tasks: [],
          notes: [],
          projects: [],
          interviewTopics: [],
          interviewQuestions: [],
          jobs: [],
        };
        res.json(empty);
        return;
      }

      const pattern = `%${q}%`;

      const [
        courseRows,
        taskRows,
        noteRows,
        projectRows,
        featureRows,
        topicRows,
        questionRows,
        jobRows,
      ] = await Promise.all([
        db
          .select()
          .from(courses)
          .where(or(ilike(courses.title, pattern), ilike(courses.description, pattern)))
          .orderBy(asc(courses.category), asc(courses.sortOrder))
          .limit(limit),
        db
          .select()
          .from(tasks)
          .where(or(ilike(tasks.title, pattern), ilike(tasks.description, pattern)))
          .orderBy(desc(tasks.updatedAt))
          .limit(limit),
        db
          .select()
          .from(learningNotes)
          .where(
            or(ilike(learningNotes.title, pattern), ilike(learningNotes.contentMarkdown, pattern)),
          )
          .orderBy(desc(learningNotes.updatedAt))
          .limit(limit),
        db
          .select()
          .from(projects)
          .where(or(ilike(projects.name, pattern), ilike(projects.description, pattern)))
          .orderBy(asc(projects.sortOrder))
          .limit(limit),
        db
          .select()
          .from(projectFeatures)
          .where(
            or(ilike(projectFeatures.title, pattern), ilike(projectFeatures.description, pattern)),
          )
          .orderBy(asc(projectFeatures.sortOrder))
          .limit(limit),
        db
          .select()
          .from(interviewTopics)
          .where(
            or(
              ilike(interviewTopics.name, pattern),
              ilike(interviewTopics.category, pattern),
              ilike(interviewTopics.notes, pattern),
            ),
          )
          .orderBy(asc(interviewTopics.sortOrder))
          .limit(limit),
        db
          .select()
          .from(interviewQuestions)
          .where(
            or(
              ilike(interviewQuestions.question, pattern),
              ilike(interviewQuestions.answer, pattern),
            ),
          )
          .orderBy(desc(interviewQuestions.updatedAt))
          .limit(limit),
        db
          .select()
          .from(jobApplications)
          .where(
            or(
              ilike(jobApplications.company, pattern),
              ilike(jobApplications.position, pattern),
              ilike(jobApplications.notes, pattern),
            ),
          )
          .orderBy(desc(jobApplications.updatedAt))
          .limit(limit),
      ]);

      const projectResults: SearchResultItem[] = [
        ...projectRows.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.description.slice(0, 80) || undefined,
          badge: p.status,
          route: '/projects',
        })),
        ...featureRows.map((f) => ({
          id: f.id,
          title: f.title,
          subtitle: f.description.slice(0, 80) || undefined,
          badge: f.status,
          route: '/projects',
        })),
      ].slice(0, limit);

      const response: SearchResponse = {
        query: q,
        courses: courseRows.map((c) => ({
          id: c.id,
          title: c.title,
          subtitle: c.description.slice(0, 80) || undefined,
          badge: c.category,
          route: `/roadmap/${c.id}`,
        })),
        tasks: taskRows.map((t) => ({
          id: t.id,
          title: t.title,
          subtitle: t.plannedDate ?? undefined,
          badge: t.status,
          route: t.plannedDate ? `/planner?date=${t.plannedDate}` : '/planner',
        })),
        notes: noteRows.map((n) => ({
          id: n.id,
          title: n.title,
          subtitle: n.contentMarkdown.slice(0, 80) || undefined,
          badge: n.relatedType,
          route: `/notes?noteId=${n.id}`,
        })),
        projects: projectResults,
        interviewTopics: topicRows.map((t) => ({
          id: t.id,
          title: t.name,
          subtitle: t.category,
          badge: t.status,
          route: `/interview?topicId=${t.id}`,
        })),
        interviewQuestions: questionRows.map((question) => ({
          id: question.id,
          title: question.question,
          subtitle: question.answer ? question.answer.slice(0, 80) : undefined,
          badge:
            question.confidenceLevel !== null ? `${question.confidenceLevel}/5` : undefined,
          route: `/interview?topicId=${question.topicId}`,
        })),
        jobs: jobRows.map((j) => ({
          id: j.id,
          title: `${j.company} — ${j.position}`,
          subtitle: j.appliedAt ?? undefined,
          badge: j.status,
          route: '/jobs',
        })),
      };

      res.json(response);
    }),
  );

  return router;
}
