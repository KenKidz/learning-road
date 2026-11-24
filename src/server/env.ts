import path from 'node:path';
import crypto from 'node:crypto';
import 'dotenv/config';

function optionalSecret(): string {
  const provided = process.env.SESSION_SECRET?.trim();
  if (provided) return provided;
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[auth] SESSION_SECRET is not set. A random secret was generated for this process; sessions will not survive a restart.',
  );
  return generated;
}

const appPassword = process.env.APP_PASSWORD?.trim() ?? '';
const fallbackAiSessionId = `ses_${crypto.randomBytes(12).toString('hex')}`;

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseDir: path.resolve(process.env.DATABASE_DIR ?? './data/pg'),
  migrationsFolder: path.resolve(process.env.MIGRATIONS_DIR ?? './drizzle'),
  webDistDir: path.resolve(process.env.WEB_DIST_DIR ?? './dist/web'),
  appPassword,
  sessionSecret: appPassword ? optionalSecret() : crypto.randomBytes(32).toString('hex'),
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
  get authEnabled(): boolean {
    return this.appPassword.length > 0;
  },
  get aiApiKey(): string {
    return process.env.AI_API_KEY?.trim() ?? '';
  },
  get aiBaseUrl(): string {
    const raw = process.env.AI_BASE_URL?.trim() || 'https://api.openai.com/v1';
    return raw.replace(/\/+$/, '');
  },
  get aiModel(): string {
    return process.env.AI_MODEL?.trim() || 'gpt-6-luna';
  },
  get aiReasoningEffort(): string {
    return process.env.AI_REASONING_EFFORT?.trim() ?? '';
  },
  get aiSessionId(): string {
    const provided = process.env.AI_SESSION_ID?.trim();
    if (provided) return provided.startsWith('ses_') ? provided : `ses_${provided}`;
    return fallbackAiSessionId;
  },
  get aiTimeoutMs(): number {
    const parsed = Number(process.env.AI_TIMEOUT_MS ?? 30000);
    return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 30000;
  },
  get aiEnabled(): boolean {
    return this.aiApiKey.length > 0;
  },
};
