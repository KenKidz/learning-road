import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeTestDb, createTestDb, type AppDb } from '../db/client';
import { seedDatabase } from '../db/seed';
import { interviewQuestions } from '../db/schema';
import { resetAiSettings, updateAiSettings } from './ai-settings';
import {
  isUnsupportedTemperatureError,
  reviewInterviewAnswer,
  setAiProviderForTests,
  streamWeeklyCoaching,
  testAiConnection,
} from './ai';

let db: AppDb;
let sampleQuestionId: number;

beforeAll(async () => {
  db = await createTestDb();
  await seedDatabase(db);
  const [question] = await db.select({ id: interviewQuestions.id }).from(interviewQuestions).limit(1);
  sampleQuestionId = question!.id;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setAiProviderForTests(null);
  await resetAiSettings(db);
});

afterAll(async () => {
  await closeTestDb();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`),
        );
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('isUnsupportedTemperatureError', () => {
  it('matches provider errors where only default temperature is supported', () => {
    expect(
      isUnsupportedTemperatureError(
        "Unsupported value: 'temperature' does not support 0.25 with this model. Only the default (1) value is supported.",
      ),
    ).toBe(true);
    expect(
      isUnsupportedTemperatureError("Unsupported parameter: 'temperature' is not supported with this model."),
    ).toBe(true);
    expect(
      isUnsupportedTemperatureError('temperature may only be set to 1 when thinking is enabled'),
    ).toBe(true);
  });

  it('ignores unrelated or range errors', () => {
    expect(isUnsupportedTemperatureError('temperature must be between 0 and 1')).toBe(false);
    expect(isUnsupportedTemperatureError("Unsupported parameter: 'reasoning_effort'")).toBe(false);
  });
});

describe('AI request temperature handling', () => {
  it('omits temperature by default when unset in settings and env', async () => {
    const previousTemp = process.env.AI_TEMPERATURE;
    delete process.env.AI_TEMPERATURE;

    const capturedBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestedConfidence: 4,
                  summary: 'Good explanation.',
                  strengths: ['Clear'],
                  missingPoints: ['Edge cases'],
                  improvedAnswer: 'Improved answer.',
                  followUpQuestions: ['Follow up?'],
                }),
              },
            },
          ],
        });
      }),
    );

    try {
      await updateAiSettings(db, {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5-mini',
        temperature: null,
      });

      const result = await reviewInterviewAnswer(db, {
        questionId: sampleQuestionId,
        answer: 'Closures capture lexical scope.',
      });

      expect(result.suggestedConfidence).toBe(4);
      expect(capturedBodies).toHaveLength(1);
      expect('temperature' in capturedBodies[0]!).toBe(false);
    } finally {
      if (previousTemp !== undefined) process.env.AI_TEMPERATURE = previousTemp;
    }
  });

  it('sends configured temperature including 0 in completion and stream requests', async () => {
    const capturedBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        capturedBodies.push(body);
        if (body.stream) {
          return sseResponse(['Hello ', 'world']);
        }
        return jsonResponse({ choices: [{ message: { content: 'OK' } }] });
      }),
    );

    await updateAiSettings(db, {
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 0,
    });

    await testAiConnection(db);
    const chunks: string[] = [];
    for await (const chunk of streamWeeklyCoaching(db, {})) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello world');
    expect(capturedBodies).toHaveLength(2);
    expect(capturedBodies[0]!.temperature).toBe(0);
    expect(capturedBodies[1]!.temperature).toBe(0);
  });

  it('retries without temperature when provider rejects custom temperature with 400 (complete & stream)', async () => {
    const capturedBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        capturedBodies.push(body);
        if ('temperature' in body && body.temperature !== 1) {
          return jsonResponse(
            {
              error: {
                message:
                  "Unsupported value: 'temperature' does not support 0.25 with this model. Only the default (1) value is supported.",
              },
            },
            400,
          );
        }
        if (body.stream) {
          return sseResponse(['Streamed OK']);
        }
        return jsonResponse({ choices: [{ message: { content: 'OK' } }] });
      }),
    );

    await updateAiSettings(db, {
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      temperature: 0.25,
    });

    const testResult = await testAiConnection(db);
    expect(testResult.ok).toBe(true);

    const chunks: string[] = [];
    for await (const chunk of streamWeeklyCoaching(db, {})) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('Streamed OK');

    expect(capturedBodies).toHaveLength(4);
    expect(capturedBodies[0]!.temperature).toBe(0.25);
    expect('temperature' in capturedBodies[1]!).toBe(false);
    expect(capturedBodies[2]!.temperature).toBe(0.25);
    expect('temperature' in capturedBodies[3]!).toBe(false);
  });

  it('does not retry on unrelated 400 errors', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: 'temperature must be between 0 and 1' } }, 400),
    );
    vi.stubGlobal('fetch', fetchMock);

    await updateAiSettings(db, {
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'claude-sonnet',
      temperature: 1.5,
    });

    await expect(testAiConnection(db)).rejects.toThrow('temperature must be between 0 and 1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
