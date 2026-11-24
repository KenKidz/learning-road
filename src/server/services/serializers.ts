import type {
  CourseSummary,
  CourseTopic,
  InterviewChecklistItem,
  InterviewQuestion,
  InterviewTopic,
  JobApplication,
  LearningNote,
  Project,
  ProjectFeature,
  StudySession,
  Task,
} from '../../shared/types';
import type {
  CourseRow,
  CourseTopicRow,
  InterviewChecklistRow,
  InterviewQuestionRow,
  InterviewTopicRow,
  JobApplicationRow,
  LearningNoteRow,
  ProjectFeatureRow,
  ProjectRow,
  StudySessionRow,
  TaskRow,
} from '../db/schema';
import { iso } from '../lib/dates';

export function serializeTopic(row: CourseTopicRow): CourseTopic {
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    description: row.description,
    kind: row.kind,
    isCompleted: row.isCompleted,
    sortOrder: row.sortOrder,
  };
}

export function computeCourseProgress(
  topics: Pick<CourseTopicRow, 'isCompleted'>[],
  progressManual: number | null,
): number {
  if (topics.length > 0) {
    const completed = topics.filter((topic) => topic.isCompleted).length;
    return Math.round((completed / topics.length) * 100);
  }
  return Math.max(0, Math.min(100, progressManual ?? 0));
}

export function serializeCourse(
  row: CourseRow,
  topics: CourseTopicRow[],
  studyMinutes: number,
): CourseSummary {
  const total = topics.length;
  const completed = topics.filter((topic) => topic.isCompleted).length;
  const content = topics.filter((topic) => topic.kind === 'content');
  const dod = topics.filter((topic) => topic.kind === 'dod');
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    durationHours: row.durationHours,
    description: row.description,
    objectives: row.objectives,
    status: row.status,
    progressManual: row.progressManual,
    progress: computeCourseProgress(topics, row.progressManual),
    weight: row.weight,
    sortOrder: row.sortOrder,
    isSeeded: row.isSeeded,
    link: row.link,
    notes: row.notes,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    topicsTotal: total,
    topicsCompleted: completed,
    contentTotal: content.length,
    contentCompleted: content.filter((topic) => topic.isCompleted).length,
    dodTotal: dod.length,
    dodCompleted: dod.filter((topic) => topic.isCompleted).length,
    studyMinutes,
  };
}

export function serializeSession(
  row: StudySessionRow,
  courseTitle?: string | null,
  taskTitle?: string | null,
): StudySession {
  return {
    id: row.id,
    courseId: row.courseId,
    taskId: row.taskId,
    startedAt: iso(row.startedAt) ?? new Date().toISOString(),
    endedAt: iso(row.endedAt),
    durationMinutes: row.durationMinutes,
    notes: row.notes,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    courseTitle: courseTitle ?? null,
    taskTitle: taskTitle ?? null,
  };
}

export function serializeTask(
  row: TaskRow,
  courseTitle?: string | null,
  projectName?: string | null,
): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    relatedCourseId: row.relatedCourseId,
    relatedProjectId: row.relatedProjectId,
    plannedDate: row.plannedDate,
    dueDate: row.dueDate,
    estimatedMinutes: row.estimatedMinutes,
    actualMinutes: row.actualMinutes,
    status: row.status,
    priority: row.priority,
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    courseTitle: courseTitle ?? null,
    projectName: projectName ?? null,
  };
}

export function serializeFeature(row: ProjectFeatureRow): ProjectFeature {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    checklist: row.checklist,
    targetDate: row.targetDate,
    notes: row.notes,
    sortOrder: row.sortOrder,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
  };
}

export function serializeProject(row: ProjectRow, features: ProjectFeatureRow[]): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    startedAt: iso(row.startedAt),
    targetDate: row.targetDate,
    completedAt: iso(row.completedAt),
    isSeeded: row.isSeeded,
    sortOrder: row.sortOrder,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    features: features.map(serializeFeature),
  };
}

export function serializeInterviewQuestion(row: InterviewQuestionRow): InterviewQuestion {
  return {
    id: row.id,
    topicId: row.topicId,
    question: row.question,
    answer: row.answer,
    confidenceLevel: row.confidenceLevel,
    lastReviewedAt: iso(row.lastReviewedAt),
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
  };
}

export function serializeInterviewTopic(
  row: InterviewTopicRow,
  questions: InterviewQuestionRow[],
): InterviewTopic {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    lastReviewedAt: iso(row.lastReviewedAt),
    notes: row.notes,
    sortOrder: row.sortOrder,
    isSeeded: row.isSeeded,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    questions: questions.map(serializeInterviewQuestion),
  };
}

export function serializeInterviewChecklist(row: InterviewChecklistRow): InterviewChecklistItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    isCompleted: row.isCompleted,
    notes: row.notes,
    sortOrder: row.sortOrder,
    isSeeded: row.isSeeded,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
  };
}

export function serializeJobApplication(row: JobApplicationRow): JobApplication {
  return {
    id: row.id,
    company: row.company,
    position: row.position,
    jobUrl: row.jobUrl,
    appliedAt: row.appliedAt,
    status: row.status,
    contactPerson: row.contactPerson,
    followUpAt: row.followUpAt,
    notes: row.notes,
    cvVersion: row.cvVersion,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
  };
}

export function serializeLearningNote(row: LearningNoteRow): LearningNote {
  return {
    id: row.id,
    title: row.title,
    contentMarkdown: row.contentMarkdown,
    relatedType: row.relatedType,
    relatedId: row.relatedId,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
  };
}
