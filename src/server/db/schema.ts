import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { ProjectFeatureChecklistItem } from '../../shared/types';

export const courseCategoryEnum = pgEnum('course_category', ['A', 'B', 'C']);
export const courseStatusEnum = pgEnum('course_status', [
  'not_started',
  'in_progress',
  'completed',
  'paused',
]);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high']);
export const topicKindEnum = pgEnum('topic_kind', ['content', 'dod']);
export const taskTypeEnum = pgEnum('task_type', [
  'study',
  'practice',
  'project',
  'interview',
  'application',
  'other',
]);
export const taskStatusEnum = pgEnum('task_status', ['todo', 'in_progress', 'done', 'cancelled']);
export const projectStatusEnum = pgEnum('project_status', [
  'planned',
  'in_progress',
  'completed',
  'paused',
]);
export const featureStatusEnum = pgEnum('feature_status', [
  'not_started',
  'in_progress',
  'completed',
  'blocked',
]);
export const interviewStatusEnum = pgEnum('interview_status', [
  'not_reviewed',
  'reviewing',
  'mastered',
]);
export const jobStatusEnum = pgEnum('job_status', [
  'saved',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
]);
export const noteRelatedTypeEnum = pgEnum('note_related_type', [
  'general',
  'course',
  'task',
  'project',
  'interview_topic',
]);

export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  roadmapStartDate: date('roadmap_start_date'),
  dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(60),
  weeklyGoalMinutes: integer('weekly_goal_minutes').notNull().default(420),
  preferredStudyDays: jsonb('preferred_study_days')
    .$type<number[]>()
    .notNull()
    .default(sql`'[1,2,3,4,5,6]'::jsonb`),
  studyWindow: text('study_window').notNull().default('19:00-21:00'),
  experienceYears: integer('experience_years'),
  level: text('level'),
  targetRole: text('target_role'),
  backendLevel: text('backend_level'),
  typescriptLevel: text('typescript_level'),
  sqlLevel: text('sql_level'),
  gitLevel: text('git_level'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const courses = pgTable(
  'courses',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    category: courseCategoryEnum('category').notNull(),
    priority: priorityEnum('priority').notNull().default('medium'),
    durationHours: integer('duration_hours'),
    description: text('description').notNull().default(''),
    objectives: jsonb('objectives')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: courseStatusEnum('status').notNull().default('not_started'),
    progressManual: integer('progress_manual'),
    weight: integer('weight').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    isSeeded: boolean('is_seeded').notNull().default(false),
    link: text('link'),
    notes: text('notes').notNull().default(''),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_courses_category_sort').on(table.category, table.sortOrder)],
);

export const courseTopics = pgTable(
  'course_topics',
  {
    id: serial('id').primaryKey(),
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    kind: topicKindEnum('kind').notNull().default('content'),
    isCompleted: boolean('is_completed').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('idx_course_topics_course').on(table.courseId, table.sortOrder)],
);

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: projectStatusEnum('status').notNull().default('planned'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  targetDate: date('target_date'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  isSeeded: boolean('is_seeded').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projectFeatures = pgTable(
  'project_features',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: featureStatusEnum('status').notNull().default('not_started'),
    priority: priorityEnum('priority').notNull().default('medium'),
    checklist: jsonb('checklist')
      .$type<ProjectFeatureChecklistItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    targetDate: date('target_date'),
    notes: text('notes').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_project_features_project').on(table.projectId, table.sortOrder)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    type: taskTypeEnum('type').notNull().default('study'),
    relatedCourseId: integer('related_course_id').references(() => courses.id, {
      onDelete: 'set null',
    }),
    relatedProjectId: integer('related_project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    plannedDate: date('planned_date'),
    dueDate: date('due_date'),
    estimatedMinutes: integer('estimated_minutes'),
    actualMinutes: integer('actual_minutes').notNull().default(0),
    status: taskStatusEnum('status').notNull().default('todo'),
    priority: priorityEnum('priority').notNull().default('medium'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tasks_planned_date').on(table.plannedDate),
    index('idx_tasks_status').on(table.status),
  ],
);

export const studySessions = pgTable(
  'study_sessions',
  {
    id: serial('id').primaryKey(),
    courseId: integer('course_id').references(() => courses.id, { onDelete: 'set null' }),
    taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes').notNull(),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_study_sessions_started').on(table.startedAt)],
);

export const interviewTopics = pgTable('interview_topics', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  status: interviewStatusEnum('status').notNull().default('not_reviewed'),
  lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
  notes: text('notes').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  isSeeded: boolean('is_seeded').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const interviewQuestions = pgTable(
  'interview_questions',
  {
    id: serial('id').primaryKey(),
    topicId: integer('topic_id')
      .notNull()
      .references(() => interviewTopics.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer').notNull().default(''),
    confidenceLevel: integer('confidence_level'),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_interview_questions_topic').on(table.topicId)],
);

export const interviewChecklist = pgTable('interview_checklist', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull().default('General'),
  isCompleted: boolean('is_completed').notNull().default(false),
  notes: text('notes').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  isSeeded: boolean('is_seeded').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobApplications = pgTable(
  'job_applications',
  {
    id: serial('id').primaryKey(),
    company: text('company').notNull(),
    position: text('position').notNull(),
    jobUrl: text('job_url'),
    appliedAt: date('applied_at'),
    status: jobStatusEnum('status').notNull().default('saved'),
    contactPerson: text('contact_person'),
    followUpAt: date('follow_up_at'),
    notes: text('notes').notNull().default(''),
    cvVersion: text('cv_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_job_applications_follow_up').on(table.followUpAt)],
);

export const learningNotes = pgTable(
  'learning_notes',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    contentMarkdown: text('content_markdown').notNull().default(''),
    relatedType: noteRelatedTypeEnum('related_type').notNull().default('general'),
    relatedId: integer('related_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_learning_notes_related').on(table.relatedType, table.relatedId)],
);

export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CourseRow = typeof courses.$inferSelect;
export type CourseTopicRow = typeof courseTopics.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type StudySessionRow = typeof studySessions.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type ProjectFeatureRow = typeof projectFeatures.$inferSelect;
export type InterviewTopicRow = typeof interviewTopics.$inferSelect;
export type InterviewQuestionRow = typeof interviewQuestions.$inferSelect;
export type InterviewChecklistRow = typeof interviewChecklist.$inferSelect;
export type JobApplicationRow = typeof jobApplications.$inferSelect;
export type LearningNoteRow = typeof learningNotes.$inferSelect;
export type UserSettingsRow = typeof userSettings.$inferSelect;
