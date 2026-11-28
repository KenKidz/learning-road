<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  AiInterviewReviewResponse,
  InterviewQuestion,
  InterviewTopic,
} from '@shared/types';
import {
  getReviewIntervalDays,
  isQuestionDue,
  sortDueQuestions,
} from '@shared/spaced-repetition';
import { api, ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useToast } from '../composables/useToast';
import EmptyState from './EmptyState.vue';
import ProgressBar from './ProgressBar.vue';
import Icon from './Icon.vue';

type PracticeScope = 'due' | 'weak' | 'all';

interface PracticeCard {
  topic: InterviewTopic;
  question: InterviewQuestion;
}

const props = defineProps<{
  topics: InterviewTopic[];
}>();

const emit = defineEmits<{
  updated: [];
}>();

const { t } = useI18n();
const toast = useToast();

const scope = ref<PracticeScope>('due');
const selectedTopicId = ref<string>('all');
const queue = ref<PracticeCard[]>([]);
const cursor = ref(0);
const flipped = ref(false);
const draftAnswer = ref('');
const saveDraftOnRate = ref(false);
const saving = ref(false);
const aiReviewing = ref(false);
const aiReview = ref<AiInterviewReviewResponse | null>(null);
const reviewedRatings = ref<number[]>([]);
const roundDone = ref(false);

const allCards = computed<PracticeCard[]>(() =>
  props.topics.flatMap((topic) =>
    topic.questions.map((question) => ({ topic, question })),
  ),
);

const dueTotalCount = computed(
  () => allCards.value.filter((item) => isQuestionDue(item.question)).length,
);

const weakTotalCount = computed(
  () =>
    allCards.value.filter(
      (item) => item.question.confidenceLevel === null || item.question.confidenceLevel <= 3,
    ).length,
);

function buildQueue() {
  const now = new Date();
  let pool = allCards.value;
  if (selectedTopicId.value !== 'all') {
    pool = pool.filter((item) => String(item.topic.id) === selectedTopicId.value);
  }
  if (scope.value === 'due') {
    pool = pool.filter((item) => isQuestionDue(item.question, now));
  } else if (scope.value === 'weak') {
    pool = pool.filter(
      (item) => item.question.confidenceLevel === null || item.question.confidenceLevel <= 3,
    );
  }
  const sortedQuestions = sortDueQuestions(
    pool.map((item) => item.question),
    now,
  );
  const byId = new Map(pool.map((item) => [item.question.id, item]));
  queue.value = sortedQuestions
    .map((q) => byId.get(q.id))
    .filter((item): item is PracticeCard => Boolean(item));
  cursor.value = 0;
  flipped.value = false;
  draftAnswer.value = '';
  saveDraftOnRate.value = false;
  aiReview.value = null;
  reviewedRatings.value = [];
  roundDone.value = false;
}

watch([scope, selectedTopicId], buildQueue, { immediate: true });

watch(
  () => props.topics,
  () => {
    if (queue.value.length === 0 && !roundDone.value) {
      buildQueue();
    }
  },
);

const currentCard = computed<PracticeCard | null>(() =>
  !roundDone.value ? queue.value[cursor.value] ?? null : null,
);

const progressPercent = computed(() => {
  if (queue.value.length === 0) return 0;
  const doneCount = roundDone.value ? queue.value.length : cursor.value;
  return Math.round((doneCount / queue.value.length) * 100);
});

const avgRating = computed(() => {
  if (reviewedRatings.value.length === 0) return 0;
  const sum = reviewedRatings.value.reduce((acc, n) => acc + n, 0);
  return (sum / reviewedRatings.value.length).toFixed(1);
});

function flipCard() {
  if (!currentCard.value) return;
  flipped.value = !flipped.value;
}

async function runAiReview() {
  if (!currentCard.value || aiReviewing.value) return;
  aiReviewing.value = true;
  try {
    const answerText = draftAnswer.value.trim() || currentCard.value.question.answer;
    aiReview.value = await api.aiInterviewReview({
      questionId: currentCard.value.question.id,
      answer: answerText,
    });
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    aiReviewing.value = false;
  }
}

async function applyAiImprovedAnswer() {
  if (!currentCard.value || !aiReview.value) return;
  try {
    const updated = await api.updateQuestion(currentCard.value.question.id, {
      answer: aiReview.value.improvedAnswer,
      confidenceLevel: aiReview.value.suggestedConfidence,
    });
    currentCard.value.question.answer = updated.answer;
    currentCard.value.question.confidenceLevel = updated.confidenceLevel;
    toast.success(t('ai.interviewAppliedToast'));
    emit('updated');
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function rateCard(level: number) {
  if (!currentCard.value || saving.value) return;
  saving.value = true;
  try {
    const payload: Record<string, unknown> = {
      confidenceLevel: level,
      lastReviewedAt: new Date().toISOString(),
    };
    if (saveDraftOnRate.value && draftAnswer.value.trim()) {
      payload.answer = draftAnswer.value.trim();
    }
    const updated = await api.updateQuestion(currentCard.value.question.id, payload);
    currentCard.value.question.confidenceLevel = updated.confidenceLevel;
    currentCard.value.question.lastReviewedAt = updated.lastReviewedAt;
    currentCard.value.question.answer = updated.answer;
    reviewedRatings.value.push(level);
    emit('updated');

    if (cursor.value + 1 < queue.value.length) {
      cursor.value += 1;
      flipped.value = false;
      draftAnswer.value = '';
      saveDraftOnRate.value = false;
      aiReview.value = null;
    } else {
      roundDone.value = true;
    }
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    saving.value = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  const tag = (event.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (!currentCard.value) return;

  if (event.code === 'Space') {
    event.preventDefault();
    flipCard();
  } else if (flipped.value && ['1', '2', '3', '4', '5'].includes(event.key)) {
    event.preventDefault();
    void rateCard(Number(event.key));
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div class="stack">
    <div class="card compact">
      <div class="row-between wrap" style="gap: 10px">
        <div class="tabs tabs-full">
          <button
            type="button"
            class="tab"
            :class="{ active: scope === 'due' }"
            @click="scope = 'due'"
          >
            {{ $t('practice.scopeDue') }}
            <span class="badge badge-info tabular" style="margin-left: 4px">{{ dueTotalCount }}</span>
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: scope === 'weak' }"
            @click="scope = 'weak'"
          >
            {{ $t('practice.scopeWeak') }} ({{ weakTotalCount }})
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: scope === 'all' }"
            @click="scope = 'all'"
          >
            {{ $t('common.all') }} ({{ allCards.length }})
          </button>
        </div>

        <div class="filter-controls" style="gap: 8px">
          <select
            v-model="selectedTopicId"
            class="select input-sm filter-select"
            :aria-label="$t('practice.filterTopic')"
          >
            <option value="all">{{ $t('practice.allTopics') }}</option>
            <option v-for="topic in topics" :key="topic.id" :value="String(topic.id)">
              {{ topic.name }} ({{ topic.questions.length }})
            </option>
          </select>
          <button type="button" class="btn btn-sm" @click="buildQueue">
            <Icon name="refresh" :size="14" /> {{ $t('practice.restart') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="allCards.length === 0" class="card">
      <EmptyState
        :title="$t('interview.noQuestionsTitle')"
        :text="$t('interview.noQuestionsText')"
        icon="interview"
      />
    </div>

    <div v-else-if="queue.length === 0" class="card">
      <EmptyState
        :title="$t('practice.emptyDueTitle')"
        :text="$t('practice.emptyDueText')"
        icon="check-circle"
      >
        <button
          v-if="scope !== 'all'"
          type="button"
          class="btn btn-primary btn-sm"
          @click="scope = 'all'"
        >
          {{ $t('practice.practiceAll') }}
        </button>
      </EmptyState>
    </div>

    <div v-else-if="roundDone" class="card">
      <EmptyState
        :title="$t('practice.completeTitle')"
        :text="$t('practice.completeText', { count: reviewedRatings.length, avg: avgRating })"
        icon="check-circle"
      >
        <button type="button" class="btn btn-primary btn-sm" @click="buildQueue">
          {{ $t('practice.anotherRound') }}
        </button>
      </EmptyState>
    </div>

    <article v-else-if="currentCard" class="card flashcard">
      <div class="row-between wrap" style="gap: 8px">
        <div class="row wrap" style="gap: 6px">
          <span class="badge badge-info">{{ currentCard.topic.category }}</span>
          <span class="badge badge-outline">{{ currentCard.topic.name }}</span>
          <span class="badge badge-neutral tabular">
            {{
              currentCard.question.confidenceLevel
                ? $t('interview.confidenceValue', { level: currentCard.question.confidenceLevel })
                : $t('interview.notRated')
            }}
          </span>
        </div>
        <span class="muted tabular">
          {{ $t('practice.cardCounter', { current: cursor + 1, total: queue.length }) }}
        </span>
      </div>

      <div class="mt-12">
        <ProgressBar :value="progressPercent" size="sm" tone="accent" />
      </div>

      <h2 class="flashcard-question mt-16">{{ currentCard.question.question }}</h2>
      <p class="card-hint mt-8 tabular">
        {{ $t('interview.questionReviewed', { date: formatDateTime(currentCard.question.lastReviewedAt) }) }}
      </p>

      <div class="field mt-16">
        <label class="field-label" for="practice-draft">{{ $t('practice.draftLabel') }}</label>
        <textarea
          id="practice-draft"
          v-model="draftAnswer"
          class="textarea"
          :placeholder="$t('practice.draftPlaceholder')"
        />
      </div>

      <div class="row wrap mt-16" style="gap: 8px">
        <button type="button" class="btn btn-primary" @click="flipCard">
          <Icon name="flip" :size="15" />
          {{ flipped ? $t('practice.hideAnswer') : $t('practice.showAnswer') }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="aiReviewing"
          @click="runAiReview"
        >
          <span v-if="aiReviewing" class="spinner" />
          <Icon v-else name="sparkles" :size="15" />
          {{ aiReviewing ? $t('ai.interviewReviewing') : $t('ai.interviewReviewBtn') }}
        </button>
        <span class="kbd kbd-desktop-only" style="margin-left: auto">{{ $t('practice.shortcutHint') }}</span>
      </div>

      <div v-if="flipped" class="feature-card mt-16">
        <div class="field-label">{{ $t('practice.savedAnswerTitle') }}</div>
        <p v-if="currentCard.question.answer.trim()" class="mt-8" style="white-space: pre-line">
          {{ currentCard.question.answer }}
        </p>
        <p v-else class="muted mt-8">{{ $t('practice.noSavedAnswer') }}</p>

        <label v-if="draftAnswer.trim()" class="check-item mt-12" style="border: 0; padding: 4px 0">
          <input v-model="saveDraftOnRate" type="checkbox" />
          <span class="check-label">{{ $t('practice.overwriteWithDraft') }}</span>
        </label>
      </div>

      <div v-if="aiReview" class="ai-review-box mt-16">
        <div class="row-between wrap" style="gap: 8px">
          <strong>{{ $t('ai.interviewResultTitle') }}</strong>
          <span class="badge badge-info tabular">
            {{ $t('ai.interviewSuggestedConfidence', { level: aiReview.suggestedConfidence }) }}
          </span>
        </div>
        <p class="mt-8">{{ aiReview.summary }}</p>
        <div v-if="aiReview.missingPoints.length > 0" class="ai-callout missing mt-12">
          <div class="field-label">{{ $t('ai.interviewMissing') }}</div>
          <ul class="stack-sm mt-8">
            <li v-for="(point, idx) in aiReview.missingPoints" :key="idx" class="text-soft">
              • {{ point }}
            </li>
          </ul>
        </div>
        <div class="mt-12">
          <div class="row-between wrap" style="gap: 8px">
            <span class="field-label">{{ $t('ai.interviewImprovedAnswer') }}</span>
            <button type="button" class="btn btn-sm" @click="applyAiImprovedAnswer">
              {{ $t('ai.interviewApplyAnswer') }}
            </button>
          </div>
          <p class="text-soft mt-8" style="white-space: pre-line">{{ aiReview.improvedAnswer }}</p>
        </div>
      </div>

      <div v-if="flipped" class="divider" />

      <div v-if="flipped" class="stack-sm">
        <div class="field-label">{{ $t('practice.ratePrompt') }}</div>
        <div class="practice-rating-grid">
          <button
            v-for="level in [1, 2, 3, 4, 5]"
            :key="level"
            type="button"
            class="btn btn-sm"
            :disabled="saving"
            @click="rateCard(level)"
          >
            <strong class="tabular">{{ level }}</strong>
            <span class="muted tabular">({{ getReviewIntervalDays(level) }}d)</span>
          </button>
        </div>
      </div>
    </article>
  </div>
</template>
