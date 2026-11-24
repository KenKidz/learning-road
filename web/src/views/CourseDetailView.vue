<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type {
  CourseCategory,
  CourseDetail,
  CourseStatus,
  CourseTopic,
  LearningNote,
  Priority,
  TopicKind,
} from '@shared/types';
import { COURSE_CATEGORIES, COURSE_STATUSES, PRIORITIES, TOPIC_KINDS } from '@shared/types';
import { api, ApiError } from '../lib/api';
import {
  formatDate,
  formatDateTime,
  formatMinutes,
  localDateString,
} from '../lib/format';
import {
  badgeToneForCourseStatus,
  badgeToneForPriority,
  categoryDescriptions,
  categoryLabels,
  courseStatusLabels,
  priorityLabels,
} from '../lib/labels';
import { useToast } from '../composables/useToast';
import { confirmAction } from '../composables/useConfirm';
import PageHeader from '../components/PageHeader.vue';
import ProgressBar from '../components/ProgressBar.vue';
import EmptyState from '../components/EmptyState.vue';
import BaseModal from '../components/BaseModal.vue';
import Icon from '../components/Icon.vue';

const props = defineProps<{ id: number }>();
const toast = useToast();
const { t } = useI18n();

const course = ref<CourseDetail | null>(null);
const notes = ref<LearningNote[]>([]);
const loading = ref(true);
const error = ref('');
const busy = ref(false);
const statusUpdating = ref(false);
const showEdit = ref(false);
const showTopic = ref(false);
const topicError = ref('');
const editError = ref('');
const manualProgress = ref('0');

const editingTopicId = ref<number | null>(null);

const editForm = reactive({
  title: '',
  category: 'A' as CourseCategory,
  priority: 'high' as Priority,
  durationHours: '',
  weight: '1',
  description: '',
  objectives: '',
  link: '',
  notes: '',
  startedDate: '',
  completedDate: '',
});

const topicForm = reactive({
  title: '',
  description: '',
  kind: 'content' as TopicKind,
  sortOrder: '0',
});

const contentTopics = computed(() =>
  (course.value?.topics ?? []).filter((topic) => topic.kind === 'content'),
);
const dodTopics = computed(() =>
  (course.value?.topics ?? []).filter((topic) => topic.kind === 'dod'),
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    course.value = await api.course(props.id);
    manualProgress.value = String(course.value.progressManual ?? 0);
    const noteResponse = await api.notes({ relatedType: 'course', relatedId: props.id });
    notes.value = noteResponse.notes;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.courseLoad');
  } finally {
    loading.value = false;
  }
}

function openEdit() {
  if (!course.value) return;
  editError.value = '';
  editForm.title = course.value.title;
  editForm.category = course.value.category;
  editForm.priority = course.value.priority;
  editForm.durationHours = course.value.durationHours === null ? '' : String(course.value.durationHours);
  editForm.weight = String(course.value.weight);
  editForm.description = course.value.description;
  editForm.objectives = course.value.objectives.join('\n');
  editForm.link = course.value.link ?? '';
  editForm.notes = course.value.notes;
  editForm.startedDate = course.value.startedAt
    ? localDateString(new Date(course.value.startedAt))
    : '';
  editForm.completedDate = course.value.completedAt
    ? localDateString(new Date(course.value.completedAt))
    : '';
  showEdit.value = true;
}

async function saveCourse() {
  if (!course.value) return;
  if (!editForm.title.trim()) {
    editError.value = t('course.titleRequired');
    return;
  }
  busy.value = true;
  editError.value = '';
  try {
    const duration = editForm.durationHours.trim();
    const toIso = (value: string) =>
      value ? new Date(`${value}T00:00:00`).toISOString() : null;
    await api.updateCourse(course.value.id, {
      title: editForm.title.trim(),
      category: editForm.category,
      priority: editForm.priority,
      durationHours: duration ? Number(duration) : null,
      weight: Number(editForm.weight || 0),
      description: editForm.description.trim(),
      objectives: editForm.objectives
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      link: editForm.link.trim() || null,
      notes: editForm.notes.trim(),
      startedAt: toIso(editForm.startedDate),
      completedAt: toIso(editForm.completedDate),
    });
    showEdit.value = false;
    toast.success(t('course.saved'));
    await load();
  } catch (err) {
    editError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    busy.value = false;
  }
}

async function changeStatus(status: CourseStatus) {
  if (!course.value || status === course.value.status) return;
  if (status === 'completed') {
    const confirmed = await confirmAction({
      title: t('course.confirmCompleteTitle'),
      message:
        t('course.confirmCompleteText'),
      confirmLabel: t('course.confirmComplete'),
    });
    if (!confirmed) return;
  }
  statusUpdating.value = true;
  try {
    course.value = await api.updateCourse(course.value.id, { status });
    toast.success(t('roadmap.statusUpdated', { status: courseStatusLabels[status] }));
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    statusUpdating.value = false;
  }
}

async function saveManualProgress() {
  if (!course.value) return;
  busy.value = true;
  try {
    course.value = await api.updateCourse(course.value.id, {
      progressManual: Number(manualProgress.value),
    });
    toast.success(t('course.progressSaved'));
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    busy.value = false;
  }
}

async function toggleTopic(topic: CourseTopic) {
  try {
    await api.updateTopic(topic.id, { isCompleted: !topic.isCompleted });
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

function openTopicCreate(kind: TopicKind) {
  editingTopicId.value = null;
  topicForm.title = '';
  topicForm.description = '';
  topicForm.kind = kind;
  topicForm.sortOrder = '0';
  topicError.value = '';
  showTopic.value = true;
}

function openTopicEdit(topic: CourseTopic) {
  editingTopicId.value = topic.id;
  topicForm.title = topic.title;
  topicForm.description = topic.description;
  topicForm.kind = topic.kind;
  topicForm.sortOrder = String(topic.sortOrder);
  topicError.value = '';
  showTopic.value = true;
}

async function saveTopic() {
  if (!course.value) return;
  if (!topicForm.title.trim()) {
    topicError.value = t('course.topicTitleRequired');
    return;
  }
  busy.value = true;
  topicError.value = '';
  try {
    if (editingTopicId.value === null) {
      await api.createTopic(course.value.id, {
        title: topicForm.title.trim(),
        description: topicForm.description.trim(),
        kind: topicForm.kind,
        sortOrder: Number(topicForm.sortOrder || 0),
      });
      toast.success(t('course.topicAdded'));
    } else {
      await api.updateTopic(editingTopicId.value, {
        title: topicForm.title.trim(),
        description: topicForm.description.trim(),
        kind: topicForm.kind,
        sortOrder: Number(topicForm.sortOrder || 0),
      });
      toast.success(t('course.topicUpdated'));
    }
    showTopic.value = false;
    await load();
  } catch (err) {
    topicError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    busy.value = false;
  }
}

async function removeTopic(topic: CourseTopic) {
  const confirmed = await confirmAction({
    title: t('course.deleteTopicTitle'),
    message: t('course.deleteTopicText', { title: topic.title }),
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed || !course.value) return;
  try {
    await api.deleteTopic(topic.id);
    toast.success(t('course.topicDeleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function removeCourse() {
  if (!course.value) return;
  const confirmed = await confirmAction({
    title: t('course.confirmDeleteTitle'),
    message:
      t('course.confirmDeleteText'),
    confirmLabel: t('course.confirmDelete'),
    danger: true,
  });
  if (!confirmed || !course.value) return;
  busy.value = true;
  try {
    await api.deleteCourse(course.value.id);
    toast.success(t('course.deleted'));
    window.location.href = '/roadmap';
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    busy.value = false;
  }
}

async function removeSession(id: number) {
  const confirmed = await confirmAction({
    title: t('course.deleteSessionTitle'),
    message: t('course.deleteSessionText'),
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteSession(id);
    toast.success(t('course.sessionDeleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

onMounted(load);
watch(
  () => props.id,
  () => void load(),
);
</script>

<template>
  <div v-if="loading" class="stack">
    <div class="skeleton skeleton-line short" />
    <div class="skeleton" style="height: 120px" />
    <div class="skeleton" style="height: 340px" />
  </div>

  <div v-else-if="error" class="card">
    <EmptyState :title="$t('errors.courseLoad')" :text="error" icon="alert">
      <RouterLink to="/roadmap" class="btn btn-primary">{{ $t('course.backToRoadmap') }}</RouterLink>
    </EmptyState>
  </div>

  <template v-else-if="course">
    <div class="breadcrumb">
      <RouterLink to="/roadmap">{{ $t('nav.roadmap') }}</RouterLink>
      <Icon name="chevron-right" :size="12" />
      <span>{{ categoryLabels[course.category] }}</span>
    </div>

    <PageHeader :title="course.title" :subtitle="course.description">
      <template #actions>
        <a
          v-if="course.link"
          :href="course.link"
          target="_blank"
          rel="noopener noreferrer"
          class="btn"
        >
          <Icon name="external" :size="16" /> {{ $t('course.courseLink') }}
        </a>
        <button type="button" class="btn" @click="openEdit">
          <Icon name="edit" :size="16" /> {{ $t('jobs.edit') }}
        </button>
        <button type="button" class="btn btn-danger" @click="removeCourse">
          <Icon name="trash" :size="16" /> {{ $t('jobs.delete') }}
        </button>
      </template>
    </PageHeader>

    <div class="row wrap" style="gap: 6px; margin-bottom: 18px">
      <span class="badge badge-outline">{{ categoryLabels[course.category] }}</span>
      <span class="badge" :class="`badge-${badgeToneForCourseStatus(course.status)}`">
        {{ courseStatusLabels[course.status] }}
      </span>
      <span class="badge" :class="`badge-${badgeToneForPriority(course.priority)}`">
        Priority {{ priorityLabels[course.priority] }}
      </span>
      <span v-if="course.durationHours !== null" class="badge badge-neutral">
        {{ $t('roadmap.durationBadge', { hours: course.durationHours }) }}
      </span>
      <span v-if="course.isSeeded" class="badge badge-neutral">{{ $t('course.seedBadge') }}</span>
    </div>

    <div class="grid cols-main">
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('course.progressTitle') }}</h2>
              <p class="card-hint">
                {{ $t('course.progressHint') }}
              </p>
            </div>
            <strong>{{ course.progress }}%</strong>
          </div>
          <ProgressBar :value="course.progress" size="lg" />
          <div class="row wrap mt-16" style="gap: 16px">
            <span class="muted">{{ $t('course.contentStat', { done: course.contentCompleted, total: course.contentTotal }) }}</span>
            <span class="muted">Definition of Done: {{ course.dodCompleted }}/{{ course.dodTotal }}</span>
            <span class="muted">{{ $t('course.studyRecorded', { duration: formatMinutes(course.studyMinutes) }) }}</span>
          </div>

          <div v-if="course.topicsTotal === 0" class="mt-16">
            <div class="row wrap" style="gap: 8px; align-items: flex-end">
              <div class="field" style="width: 170px">
                <label class="field-label" for="manual-progress">{{ $t('course.manualLabel') }}</label>
                <input
                  id="manual-progress"
                  v-model="manualProgress"
                  class="input"
                  type="number"
                  min="0"
                  max="100"
                />
              </div>
              <button type="button" class="btn" :disabled="busy" @click="saveManualProgress">
                {{ $t('course.saveProgress') }}
              </button>
            </div>
            <p class="field-hint mt-8">
              {{ $t('course.manualHint') }}
            </p>
          </div>

          <div class="divider" />
          <h3>{{ $t('course.statusTitle') }}</h3>
          <div class="row wrap mt-8" style="gap: 6px">
            <button
              v-for="status in COURSE_STATUSES"
              :key="status"
              type="button"
              class="btn btn-sm"
              :class="{ 'btn-primary': course.status === status }"
              :disabled="statusUpdating"
              @click="changeStatus(status)"
            >
              {{ courseStatusLabels[status] }}
            </button>
          </div>
          <p class="field-hint mt-8">
            {{ $t('course.statusHint') }}
          </p>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('course.contentTitle') }}</h2>
              <p class="card-hint">{{ $t('course.contentCount', { done: contentTopics.filter((t) => t.isCompleted).length, total: contentTopics.length }) }}</p>
            </div>
            <button type="button" class="btn btn-sm" @click="openTopicCreate('content')">
              <Icon name="plus" :size="14" /> {{ $t('course.addItem') }}
            </button>
          </div>
          <div v-if="contentTopics.length === 0">
            <EmptyState
              :title="$t('course.noContentTitle')"
              :text="$t('course.noContentText')"
              icon="book"
            />
          </div>
          <div v-else>
            <div
              v-for="topic in contentTopics"
              :key="topic.id"
              class="check-item"
              :class="{ 'is-done': topic.isCompleted }"
            >
              <input
                type="checkbox"
                :checked="topic.isCompleted"
                :aria-label="$t('course.markTopicAria', { title: topic.title })"
                @change="toggleTopic(topic)"
              />
              <div class="check-label">
                <div>{{ topic.title }}</div>
                <div v-if="topic.description" class="muted">{{ topic.description }}</div>
              </div>
              <div class="check-actions">
                <button type="button" class="btn btn-ghost btn-icon btn-sm" @click="openTopicEdit(topic)">
                  <Icon name="edit" :size="14" />
                </button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" @click="removeTopic(topic)">
                  <Icon name="trash" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('course.dodTitle') }}</h2>
              <p class="card-hint">{{ $t('course.contentCount', { done: dodTopics.filter((t) => t.isCompleted).length, total: dodTopics.length }) }}</p>
            </div>
            <button type="button" class="btn btn-sm" @click="openTopicCreate('dod')">
              <Icon name="plus" :size="14" /> {{ $t('course.addItem') }}
            </button>
          </div>
          <div v-if="dodTopics.length === 0">
            <p class="muted">{{ $t('course.noDod') }}</p>
          </div>
          <div v-else>
            <div
              v-for="topic in dodTopics"
              :key="topic.id"
              class="check-item"
              :class="{ 'is-done': topic.isCompleted }"
            >
              <input
                type="checkbox"
                :checked="topic.isCompleted"
                :aria-label="$t('course.markDodAria', { title: topic.title })"
                @change="toggleTopic(topic)"
              />
              <div class="check-label">
                <div>{{ topic.title }}</div>
                <div v-if="topic.description" class="muted">{{ topic.description }}</div>
              </div>
              <div class="check-actions">
                <button type="button" class="btn btn-ghost btn-icon btn-sm" @click="openTopicEdit(topic)">
                  <Icon name="edit" :size="14" />
                </button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" @click="removeTopic(topic)">
                  <Icon name="trash" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="course.objectives.length > 0" class="card">
          <h2 class="card-title">{{ $t('course.objectivesTitle') }}</h2>
          <ul class="stack-sm mt-16">
            <li v-for="(objective, index) in course.objectives" :key="index" class="row" style="align-items: flex-start">
              <Icon name="check" :size="15" class="text-success" style="margin-top: 3px" />
              <span class="text-soft">{{ objective }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <h2 class="card-title">{{ $t('course.infoTitle') }}</h2>
          <ul class="stack-sm mt-16">
            <li class="row-between">
              <span class="muted">{{ $t('course.duration') }}</span>
              <span>{{ course.durationHours !== null ? $t('roadmap.durationBadge', { hours: course.durationHours }) : $t('common.notSet') }}</span>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('course.weight') }}</span>
              <span>{{ course.weight }}</span>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('course.started') }}</span>
              <span>{{ formatDate(course.startedAt) }}</span>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('course.completed') }}</span>
              <span>{{ formatDate(course.completedAt) }}</span>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('course.updated') }}</span>
              <span>{{ formatDateTime(course.updatedAt) }}</span>
            </li>
          </ul>
          <div v-if="course.notes" class="divider" />
          <p v-if="course.notes" class="text-soft" style="white-space: pre-line">{{ course.notes }}</p>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('course.sessionsTitle') }}</h2>
              <p class="card-hint">{{ $t('course.sessionsHint', { duration: formatMinutes(course.studyMinutes) }) }}</p>
            </div>
            <RouterLink :to="`/planner?courseId=${course.id}`" class="btn btn-sm">
              <Icon name="plus" :size="14" /> {{ $t('course.logTime') }}
            </RouterLink>
          </div>
          <div v-if="course.sessions.length === 0">
            <EmptyState
              :title="$t('course.noSessionsTitle')"
              :text="$t('course.noSessionsText')"
              icon="clock"
            />
          </div>
          <ul v-else class="list">
            <li v-for="session in course.sessions" :key="session.id" class="list-item">
              <div class="grow">
                <div class="row-between">
                  <strong>{{ formatMinutes(session.durationMinutes) }}</strong>
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon btn-sm"
                    :aria-label="$t('common.delete')"
                    @click="removeSession(session.id)"
                  >
                    <Icon name="trash" :size="14" />
                  </button>
                </div>
                <div class="list-meta">
                  <span>{{ formatDateTime(session.startedAt) }}</span>
                  <template v-if="session.taskTitle">
                    <span class="sep">·</span>
                    <span>{{ session.taskTitle }}</span>
                  </template>
                </div>
                <p v-if="session.notes" class="muted mt-8">{{ session.notes }}</p>
              </div>
            </li>
          </ul>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('course.notesTitle') }}</h2>
              <p class="card-hint">{{ $t('course.notesCount', { count: notes.length }) }}</p>
            </div>
            <RouterLink
              :to="`/notes?relatedType=course&relatedId=${course.id}`"
              class="link-btn"
            >
              {{ $t('common.open') }}
            </RouterLink>
          </div>
          <div v-if="notes.length === 0">
            <p class="muted">{{ $t('course.noNotes') }}</p>
            <RouterLink
              :to="`/notes?relatedType=course&relatedId=${course.id}`"
              class="btn btn-sm mt-8"
            >
              {{ $t('course.addNote') }}
            </RouterLink>
          </div>
          <ul v-else class="list">
            <li v-for="note in notes" :key="note.id" class="list-item">
              <div class="grow">
                <RouterLink
                  :to="`/notes?relatedType=course&relatedId=${course.id}&noteId=${note.id}`"
                  class="task-title"
                >
                  {{ note.title }}
                </RouterLink>
                <div class="list-meta">{{ formatDateTime(note.updatedAt) }}</div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <BaseModal v-if="showEdit" :title="$t('course.editTitle')" wide @close="showEdit = false">
      <form id="edit-course-form" class="stack" @submit.prevent="saveCourse">
        <div class="form-grid">
          <div class="field span-2">
            <label class="field-label" for="edit-title">{{ $t('roadmap.titleField') }}</label>
            <input id="edit-title" v-model="editForm.title" class="input" required />
          </div>
          <div class="field">
            <label class="field-label" for="edit-category">{{ $t('roadmap.groupField') }}</label>
            <select id="edit-category" v-model="editForm.category" class="select">
              <option v-for="category in COURSE_CATEGORIES" :key="category" :value="category">
                {{ categoryLabels[category] }} — {{ categoryDescriptions[category] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="edit-priority">{{ $t('planner.taskPriority') }}</label>
            <select id="edit-priority" v-model="editForm.priority" class="select">
              <option v-for="priority in PRIORITIES" :key="priority" :value="priority">
                {{ priorityLabels[priority] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="edit-duration">{{ $t('roadmap.durationField') }}</label>
            <input id="edit-duration" v-model="editForm.durationHours" class="input" type="number" min="0" />
          </div>
          <div class="field">
            <label class="field-label" for="edit-weight">{{ $t('course.weight') }}</label>
            <input id="edit-weight" v-model="editForm.weight" class="input" type="number" min="0" max="10" />
          </div>
          <div class="field">
            <label class="field-label" for="edit-started">{{ $t('course.startField') }}</label>
            <input id="edit-started" v-model="editForm.startedDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="edit-completed">{{ $t('course.completedField') }}</label>
            <input id="edit-completed" v-model="editForm.completedDate" class="input" type="date" />
          </div>
          <div class="field span-2">
            <label class="field-label" for="edit-description">{{ $t('course.descriptionField') }}</label>
            <textarea id="edit-description" v-model="editForm.description" class="textarea" />
          </div>
          <div class="field span-2">
            <label class="field-label" for="edit-objectives">{{ $t('course.objectivesField') }}</label>
            <textarea id="edit-objectives" v-model="editForm.objectives" class="textarea" />
          </div>
          <div class="field span-2">
            <label class="field-label" for="edit-link">{{ $t('course.linkField') }}</label>
            <input id="edit-link" v-model="editForm.link" class="input" />
          </div>
          <div class="field span-2">
            <label class="field-label" for="edit-notes">{{ $t('jobs.notes') }}</label>
            <textarea id="edit-notes" v-model="editForm.notes" class="textarea" />
          </div>
        </div>
        <p v-if="editError" class="form-error">{{ editError }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn" @click="showEdit = false">{{ $t('common.cancel') }}</button>
        <button type="submit" form="edit-course-form" class="btn btn-primary" :disabled="busy">
          <span v-if="busy" class="spinner" /> {{ $t('common.saveChanges') }}
        </button>
      </template>
    </BaseModal>

    <BaseModal
      v-if="showTopic"
      :title="editingTopicId === null ? $t('course.topicCreateTitle') : $t('course.topicEditTitle')"
      @close="showTopic = false"
    >
      <form id="topic-form" class="stack" @submit.prevent="saveTopic">
        <div class="field">
          <label class="field-label" for="topic-title">{{ $t('notes.titleField') }}</label>
          <input id="topic-title" v-model="topicForm.title" class="input" required />
        </div>
        <div class="field">
          <label class="field-label" for="topic-kind">{{ $t('planner.taskType') }}</label>
          <select id="topic-kind" v-model="topicForm.kind" class="select">
            <option v-for="kind in TOPIC_KINDS" :key="kind" :value="kind">
              {{ kind === 'content' ? $t('course.topicKindContent') : $t('course.dodTitle') }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="topic-description">{{ $t('course.descriptionField') }}</label>
          <textarea id="topic-description" v-model="topicForm.description" class="textarea" />
        </div>
        <div class="field">
          <label class="field-label" for="topic-order">{{ $t('course.topicOrderField') }}</label>
          <input id="topic-order" v-model="topicForm.sortOrder" class="input" type="number" min="0" />
        </div>
        <p v-if="topicError" class="form-error">{{ topicError }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn" @click="showTopic = false">{{ $t('common.cancel') }}</button>
        <button type="submit" form="topic-form" class="btn btn-primary" :disabled="busy">
          <span v-if="busy" class="spinner" /> {{ $t('common.save') }}
        </button>
      </template>
    </BaseModal>
  </template>
</template>
