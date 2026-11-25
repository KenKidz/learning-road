import type {
  AiInterviewReviewRequest,
  AiInterviewReviewResponse,
  AiStatus,
  AiStudyPlanRequest,
  AiStudyPlanResponse,
  AiSuggestedTask,
  AiWeeklyCoachRequest,
  AiWeeklyCoachResponse,
  AnalyticsData,
  AuthStatus,
  CourseDetail,
  CourseSummary,
  CourseTopic,
  CoursesResponse,
  DashboardData,
  ExportPayload,
  ImportMode,
  ImportPreviewResult,
  ImportResult,
  InterviewChecklistItem,
  InterviewQuestion,
  InterviewResponse,
  InterviewTopic,
  JobApplication,
  JobsResponse,
  LearningNote,
  NotesResponse,
  Project,
  ProjectFeature,
  ProjectsResponse,
  SearchResponse,
  SessionsResponse,
  StudySession,
  Task,
  TasksResponse,
  UserSettings,
} from '@shared/types';

import { currentLocale, i18n, translate } from '../i18n';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function localizedApiMessage(code: string, fallback: string): string {
  if (currentLocale() === 'vi') return fallback;
  const key = `apiErrors.${code}`;
  return i18n.global.te(key) ? translate(key) : translate('apiErrors.generic');
}



function queryString(params: object = {}): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  if (response.status === 401 && path !== '/auth/login') {
    window.dispatchEvent(new CustomEvent('lr:unauthorized'));
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string; details?: unknown } } | null;
    const code = body?.error?.code ?? 'REQUEST_FAILED';
    throw new ApiError(
      response.status,
      code,
      localizedApiMessage(code, body?.error?.message ?? `Request failed (${response.status}).`),
      body?.error?.details,
    );
  }

  return payload as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const remove = (path: string) => request<void>(path, { method: 'DELETE' });

export interface TaskFilters {
  scope?: 'today' | 'week' | 'overdue' | 'history' | 'upcoming' | 'all';
  date?: string;
  from?: string;
  to?: string;
  status?: string;
  courseId?: number;
  projectId?: number;
  q?: string;
}

export interface SessionFilters {
  from?: string;
  to?: string;
  courseId?: number;
  taskId?: number;
}

export const api = {
  authStatus: () => get<AuthStatus>('/auth/status'),
  login: (password: string) => post<AuthStatus>('/auth/login', { password }),
  logout: () => post<void>('/auth/logout'),

  dashboard: () => get<DashboardData>('/dashboard'),

  courses: (params: { category?: string; status?: string; q?: string } = {}) =>
    get<CoursesResponse>(`/courses${queryString(params)}`),
  course: (id: number) => get<CourseDetail>(`/courses/${id}`),
  createCourse: (body: unknown) => post<CourseDetail>('/courses', body),
  updateCourse: (id: number, body: unknown) => patch<CourseDetail>(`/courses/${id}`, body),
  deleteCourse: (id: number) => remove(`/courses/${id}`),
  createTopic: (courseId: number, body: unknown) =>
    post<CourseTopic>(`/courses/${courseId}/topics`, body),
  updateTopic: (id: number, body: unknown) => patch<CourseTopic>(`/topics/${id}`, body),
  deleteTopic: (id: number) => remove(`/topics/${id}`),

  tasks: (params: TaskFilters = {}) => get<TasksResponse>(`/tasks${queryString(params)}`),
  createTask: (body: unknown) => post<Task>('/tasks', body),
  updateTask: (id: number, body: unknown) => patch<Task>(`/tasks/${id}`, body),
  rescheduleTask: (id: number, plannedDate: string) =>
    post<Task>(`/tasks/${id}/reschedule`, { plannedDate }),
  deleteTask: (id: number) => remove(`/tasks/${id}`),

  sessions: (params: SessionFilters = {}) =>
    get<SessionsResponse>(`/study-sessions${queryString(params)}`),
  createSession: (body: unknown) => post<StudySession>('/study-sessions', body),
  updateSession: (id: number, body: unknown) => patch<StudySession>(`/study-sessions/${id}`, body),
  deleteSession: (id: number) => remove(`/study-sessions/${id}`),

  projects: () => get<ProjectsResponse>('/projects'),
  createProject: (body: unknown) => post<Project>('/projects', body),
  updateProject: (id: number, body: unknown) => patch<Project>(`/projects/${id}`, body),
  deleteProject: (id: number) => remove(`/projects/${id}`),
  createFeature: (projectId: number, body: unknown) =>
    post<ProjectFeature>(`/projects/${projectId}/features`, body),
  updateFeature: (id: number, body: unknown) => patch<ProjectFeature>(`/features/${id}`, body),
  deleteFeature: (id: number) => remove(`/features/${id}`),

  interview: () => get<InterviewResponse>('/interview'),
  createInterviewTopic: (body: unknown) => post<InterviewTopic>('/interview/topics', body),
  updateInterviewTopic: (id: number, body: unknown) =>
    patch<InterviewTopic>(`/interview/topics/${id}`, body),
  deleteInterviewTopic: (id: number) => remove(`/interview/topics/${id}`),
  createQuestion: (topicId: number, body: unknown) =>
    post<InterviewQuestion>(`/interview/topics/${topicId}/questions`, body),
  updateQuestion: (id: number, body: unknown) =>
    patch<InterviewQuestion>(`/interview/questions/${id}`, body),
  deleteQuestion: (id: number) => remove(`/interview/questions/${id}`),
  createChecklistItem: (body: unknown) =>
    post<InterviewChecklistItem>('/interview/checklist', body),
  updateChecklistItem: (id: number, body: unknown) =>
    patch<InterviewChecklistItem>(`/interview/checklist/${id}`, body),
  deleteChecklistItem: (id: number) => remove(`/interview/checklist/${id}`),

  jobs: (params: { status?: string } = {}) => get<JobsResponse>(`/jobs${queryString(params)}`),
  createJob: (body: unknown) => post<JobApplication>('/jobs', body),
  updateJob: (id: number, body: unknown) => patch<JobApplication>(`/jobs/${id}`, body),
  deleteJob: (id: number) => remove(`/jobs/${id}`),

  notes: (params: { relatedType?: string; relatedId?: number; q?: string } = {}) =>
    get<NotesResponse>(`/notes${queryString(params)}`),
  createNote: (body: unknown) => post<LearningNote>('/notes', body),
  updateNote: (id: number, body: unknown) => patch<LearningNote>(`/notes/${id}`, body),
  deleteNote: (id: number) => remove(`/notes/${id}`),

  settings: () => get<UserSettings>('/settings'),
  updateSettings: (body: unknown) => patch<UserSettings>('/settings', body),

  aiStatus: () => get<AiStatus>('/ai/status'),
  aiInterviewReview: (body: AiInterviewReviewRequest) =>
    post<AiInterviewReviewResponse>('/ai/interview-review', {
      locale: currentLocale(),
      ...body,
    }),
  aiStudyPlan: (body: AiStudyPlanRequest) =>
    post<AiStudyPlanResponse>('/ai/study-plan', {
      locale: currentLocale(),
      ...body,
    }),
  aiWeeklyCoaching: (body: AiWeeklyCoachRequest = {}) =>
    post<AiWeeklyCoachResponse>('/ai/weekly-coaching', {
      locale: currentLocale(),
      ...body,
      stream: false,
    }),

  importData: (payload: ExportPayload, mode: ImportMode = 'replace') =>
    post<ImportResult>(`/import?mode=${mode}`, payload),
  previewImport: (payload: ExportPayload) =>
    post<ImportPreviewResult>('/import/preview', payload),
  search: (q: string, limit = 5) =>
    get<SearchResponse>(`/search${queryString({ q, limit })}`),
  analytics: (days = 180) => get<AnalyticsData>(`/analytics${queryString({ days })}`),
};

export async function streamAiWeeklyCoaching(
  body: AiWeeklyCoachRequest,
  handlers: {
    onChunk: (chunk: string) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const response = await fetch('/api/ai/weekly-coaching', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      locale: currentLocale(),
      ...body,
      stream: true,
    }),
    signal: handlers.signal,
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('lr:unauthorized'));
  }

  if (!response.ok) {
    const text = await response.text();
    let payload: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
    if (text) {
      try {
        payload = JSON.parse(text) as { error?: { code?: string; message?: string; details?: unknown } };
      } catch {
        payload = null;
      }
    }
    const code = payload?.error?.code ?? 'REQUEST_FAILED';
    throw new ApiError(
      response.status,
      code,
      localizedApiMessage(code, payload?.error?.message ?? `Request failed (${response.status}).`),
      payload?.error?.details,
    );
  }

  if (!response.body) {
    throw new ApiError(502, 'AI_INVALID_OUTPUT', localizedApiMessage('AI_INVALID_OUTPUT', 'Stream unavailable.'));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw) continue;
        const event = JSON.parse(raw) as {
          chunk?: string;
          done?: boolean;
          error?: { code?: string; message?: string };
        };
        if (event.error) {
          const code = event.error.code ?? 'AI_PROVIDER_ERROR';
          throw new ApiError(
            502,
            code,
            localizedApiMessage(code, event.error.message ?? translate('apiErrors.generic')),
          );
        }
        if (event.chunk) {
          handlers.onChunk(event.chunk);
        }
        if (event.done) return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function downloadExport(): Promise<void> {
  const response = await fetch('/api/export', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new ApiError(response.status, 'EXPORT_FAILED', translate('apiErrors.EXPORT_FAILED'));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `learning-road-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type {
  AiInterviewReviewResponse,
  AiStatus,
  AiStudyPlanResponse,
  AiSuggestedTask,
  CourseSummary,
  CourseDetail,
  Task,
  StudySession,
  Project,
  ProjectFeature,
  InterviewTopic,
  JobApplication,
  LearningNote,
  UserSettings,
};
