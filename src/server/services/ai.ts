import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../db/client';
import { interviewQuestions, interviewTopics } from '../db/schema';
import { AppError } from '../lib/errors';
import { addDays, todayInTimezone } from '../lib/dates';
import {
  PRIORITIES,
  TASK_TYPES,
  type AiInterviewReviewRequest,
  type AiInterviewReviewResponse,
  type AiStatus,
  type AiStudyPlanRequest,
  type AiStudyPlanResponse,
  type AiSuggestedTask,
  type AiTestRequest,
  type AiTestResponse,
  type AiWeeklyCoachRequest,
  type AiWeeklyCoachResponse,
} from '../../shared/types';
import {
  buildAiRequestHeaders,
  mergeDraftAiConfig,
  resolveAiConfig,
  resolveEnvAiConfig,
  type ResolvedAiConfig,
} from './ai-settings';
import { loadCourses, toCourseSummaries } from './courses';
import { buildDashboard } from './dashboard';
import { getSettingsRow, serializeSettings } from './settings';
import { loadTaskDtos } from './tasks';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionOptions {
  messages: AiChatMessage[];
  jsonMode?: boolean;
  temperature?: number;
  signal?: AbortSignal;
  config?: ResolvedAiConfig;
}

export interface AiProvider {
  complete(options: AiCompletionOptions): Promise<string>;
  stream(options: AiCompletionOptions): AsyncIterable<string>;
}

export function assertAiConfigured(config: ResolvedAiConfig): void {
  if (!config.enabled) {
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'Tính năng AI chưa được cấu hình. Hãy thiết lập trong trang Cài đặt hoặc thêm AI_API_KEY vào file .env.',
    );
  }
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function combineSignals(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!external) return timeoutSignal;
  if ('any' in AbortSignal && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([timeoutSignal, external]);
  }
  return external;
}

async function readProviderError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `HTTP ${response.status}`;
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    return text.slice(0, 200);
  } catch {
    return `HTTP ${response.status}`;
  }
}

const defaultProvider: AiProvider = {
  async complete({ messages, jsonMode = false, temperature = 0.3, signal, config: passedConfig }) {
    const config = passedConfig ?? resolveEnvAiConfig();
    assertAiConfigured(config);
    const url = `${config.baseUrl}/chat/completions`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: buildAiRequestHeaders(config),
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature,
          ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: combineSignals(config.timeoutMs, signal),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(504, 'AI_TIMEOUT', 'Yêu cầu tới AI quá thời gian chờ hoặc đã bị hủy.');
      }
      throw new AppError(
        502,
        'AI_PROVIDER_ERROR',
        'Không thể kết nối tới nhà cung cấp AI. Kiểm tra Base URL và kết nối mạng.',
      );
    }

    if (!response.ok) {
      const detail = await readProviderError(response);
      throw new AppError(
        502,
        'AI_PROVIDER_ERROR',
        `Nhà cung cấp AI trả lỗi (${response.status}): ${detail}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new AppError(502, 'AI_INVALID_OUTPUT', 'Nhà cung cấp AI trả về nội dung rỗng.');
    }
    return content;
  },

  async *stream({ messages, temperature = 0.4, signal, config: passedConfig }) {
    const config = passedConfig ?? resolveEnvAiConfig();
    assertAiConfigured(config);
    const url = `${config.baseUrl}/chat/completions`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: buildAiRequestHeaders(config),
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature,
          ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
          stream: true,
        }),
        signal: combineSignals(config.timeoutMs, signal),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(504, 'AI_TIMEOUT', 'Yêu cầu tới AI quá thời gian chờ hoặc đã bị hủy.');
      }
      throw new AppError(
        502,
        'AI_PROVIDER_ERROR',
        'Không thể kết nối tới nhà cung cấp AI. Kiểm tra Base URL và kết nối mạng.',
      );
    }

    if (!response.ok) {
      const detail = await readProviderError(response);
      throw new AppError(
        502,
        'AI_PROVIDER_ERROR',
        `Nhà cung cấp AI trả lỗi (${response.status}): ${detail}`,
      );
    }

    if (!response.body) {
      throw new AppError(502, 'AI_INVALID_OUTPUT', 'Nhà cung cấp AI không hỗ trợ stream.');
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
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string | null }; message?: { content?: string | null } }[];
            };
            const chunk =
              parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? '';
            if (chunk) yield chunk;
          } catch {
            // Ignore malformed SSE keep-alive lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};

let activeProvider: AiProvider = defaultProvider;

export function setAiProviderForTests(provider: AiProvider | null): void {
  activeProvider = provider ?? defaultProvider;
}

export async function getAiStatus(db: AppDb): Promise<AiStatus> {
  const config = await resolveAiConfig(db);
  return {
    enabled: config.enabled,
    model: config.model,
    baseUrl: config.baseUrl,
  };
}

export async function testAiConnection(
  db: AppDb,
  draft?: AiTestRequest,
  signal?: AbortSignal,
): Promise<AiTestResponse> {
  const current = await resolveAiConfig(db);
  const config = mergeDraftAiConfig(current, draft);
  assertAiConfigured(config);

  const startedAt = Date.now();
  const reply = await activeProvider.complete({
    config,
    messages: [
      { role: 'system', content: 'You are a connectivity test endpoint. Reply concisely with OK.' },
      { role: 'user', content: 'Ping' },
    ],
    jsonMode: false,
    temperature: 0.1,
    signal,
  });

  return {
    ok: true,
    latencyMs: Math.max(1, Date.now() - startedAt),
    model: config.model,
    baseUrl: config.baseUrl,
    reply: reply.trim().slice(0, 120),
  };
}

function parseStructuredOutput<S extends z.ZodType>(schema: S, rawText: string): z.infer<S> {
  const cleaned = stripJsonFence(rawText);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    throw new AppError(
      502,
      'AI_INVALID_OUTPUT',
      'AI trả về dữ liệu không phải JSON hợp lệ. Vui lòng thử lại.',
    );
  }

  const validated = schema.safeParse(parsedJson);
  if (!validated.success) {
    throw new AppError(
      502,
      'AI_INVALID_OUTPUT',
      'AI trả về cấu trúc JSON không khớp schema yêu cầu.',
      validated.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return validated.data;
}

const interviewReviewOutputSchema = z.object({
  suggestedConfidence: z.number().int().min(1).max(5),
  summary: z.string().min(1).max(1500),
  strengths: z.array(z.string().min(1).max(500)).max(6).default([]),
  missingPoints: z.array(z.string().min(1).max(500)).max(6).default([]),
  improvedAnswer: z.string().min(1).max(4000),
  followUpQuestions: z.array(z.string().min(1).max(500)).min(1).max(5),
});

export async function reviewInterviewAnswer(
  db: AppDb,
  input: AiInterviewReviewRequest,
): Promise<AiInterviewReviewResponse> {
  const config = await resolveAiConfig(db);
  assertAiConfigured(config);

  const questionRows = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, input.questionId))
    .limit(1);
  const questionRow = questionRows[0];
  if (!questionRow) {
    throw AppError.notFound('Không tìm thấy câu hỏi phỏng vấn.');
  }

  const topicRows = await db
    .select()
    .from(interviewTopics)
    .where(eq(interviewTopics.id, questionRow.topicId))
    .limit(1);
  const topicRow = topicRows[0];
  if (!topicRow) {
    throw AppError.notFound('Không tìm thấy chủ đề phỏng vấn.');
  }

  const siblingQuestions = await db
    .select({ question: interviewQuestions.question })
    .from(interviewQuestions)
    .where(eq(interviewQuestions.topicId, topicRow.id));

  const settings = serializeSettings(await getSettingsRow(db));
  const candidateAnswer = (input.answer ?? questionRow.answer).trim();
  const lang = input.locale === 'en' ? 'English' : 'Vietnamese';

  const systemPrompt = [
    `You are a strict, constructive Senior Technical Interviewer evaluating a candidate for the role "${settings.targetRole ?? 'Full-stack / Frontend Web Developer'}" (Level: ${settings.level ?? 'Junior-Middle'}, Experience: ${settings.experienceYears ?? 'unspecified'} years).`,
    `Respond in ${lang} and return ONLY a valid JSON object matching this exact schema:`,
    `{`,
    `  "suggestedConfidence": number (integer 1-5, where 1 = no answer/very weak, 3 = acceptable basics, 5 = production-ready depth with trade-offs),`,
    `  "summary": string (concise 1-2 sentence evaluation),`,
    `  "strengths": string[] (up to 4 bullet points of what the candidate answered well; empty array if the answer is blank),`,
    `  "missingPoints": string[] (up to 4 key technical concepts, edge cases, or real-world examples missing from the answer),`,
    `  "improvedAnswer": string (a crisp, interview-ready model answer structured with concept, mechanism, and practical example),`,
    `  "followUpQuestions": string[] (2-3 realistic follow-up questions an interviewer would ask next, avoiding duplicates of existing questions)`,
    `}`,
  ].join('\n');

  const userPrompt = JSON.stringify({
    topic: topicRow.name,
    category: topicRow.category,
    question: questionRow.question,
    candidateAnswer: candidateAnswer || '(Candidate has not written an answer yet — provide key points to cover, suggestedConfidence = 1, and a strong model answer)',
    existingQuestionsInTopic: siblingQuestions.map((row) => row.question),
  });

  const raw = await activeProvider.complete({
    config,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    jsonMode: true,
    temperature: 0.25,
  });

  const parsed = parseStructuredOutput(interviewReviewOutputSchema, raw);
  return {
    questionId: questionRow.id,
    suggestedConfidence: parsed.suggestedConfidence,
    summary: parsed.summary,
    strengths: parsed.strengths,
    missingPoints: parsed.missingPoints,
    improvedAnswer: parsed.improvedAnswer,
    followUpQuestions: parsed.followUpQuestions,
  };
}

const studyPlanOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).default(''),
        type: z.enum(TASK_TYPES).default('study'),
        relatedCourseId: z.number().int().positive().nullable().default(null),
        plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        estimatedMinutes: z.number().int().min(10).max(480),
        priority: z.enum(PRIORITIES).default('medium'),
      }),
    )
    .min(1)
    .max(10),
});

export async function generateStudyPlan(
  db: AppDb,
  input: AiStudyPlanRequest,
): Promise<AiStudyPlanResponse> {
  const config = await resolveAiConfig(db);
  assertAiConfigured(config);

  const settings = serializeSettings(await getSettingsRow(db));
  const today = todayInTimezone(settings.timezone);
  const startDate = input.startDate ?? today;
  const days = Math.min(Math.max(input.days ?? 3, 1), 7);

  const [courseBundles, allTasks] = await Promise.all([loadCourses(db), loadTaskDtos(db)]);
  const courseSummaries = toCourseSummaries(courseBundles);
  const courseById = new Map(courseSummaries.map((course) => [course.id, course]));

  if (input.courseId !== undefined && input.courseId !== null) {
    if (!courseById.has(input.courseId)) {
      throw AppError.notFound('Không tìm thấy khóa học được chọn.');
    }
  }

  const relevantBundles =
    input.courseId !== undefined && input.courseId !== null
      ? courseBundles.filter((bundle) => bundle.course.id === input.courseId)
      : [
          ...courseBundles.filter((bundle) => bundle.course.status === 'in_progress'),
          ...courseBundles.filter(
            (bundle) =>
              bundle.course.status === 'not_started' &&
              (bundle.course.category === 'A' || bundle.course.category === 'B'),
          ),
        ].slice(0, 5);

  const openTasks = allTasks
    .filter((task) => task.status === 'todo' || task.status === 'in_progress')
    .slice(0, 15);

  const dateWindow = Array.from({ length: days }, (_, index) => addDays(startDate, index));
  const lang = input.locale === 'en' ? 'English' : 'Vietnamese';

  const systemPrompt = [
    `You are a Practical Study Planner Copilot for a developer following the roadmap "Frontend -> Full-stack -> AI-powered Web Developer".`,
    `Generate a concrete, realistic daily task plan across the requested date window (${dateWindow.join(', ')}).`,
    `Respect the user's daily study goal (${settings.dailyGoalMinutes} minutes/day) and break down incomplete course checklist items into verifiable study/practice tasks.`,
    `Do NOT mark anything completed. Only propose new tasks to be reviewed by the user.`,
    `Respond in ${lang} and return ONLY a valid JSON object matching this exact schema:`,
    `{`,
    `  "summary": string (brief explanation of how this plan fits the user's current progress and daily goal),`,
    `  "tasks": [`,
    `    {`,
    `      "title": string (actionable task title, max 120 chars),`,
    `      "description": string (what concrete output/exercise to complete),`,
    `      "type": "study" | "practice" | "project" | "interview" | "application" | "other",`,
    `      "relatedCourseId": number | null (must be one of the provided course IDs or null),`,
    `      "plannedDate": "YYYY-MM-DD" (must be within ${startDate} to ${dateWindow[dateWindow.length - 1]}),`,
    `      "estimatedMinutes": number (integer between 15 and 240),`,
    `      "priority": "low" | "medium" | "high"`,
    `    }`,
    `  ]`,
    `}`,
  ].join('\n');

  const userPrompt = JSON.stringify({
    startDate,
    days,
    dateWindow,
    dailyGoalMinutes: settings.dailyGoalMinutes,
    studyWindow: settings.studyWindow,
    targetRole: settings.targetRole,
    level: settings.level,
    focusNote: input.focusNote?.trim() || null,
    courses: relevantBundles.map((bundle) => ({
      id: bundle.course.id,
      title: bundle.course.title,
      category: bundle.course.category,
      status: bundle.course.status,
      priority: bundle.course.priority,
      incompleteTopics: bundle.topics
        .filter((topic) => !topic.isCompleted)
        .slice(0, 6)
        .map((topic) => ({
          title: topic.title,
          kind: topic.kind,
          description: topic.description,
        })),
    })),
    existingOpenTasks: openTasks.map((task) => ({
      title: task.title,
      plannedDate: task.plannedDate,
      estimatedMinutes: task.estimatedMinutes,
      courseTitle: task.courseTitle,
    })),
  });

  const raw = await activeProvider.complete({
    config,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    jsonMode: true,
    temperature: 0.3,
  });

  const parsed = parseStructuredOutput(studyPlanOutputSchema, raw);
  const validDates = new Set(dateWindow);

  const normalizedTasks: AiSuggestedTask[] = parsed.tasks.map((task) => {
    const matchedCourse =
      task.relatedCourseId !== null ? courseById.get(task.relatedCourseId) ?? null : null;
    const plannedDate = validDates.has(task.plannedDate) ? task.plannedDate : startDate;
    return {
      title: task.title.trim(),
      description: task.description.trim(),
      type: task.type,
      relatedCourseId: matchedCourse ? matchedCourse.id : null,
      courseTitle: matchedCourse ? matchedCourse.title : null,
      plannedDate,
      estimatedMinutes: Math.min(Math.max(Math.round(task.estimatedMinutes), 15), 240),
      priority: task.priority,
    };
  });

  return {
    summary: parsed.summary,
    tasks: normalizedTasks,
  };
}

async function buildCoachingMessages(
  db: AppDb,
  input: AiWeeklyCoachRequest,
): Promise<AiChatMessage[]> {
  const [dashboard, courseBundles] = await Promise.all([buildDashboard(db), loadCourses(db)]);
  const activeCourses = courseBundles
    .filter((bundle) => bundle.course.status === 'in_progress')
    .map((bundle) => ({
      title: bundle.course.title,
      category: bundle.course.category,
      studyMinutes: bundle.studyMinutes,
      completedTopics: bundle.topics.filter((t) => t.isCompleted).length,
      totalTopics: bundle.topics.length,
      nextTopics: bundle.topics
        .filter((t) => !t.isCompleted)
        .slice(0, 3)
        .map((t) => t.title),
    }));

  const lang = input.locale === 'en' ? 'English' : 'Vietnamese';

  const systemPrompt = [
    `You are an honest, data-driven Engineering Career & Study Coach for the user's personal "Learning Road" tracker.`,
    `Analyze ONLY the real metrics provided below. Never invent fake progress or assume a course is done if its status is not completed.`,
    `Write a concise, actionable Markdown report in ${lang} structured into 3 short sections:`,
    `1. **Đánh giá nhịp độ & Tiến độ thật** (Current Momentum & Bottlenecks based on actual study minutes vs goals, streak, and overdue tasks)`,
    `2. **Trọng tâm ưu tiên tiếp theo** (Top 2-3 highest-leverage actions across Group A/B courses, portfolio features, or interview prep)`,
    `3. **Chiến thuật tìm việc & Phỏng vấn** (Concrete advice tailored to their target role "${dashboard.settings.targetRole ?? 'Full-stack / AI-powered Web Developer'}" and current job funnel).`,
  ].join('\n');

  const userPrompt = JSON.stringify({
    today: dashboard.today,
    focusNote: input.focusNote?.trim() || null,
    profile: {
      level: dashboard.settings.level,
      targetRole: dashboard.settings.targetRole,
      experienceYears: dashboard.settings.experienceYears,
      dailyGoalMinutes: dashboard.settings.dailyGoalMinutes,
      weeklyGoalMinutes: dashboard.settings.weeklyGoalMinutes,
    },
    roadmap: dashboard.roadmap,
    study: dashboard.study,
    tasks: {
      openCount: dashboard.tasks.openCount,
      completedToday: dashboard.tasks.completedToday,
      weekCompleted: dashboard.tasks.weekCompleted,
      todayTasks: dashboard.tasks.today.map((t) => ({
        title: t.title,
        status: t.status,
        estimatedMinutes: t.estimatedMinutes,
      })),
      overdueTasks: dashboard.tasks.overdue.slice(0, 8).map((t) => ({
        title: t.title,
        plannedDate: t.plannedDate,
        courseTitle: t.courseTitle,
      })),
    },
    activeCourses,
    portfolio: dashboard.projects,
    interview: dashboard.interview,
    jobs: {
      total: dashboard.jobs.total,
      byStatus: dashboard.jobs.byStatus,
      dueFollowUpsCount: dashboard.jobs.followUps.length,
    },
  });

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

export async function generateWeeklyCoaching(
  db: AppDb,
  input: AiWeeklyCoachRequest,
  signal?: AbortSignal,
): Promise<AiWeeklyCoachResponse> {
  const config = await resolveAiConfig(db);
  assertAiConfigured(config);
  const messages = await buildCoachingMessages(db, input);
  const markdown = await activeProvider.complete({
    config,
    messages,
    jsonMode: false,
    temperature: 0.4,
    signal,
  });
  return {
    markdown: markdown.trim(),
    generatedAt: new Date().toISOString(),
  };
}

export async function* streamWeeklyCoaching(
  db: AppDb,
  input: AiWeeklyCoachRequest,
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const config = await resolveAiConfig(db);
  assertAiConfigured(config);
  const messages = await buildCoachingMessages(db, input);
  for await (const chunk of activeProvider.stream({
    config,
    messages,
    temperature: 0.4,
    signal,
  })) {
    yield chunk;
  }
}
