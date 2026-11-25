export interface ReviewableQuestion {
  confidenceLevel: number | null;
  lastReviewedAt: string | Date | null;
}

const INTERVAL_DAYS: Record<number, number> = {
  0: 1,
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getReviewIntervalDays(confidenceLevel: number | null | undefined): number {
  if (confidenceLevel === null || confidenceLevel === undefined) return 1;
  const clamped = Math.max(0, Math.min(5, Math.round(confidenceLevel)));
  return INTERVAL_DAYS[clamped] ?? 1;
}

function toTimestamp(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function getNextReviewAt(question: ReviewableQuestion): Date | null {
  const lastMs = toTimestamp(question.lastReviewedAt);
  if (lastMs === null) return null;
  const days = getReviewIntervalDays(question.confidenceLevel);
  return new Date(lastMs + days * DAY_MS);
}

export function isQuestionDue(question: ReviewableQuestion, now: Date = new Date()): boolean {
  const next = getNextReviewAt(question);
  if (!next) return true;
  return next.getTime() <= now.getTime();
}

export function getDaysOverdue(question: ReviewableQuestion, now: Date = new Date()): number {
  const next = getNextReviewAt(question);
  if (!next) return 9999;
  const diff = now.getTime() - next.getTime();
  return Math.max(0, Math.floor(diff / DAY_MS));
}

export function sortDueQuestions<T extends ReviewableQuestion>(
  items: T[],
  now: Date = new Date(),
): T[] {
  return [...items].sort((a, b) => {
    const dueA = isQuestionDue(a, now) ? 0 : 1;
    const dueB = isQuestionDue(b, now) ? 0 : 1;
    if (dueA !== dueB) return dueA - dueB;

    const confA = a.confidenceLevel ?? 0;
    const confB = b.confidenceLevel ?? 0;
    if (confA !== confB) return confA - confB;

    const timeA = toTimestamp(a.lastReviewedAt) ?? 0;
    const timeB = toTimestamp(b.lastReviewedAt) ?? 0;
    return timeA - timeB;
  });
}
