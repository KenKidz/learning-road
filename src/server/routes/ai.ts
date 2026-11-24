import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppDb } from '../db/client';
import { env } from '../env';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import {
  generateStudyPlan,
  generateWeeklyCoaching,
  getAiStatus,
  reviewInterviewAnswer,
  streamWeeklyCoaching,
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

export function aiRouter(db: AppDb): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json(getAiStatus());
  });

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

      if (!env.aiEnabled) {
        throw new AppError(
          503,
          'AI_NOT_CONFIGURED',
          'Tính năng AI chưa được cấu hình. Hãy thêm AI_API_KEY vào file .env ở server.',
        );
      }

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
