import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../db/client';
import { appMeta } from '../db/schema';
import { env } from '../env';
import { iso } from '../lib/dates';
import type {
  AiApiKeySource,
  AiCustomHeader,
  AiSettings,
  AiSettingsUpdateRequest,
  AiTestRequest,
} from '../../shared/types';

export const AI_SETTINGS_META_KEY = 'ai_settings';

export const RESERVED_AI_HEADER_NAMES = new Set([
  'authorization',
  'content-type',
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
]);

export const AI_HEADER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const storedCustomHeaderSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const storedAiSettingsSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  reasoningEffort: z.string().optional(),
  customHeaders: z.array(storedCustomHeaderSchema).optional(),
  /** Legacy field migrated seamlessly to x-opencode-session when customHeaders is absent */
  sessionId: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
});

type StoredAiSettings = z.infer<typeof storedAiSettingsSchema>;

export interface ResolvedAiConfig {
  enabled: boolean;
  hasCustomConfig: boolean;
  apiKey: string;
  apiKeySource: AiApiKeySource;
  baseUrl: string;
  model: string;
  reasoningEffort: string;
  customHeaders: AiCustomHeader[];
  timeoutMs: number;
  updatedAt: string | null;
}

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function sanitizeCustomHeaders(headers: AiCustomHeader[]): AiCustomHeader[] {
  const seen = new Set<string>();
  const result: AiCustomHeader[] = [];
  for (const item of headers) {
    const key = item.key.trim();
    const value = item.value.trim();
    if (!key || !value) continue;
    if (!AI_HEADER_NAME_PATTERN.test(key)) continue;
    if (/[\r\n]/.test(value)) continue;
    const lower = key.toLowerCase();
    if (RESERVED_AI_HEADER_NAMES.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push({ key, value });
  }
  return result;
}

export function buildAiRequestHeaders(config: ResolvedAiConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of sanitizeCustomHeaders(config.customHeaders)) {
    headers[header.key] = header.value;
  }
  headers['Content-Type'] = 'application/json';
  headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

export function maskApiKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}••••`;
  }
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function formatLegacySessionId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('ses_') ? trimmed : `ses_${trimmed}`;
}

function envCustomHeaders(): AiCustomHeader[] {
  const sessionId = formatLegacySessionId(process.env.AI_SESSION_ID ?? '');
  if (!sessionId) return [];
  return [{ key: 'x-opencode-session', value: sessionId }];
}

export function resolveEnvAiConfig(): ResolvedAiConfig {
  const apiKey = env.aiApiKey;
  return {
    enabled: apiKey.length > 0,
    hasCustomConfig: false,
    apiKey,
    apiKeySource: apiKey.length > 0 ? 'env' : 'none',
    baseUrl: env.aiBaseUrl,
    model: env.aiModel,
    reasoningEffort: env.aiReasoningEffort,
    customHeaders: envCustomHeaders(),
    timeoutMs: env.aiTimeoutMs,
    updatedAt: null,
  };
}

async function readStoredAiSettings(
  db: AppDb,
): Promise<{ stored: StoredAiSettings; updatedAt: string | null } | null> {
  const rows = await db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, AI_SETTINGS_META_KEY))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  try {
    const parsedJson = JSON.parse(row.value) as unknown;
    const validated = storedAiSettingsSchema.safeParse(parsedJson);
    if (!validated.success) return null;
    return {
      stored: validated.data,
      updatedAt: iso(row.updatedAt),
    };
  } catch {
    return null;
  }
}

function resolveStoredHeaders(stored: StoredAiSettings): AiCustomHeader[] {
  if (stored.customHeaders !== undefined) {
    return sanitizeCustomHeaders(stored.customHeaders);
  }
  if (stored.sessionId !== undefined) {
    const formatted = formatLegacySessionId(stored.sessionId);
    return formatted ? [{ key: 'x-opencode-session', value: formatted }] : [];
  }
  return envCustomHeaders();
}

export async function resolveAiConfig(db: AppDb): Promise<ResolvedAiConfig> {
  const record = await readStoredAiSettings(db);
  if (!record) return resolveEnvAiConfig();

  const { stored, updatedAt } = record;
  const storedApiKey = stored.apiKey?.trim() ?? '';
  const envApiKey = env.aiApiKey;
  const apiKey = storedApiKey || envApiKey;
  const apiKeySource: AiApiKeySource = storedApiKey ? 'ui' : envApiKey ? 'env' : 'none';

  const baseUrl = stored.baseUrl?.trim() ? normalizeBaseUrl(stored.baseUrl) : env.aiBaseUrl;
  const model = stored.model?.trim() || env.aiModel;
  const reasoningEffort =
    stored.reasoningEffort !== undefined ? stored.reasoningEffort : env.aiReasoningEffort;
  const customHeaders = resolveStoredHeaders(stored);
  const timeoutMs = stored.timeoutMs ?? env.aiTimeoutMs;

  return {
    enabled: apiKey.length > 0,
    hasCustomConfig: true,
    apiKey,
    apiKeySource,
    baseUrl,
    model,
    reasoningEffort,
    customHeaders,
    timeoutMs,
    updatedAt,
  };
}

export function mergeDraftAiConfig(
  base: ResolvedAiConfig,
  draft?: AiTestRequest,
): ResolvedAiConfig {
  if (!draft) return base;

  const draftApiKey = draft.apiKey?.trim() ?? '';
  const apiKey = draftApiKey || base.apiKey;
  const apiKeySource: AiApiKeySource = draftApiKey ? 'ui' : base.apiKeySource;
  const baseUrl = draft.baseUrl?.trim() ? normalizeBaseUrl(draft.baseUrl) : base.baseUrl;
  const model = draft.model?.trim() || base.model;
  const reasoningEffort =
    draft.reasoningEffort !== undefined ? draft.reasoningEffort.trim() : base.reasoningEffort;
  const customHeaders =
    draft.customHeaders !== undefined
      ? sanitizeCustomHeaders(draft.customHeaders)
      : base.customHeaders;
  const timeoutMs = draft.timeoutMs ?? base.timeoutMs;

  return {
    ...base,
    enabled: apiKey.length > 0,
    apiKey,
    apiKeySource,
    baseUrl,
    model,
    reasoningEffort,
    customHeaders,
    timeoutMs,
  };
}

function toAiSettingsDto(config: ResolvedAiConfig): AiSettings {
  return {
    enabled: config.enabled,
    hasCustomConfig: config.hasCustomConfig,
    apiKeySource: config.apiKeySource,
    hasApiKey: config.apiKey.length > 0,
    maskedApiKey: maskApiKey(config.apiKey),
    baseUrl: config.baseUrl,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    customHeaders: config.customHeaders,
    timeoutMs: config.timeoutMs,
    envDefaults: {
      hasApiKey: env.aiApiKey.length > 0,
      baseUrl: env.aiBaseUrl,
      model: env.aiModel,
      reasoningEffort: env.aiReasoningEffort,
      customHeaders: envCustomHeaders(),
      timeoutMs: env.aiTimeoutMs,
    },
    updatedAt: config.updatedAt,
  };
}

export async function getAiSettings(db: AppDb): Promise<AiSettings> {
  const config = await resolveAiConfig(db);
  return toAiSettingsDto(config);
}

export async function updateAiSettings(
  db: AppDb,
  input: AiSettingsUpdateRequest,
): Promise<AiSettings> {
  const existingRecord = await readStoredAiSettings(db);
  const next: StoredAiSettings = { ...(existingRecord?.stored ?? {}) };

  if (input.apiKey === null) {
    delete next.apiKey;
  } else if (typeof input.apiKey === 'string') {
    const trimmed = input.apiKey.trim();
    if (trimmed) {
      next.apiKey = trimmed;
    }
  }

  if (input.baseUrl !== undefined) {
    const normalized = normalizeBaseUrl(input.baseUrl);
    if (normalized) next.baseUrl = normalized;
    else delete next.baseUrl;
  }

  if (input.model !== undefined) {
    const trimmed = input.model.trim();
    if (trimmed) next.model = trimmed;
    else delete next.model;
  }

  if (input.reasoningEffort !== undefined) {
    next.reasoningEffort = input.reasoningEffort.trim();
  }

  if (input.customHeaders !== undefined) {
    next.customHeaders = sanitizeCustomHeaders(input.customHeaders);
    delete next.sessionId;
  }

  if (input.timeoutMs !== undefined) {
    next.timeoutMs = input.timeoutMs;
  }

  const now = new Date();
  const serialized = JSON.stringify(next);

  await db
    .insert(appMeta)
    .values({
      key: AI_SETTINGS_META_KEY,
      value: serialized,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: {
        value: serialized,
        updatedAt: now,
      },
    });

  return getAiSettings(db);
}

export async function resetAiSettings(db: AppDb): Promise<AiSettings> {
  await db.delete(appMeta).where(eq(appMeta.key, AI_SETTINGS_META_KEY));
  return getAiSettings(db);
}
