import { z } from 'zod';
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
import { isValidDateString, isTimezoneValid } from '../lib/dates';

const dateOnly = z
  .string()
  .refine(isValidDateString, 'Ngày phải có định dạng YYYY-MM-DD và hợp lệ.');
const dateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Thời gian không hợp lệ (cần ISO 8601).');
const shortText = z.string().trim().min(1, 'Không được để trống.').max(200);
const text = (max = 20000) => z.string().max(max);
const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .nullable()
  .refine(
    (value) => value === null || value === '' || /^https?:\/\//i.test(value),
    'URL phải bắt đầu bằng http:// hoặc https://.',
  );

export const topicCreateSchema = z
  .object({
    title: shortText,
    description: text(5000).optional(),
    kind: z.enum(TOPIC_KINDS).optional(),
    isCompleted: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .strict();
export const topicUpdateSchema = topicCreateSchema.partial();

export const courseCreateSchema = z
  .object({
    title: shortText,
    category: z.enum(COURSE_CATEGORIES),
    priority: z.enum(PRIORITIES).optional(),
    durationHours: z.number().int().min(0).max(1000).nullable().optional(),
    description: text().optional(),
    objectives: z.array(z.string().trim().max(500)).max(100).optional(),
    status: z.enum(COURSE_STATUSES).optional(),
    progressManual: z.number().int().min(0).max(100).nullable().optional(),
    weight: z.number().int().min(0).max(10).optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
    link: optionalUrl.optional(),
    notes: text().optional(),
    startedAt: dateTime.nullable().optional(),
    completedAt: dateTime.nullable().optional(),
    topics: z.array(topicCreateSchema).max(200).optional(),
  })
  .strict();
export const courseUpdateSchema = courseCreateSchema.omit({ topics: true }).partial();

export const taskCreateSchema = z
  .object({
    title: shortText,
    description: text().optional(),
    type: z.enum(TASK_TYPES).optional(),
    relatedCourseId: z.number().int().positive().nullable().optional(),
    relatedProjectId: z.number().int().positive().nullable().optional(),
    plannedDate: dateOnly.nullable().optional(),
    dueDate: dateOnly.nullable().optional(),
    estimatedMinutes: z.number().int().min(0).max(1440).nullable().optional(),
    actualMinutes: z.number().int().min(0).max(1440).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    completedAt: dateTime.nullable().optional(),
  })
  .strict();
export const taskUpdateSchema = taskCreateSchema.partial();
export const taskRescheduleSchema = z.object({ plannedDate: dateOnly }).strict();

export const sessionCreateSchema = z
  .object({
    startedAt: dateTime,
    endedAt: dateTime.nullable().optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    courseId: z.number().int().positive().nullable().optional(),
    taskId: z.number().int().positive().nullable().optional(),
    notes: text().optional(),
  })
  .strict()
  .refine((value) => value.endedAt !== undefined || value.durationMinutes !== undefined, {
    message: 'Cần nhập thời lượng hoặc thời điểm kết thúc.',
    path: ['durationMinutes'],
  });
export const sessionUpdateSchema = z
  .object({
    startedAt: dateTime.optional(),
    endedAt: dateTime.nullable().optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    courseId: z.number().int().positive().nullable().optional(),
    taskId: z.number().int().positive().nullable().optional(),
    notes: text().optional(),
  })
  .strict();

export const projectCreateSchema = z
  .object({
    name: shortText,
    description: text().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    startedAt: dateTime.nullable().optional(),
    targetDate: dateOnly.nullable().optional(),
    completedAt: dateTime.nullable().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .strict();
export const projectUpdateSchema = projectCreateSchema.partial();

export const checklistItemSchema = z
  .object({
    label: z.string().trim().min(1).max(300),
    done: z.boolean(),
  })
  .strict();

export const featureCreateSchema = z
  .object({
    title: shortText,
    description: text(5000).optional(),
    status: z.enum(FEATURE_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    checklist: z.array(checklistItemSchema).max(100).optional(),
    targetDate: dateOnly.nullable().optional(),
    notes: text().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .strict();
export const featureUpdateSchema = featureCreateSchema.partial();

export const interviewTopicCreateSchema = z
  .object({
    name: shortText,
    category: z.string().trim().min(1).max(100),
    status: z.enum(INTERVIEW_STATUSES).optional(),
    notes: text().optional(),
    lastReviewedAt: dateTime.nullable().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .strict();
export const interviewTopicUpdateSchema = interviewTopicCreateSchema.partial();

export const interviewQuestionCreateSchema = z
  .object({
    question: z.string().trim().min(1).max(2000),
    answer: text().optional(),
    confidenceLevel: z.number().int().min(0).max(5).nullable().optional(),
    lastReviewedAt: dateTime.nullable().optional(),
  })
  .strict();
export const interviewQuestionUpdateSchema = interviewQuestionCreateSchema.partial();

export const interviewChecklistCreateSchema = z
  .object({
    title: shortText,
    category: z.string().trim().min(1).max(100).optional(),
    isCompleted: z.boolean().optional(),
    notes: text(5000).optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .strict();
export const interviewChecklistUpdateSchema = interviewChecklistCreateSchema.partial();

export const jobCreateSchema = z
  .object({
    company: shortText,
    position: shortText,
    jobUrl: optionalUrl.optional(),
    appliedAt: dateOnly.nullable().optional(),
    status: z.enum(JOB_STATUSES).optional(),
    contactPerson: z.string().trim().max(200).nullable().optional(),
    followUpAt: dateOnly.nullable().optional(),
    notes: text().optional(),
    cvVersion: z.string().trim().max(100).nullable().optional(),
  })
  .strict();
export const jobUpdateSchema = jobCreateSchema.partial();

export const noteCreateSchema = z
  .object({
    title: shortText,
    contentMarkdown: text(100000).optional(),
    relatedType: z.enum(NOTE_RELATED_TYPES).optional(),
    relatedId: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine((value) => (value.relatedType ?? 'general') === 'general' || value.relatedId != null, {
    message: 'Ghi chú gắn với khóa học/task/project cần relatedId.',
    path: ['relatedId'],
  });
export const noteUpdateSchema = z
  .object({
    title: shortText.optional(),
    contentMarkdown: text(100000).optional(),
    relatedType: z.enum(NOTE_RELATED_TYPES).optional(),
    relatedId: z.number().int().positive().nullable().optional(),
  })
  .strict();

const levelValue = z.string().trim().max(100).nullable().optional();

export const settingsUpdateSchema = z
  .object({
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isTimezoneValid, 'Múi giờ không hợp lệ (IANA timezone).')
      .optional(),
    roadmapStartDate: dateOnly.nullable().optional(),
    dailyGoalMinutes: z.number().int().min(0).max(1440).optional(),
    weeklyGoalMinutes: z.number().int().min(0).max(10080).optional(),
    preferredStudyDays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Ngày học bị trùng.')
      .optional(),
    studyWindow: z.string().trim().max(100).optional(),
    experienceYears: z.number().int().min(0).max(60).nullable().optional(),
    level: levelValue,
    targetRole: levelValue,
    backendLevel: levelValue,
    typescriptLevel: levelValue,
    sqlLevel: levelValue,
    gitLevel: levelValue,
  })
  .strict();
