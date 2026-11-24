import { Router } from 'express';
import { asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../db/client';
import {
  courseTopics,
  courses,
  interviewChecklist,
  interviewQuestions,
  interviewTopics,
  jobApplications,
  learningNotes,
  projectFeatures,
  projects,
  studySessions,
  tasks,
  userSettings,
} from '../db/schema';
import type { ExportPayload, ImportResult } from '../../shared/types';
import {
  COURSE_CATEGORIES,
  COURSE_STATUSES,
  FEATURE_STATUSES,
  INTERVIEW_STATUSES,
  JOB_STATUSES,
  NOTE_RELATED_TYPES,
  PRIORITIES,
  PROJECT_STATUSES,
  TASK_STATUSES,
  TASK_TYPES,
  TOPIC_KINDS,
} from '../../shared/types';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { isValidDateString } from '../lib/dates';
import { parseInput } from '../lib/validate';
import { serializeCourse, serializeTopic } from '../services/serializers';
import { loadCourses } from '../services/courses';
import { loadSessionDtos, loadTaskDtos } from '../services/tasks';
import { getSettingsRow, serializeSettings } from '../services/settings';

const dateOnly = z.string().refine(isValidDateString, 'Ngày không hợp lệ.');
const dateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Thời gian không hợp lệ.');
const nullableDate = dateOnly.nullable();
const nullableDateTime = dateTime.nullable();

const importTopic = z.object({
  id: z.number().int().positive(),
  courseId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000),
  kind: z.enum(TOPIC_KINDS),
  isCompleted: z.boolean(),
  sortOrder: z.number().int(),
});

const importCourse = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(300),
  category: z.enum(COURSE_CATEGORIES),
  priority: z.enum(PRIORITIES),
  durationHours: z.number().int().nullable(),
  description: z.string(),
  objectives: z.array(z.string()),
  status: z.enum(COURSE_STATUSES),
  progressManual: z.number().int().nullable(),
  weight: z.number().int(),
  sortOrder: z.number().int(),
  isSeeded: z.boolean(),
  link: z.string().nullable(),
  notes: z.string(),
  startedAt: nullableDateTime,
  completedAt: nullableDateTime,
  createdAt: dateTime,
  updatedAt: dateTime,
  topics: z.array(importTopic),
});

const importTask = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string(),
  type: z.enum(TASK_TYPES),
  relatedCourseId: z.number().int().positive().nullable(),
  relatedProjectId: z.number().int().positive().nullable(),
  plannedDate: nullableDate,
  dueDate: nullableDate,
  estimatedMinutes: z.number().int().nullable(),
  actualMinutes: z.number().int(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  completedAt: nullableDateTime,
  createdAt: dateTime,
  updatedAt: dateTime,
});

const importSession = z.object({
  id: z.number().int().positive(),
  courseId: z.number().int().positive().nullable(),
  taskId: z.number().int().positive().nullable(),
  startedAt: dateTime,
  endedAt: nullableDateTime,
  durationMinutes: z.number().int().positive(),
  notes: z.string(),
  createdAt: dateTime,
});

const importFeature = z.object({
  id: z.number().int().positive(),
  projectId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string(),
  status: z.enum(FEATURE_STATUSES),
  priority: z.enum(PRIORITIES),
  checklist: z.array(z.object({ label: z.string(), done: z.boolean() })),
  targetDate: nullableDate,
  notes: z.string(),
  sortOrder: z.number().int(),
  createdAt: dateTime,
  updatedAt: dateTime,
});

const importProject = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(300),
  description: z.string(),
  status: z.enum(PROJECT_STATUSES),
  startedAt: nullableDateTime,
  targetDate: nullableDate,
  completedAt: nullableDateTime,
  isSeeded: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: dateTime,
  updatedAt: dateTime,
  features: z.array(importFeature),
});

const importQuestion = z.object({
  id: z.number().int().positive(),
  topicId: z.number().int().positive(),
  question: z.string().min(1),
  answer: z.string(),
  confidenceLevel: z.number().int().min(0).max(5).nullable(),
  lastReviewedAt: nullableDateTime,
  createdAt: dateTime,
  updatedAt: dateTime,
});

const importInterviewTopic = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(300),
  category: z.string().min(1).max(100),
  status: z.enum(INTERVIEW_STATUSES),
  lastReviewedAt: nullableDateTime,
  notes: z.string(),
  sortOrder: z.number().int(),
  isSeeded: z.boolean(),
  createdAt: dateTime,
  updatedAt: dateTime,
  questions: z.array(importQuestion),
});

const importChecklist = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(500),
  category: z.string().min(1).max(100),
  isCompleted: z.boolean(),
  notes: z.string(),
  sortOrder: z.number().int(),
  isSeeded: z.boolean(),
  createdAt: dateTime,
});

const importJob = z.object({
  id: z.number().int().positive(),
  company: z.string().min(1).max(300),
  position: z.string().min(1).max(300),
  jobUrl: z.string().nullable(),
  appliedAt: nullableDate,
  status: z.enum(JOB_STATUSES),
  contactPerson: z.string().nullable(),
  followUpAt: nullableDate,
  notes: z.string(),
  cvVersion: z.string().nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
});

const importNote = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(500),
  contentMarkdown: z.string().max(100000),
  relatedType: z.enum(NOTE_RELATED_TYPES),
  relatedId: z.number().int().positive().nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
});

const importSettings = z.object({
  id: z.number().int().positive(),
  timezone: z.string().min(1).max(100),
  roadmapStartDate: nullableDate,
  dailyGoalMinutes: z.number().int(),
  weeklyGoalMinutes: z.number().int(),
  preferredStudyDays: z.array(z.number().int().min(0).max(6)),
  studyWindow: z.string(),
  experienceYears: z.number().int().nullable(),
  level: z.string().nullable(),
  targetRole: z.string().nullable(),
  backendLevel: z.string().nullable(),
  typescriptLevel: z.string().nullable(),
  sqlLevel: z.string().nullable(),
  gitLevel: z.string().nullable(),
  updatedAt: dateTime,
});

const importSchema = z.object({
  app: z.literal('learning-road'),
  version: z.literal(1),
  exportedAt: z.string(),
  data: z.object({
    settings: importSettings,
    courses: z.array(importCourse),
    tasks: z.array(importTask),
    studySessions: z.array(importSession),
    projects: z.array(importProject),
    interviewTopics: z.array(importInterviewTopic),
    interviewChecklist: z.array(importChecklist),
    jobApplications: z.array(importJob),
    learningNotes: z.array(importNote),
  }),
});

type ImportData = z.infer<typeof importSchema>['data'];

const toDate = (value: string | null): Date | null => (value ? new Date(value) : null);

async function buildExport(db: AppDb): Promise<ExportPayload> {
  const [settingsRow, courseBundles, taskDtos, sessionDtos, projectRows, featureRows] =
    await Promise.all([
      getSettingsRow(db),
      loadCourses(db),
      loadTaskDtos(db),
      loadSessionDtos(db),
      db.select().from(projects).orderBy(asc(projects.sortOrder), asc(projects.id)),
      db.select().from(projectFeatures).orderBy(asc(projectFeatures.sortOrder), asc(projectFeatures.id)),
    ]);

  const [topicRows, questionRows, checklistRows, jobRows, noteRows] = await Promise.all([
    db.select().from(interviewTopics).orderBy(asc(interviewTopics.sortOrder), asc(interviewTopics.id)),
    db.select().from(interviewQuestions).orderBy(asc(interviewQuestions.id)),
    db.select().from(interviewChecklist).orderBy(asc(interviewChecklist.sortOrder), asc(interviewChecklist.id)),
    db.select().from(jobApplications).orderBy(asc(jobApplications.id)),
    db.select().from(learningNotes).orderBy(asc(learningNotes.id)),
  ]);

  const topics = topicRows.map((topic) => ({
    id: topic.id,
    name: topic.name,
    category: topic.category,
    status: topic.status,
    lastReviewedAt: topic.lastReviewedAt ? topic.lastReviewedAt.toISOString() : null,
    notes: topic.notes,
    sortOrder: topic.sortOrder,
    isSeeded: topic.isSeeded,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
    questions: questionRows
      .filter((question) => question.topicId === topic.id)
      .map((question) => ({
        id: question.id,
        topicId: question.topicId,
        question: question.question,
        answer: question.answer,
        confidenceLevel: question.confidenceLevel,
        lastReviewedAt: question.lastReviewedAt ? question.lastReviewedAt.toISOString() : null,
        createdAt: question.createdAt.toISOString(),
        updatedAt: question.updatedAt.toISOString(),
      })),
  }));

  return {
    app: 'learning-road',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings: serializeSettings(settingsRow),
      courses: courseBundles.map((bundle) => ({
        ...serializeCourse(bundle.course, bundle.topics, bundle.studyMinutes),
        topics: bundle.topics.map(serializeTopic),
      })),
      tasks: taskDtos,
      studySessions: sessionDtos,
      projects: projectRows.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        startedAt: project.startedAt ? project.startedAt.toISOString() : null,
        targetDate: project.targetDate,
        completedAt: project.completedAt ? project.completedAt.toISOString() : null,
        isSeeded: project.isSeeded,
        sortOrder: project.sortOrder,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        features: featureRows
          .filter((feature) => feature.projectId === project.id)
          .map((feature) => ({
            id: feature.id,
            projectId: feature.projectId,
            title: feature.title,
            description: feature.description,
            status: feature.status,
            priority: feature.priority,
            checklist: feature.checklist,
            targetDate: feature.targetDate,
            notes: feature.notes,
            sortOrder: feature.sortOrder,
            createdAt: feature.createdAt.toISOString(),
            updatedAt: feature.updatedAt.toISOString(),
          })),
      })),
      interviewTopics: topics,
      interviewChecklist: checklistRows.map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category,
        isCompleted: item.isCompleted,
        notes: item.notes,
        sortOrder: item.sortOrder,
        isSeeded: item.isSeeded,
        createdAt: item.createdAt.toISOString(),
      })),
      jobApplications: jobRows.map((job) => ({
        id: job.id,
        company: job.company,
        position: job.position,
        jobUrl: job.jobUrl,
        appliedAt: job.appliedAt,
        status: job.status,
        contactPerson: job.contactPerson,
        followUpAt: job.followUpAt,
        notes: job.notes,
        cvVersion: job.cvVersion,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      })),
      learningNotes: noteRows.map((note) => ({
        id: note.id,
        title: note.title,
        contentMarkdown: note.contentMarkdown,
        relatedType: note.relatedType,
        relatedId: note.relatedId,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      })),
    },
  };
}

async function restore(db: AppDb, data: ImportData): Promise<ImportResult> {
  await db.transaction(async (tx) => {
    await tx.delete(learningNotes);
    await tx.delete(jobApplications);
    await tx.delete(interviewChecklist);
    await tx.delete(interviewQuestions);
    await tx.delete(interviewTopics);
    await tx.delete(projectFeatures);
    await tx.delete(projects);
    await tx.delete(studySessions);
    await tx.delete(tasks);
    await tx.delete(courseTopics);
    await tx.delete(courses);
    await tx.delete(userSettings);

    await tx.insert(userSettings).values({
      id: data.settings.id,
      timezone: data.settings.timezone,
      roadmapStartDate: data.settings.roadmapStartDate,
      dailyGoalMinutes: data.settings.dailyGoalMinutes,
      weeklyGoalMinutes: data.settings.weeklyGoalMinutes,
      preferredStudyDays: data.settings.preferredStudyDays,
      studyWindow: data.settings.studyWindow,
      experienceYears: data.settings.experienceYears,
      level: data.settings.level,
      targetRole: data.settings.targetRole,
      backendLevel: data.settings.backendLevel,
      typescriptLevel: data.settings.typescriptLevel,
      sqlLevel: data.settings.sqlLevel,
      gitLevel: data.settings.gitLevel,
      updatedAt: new Date(data.settings.updatedAt),
    });

    for (const course of data.courses) {
      await tx.insert(courses).values({
        id: course.id,
        title: course.title,
        category: course.category,
        priority: course.priority,
        durationHours: course.durationHours,
        description: course.description,
        objectives: course.objectives,
        status: course.status,
        progressManual: course.progressManual,
        weight: course.weight,
        sortOrder: course.sortOrder,
        isSeeded: course.isSeeded,
        link: course.link,
        notes: course.notes,
        startedAt: toDate(course.startedAt),
        completedAt: toDate(course.completedAt),
        createdAt: new Date(course.createdAt),
        updatedAt: new Date(course.updatedAt),
      });
    }
    if (data.courses.length > 0) {
      const topics = data.courses.flatMap((course) =>
        course.topics.map((topic) => ({
          ...topic,
          courseId: course.id,
        })),
      );
      if (topics.length > 0) await tx.insert(courseTopics).values(topics);
    }

    for (const project of data.projects) {
      await tx.insert(projects).values({
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        startedAt: toDate(project.startedAt),
        targetDate: project.targetDate,
        completedAt: toDate(project.completedAt),
        isSeeded: project.isSeeded,
        sortOrder: project.sortOrder,
        createdAt: new Date(project.createdAt),
        updatedAt: new Date(project.updatedAt),
      });
      for (const feature of project.features) {
        await tx.insert(projectFeatures).values({
          id: feature.id,
          projectId: project.id,
          title: feature.title,
          description: feature.description,
          status: feature.status,
          priority: feature.priority,
          checklist: feature.checklist,
          targetDate: feature.targetDate,
          notes: feature.notes,
          sortOrder: feature.sortOrder,
          createdAt: new Date(feature.createdAt),
          updatedAt: new Date(feature.updatedAt),
        });
      }
    }

    for (const task of data.tasks) {
      await tx.insert(tasks).values({
        id: task.id,
        title: task.title,
        description: task.description,
        type: task.type,
        relatedCourseId: task.relatedCourseId,
        relatedProjectId: task.relatedProjectId,
        plannedDate: task.plannedDate,
        dueDate: task.dueDate,
        estimatedMinutes: task.estimatedMinutes,
        actualMinutes: task.actualMinutes,
        status: task.status,
        priority: task.priority,
        completedAt: toDate(task.completedAt),
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
      });
    }

    for (const session of data.studySessions) {
      await tx.insert(studySessions).values({
        id: session.id,
        courseId: session.courseId,
        taskId: session.taskId,
        startedAt: new Date(session.startedAt),
        endedAt: toDate(session.endedAt),
        durationMinutes: session.durationMinutes,
        notes: session.notes,
        createdAt: new Date(session.createdAt),
      });
    }

    for (const topic of data.interviewTopics) {
      await tx.insert(interviewTopics).values({
        id: topic.id,
        name: topic.name,
        category: topic.category,
        status: topic.status,
        lastReviewedAt: toDate(topic.lastReviewedAt),
        notes: topic.notes,
        sortOrder: topic.sortOrder,
        isSeeded: topic.isSeeded,
        createdAt: new Date(topic.createdAt),
        updatedAt: new Date(topic.updatedAt),
      });
      for (const question of topic.questions) {
        await tx.insert(interviewQuestions).values({
          id: question.id,
          topicId: topic.id,
          question: question.question,
          answer: question.answer,
          confidenceLevel: question.confidenceLevel,
          lastReviewedAt: toDate(question.lastReviewedAt),
          createdAt: new Date(question.createdAt),
          updatedAt: new Date(question.updatedAt),
        });
      }
    }

    if (data.interviewChecklist.length > 0) {
      await tx.insert(interviewChecklist).values(
        data.interviewChecklist.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          isCompleted: item.isCompleted,
          notes: item.notes,
          sortOrder: item.sortOrder,
          isSeeded: item.isSeeded,
          createdAt: new Date(item.createdAt),
        })),
      );
    }

    for (const job of data.jobApplications) {
      await tx.insert(jobApplications).values({
        id: job.id,
        company: job.company,
        position: job.position,
        jobUrl: job.jobUrl,
        appliedAt: job.appliedAt,
        status: job.status,
        contactPerson: job.contactPerson,
        followUpAt: job.followUpAt,
        notes: job.notes,
        cvVersion: job.cvVersion,
        createdAt: new Date(job.createdAt),
        updatedAt: new Date(job.updatedAt),
      });
    }

    for (const note of data.learningNotes) {
      await tx.insert(learningNotes).values({
        id: note.id,
        title: note.title,
        contentMarkdown: note.contentMarkdown,
        relatedType: note.relatedType,
        relatedId: note.relatedId,
        createdAt: new Date(note.createdAt),
        updatedAt: new Date(note.updatedAt),
      });
    }

    const sequences: [string, string][] = [
      ['user_settings', 'id'],
      ['courses', 'id'],
      ['course_topics', 'id'],
      ['projects', 'id'],
      ['project_features', 'id'],
      ['tasks', 'id'],
      ['study_sessions', 'id'],
      ['interview_topics', 'id'],
      ['interview_questions', 'id'],
      ['interview_checklist', 'id'],
      ['job_applications', 'id'],
      ['learning_notes', 'id'],
    ];
    for (const [table, column] of sequences) {
      await tx.execute(
        sql.raw(
          `SELECT setval(pg_get_serial_sequence('${table}', '${column}'), COALESCE((SELECT MAX(${column}) FROM ${table}), 0) + 1, false)`,
        ),
      );
    }
  });

  return {
    imported: {
      courses: data.courses.length,
      tasks: data.tasks.length,
      studySessions: data.studySessions.length,
      projects: data.projects.length,
      interviewTopics: data.interviewTopics.length,
      jobApplications: data.jobApplications.length,
      learningNotes: data.learningNotes.length,
    },
  };
}

export function exportRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/export',
    asyncHandler(async (_req, res) => {
      const payload = await buildExport(db);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="learning-road-backup-${payload.exportedAt.slice(0, 10)}.json"`,
      );
      res.json(payload);
    }),
  );

  router.post(
    '/import',
    asyncHandler(async (req, res) => {
      const input = parseInput(importSchema, req.body);
      try {
        const result = await restore(db, input.data);
        res.json(result);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === '23503' || code === '23505' || code === '22P02') {
          throw new AppError(
            422,
            'IMPORT_CONFLICT',
            'File import có dữ liệu không hợp lệ hoặc quan hệ bị thiếu. Không có thay đổi nào được lưu.',
          );
        }
        throw error;
      }
    }),
  );

  return router;
}
