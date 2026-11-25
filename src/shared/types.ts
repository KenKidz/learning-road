export const COURSE_CATEGORIES = ['A', 'B', 'C'] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const COURSE_STATUSES = ['not_started', 'in_progress', 'completed', 'paused'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TOPIC_KINDS = ['content', 'dod'] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];

export const TASK_TYPES = ['study', 'practice', 'project', 'interview', 'application', 'other'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PROJECT_STATUSES = ['planned', 'in_progress', 'completed', 'paused'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const FEATURE_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const INTERVIEW_STATUSES = ['not_reviewed', 'reviewing', 'mastered'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const JOB_STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const NOTE_RELATED_TYPES = ['general', 'course', 'task', 'project', 'interview_topic'] as const;
export type NoteRelatedType = (typeof NOTE_RELATED_TYPES)[number];

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CourseTopic {
  id: number;
  courseId: number;
  title: string;
  description: string;
  kind: TopicKind;
  isCompleted: boolean;
  sortOrder: number;
}

export interface CourseSummary {
  id: number;
  title: string;
  category: CourseCategory;
  priority: Priority;
  durationHours: number | null;
  description: string;
  objectives: string[];
  status: CourseStatus;
  progressManual: number | null;
  progress: number;
  weight: number;
  sortOrder: number;
  isSeeded: boolean;
  link: string | null;
  notes: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  topicsTotal: number;
  topicsCompleted: number;
  contentTotal: number;
  contentCompleted: number;
  dodTotal: number;
  dodCompleted: number;
  studyMinutes: number;
}

export interface StudySession {
  id: number;
  courseId: number | null;
  taskId: number | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  notes: string;
  createdAt: string;
  courseTitle?: string | null;
  taskTitle?: string | null;
}

export interface CourseDetail extends CourseSummary {
  topics: CourseTopic[];
  sessions: StudySession[];
}

export interface Task {
  id: number;
  title: string;
  description: string;
  type: TaskType;
  relatedCourseId: number | null;
  relatedProjectId: number | null;
  plannedDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number;
  status: TaskStatus;
  priority: Priority;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  courseTitle?: string | null;
  projectName?: string | null;
}

export interface ProjectFeatureChecklistItem {
  label: string;
  done: boolean;
}

export interface ProjectFeature {
  id: number;
  projectId: number;
  title: string;
  description: string;
  status: FeatureStatus;
  priority: Priority;
  checklist: ProjectFeatureChecklistItem[];
  targetDate: string | null;
  notes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  startedAt: string | null;
  targetDate: string | null;
  completedAt: string | null;
  isSeeded: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  features: ProjectFeature[];
}

export interface InterviewQuestion {
  id: number;
  topicId: number;
  question: string;
  answer: string;
  confidenceLevel: number | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewTopic {
  id: number;
  name: string;
  category: string;
  status: InterviewStatus;
  lastReviewedAt: string | null;
  notes: string;
  sortOrder: number;
  isSeeded: boolean;
  createdAt: string;
  updatedAt: string;
  questions: InterviewQuestion[];
}

export interface InterviewChecklistItem {
  id: number;
  title: string;
  category: string;
  isCompleted: boolean;
  notes: string;
  sortOrder: number;
  isSeeded: boolean;
  createdAt: string;
}

export interface JobApplication {
  id: number;
  company: string;
  position: string;
  jobUrl: string | null;
  appliedAt: string | null;
  status: JobStatus;
  contactPerson: string | null;
  followUpAt: string | null;
  notes: string;
  cvVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LearningNote {
  id: number;
  title: string;
  contentMarkdown: string;
  relatedType: NoteRelatedType;
  relatedId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  id: number;
  timezone: string;
  roadmapStartDate: string | null;
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  preferredStudyDays: number[];
  studyWindow: string;
  experienceYears: number | null;
  level: string | null;
  targetRole: string | null;
  backendLevel: string | null;
  typescriptLevel: string | null;
  sqlLevel: string | null;
  gitLevel: string | null;
  updatedAt: string;
}

export interface DashboardGroup {
  category: CourseCategory;
  label: string;
  coursesTotal: number;
  coursesCompleted: number;
  coursesInProgress: number;
  progress: number;
  studyMinutes: number;
}

export interface DashboardData {
  settings: UserSettings;
  today: string;
  dataStatus: {
    courses: boolean;
    tasks: boolean;
    studySessions: boolean;
    projects: boolean;
    interview: boolean;
    jobs: boolean;
    notes: boolean;
  };
  roadmap: {
    progress: number;
    totalCourses: number;
    byStatus: Record<CourseStatus, number>;
    groups: DashboardGroup[];
  };
  study: {
    totalMinutes: number;
    weekMinutes: number;
    todayMinutes: number;
    weekStart: string;
    weekEnd: string;
    streakDays: number;
    last7Days: { date: string; minutes: number }[];
  };
  tasks: {
    today: Task[];
    overdue: Task[];
    openCount: number;
    completedToday: number;
    weekCompleted: number;
  };
  projects: {
    projectsTotal: number;
    totalFeatures: number;
    completedFeatures: number;
    progress: number;
  };
  interview: {
    topicsTotal: number;
    mastered: number;
    reviewing: number;
    notReviewed: number;
    questionsTotal: number;
    reviewedThisWeek: number;
    dueQuestionsCount: number;
  };
  jobs: {
    total: number;
    byStatus: Record<JobStatus, number>;
    followUps: JobApplication[];
  };
}

export interface TasksResponse {
  tasks: Task[];
  summary: {
    open: number;
    done: number;
    estimatedMinutes: number;
    actualMinutes: number;
  };
}

export interface SessionsResponse {
  sessions: StudySession[];
  totalMinutes: number;
}

export interface CoursesResponse {
  courses: CourseSummary[];
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface InterviewResponse {
  topics: InterviewTopic[];
  checklist: InterviewChecklistItem[];
}

export interface JobsResponse {
  applications: JobApplication[];
  summary: Record<JobStatus, number>;
}

export interface NotesResponse {
  notes: LearningNote[];
}

export interface AuthStatus {
  required: boolean;
  authenticated: boolean;
}

export interface ExportPayload {
  app: 'learning-road';
  version: 1;
  exportedAt: string;
  data: {
    settings: UserSettings;
    courses: (CourseSummary & { topics: CourseTopic[] })[];
    tasks: Task[];
    studySessions: StudySession[];
    projects: Project[];
    interviewTopics: InterviewTopic[];
    interviewChecklist: InterviewChecklistItem[];
    jobApplications: JobApplication[];
    learningNotes: LearningNote[];
  };
}

export type ImportMode = 'replace' | 'merge';

export interface ImportEntityDiff {
  incoming: number;
  toAdd: number;
  toSkip: number;
}

export interface ImportPreviewResult {
  exportedAt: string;
  existing: {
    courses: number;
    tasks: number;
    studySessions: number;
    projects: number;
    interviewTopics: number;
    interviewChecklist: number;
    jobApplications: number;
    learningNotes: number;
  };
  merge: {
    courses: ImportEntityDiff;
    tasks: ImportEntityDiff;
    studySessions: ImportEntityDiff;
    projects: ImportEntityDiff;
    interviewTopics: ImportEntityDiff;
    interviewChecklist: ImportEntityDiff;
    jobApplications: ImportEntityDiff;
    learningNotes: ImportEntityDiff;
  };
}

export interface ImportResult {
  mode?: ImportMode;
  imported: {
    courses: number;
    tasks: number;
    studySessions: number;
    projects: number;
    interviewTopics: number;
    jobApplications: number;
    learningNotes: number;
  };
  skipped?: {
    courses: number;
    tasks: number;
    studySessions: number;
    projects: number;
    interviewTopics: number;
    jobApplications: number;
    learningNotes: number;
  };
}

export interface SearchResultItem {
  id: number;
  title: string;
  subtitle?: string;
  badge?: string;
  route: string;
}

export interface SearchResponse {
  query: string;
  courses: SearchResultItem[];
  tasks: SearchResultItem[];
  notes: SearchResultItem[];
  projects: SearchResultItem[];
  interviewTopics: SearchResultItem[];
  interviewQuestions: SearchResultItem[];
  jobs: SearchResultItem[];
}

export interface AnalyticsHeatmapDay {
  date: string;
  minutes: number;
  sessionsCount: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface AnalyticsWeeklyPoint {
  weekStart: string;
  minutes: number;
  goalMinutes: number;
  sessionsCount: number;
  tasksCompleted: number;
}

export interface AnalyticsCategoryStat {
  category: CourseCategory;
  studyMinutes: number;
  sessionsCount: number;
}

export interface AnalyticsCourseStat {
  courseId: number;
  title: string;
  category: CourseCategory;
  studyMinutes: number;
  sessionsCount: number;
  progress: number;
}

export interface AnalyticsTaskAccuracy {
  completedWithEstimate: number;
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  ratioPercent: number | null;
}

export interface AnalyticsPaceForecast {
  activeWeeksSampled: number;
  avgWeeklyMinutes: number;
  remainingCourseHours: number;
  estimatedWeeksToFinish: number | null;
}

export interface AnalyticsData {
  days: number;
  today: string;
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  activeDaysCount: number;
  longestStreakDays: number;
  heatmap: AnalyticsHeatmapDay[];
  weeklyTrend: AnalyticsWeeklyPoint[];
  byCategory: AnalyticsCategoryStat[];
  topCourses: AnalyticsCourseStat[];
  taskAccuracy: AnalyticsTaskAccuracy;
  paceForecast: AnalyticsPaceForecast;
}

export interface AiStatus {
  enabled: boolean;
  model: string;
  baseUrl: string;
}

export interface AiInterviewReviewRequest {
  questionId: number;
  answer?: string;
  locale?: 'vi' | 'en';
}

export interface AiInterviewReviewResponse {
  questionId: number;
  suggestedConfidence: number;
  summary: string;
  strengths: string[];
  missingPoints: string[];
  improvedAnswer: string;
  followUpQuestions: string[];
}

export interface AiStudyPlanRequest {
  courseId?: number | null;
  startDate?: string;
  days?: number;
  focusNote?: string;
  locale?: 'vi' | 'en';
}

export interface AiSuggestedTask {
  title: string;
  description: string;
  type: TaskType;
  relatedCourseId: number | null;
  courseTitle: string | null;
  plannedDate: string;
  estimatedMinutes: number;
  priority: Priority;
}

export interface AiStudyPlanResponse {
  summary: string;
  tasks: AiSuggestedTask[];
}

export interface AiWeeklyCoachRequest {
  focusNote?: string;
  locale?: 'vi' | 'en';
  stream?: boolean;
}

export interface AiWeeklyCoachResponse {
  markdown: string;
  generatedAt: string;
}
