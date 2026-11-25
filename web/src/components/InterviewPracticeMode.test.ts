// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import InterviewPracticeMode from './InterviewPracticeMode.vue';
import { i18n } from '../i18n';
import type { InterviewTopic } from '@shared/types';

const updateQuestionMock = vi.fn().mockResolvedValue({
  id: 10,
  topicId: 1,
  question: 'What is a closure?',
  answer: 'A function bundled with its lexical scope.',
  confidenceLevel: 4,
  lastReviewedAt: '2026-11-25T10:00:00.000Z',
  createdAt: '2026-11-25T09:00:00.000Z',
  updatedAt: '2026-11-25T10:00:00.000Z',
});

vi.mock('../lib/api', () => ({
  ApiError: class extends Error {},
  api: {
    updateQuestion: (...args: unknown[]) => updateQuestionMock(...args),
    aiInterviewReview: vi.fn(),
  },
}));

const sampleTopics: InterviewTopic[] = [
  {
    id: 1,
    name: 'JavaScript Core',
    category: 'Frontend',
    status: 'reviewing',
    lastReviewedAt: null,
    notes: '',
    sortOrder: 0,
    isSeeded: true,
    createdAt: '2026-11-25T09:00:00.000Z',
    updatedAt: '2026-11-25T09:00:00.000Z',
    questions: [
      {
        id: 10,
        topicId: 1,
        question: 'What is a closure?',
        answer: 'A function bundled with its lexical scope.',
        confidenceLevel: null,
        lastReviewedAt: null,
        createdAt: '2026-11-25T09:00:00.000Z',
        updatedAt: '2026-11-25T09:00:00.000Z',
      },
    ],
  },
];

describe('InterviewPracticeMode', () => {
  it('hides answer until flipped and saves confidence rating', async () => {
    const wrapper = mount(InterviewPracticeMode, {
      global: {
        plugins: [i18n],
      },
      props: {
        topics: sampleTopics,
      },
    });

    expect(wrapper.text()).toContain('What is a closure?');
    expect(wrapper.text()).not.toContain('A function bundled with its lexical scope.');

    const flipBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Hiện đáp án') || b.text().includes('Show answer'));
    expect(flipBtn).toBeTruthy();
    await flipBtn!.trigger('click');

    expect(wrapper.text()).toContain('A function bundled with its lexical scope.');

    const rate4Btn = wrapper.findAll('button').find((b) => b.text().includes('(14d)'));
    expect(rate4Btn).toBeTruthy();
    await rate4Btn!.trigger('click');

    expect(updateQuestionMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ confidenceLevel: 4 }),
    );
  });
});
