import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../env';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import { asyncHandler } from '../lib/async-handler';

const COOKIE_NAME = 'lr_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function hash(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function sign(expiresAt: number): string {
  return crypto
    .createHmac('sha256', env.sessionSecret)
    .update(`learning-road:${expiresAt}`)
    .digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createSessionToken(): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const separator = token.indexOf('.');
  if (separator <= 0) return false;
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return safeEqual(signature, sign(expiresAt));
}

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function checkRateLimit(req: Request): void {
  const key = clientKey(req);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Quá nhiều lần đăng nhập. Thử lại sau vài phút.');
  }
}

const loginSchema = z.object({ password: z.string().min(1).max(500) }).strict();

export function authRouter(): Router {
  const router = Router();

  router.get('/status', (req, res) => {
    const authenticated =
      !env.authEnabled || verifySessionToken(req.cookies?.[COOKIE_NAME] as string | undefined);
    res.json({ required: env.authEnabled, authenticated });
  });

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      if (!env.authEnabled) {
        res.json({ required: false, authenticated: true });
        return;
      }
      checkRateLimit(req);
      const input = parseInput(loginSchema, req.body);
      const matches = crypto.timingSafeEqual(hash(input.password), hash(env.appPassword));
      if (!matches) {
        throw new AppError(401, 'INVALID_PASSWORD', 'Mật khẩu không đúng.');
      }
      loginAttempts.delete(clientKey(req));
      res.cookie(COOKIE_NAME, createSessionToken(), {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure,
        path: '/',
        maxAge: SESSION_TTL_MS,
      });
      res.json({ required: true, authenticated: true });
    }),
  );

  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(204).end();
  });

  return router;
}
