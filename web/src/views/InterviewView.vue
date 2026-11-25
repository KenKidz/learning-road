<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  AiInterviewReviewResponse,
  InterviewChecklistItem,
  InterviewQuestion,
  InterviewStatus,
  InterviewTopic,
} from '@shared/types';
import { INTERVIEW_STATUSES } from '@shared/types';
import { api, ApiError } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { interviewStatusLabels } from '../lib/labels';
import { useToast } from '../composables/useToast';
import { confirmAction } from '../composables/useConfirm';
import PageHeader from '../components/PageHeader.vue';
import StatCard from '../components/StatCard.vue';
import EmptyState from '../components/EmptyState.vue';
import BaseModal from '../components/BaseModal.vue';
import Icon from '../components/Icon.vue';

const toast = useToast();
const { t } = useI18n();

const topics = ref<InterviewTopic[]>([]);
const checklist = ref<InterviewChecklistItem[]>([]);
const loading = ref(true);
const error = ref('');
const busy = ref(false);
const formError = ref('');
const tab = ref<'topics' | 'checklist'>('topics');
const showTopicModal = ref(false);
const editingTopic = ref<InterviewTopic | null>(null);
const newQuestion = reactive<Record<number, string>>({});
const aiReviews = reactive<Record<number, AiInterviewReviewResponse>>({});
const aiReviewingId = ref<number | null>(null);
const checklistForm = reactive({ title: '', category: 'General' });
const topicForm = reactive({
  name: '',
  category: 'Frontend',
  status: 'not_reviewed' as InterviewStatus,
  notes: '',
});

const topicSearch = ref('');
const categoryFilter = ref('all');
const statusFilter = ref<'all' | InterviewStatus>('all');
const expandedTopicIds = ref<Set<number>>(new Set());
const savedQuestionSnapshots = reactive<Record<number, { answer: string; confidenceLevel: number | null }>>({});

const categories = computed(() => {
  const set = new Set<string>();
  for (const topic of topics.value) set.add(topic.category);
  return Array.from(set);
});

const filteredTopics = computed(() => {
  const query = topicSearch.value.trim().toLowerCase();
  return topics.value.filter((topic) => {
    if (categoryFilter.value !== 'all' && topic.category !== categoryFilter.value) return false;
    if (statusFilter.value !== 'all' && topic.status !== statusFilter.value) return false;
    if (query) {
      const qMatch = topic.questions.some((q) => q.question.toLowerCase().includes(query));
      const haystack = `${topic.name} ${topic.category} ${topic.notes}`.toLowerCase();
      if (!haystack.includes(query) && !qMatch) return false;
    }
    return true;
  });
});

const groupedChecklist = computed(() => {
  const groups = new Map<string, InterviewChecklistItem[]>();
  for (const item of checklist.value) {
    const key = item.category || 'General';
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([category, items]) => ({
    category,
    items,
    done: items.filter((item) => item.isCompleted).length,
  }));
});

const questionCount = computed(() =>
  topics.value.reduce((total, topic) => total + topic.questions.length, 0),
);
const masteredCount = computed(
  () => topics.value.filter((topic) => topic.status === 'mastered').length,
);
const reviewingCount = computed(
  () => topics.value.filter((topic) => topic.status === 'reviewing').length,
);
const checklistDone = computed(() => checklist.value.filter((item) => item.isCompleted).length);
const checklistProgress = computed(() =>
  checklist.value.length ? Math.round((checklistDone.value / checklist.value.length) * 100) : 0,
);

function syncSnapshots(list: InterviewTopic[]) {
  for (const topic of list) {
    for (const q of topic.questions) {
      savedQuestionSnapshots[q.id] = {
        answer: q.answer,
        confidenceLevel: q.confidenceLevel ?? null,
      };
    }
  }
}

function isQuestionDirty(question: InterviewQuestion): boolean {
  const snap = savedQuestionSnapshots[question.id];
  if (!snap) return false;
  return (
    snap.answer !== question.answer ||
    (snap.confidenceLevel ?? null) !== (question.confidenceLevel ?? null)
  );
}

function isTopicExpanded(topicId: number): boolean {
  return expandedTopicIds.value.has(topicId);
}

function toggleTopic(topicId: number) {
  const next = new Set(expandedTopicIds.value);
  if (next.has(topicId)) next.delete(topicId);
  else next.add(topicId);
  expandedTopicIds.value = next;
}

function expandAllTopics() {
  expandedTopicIds.value = new Set(filteredTopics.value.map((t) => t.id));
}

function collapseAllTopics() {
  expandedTopicIds.value = new Set();
}

async function load(initExpand = false) {
  loading.value = true;
  error.value = '';
  try {
    const response = await api.interview();
    topics.value = response.topics;
    checklist.value = response.checklist;
    syncSnapshots(response.topics);
    if (initExpand) {
      const reviewing = response.topics.filter((topic) => topic.status === 'reviewing');
      if (reviewing.length > 0) {
        expandedTopicIds.value = new Set(reviewing.map((t) => t.id));
      } else if (response.topics[0]) {
        expandedTopicIds.value = new Set([response.topics[0].id]);
      }
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.interviewLoad');
  } finally {
    loading.value = false;
  }
}

function openTopicCreate() {
  editingTopic.value = null;
  topicForm.name = '';
  topicForm.category = 'Frontend';
  topicForm.status = 'not_reviewed';
  topicForm.notes = '';
  formError.value = '';
  showTopicModal.value = true;
}

function openTopicEdit(topic: InterviewTopic) {
  editingTopic.value = topic;
  topicForm.name = topic.name;
  topicForm.category = topic.category;
  topicForm.status = topic.status;
  topicForm.notes = topic.notes;
  formError.value = '';
  showTopicModal.value = true;
}

async function saveTopic() {
  if (!topicForm.name.trim() || !topicForm.category.trim()) {
    formError.value = t('interview.nameRequired');
    return;
  }
  busy.value = true;
  formError.value = '';
  try {
    const payload = {
      name: topicForm.name.trim(),
      category: topicForm.category.trim(),
      status: topicForm.status,
      notes: topicForm.notes.trim(),
    };
    if (editingTopic.value) {
      await api.updateInterviewTopic(editingTopic.value.id, payload);
      toast.success(t('interview.topicSaved'));
    } else {
      const created = await api.createInterviewTopic(payload);
      expandedTopicIds.value = new Set([...expandedTopicIds.value, created.id]);
      toast.success(t('interview.topicCreated'));
    }
    showTopicModal.value = false;
    await load();
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    busy.value = false;
  }
}

async function removeTopic(topic: InterviewTopic) {
  const confirmed = await confirmAction({
    title: t('interview.deleteTopicTitle'),
    message: t('interview.deleteTopicText', { name: topic.name }),
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteInterviewTopic(topic.id);
    toast.success(t('interview.topicDeleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function changeTopicStatus(topic: InterviewTopic, event: Event) {
  const status = (event.target as HTMLSelectElement).value as InterviewStatus;
  if (status === topic.status) return;
  try {
    await api.updateInterviewTopic(topic.id, { status });
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function markReviewed(topic: InterviewTopic) {
  try {
    await api.updateInterviewTopic(topic.id, { lastReviewedAt: new Date().toISOString() });
    toast.success(t('interview.reviewedDateSaved', { name: topic.name }));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

function setConfidence(question: InterviewQuestion, level: number) {
  question.confidenceLevel = question.confidenceLevel === level ? null : level;
}

async function saveQuestion(question: InterviewQuestion) {
  try {
    const confidence =
      question.confidenceLevel === null || question.confidenceLevel === undefined
        ? null
        : Number(question.confidenceLevel);
    await api.updateQuestion(question.id, {
      answer: question.answer,
      confidenceLevel: confidence,
    });
    toast.success(t('interview.answerSaved'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function markQuestionReviewed(question: InterviewQuestion) {
  try {
    await api.updateQuestion(question.id, { lastReviewedAt: new Date().toISOString() });
    await load();
    toast.success(t('interview.questionReviewedSaved'));
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function addQuestion(topic: InterviewTopic) {
  const text = (newQuestion[topic.id] ?? '').trim();
  if (!text) return;
  try {
    await api.createQuestion(topic.id, { question: text, answer: '' });
    newQuestion[topic.id] = '';
    expandedTopicIds.value = new Set([...expandedTopicIds.value, topic.id]);
    toast.success(t('interview.questionAdded'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function removeQuestion(question: InterviewQuestion) {
  const confirmed = await confirmAction({
    title: t('interview.deleteQuestionTitle'),
    message: t('interview.deleteQuestionText'),
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteQuestion(question.id);
    toast.success(t('interview.questionDeleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function toggleChecklistItem(item: InterviewChecklistItem) {
  try {
    await api.updateChecklistItem(item.id, { isCompleted: !item.isCompleted });
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function addChecklistItem() {
  if (!checklistForm.title.trim()) return;
  try {
    await api.createChecklistItem({
      title: checklistForm.title.trim(),
      category: checklistForm.category.trim() || 'General',
    });
    checklistForm.title = '';
    toast.success(t('interview.knowledgeAdded'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function removeChecklistItem(item: InterviewChecklistItem) {
  const confirmed = await confirmAction({
    title: t('interview.deleteKnowledgeTitle'),
    message: item.title,
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteChecklistItem(item.id);
    toast.success(t('interview.knowledgeDeleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

function confidenceLabel(level: number | null): string {
  if (!level) return t('interview.notRated');
  return t('interview.confidenceValue', { level });
}

async function reviewWithAi(question: InterviewQuestion) {
  if (aiReviewingId.value !== null) return;
  aiReviewingId.value = question.id;
  try {
    const result = await api.aiInterviewReview({
      questionId: question.id,
      answer: question.answer,
    });
    aiReviews[question.id] = result;
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    aiReviewingId.value = null;
  }
}

async function applyAiReview(question: InterviewQuestion) {
  const review = aiReviews[question.id];
  if (!review) return;
  question.answer = review.improvedAnswer;
  question.confidenceLevel = review.suggestedConfidence;
  try {
    await api.updateQuestion(question.id, {
      answer: review.improvedAnswer,
      confidenceLevel: review.suggestedConfidence,
    });
    toast.success(t('ai.interviewAppliedToast'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function addFollowUpQuestion(topic: InterviewTopic, followUp: string) {
  const trimmed = followUp.trim();
  if (!trimmed) return;
  try {
    await api.createQuestion(topic.id, { question: trimmed, answer: '' });
    toast.success(t('interview.questionAdded'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

onMounted(() => void load(true));
</script>

<template>
  <PageHeader
    :title="$t('nav.interview')"
    :subtitle="$t('interview.subtitle')"
  >
    <template #actions>
      <button type="button" class="btn" :disabled="loading" @click="load()">
        <Icon name="refresh" :size="16" /> {{ $t('common.refresh') }}
      </button>
      <button type="button" class="btn btn-primary" @click="openTopicCreate">
        <Icon name="plus" :size="16" /> {{ $t('interview.addTopic') }}
      </button>
    </template>
  </PageHeader>

  <div v-if="loading" class="stack">
    <div class="skeleton skeleton-card" />
    <div class="skeleton" style="height: 320px" />
  </div>

  <div v-else-if="error" class="card">
    <EmptyState :title="$t('errors.interviewLoad')" :text="error" icon="alert">
      <button type="button" class="btn btn-primary" @click="load(true)">{{ $t('common.retry') }}</button>
    </EmptyState>
  </div>

  <template v-else>
    <div class="grid stats-grid">
      <StatCard
        :label="$t('interview.mastered')"
        :value="`${masteredCount}/${topics.length}`"
        icon="check-circle"
        tone="success"
      />
      <StatCard
        :label="$t('dashboard.reviewing')"
        :value="reviewingCount"
        icon="interview"
        tone="info"
      />
      <StatCard
        :label="$t('dashboard.questions')"
        :value="questionCount"
        icon="book"
      />
      <StatCard
        :label="$t('interview.checklist')"
        :value="`${checklistDone}/${checklist.length}`"
        :progress="checklistProgress"
        :tone="checklistProgress === 100 ? 'success' : 'accent'"
      />
    </div>

    <div class="row-between wrap mt-16" style="gap: 10px">
      <div class="tabs">
        <button type="button" class="tab" :class="{ active: tab === 'topics' }" @click="tab = 'topics'">
          {{ $t('interview.topicsTab') }}
        </button>
        <button type="button" class="tab" :class="{ active: tab === 'checklist' }" @click="tab = 'checklist'">
          {{ $t('interview.checklist') }}
        </button>
      </div>

      <div v-if="tab === 'topics' && topics.length > 0" class="row wrap" style="gap: 8px">
        <button type="button" class="btn btn-sm" @click="expandAllTopics">{{ $t('common.expandAll') }}</button>
        <button type="button" class="btn btn-sm" @click="collapseAllTopics">{{ $t('common.collapseAll') }}</button>
      </div>
    </div>

    <div v-if="tab === 'topics'" class="stack mt-16">
      <div v-if="topics.length > 0" class="card compact">
        <div class="row wrap" style="gap: 10px">
          <div class="input-wrap" style="max-width: 280px">
            <Icon name="search" :size="15" class="input-icon-left" />
            <input
              v-model="topicSearch"
              class="input input-sm input-has-left"
              :class="{ 'input-has-right': topicSearch }"
              type="search"
              :placeholder="$t('interview.searchPlaceholder')"
              :aria-label="$t('interview.searchPlaceholder')"
            />
            <button
              v-if="topicSearch"
              type="button"
              class="input-action-right"
              :aria-label="$t('common.clear')"
              @click="topicSearch = ''"
            >
              <Icon name="close" :size="13" />
            </button>
          </div>
          <select v-model="categoryFilter" class="select input-sm" style="max-width: 190px">
            <option value="all">{{ $t('interview.allCategories') }}</option>
            <option v-for="category in categories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
          <select v-model="statusFilter" class="select input-sm" style="max-width: 190px">
            <option value="all">{{ $t('interview.allStatuses') }}</option>
            <option v-for="status in INTERVIEW_STATUSES" :key="status" :value="status">
              {{ interviewStatusLabels[status] }}
            </option>
          </select>
          <button
            v-if="topicSearch || categoryFilter !== 'all' || statusFilter !== 'all'"
            type="button"
            class="link-btn"
            @click="
              topicSearch = '';
              categoryFilter = 'all';
              statusFilter = 'all';
            "
          >
            {{ $t('common.clear') }}
          </button>
        </div>
      </div>

      <div v-if="topics.length === 0" class="card">
        <EmptyState :title="$t('interview.noTopicsTitle')" :text="$t('interview.noTopicsText')" icon="interview">
          <button type="button" class="btn btn-primary btn-sm" @click="openTopicCreate">{{ $t('interview.addTopic') }}</button>
        </EmptyState>
      </div>

      <div v-else-if="filteredTopics.length === 0" class="card">
        <EmptyState :title="$t('common.noItems')" icon="search">
          <button
            type="button"
            class="btn btn-sm"
            @click="
              topicSearch = '';
              categoryFilter = 'all';
              statusFilter = 'all';
            "
          >
            {{ $t('common.clear') }}
          </button>
        </EmptyState>
      </div>

      <section v-for="topic in filteredTopics" :key="topic.id" class="accordion-card">
        <div class="accordion-head">
          <button
            type="button"
            class="accordion-toggle"
            :aria-expanded="isTopicExpanded(topic.id)"
            @click="toggleTopic(topic.id)"
          >
            <Icon
              :name="isTopicExpanded(topic.id) ? 'chevron-down' : 'chevron-right'"
              :size="17"
              class="accordion-chevron"
            />
            <div class="grow">
              <div class="row wrap" style="gap: 6px">
                <h2>{{ topic.name }}</h2>
                <span class="badge badge-outline">{{ topic.category }}</span>
                <span
                  class="badge"
                  :class="`badge-${topic.status === 'mastered' ? 'success' : topic.status === 'reviewing' ? 'info' : 'neutral'}`"
                >
                  {{ interviewStatusLabels[topic.status] }}
                </span>
              </div>
              <p class="card-hint">
                {{ $t('interview.lastReviewed', { date: formatDate(topic.lastReviewedAt) }) }} ·
                {{ $t('interview.questionCount', { count: topic.questions.length }) }}
              </p>
            </div>
          </button>

          <div class="row wrap" style="gap: 4px">
            <select
              class="select input-sm"
              style="max-width: 140px"
              :value="topic.status"
              :aria-label="$t('interview.statusAria', { name: topic.name })"
              @change="changeTopicStatus(topic, $event)"
            >
              <option v-for="status in INTERVIEW_STATUSES" :key="status" :value="status">
                {{ interviewStatusLabels[status] }}
              </option>
            </select>
            <button type="button" class="btn btn-sm" @click="markReviewed(topic)">{{ $t('interview.reviewed') }}</button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" :title="$t('interview.editTopic')" @click="openTopicEdit(topic)">
              <Icon name="edit" :size="15" />
            </button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-hover" :title="$t('interview.deleteTopic')" @click="removeTopic(topic)">
              <Icon name="trash" :size="15" />
            </button>
          </div>
        </div>

        <div v-if="isTopicExpanded(topic.id)" class="accordion-body">
          <p v-if="topic.notes" class="text-soft" style="white-space: pre-line; margin-bottom: 14px">{{ topic.notes }}</p>

          <div v-if="topic.questions.length === 0">
            <EmptyState :title="$t('interview.noQuestionsTitle')" :text="$t('interview.noQuestionsText')" icon="interview" />
          </div>
          <div v-else class="stack-sm">
            <article v-for="question in topic.questions" :key="question.id" class="feature-card">
              <div class="row-between wrap" style="gap: 8px">
                <strong class="grow">{{ question.question }}</strong>
                <div class="row" style="gap: 4px">
                  <span v-if="isQuestionDirty(question)" class="badge badge-warning">{{ $t('common.unsaved') }}</span>
                  <span class="badge badge-neutral tabular">{{ confidenceLabel(question.confidenceLevel) }}</span>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" :title="$t('interview.reviewQuestion')" @click="markQuestionReviewed(question)">
                    <Icon name="check" :size="14" />
                  </button>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-hover" :title="$t('interview.deleteQuestion')" @click="removeQuestion(question)">
                    <Icon name="trash" :size="14" />
                  </button>
                </div>
              </div>

              <div class="stack-sm mt-12">
                <div class="field">
                  <label class="field-label" :for="`answer-${question.id}`">{{ $t('interview.answerLabel') }}</label>
                  <textarea
                    :id="`answer-${question.id}`"
                    v-model="question.answer"
                    class="textarea"
                    :placeholder="$t('interview.answerPlaceholder')"
                  />
                </div>

                <div class="row-between wrap" style="gap: 10px">
                  <div class="row wrap" style="gap: 8px">
                    <span class="field-label">{{ $t('interview.confidence') }}:</span>
                    <div class="confidence-pills" role="group" :aria-label="$t('interview.confidence')">
                      <button
                        v-for="level in [1, 2, 3, 4, 5]"
                        :key="level"
                        type="button"
                        class="confidence-pill tabular"
                        :class="{ active: question.confidenceLevel === level }"
                        :aria-pressed="question.confidenceLevel === level"
                        @click="setConfidence(question, level)"
                      >
                        {{ level }}
                      </button>
                    </div>
                  </div>

                  <div class="row wrap" style="gap: 8px">
                    <button
                      type="button"
                      class="btn btn-sm"
                      :disabled="aiReviewingId === question.id"
                      @click="reviewWithAi(question)"
                    >
                      <span v-if="aiReviewingId === question.id" class="spinner" />
                      <Icon v-else name="sparkles" :size="14" />
                      {{
                        aiReviewingId === question.id
                          ? $t('ai.interviewReviewing')
                          : $t('ai.interviewReviewBtn')
                      }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      @click="saveQuestion(question)"
                    >
                      {{ $t('interview.saveAnswer') }}
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="aiReviews[question.id]" class="ai-review-box mt-16">
                <div class="row-between wrap" style="gap: 8px">
                  <div class="row" style="gap: 6px">
                    <Icon name="sparkles" :size="16" class="text-info" />
                    <strong>{{ $t('ai.interviewResultTitle') }}</strong>
                  </div>
                  <span class="badge badge-info tabular">
                    {{
                      $t('ai.interviewSuggestedConfidence', {
                        level: aiReviews[question.id]!.suggestedConfidence,
                      })
                    }}
                  </span>
                </div>
                <p class="mt-8">{{ aiReviews[question.id]!.summary }}</p>

                <div class="grid cols-2 mt-12">
                  <div v-if="aiReviews[question.id]!.strengths.length > 0" class="ai-callout strengths">
                    <div class="field-label">{{ $t('ai.interviewStrengths') }}</div>
                    <ul class="stack-sm mt-8">
                      <li
                        v-for="(point, idx) in aiReviews[question.id]!.strengths"
                        :key="idx"
                        class="text-soft"
                      >
                        • {{ point }}
                      </li>
                    </ul>
                  </div>
                  <div v-if="aiReviews[question.id]!.missingPoints.length > 0" class="ai-callout missing">
                    <div class="field-label">{{ $t('ai.interviewMissing') }}</div>
                    <ul class="stack-sm mt-8">
                      <li
                        v-for="(point, idx) in aiReviews[question.id]!.missingPoints"
                        :key="idx"
                        class="text-soft"
                      >
                        • {{ point }}
                      </li>
                    </ul>
                  </div>
                </div>

                <div class="mt-12">
                  <div class="row-between wrap" style="gap: 8px">
                    <span class="field-label">{{ $t('ai.interviewImprovedAnswer') }}</span>
                    <button
                      type="button"
                      class="btn btn-sm"
                      @click="applyAiReview(question)"
                    >
                      {{ $t('ai.interviewApplyAnswer') }}
                    </button>
                  </div>
                  <p class="text-soft mt-8" style="white-space: pre-line">
                    {{ aiReviews[question.id]!.improvedAnswer }}
                  </p>
                </div>

                <div v-if="aiReviews[question.id]!.followUpQuestions.length > 0" class="mt-12">
                  <div class="field-label">{{ $t('ai.interviewFollowUps') }}</div>
                  <div class="row wrap mt-8" style="gap: 8px">
                    <button
                      v-for="(followUp, idx) in aiReviews[question.id]!.followUpQuestions"
                      :key="idx"
                      type="button"
                      class="btn btn-sm"
                      @click="addFollowUpQuestion(topic, followUp)"
                    >
                      <Icon name="plus" :size="13" /> {{ followUp }}
                    </button>
                  </div>
                </div>
              </div>

              <p class="card-hint mt-8 tabular">
                {{ $t('interview.questionReviewed', { date: formatDateTime(question.lastReviewedAt) }) }}
              </p>
            </article>
          </div>

          <form class="row mt-16" style="gap: 8px" @submit.prevent="addQuestion(topic)">
            <input
              v-model="newQuestion[topic.id]"
              class="input input-sm"
              :placeholder="$t('interview.addQuestionPlaceholder')"
              :aria-label="$t('interview.addQuestionAria', { name: topic.name })"
            />
            <button type="submit" class="btn btn-sm" :disabled="!(newQuestion[topic.id] ?? '').trim()">
              {{ $t('interview.addQuestion') }}
            </button>
          </form>
        </div>
      </section>
    </div>

    <div v-else class="stack mt-16">
      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ $t('interview.checklistTitle') }}</h2>
            <p class="card-hint">{{ $t('interview.checklistHint') }}</p>
          </div>
          <span class="badge badge-neutral tabular">{{ checklistDone }}/{{ checklist.length }}</span>
        </div>

        <form class="row wrap" style="gap: 8px; margin-bottom: 16px" @submit.prevent="addChecklistItem">
          <input
            v-model="checklistForm.title"
            class="input grow"
            :placeholder="$t('interview.addKnowledgePlaceholder')"
            :aria-label="$t('interview.knowledgeAria')"
          />
          <input
            v-model="checklistForm.category"
            class="input"
            style="max-width: 170px"
            :placeholder="$t('interview.categoryAria')"
            :aria-label="$t('interview.categoryAria')"
          />
          <button type="submit" class="btn btn-primary" :disabled="!checklistForm.title.trim()">{{ $t('common.add') }}</button>
        </form>

        <div v-if="checklist.length === 0">
          <EmptyState :title="$t('interview.noChecklistTitle')" :text="$t('interview.noChecklistText')" icon="check" />
        </div>
        <div v-else class="stack">
          <div v-for="group in groupedChecklist" :key="group.category" class="feature-card">
            <div class="row-between" style="margin-bottom: 8px">
              <span class="badge badge-outline">{{ group.category }}</span>
              <span class="muted tabular">{{ group.done }}/{{ group.items.length }}</span>
            </div>
            <div
              v-for="item in group.items"
              :key="item.id"
              class="check-item"
              :class="{ 'is-done': item.isCompleted }"
            >
              <input
                :id="`check-${item.id}`"
                type="checkbox"
                :checked="item.isCompleted"
                :aria-label="$t('interview.markKnowledgeAria', { title: item.title })"
                @change="toggleChecklistItem(item)"
              />
              <label :for="`check-${item.id}`" class="check-label">
                <div>{{ item.title }}</div>
                <div v-if="item.notes" class="muted">{{ item.notes }}</div>
              </label>
              <div class="check-actions">
                <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-hover" :aria-label="$t('common.delete')" @click="removeChecklistItem(item)">
                  <Icon name="trash" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </template>

  <BaseModal
    v-if="showTopicModal"
    :title="editingTopic ? $t('interview.editTopic') : $t('interview.addTopic')"
    @close="showTopicModal = false"
  >
    <form id="topic-interview-form" class="stack" @submit.prevent="saveTopic">
      <div class="field">
        <label class="field-label" for="interview-topic-name">{{ $t('interview.topicName') }}</label>
        <input id="interview-topic-name" v-model="topicForm.name" class="input" required />
      </div>
      <div class="field">
        <label class="field-label" for="interview-topic-category">{{ $t('interview.categoryAria') }}</label>
        <input id="interview-topic-category" v-model="topicForm.category" class="input" list="topic-categories" required />
        <datalist id="topic-categories">
          <option v-for="category in categories" :key="category" :value="category" />
        </datalist>
      </div>
      <div class="field">
        <label class="field-label" for="interview-topic-status">{{ $t('jobs.status') }}</label>
        <select id="interview-topic-status" v-model="topicForm.status" class="select">
          <option v-for="status in INTERVIEW_STATUSES" :key="status" :value="status">
            {{ interviewStatusLabels[status] }}
          </option>
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="interview-topic-notes">{{ $t('jobs.notes') }}</label>
        <textarea id="interview-topic-notes" v-model="topicForm.notes" class="textarea" />
      </div>
      <p class="field-hint">{{ $t('interview.topicStatusHint') }}</p>
      <p v-if="formError" class="form-error">{{ formError }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn" @click="showTopicModal = false">{{ $t('common.cancel') }}</button>
      <button type="submit" form="topic-interview-form" class="btn btn-primary" :disabled="busy">
        <span v-if="busy" class="spinner" /> {{ $t('interview.saveTopic') }}
      </button>
    </template>
  </BaseModal>
</template>
