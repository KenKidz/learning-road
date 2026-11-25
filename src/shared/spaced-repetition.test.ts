import { describe, expect, it } from 'vitest';
import {
  getDaysOverdue,
  getNextReviewAt,
  getReviewIntervalDays,
  isQuestionDue,
  sortDueQuestions,
} from './spaced-repetition';

describe('spaced repetition scheduler', () => {
  it('maps confidence levels to deterministic day intervals', () => {
    expect(getReviewIntervalDays(null)).toBe(1);
    expect(getReviewIntervalDays(1)).toBe(1);
    expect(getReviewIntervalDays(2)).toBe(3);
    expect(getReviewIntervalDays(3)).toBe(7);
    expect(getReviewIntervalDays(4)).toBe(14);
    expect(getReviewIntervalDays(5)).toBe(30);
  });

  it('marks unreviewed questions as immediately due and computes next review date', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    expect(isQuestionDue({ confidenceLevel: null, lastReviewedAt: null }, now)).toBe(true);
    expect(getNextReviewAt({ confidenceLevel: 3, lastReviewedAt: null })).toBeNull();

    const recent = { confidenceLevel: 4, lastReviewedAt: '2026-11-20T12:00:00Z' };
    expect(isQuestionDue(recent, now)).toBe(false);
    expect(getDaysOverdue(recent, now)).toBe(0);

    const overdue = { confidenceLevel: 2, lastReviewedAt: '2026-11-20T12:00:00Z' };
    expect(isQuestionDue(overdue, now)).toBe(true);
    expect(getDaysOverdue(overdue, now)).toBe(2);
  });

  it('sorts due and low-confidence questions ahead of mastered future questions', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    const items = [
      { id: 'future-high', confidenceLevel: 5, lastReviewedAt: '2026-11-24T12:00:00Z' },
      { id: 'due-mid', confidenceLevel: 3, lastReviewedAt: '2026-11-10T12:00:00Z' },
      { id: 'never', confidenceLevel: null, lastReviewedAt: null },
    ];
    const sorted = sortDueQuestions(items, now);
    expect(sorted.map((x) => x.id)).toEqual(['never', 'due-mid', 'future-high']);
  });
});
