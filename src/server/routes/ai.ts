import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppDb } from '../db/client';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import {
  AI_HEADER_NAME_PATTERN,
  RESERVED_AI_HEADER_NAMES,
  getAiSettings,
  resetAiSettings,
  resolveAiConfig,
  updateAiSettings,
} from '../services/ai-settings';
import {
  assertAiConfigured,
  generateStudyPlan,
  generateWeeklyCoaching,
  getAiStatus,
  reviewInterviewAnswer,
  streamWeeklyCoaching,
  testAiConnection,
} from '../services/ai';

const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const aiRateMap = new Map<string, { count: number; firstAt: number }>();

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function checkAiRateLimit(req: Request): void {
  const key = clientKey(req);
  const now = Date.now();
  const entry = aiRateMap.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    aiRateMap.set(key, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    throw new AppError(
      429,
      'AI_RATE_LIMITED',
      'Bạn đã gửi quá nhiều yêu cầu AI trong thời gian ngắn. Vui lòng thử lại sau vài phút.',
    );
  }
}

export function resetAiRateLimitForTests(): void {
  aiRateMap.clear();
}

const localeSchema = z.enum(['vi', 'en']).optional();

const interviewReviewRequestSchema = z
  .object({
    questionId: z.number().int().positive(),
    answer: z.string().max(4000).optional(),
    locale: localeSchema,
  })
  .strict();

const studyPlanRequestSchema = z
  .object({
    courseId: z.number().int().positive().nullable().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày bắt đầu phải có định dạng YYYY-MM-DD.')
      .optional(),
    days: z.number().int().min(1).max(7).optional(),
    focusNote: z.string().max(1000).optional(),
    locale: localeSchema,
  })
  .strict();

const weeklyCoachRequestSchema = z
  .object({
    focusNote: z.string().max(1000).optional(),
    locale: localeSchema,
    stream: z.boolean().optional(),
  })
  .strict();

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, 'Base URL không được để trống.')
  .max(2048)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Base URL phải là đường dẫn http:// hoặc https:// hợp lệ.');

const customHeaderSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, 'Tên header không được để trống.')
      .max(100, 'Tên header quá dài (tối đa 100 ký tự).')
      .refine(
        (value) => AI_HEADER_NAME_PATTERN.test(value),
        'Tên header chỉ được chứa chữ cái, số, dấu gạch ngang (-) hoặc gạch dưới (_).',
      )
      .refine(
        (value) => !RESERVED_AI_HEADER_NAMES.has(value.toLowerCase()),
        'Không thể ghi đè header hệ thống (Authorization, Content-Type, Host…).',
      ),
    value: z
      .string()
      .trim()
      .min(1, 'Giá trị header không được để trống.')
      .max(1000, 'Giá trị header quá dài (tối đa 1000 ký tự).')
      .refine((value) => !/[\r\n]/.test(value), 'Giá trị header không được chứa ký tự xuống dòng.'),
  })
  .strict();

const customHeadersArraySchema = z
  .array(customHeaderSchema)
  .max(20, 'Tối đa 20 custom header.')
  .refine((headers) => {
    const seen = new Set<string>();
    for (const item of headers) {
      const lower = item.key.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
    }
    return true;
  }, 'Tên header không được trùng lặp.');

const aiSettingsUpdateSchema = z
  .object({
    apiKey: z.string().trim().max(500).nullable().optional(),
    baseUrl: httpUrlSchema.optional(),
    model: z.string().trim().min(1, 'Model không được để trống.').max(200).optional(),
    reasoningEffort: z.string().trim().max(50).optional(),
    customHeaders: customHeadersArraySchema.optional(),
    timeoutMs: z.number().int().min(1000).max(300000).optional(),
  })
  .strict();

const aiTestRequestSchema = z
  .object({
    apiKey: z.string().trim().max(500).optional(),
    baseUrl: httpUrlSchema.optional(),
    model: z.string().trim().min(1, 'Model không được để trống.').max(200).optional(),
    reasoningEffort: z.string().trim().max(50).optional(),
    customHeaders: customHeadersArraySchema.optional(),
    timeoutMs: z.number().int().min(1000).max(300000).optional(),
  })
  .strict();

export function aiRouter(db: AppDb): Router {
  const router = Router();

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      res.json(await getAiStatus(db));
    }),
  );

  router.get(
    '/settings',
    asyncHandler(async (_req, res) => {
      res.json(await getAiSettings(db));
    }),
  );

  router.patch(
    '/settings',
    asyncHandler(async (req, res) => {
      const input = parseInput(aiSettingsUpdateSchema, req.body);
      res.json(await updateAiSettings(db, input));
    }),
  );

  router.delete(
    '/settings',
    asyncHandler(async (_req, res) => {
      res.json(await resetAiSettings(db));
    }),
  );

  router.post(
    '/test',
    asyncHandler(async (req, res) => {
      checkAiRateLimit(req);
      const input = parseInput(aiTestRequestSchema, req.body ?? {});
      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });
      const result = await testAiConnection(db, input, abortController.signal);
      res.json(result);
    }),
  );

  router.post(
    '/interview-review',
    asyncHandler(async (req, res) => {
      checkAiRateLimit(req);
      const input = parseInput(interviewReviewRequestSchema, req.body);
      const result = await reviewInterviewAnswer(db, input);
      res.json(result);
    }),
  );

  router.post(
    '/study-plan',
    asyncHandler(async (req, res) => {
      checkAiRateLimit(req);
      const input = parseInput(studyPlanRequestSchema, req.body);
      const result = await generateStudyPlan(db, input);
      res.json(result);
    }),
  );

  router.post(
    '/weekly-coaching',
    asyncHandler(async (req, res) => {
      checkAiRateLimit(req);
      const input = parseInput(weeklyCoachRequestSchema, req.body ?? {});

      const config = await resolveAiConfig(db);
      assertAiConfigured(config);

      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      const wantsStream =
        input.stream === true ||
        (input.stream === undefined &&
          (req.headers.accept?.includes('text/event-stream') ?? false));

      if (!wantsStream) {
        const result = await generateWeeklyCoaching(db, input, abortController.signal);
        res.json(result);
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      try {
        for await (const chunk of streamWeeklyCoaching(db, input, abortController.signal)) {
          if (abortController.signal.aborted) break;
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
        if (!abortController.signal.aborted) {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          const code = error instanceof AppError ? error.code : 'AI_PROVIDER_ERROR';
          const message =
            error instanceof Error ? error.message : 'Không thể hoàn tất phân tích AI.';
          res.write(`data: ${JSON.stringify({ error: { code, message } })}\n\n`);
        }
      } finally {
        res.end();
      }
    }),
  );

  return router;
}
