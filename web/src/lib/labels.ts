import type {
  CourseStatus,
  FeatureStatus,
  InterviewStatus,
  JobStatus,
  NoteRelatedType,
  Priority,
  ProjectStatus,
  TaskStatus,
  TaskType,
  CourseCategory,
} from '@shared/types';
import { translate } from '../i18n';

function translatedRecord<T extends string>(keys: Record<T, string>): Record<T, string> {
  return new Proxy({} as Record<T, string>, {
    get(_target, property) {
      if (typeof property !== 'string') return undefined;
      const key = keys[property as T];
      return key ? translate(key) : '';
    },
  });
}

export const courseStatusLabels = translatedRecord<CourseStatus>({
  not_started: 'labels.courseStatus.not_started',
  in_progress: 'labels.courseStatus.in_progress',
  completed: 'labels.courseStatus.completed',
  paused: 'labels.courseStatus.paused',
});

export const taskStatusLabels = translatedRecord<TaskStatus>({
  todo: 'labels.taskStatus.todo',
  in_progress: 'labels.taskStatus.in_progress',
  done: 'labels.taskStatus.done',
  cancelled: 'labels.taskStatus.cancelled',
});

export const taskTypeLabels = translatedRecord<TaskType>({
  study: 'labels.taskType.study',
  practice: 'labels.taskType.practice',
  project: 'labels.taskType.project',
  interview: 'labels.taskType.interview',
  application: 'labels.taskType.application',
  other: 'labels.taskType.other',
});

export const priorityLabels = translatedRecord<Priority>({
  low: 'labels.priority.low',
  medium: 'labels.priority.medium',
  high: 'labels.priority.high',
});

export const categoryLabels = translatedRecord<CourseCategory>({
  A: 'labels.category.A',
  B: 'labels.category.B',
  C: 'labels.category.C',
});

export const categoryDescriptions = translatedRecord<CourseCategory>({
  A: 'labels.categoryDescription.A',
  B: 'labels.categoryDescription.B',
  C: 'labels.categoryDescription.C',
});

export const projectStatusLabels = translatedRecord<ProjectStatus>({
  planned: 'labels.projectStatus.planned',
  in_progress: 'labels.projectStatus.in_progress',
  completed: 'labels.projectStatus.completed',
  paused: 'labels.projectStatus.paused',
});

export const featureStatusLabels = translatedRecord<FeatureStatus>({
  not_started: 'labels.featureStatus.not_started',
  in_progress: 'labels.featureStatus.in_progress',
  completed: 'labels.featureStatus.completed',
  blocked: 'labels.featureStatus.blocked',
});

export const interviewStatusLabels = translatedRecord<InterviewStatus>({
  not_reviewed: 'labels.interviewStatus.not_reviewed',
  reviewing: 'labels.interviewStatus.reviewing',
  mastered: 'labels.interviewStatus.mastered',
});

export const jobStatusLabels = translatedRecord<JobStatus>({
  saved: 'labels.jobStatus.saved',
  applied: 'labels.jobStatus.applied',
  interviewing: 'labels.jobStatus.interviewing',
  offer: 'labels.jobStatus.offer',
  rejected: 'labels.jobStatus.rejected',
  withdrawn: 'labels.jobStatus.withdrawn',
});

export const noteRelatedTypeLabels = translatedRecord<NoteRelatedType>({
  general: 'labels.noteRelatedType.general',
  course: 'labels.noteRelatedType.course',
  task: 'labels.noteRelatedType.task',
  project: 'labels.noteRelatedType.project',
  interview_topic: 'labels.noteRelatedType.interview_topic',
});

export function badgeToneForCourseStatus(status: CourseStatus): string {
  if (status === 'completed') return 'success';
  if (status === 'in_progress') return 'info';
  if (status === 'paused') return 'warning';
  return 'neutral';
}

export function badgeToneForTaskStatus(status: TaskStatus): string {
  if (status === 'done') return 'success';
  if (status === 'in_progress') return 'info';
  if (status === 'cancelled') return 'neutral';
  return 'warning';
}

export function badgeToneForJobStatus(status: JobStatus): string {
  if (status === 'offer') return 'success';
  if (status === 'interviewing') return 'info';
  if (status === 'rejected' || status === 'withdrawn') return 'danger';
  if (status === 'applied') return 'warning';
  return 'neutral';
}

export function badgeToneForPriority(priority: Priority): string {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'neutral';
}
