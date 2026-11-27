import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import type { AppDb } from './db/client';
import { env } from './env';
import { errorHandler, notFoundHandler } from './lib/errors';
import { authRouter, sessionCookieName, verifySessionToken } from './routes/auth';
import { aiRouter } from './routes/ai';
import { analyticsRouter } from './routes/analytics';
import { coursesRouter, topicsRouter } from './routes/courses';
import { dashboardRouter } from './routes/dashboard';
import { exportRouter } from './routes/export';
import { interviewRouter } from './routes/interview';
import { jobsRouter } from './routes/jobs';
import { notesRouter } from './routes/notes';
import { featuresRouter, projectsRouter } from './routes/projects';
import { searchRouter } from './routes/search';
import { sessionsRouter } from './routes/sessions';
import { settingsRouter } from './routes/settings';
import { tasksRouter } from './routes/tasks';

export function createApp(db: AppDb): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter());

  const authGuard: RequestHandler = (req, res, next) => {
    if (!env.authEnabled) return next();
    const token = req.cookies?.[sessionCookieName()] as string | undefined;
    if (verifySessionToken(token)) return next();
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Cần đăng nhập để truy cập dữ liệu.' },
    });
  };
  app.use('/api', authGuard);

  app.use('/api/dashboard', dashboardRouter(db));
  app.use('/api/analytics', analyticsRouter(db));
  app.use('/api/courses', coursesRouter(db));
  app.use('/api/topics', topicsRouter(db));
  app.use('/api/tasks', tasksRouter(db));
  app.use('/api/study-sessions', sessionsRouter(db));
  app.use('/api/projects', projectsRouter(db));
  app.use('/api/features', featuresRouter(db));
  app.use('/api/interview', interviewRouter(db));
  app.use('/api/jobs', jobsRouter(db));
  app.use('/api/notes', notesRouter(db));
  app.use('/api/settings', settingsRouter(db));
  app.use('/api/ai', aiRouter(db));
  app.use('/api/search', searchRouter(db));
  app.use('/api', exportRouter(db));

  app.use('/api', notFoundHandler);

  const indexHtml = path.join(env.webDistDir, 'index.html');
  const hasWebBuild = fs.existsSync(indexHtml);
  if (hasWebBuild) {
    app.use(express.static(env.webDistDir, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
