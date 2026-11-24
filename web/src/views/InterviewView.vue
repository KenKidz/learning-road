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
import EmptyState from '../components/EmptyState.vue';
import BaseModal from '../components/BaseModal.vue';
import ProgressBar from '../components/ProgressBar.vue';
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

const categories = computed(() => {
  const set = new Set<string>();
  for (const topic of topics.value) set.add(topic.category);
  return Array.from(set);
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

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const response = await api.interview();
    topics.value = response.topics;
    checklist.value = response.checklist;
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
      await api.createInterviewTopic(payload);
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

onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('nav.interview')"
    :subtitle="$t('interview.subtitle')"
  >
    <template #actions>
      <button type="button" class="btn" :disabled="loading" @click="load">
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
      <button type="button" class="btn btn-primary" @click="load">{{ $t('common.retry') }}</button>
    </EmptyState>
  </div>

  <template v-else>
    <div class="grid stats-grid">
      <div class="card compact">
        <div class="stat-label">{{ $t('interview.mastered') }}</div>
        <div class="stat-value">{{ masteredCount }}/{{ topics.length }}</div>
      </div>
      <div class="card compact">
        <div class="stat-label">{{ $t('dashboard.reviewing') }}</div>
        <div class="stat-value">{{ reviewingCount }}</div>
      </div>
      <div class="card compact">
        <div class="stat-label">{{ $t('dashboard.questions') }}</div>
        <div class="stat-value">{{ questionCount }}</div>
      </div>
      <div class="card compact">
        <div class="stat-label">{{ $t('interview.checklist') }}</div>
        <div class="stat-value">{{ checklistDone }}/{{ checklist.length }}</div>
        <div class="mt-8"><ProgressBar :value="checklistProgress" /></div>
      </div>
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
    </div>

    <div v-if="tab === 'topics'" class="stack mt-16">
      <section v-for="topic in topics" :key="topic.id" class="card">
        <div class="card-head">
          <div class="grow">
            <div class="row wrap" style="gap: 6px">
              <h2>{{ topic.name }}</h2>
              <span class="badge badge-outline">{{ topic.category }}</span>
              <span class="badge" :class="`badge-${topic.status === 'mastered' ? 'success' : topic.status === 'reviewing' ? 'info' : 'neutral'}`">
                {{ interviewStatusLabels[topic.status] }}
              </span>
            </div>
            <p class="card-hint">
              {{ $t('interview.lastReviewed', { date: formatDate(topic.lastReviewedAt) }) }} · {{ $t('interview.questionCount', { count: topic.questions.length }) }}
            </p>
          </div>
          <div class="row" style="gap: 4px">
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
            <button type="button" class="btn btn-ghost btn-icon" :title="$t('interview.editTopic')" @click="openTopicEdit(topic)">
              <Icon name="edit" :size="15" />
            </button>
            <button type="button" class="btn btn-ghost btn-icon" :title="$t('interview.deleteTopic')" @click="removeTopic(topic)">
              <Icon name="trash" :size="15" />
            </button>
          </div>
        </div>

        <p v-if="topic.notes" class="text-soft" style="white-space: pre-line">{{ topic.notes }}</p>

        <div v-if="topic.questions.length === 0" class="mt-16">
          <EmptyState :title="$t('interview.noQuestionsTitle')" :text="$t('interview.noQuestionsText')" icon="interview" />
        </div>
        <div v-else class="stack-sm mt-16">
          <article v-for="question in topic.questions" :key="question.id" class="feature-card">
            <div class="row-between wrap" style="gap: 8px">
              <strong class="grow">{{ question.question }}</strong>
              <div class="row" style="gap: 4px">
                <span class="badge badge-neutral">{{ confidenceLabel(question.confidenceLevel) }}</span>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" :title="$t('interview.reviewQuestion')" @click="markQuestionReviewed(question)">
                  <Icon name="check" :size="14" />
                </button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" :title="$t('interview.deleteQuestion')" @click="removeQuestion(question)">
                  <Icon name="trash" :size="14" />
                </button>
              </div>
            </div>
            <div class="form-grid mt-8">
              <div class="field span-2">
                <label class="field-label" :for="`answer-${question.id}`">{{ $t('interview.answerLabel') }}</label>
                <textarea
                  :id="`answer-${question.id}`"
                  v-model="question.answer"
                  class="textarea"
                  :placeholder="$t('interview.answerPlaceholder')"
                />
              </div>
              <div class="field">
                <label class="field-label" :for="`confidence-${question.id}`">{{ $t('interview.confidence') }}</label>
                <select
                  :id="`confidence-${question.id}`"
                  v-model.number="question.confidenceLevel"
                  class="select"
                >
                  <option :value="null">{{ $t('interview.notRated') }}</option>
                  <option v-for="level in [1, 2, 3, 4, 5]" :key="level" :value="level">
                    {{ $t('interview.confidenceValue', { level }) }}
                  </option>
                </select>
              </div>
              <div class="field" style="justify-content: flex-end">
                <div class="row wrap" style="gap: 8px">
                  <button
                    type="button"
                    class="btn"
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
                  <button type="button" class="btn btn-primary" @click="saveQuestion(question)">
                    {{ $t('interview.saveAnswer') }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="aiReviews[question.id]" class="card compact mt-16">
              <div class="row-between wrap" style="gap: 8px">
                <div class="row" style="gap: 6px">
                  <Icon name="sparkles" :size="16" />
                  <strong>{{ $t('ai.interviewResultTitle') }}</strong>
                </div>
                <span class="badge badge-info">
                  {{
                    $t('ai.interviewSuggestedConfidence', {
                      level: aiReviews[question.id]!.suggestedConfidence,
                    })
                  }}
                </span>
              </div>
              <p class="mt-8">{{ aiReviews[question.id]!.summary }}</p>

              <div class="grid cols-2 mt-16">
                <div v-if="aiReviews[question.id]!.strengths.length > 0">
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
                <div v-if="aiReviews[question.id]!.missingPoints.length > 0">
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

              <div class="mt-16">
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

              <div v-if="aiReviews[question.id]!.followUpQuestions.length > 0" class="mt-16">
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

            <p class="card-hint mt-8">
              {{ $t('interview.questionReviewed', { date: formatDateTime(question.lastReviewedAt) }) }}
            </p>
          </article>
        </div>

        <form class="row mt-16" style="gap: 8px" @submit.prevent="addQuestion(topic)">
          <input
            v-model="newQuestion[topic.id]"
            class="input"
            :placeholder="$t('interview.addQuestionPlaceholder')"
            :aria-label="$t('interview.addQuestionAria', { name: topic.name })"
          />
          <button type="submit" class="btn" :disabled="!(newQuestion[topic.id] ?? '').trim()">{{ $t('interview.addQuestion') }}</button>
        </form>
      </section>

      <div v-if="topics.length === 0" class="card">
        <EmptyState :title="$t('interview.noTopicsTitle')" :text="$t('interview.noTopicsText')" icon="interview">
          <button type="button" class="btn btn-primary btn-sm" @click="openTopicCreate">{{ $t('interview.addTopic') }}</button>
        </EmptyState>
      </div>
    </div>

    <div v-else class="stack mt-16">
      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ $t('interview.checklistTitle') }}</h2>
            <p class="card-hint">{{ $t('interview.checklistHint') }}</p>
          </div>
          <span class="muted">{{ checklistDone }}/{{ checklist.length }}</span>
        </div>
        <div v-if="checklist.length === 0">
          <EmptyState :title="$t('interview.noChecklistTitle')" :text="$t('interview.noChecklistText')" icon="check" />
        </div>
        <div v-else>
          <div
            v-for="item in checklist"
            :key="item.id"
            class="check-item"
            :class="{ 'is-done': item.isCompleted }"
          >
            <input
              type="checkbox"
              :checked="item.isCompleted"
              :aria-label="$t('interview.markKnowledgeAria', { title: item.title })"
              @change="toggleChecklistItem(item)"
            />
            <div class="check-label">
              <div>{{ item.title }}</div>
              <div class="muted">
                <span class="badge badge-outline">{{ item.category }}</span>
                <span v-if="item.notes"> · {{ item.notes }}</span>
              </div>
            </div>
            <div class="check-actions">
              <button type="button" class="btn btn-ghost btn-icon btn-sm" :aria-label="$t('common.delete')" @click="removeChecklistItem(item)">
                <Icon name="trash" :size="14" />
              </button>
            </div>
          </div>
        </div>

        <form class="row mt-16" style="gap: 8px" @submit.prevent="addChecklistItem">
          <input
            v-model="checklistForm.title"
            class="input"
            :placeholder="$t('interview.addKnowledgePlaceholder')"
            :aria-label="$t('interview.knowledgeAria')"
          />
          <input
            v-model="checklistForm.category"
            class="input"
            style="max-width: 160px"
            :placeholder="$t('interview.categoryAria')"
            :aria-label="$t('interview.categoryAria')"
          />
          <button type="submit" class="btn" :disabled="!checklistForm.title.trim()">{{ $t('common.add') }}</button>
        </form>
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
