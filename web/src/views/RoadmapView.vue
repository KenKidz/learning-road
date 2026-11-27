<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { CourseCategory, CourseStatus, CourseSummary, Priority } from '@shared/types';
import {
  COURSE_CATEGORIES,
  COURSE_STATUSES,
  PRIORITIES,
} from '@shared/types';
import { api, ApiError } from '../lib/api';
import { clampPercent, formatDate, formatMinutes } from '../lib/format';
import {
  badgeToneForCourseStatus,
  badgeToneForPriority,
  categoryDescriptions,
  categoryLabels,
  courseStatusLabels,
  priorityLabels,
} from '../lib/labels';
import { useToast } from '../composables/useToast';
import PageHeader from '../components/PageHeader.vue';
import ProgressBar from '../components/ProgressBar.vue';
import EmptyState from '../components/EmptyState.vue';
import BaseModal from '../components/BaseModal.vue';
import Icon from '../components/Icon.vue';

const route = useRoute();
const toast = useToast();
const { t } = useI18n();

const courses = ref<CourseSummary[]>([]);
const loading = ref(true);
const error = ref('');
const saving = ref(false);
const formError = ref('');
const showCreate = ref(false);
const statusUpdating = ref<number | null>(null);

const initialCategory = typeof route.query.category === 'string' ? route.query.category : 'all';
const categoryFilter = ref(initialCategory);
const statusFilter = ref('all');
const search = ref('');
const sortBy = ref<'default' | 'progress' | 'duration' | 'title'>('default');

const createForm = reactive({
  title: '',
  category: 'A' as CourseCategory,
  priority: 'high' as Priority,
  durationHours: '' as string,
  weight: '1',
  description: '',
  objectives: '',
  link: '',
  notes: '',
});

const hasActiveFilters = computed(
  () =>
    categoryFilter.value !== 'all' ||
    statusFilter.value !== 'all' ||
    search.value.trim() !== '' ||
    sortBy.value !== 'default',
);

const overallStats = computed(() => {
  const total = courses.value.length;
  const completed = courses.value.filter((c) => c.status === 'completed').length;
  const inProgress = courses.value.filter((c) => c.status === 'in_progress').length;
  return { total, completed, inProgress };
});

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  const list = courses.value.filter((course) => {
    if (categoryFilter.value !== 'all' && course.category !== categoryFilter.value) return false;
    if (statusFilter.value !== 'all' && course.status !== statusFilter.value) return false;
    if (query) {
      const haystack = `${course.title} ${course.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  if (sortBy.value === 'progress') return [...list].sort((a, b) => b.progress - a.progress);
  if (sortBy.value === 'duration') {
    return [...list].sort((a, b) => (b.durationHours ?? 0) - (a.durationHours ?? 0));
  }
  if (sortBy.value === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title));
  return list;
});

const grouped = computed(() =>
  COURSE_CATEGORIES.map((category) => {
    const list = filtered.value.filter((course) => course.category === category);
    const completed = list.filter((course) => course.status === 'completed').length;
    const avgProgress =
      list.length > 0
        ? clampPercent(list.reduce((sum, item) => sum + item.progress, 0) / list.length)
        : 0;
    return { category, list, completed, avgProgress };
  }).filter((group) => group.list.length > 0),
);

const totalVisible = computed(() => filtered.value.length);

function clearFilters() {
  categoryFilter.value = 'all';
  statusFilter.value = 'all';
  search.value = '';
  sortBy.value = 'default';
}

async function load() {
  if (courses.value.length === 0) {
    loading.value = true;
  }
  error.value = '';
  try {
    const response = await api.courses();
    courses.value = response.courses;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.roadmapLoad');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  formError.value = '';
  showCreate.value = true;
}

async function submitCreate() {
  formError.value = '';
  if (!createForm.title.trim()) {
    formError.value = t('roadmap.titleRequired');
    return;
  }
  saving.value = true;
  try {
    const duration = createForm.durationHours.trim();
    const objectives = createForm.objectives
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    await api.createCourse({
      title: createForm.title.trim(),
      category: createForm.category,
      priority: createForm.priority,
      durationHours: duration ? Number(duration) : null,
      weight: Number(createForm.weight || 0),
      description: createForm.description.trim(),
      objectives,
      link: createForm.link.trim() || null,
      notes: createForm.notes.trim(),
    });
    showCreate.value = false;
    createForm.title = '';
    createForm.description = '';
    createForm.objectives = '';
    createForm.link = '';
    createForm.notes = '';
    createForm.durationHours = '';
    createForm.weight = '1';
    clearFilters();
    toast.success(t('roadmap.added'));
    await load();
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    saving.value = false;
  }
}

async function changeStatus(course: CourseSummary, event: Event) {
  const select = event.target as HTMLSelectElement;
  const status = select.value as CourseStatus;
  if (status === course.status) return;
  statusUpdating.value = course.id;
  try {
    const updated = await api.updateCourse(course.id, { status });
    const index = courses.value.findIndex((item) => item.id === course.id);
    if (index >= 0) courses.value[index] = updated;
    toast.success(
      status === 'completed'
        ? t('roadmap.markedCompleted', { title: course.title })
        : t('roadmap.statusUpdated', { status: courseStatusLabels[status] }),
    );
  } catch (err) {
    select.value = course.status;
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    statusUpdating.value = null;
  }
}

onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('nav.roadmap')"
    :subtitle="$t('roadmap.subtitle')"
  >
    <template #actions>
      <button type="button" class="btn" :disabled="loading" @click="load">
        <Icon name="refresh" :size="16" /> {{ $t('common.refresh') }}
      </button>
      <button type="button" class="btn btn-primary" @click="openCreate">
        <Icon name="plus" :size="16" /> {{ $t('roadmap.addCourse') }}
      </button>
    </template>
  </PageHeader>

  <div class="card compact">
    <div class="row-between wrap" style="gap: 12px">
      <div class="row wrap" style="gap: 10px">
        <div class="tabs">
          <button
            type="button"
            class="tab"
            :class="{ active: categoryFilter === 'all' }"
            @click="categoryFilter = 'all'"
          >
            {{ $t('common.all') }}
          </button>
          <button
            v-for="category in COURSE_CATEGORIES"
            :key="category"
            type="button"
            class="tab"
            :class="{ active: categoryFilter === category }"
            @click="categoryFilter = category"
          >
            {{ categoryLabels[category] }}
          </button>
        </div>

        <div class="input-wrap" style="max-width: 240px">
          <Icon name="search" :size="15" class="input-icon-left" />
          <input
            v-model="search"
            class="input input-sm input-has-left"
            :class="{ 'input-has-right': search }"
            type="search"
            :placeholder="$t('roadmap.searchPlaceholder')"
            :aria-label="$t('roadmap.searchAria')"
          />
          <button
            v-if="search"
            type="button"
            class="input-action-right"
            :aria-label="$t('common.clear')"
            @click="search = ''"
          >
            <Icon name="close" :size="13" />
          </button>
        </div>

        <select v-model="statusFilter" class="select input-sm" style="max-width: 175px" :aria-label="$t('roadmap.filterStatusAria')">
          <option value="all">{{ $t('roadmap.filterStatus') }}</option>
          <option v-for="status in COURSE_STATUSES" :key="status" :value="status">
            {{ courseStatusLabels[status] }}
          </option>
        </select>

        <select v-model="sortBy" class="select input-sm" style="max-width: 175px" :aria-label="$t('roadmap.sortAria')">
          <option value="default">{{ $t('roadmap.sortDefault') }}</option>
          <option value="progress">{{ $t('roadmap.sortProgress') }}</option>
          <option value="duration">{{ $t('roadmap.sortDuration') }}</option>
          <option value="title">{{ $t('roadmap.sortTitle') }}</option>
        </select>
      </div>

      <div class="row wrap" style="gap: 10px">
        <button v-if="hasActiveFilters" type="button" class="link-btn" @click="clearFilters">
          {{ $t('roadmap.clearFilters') }}
        </button>
        <span class="badge badge-neutral tabular">{{ $t('roadmap.count', { count: totalVisible }) }}</span>
      </div>
    </div>

    <div v-if="!loading && courses.length > 0" class="muted mt-8 tabular">
      {{ $t('roadmap.overallSummary', overallStats) }}
    </div>
  </div>

  <div v-if="loading" class="stack mt-16">
    <div v-for="index in 3" :key="index" class="skeleton" style="height: 180px" />
  </div>

  <div v-else-if="error" class="card mt-16">
    <EmptyState :title="$t('errors.roadmapLoad')" :text="error" icon="alert">
      <button type="button" class="btn btn-primary" @click="load">{{ $t('common.retry') }}</button>
    </EmptyState>
  </div>

  <div v-else-if="grouped.length === 0" class="card mt-16">
    <EmptyState
      :title="$t('roadmap.emptyTitle')"
      :text="$t('roadmap.emptyText')"
      icon="search"
    >
      <div class="row wrap" style="gap: 8px; justify-content: center">
        <button v-if="hasActiveFilters" type="button" class="btn btn-sm" @click="clearFilters">
          {{ $t('roadmap.clearFilters') }}
        </button>
        <button type="button" class="btn btn-primary btn-sm" @click="openCreate">{{ $t('roadmap.addCourse') }}</button>
      </div>
    </EmptyState>
  </div>

  <div v-else class="stack mt-24">
    <section v-for="group in grouped" :key="group.category" class="stack">
      <div class="row-between wrap" style="gap: 12px">
        <div class="row wrap" style="gap: 10px">
          <span class="badge" :class="`badge-cat-${group.category}`" style="font-size: 12.5px; padding: 4px 10px">
            {{ categoryLabels[group.category] }}
          </span>
          <div>
            <h2>{{ categoryDescriptions[group.category] }}</h2>
            <p class="muted tabular">
              {{ $t('roadmap.groupMeta', { count: group.list.length, completed: group.completed }) }}
              <span v-if="group.category === 'C'">{{ $t('roadmap.groupWeightZero') }}</span>
            </p>
          </div>
        </div>
        <div class="row" style="gap: 10px; min-width: 170px">
          <div class="grow">
            <ProgressBar
              :value="group.avgProgress"
              :tone="group.avgProgress === 100 ? 'success' : 'accent'"
              size="sm"
            />
          </div>
          <strong class="tabular muted">{{ group.avgProgress }}%</strong>
        </div>
      </div>

      <div class="grid cols-2">
        <article
          v-for="course in group.list"
          :key="course.id"
          class="course-card"
          :class="`status-${course.status}`"
        >
          <div class="course-card-head">
            <div class="grow">
              <div class="row wrap" style="gap: 6px; margin-bottom: 6px">
                <span class="badge" :class="`badge-cat-${course.category}`">{{ categoryLabels[course.category] }}</span>
                <span class="badge" :class="`badge-${badgeToneForCourseStatus(course.status)}`">
                  {{ courseStatusLabels[course.status] }}
                </span>
                <span class="badge" :class="`badge-${badgeToneForPriority(course.priority)}`">
                  {{ priorityLabels[course.priority] }}
                </span>
                <span v-if="course.durationHours !== null" class="badge badge-neutral tabular">
                  {{ $t('roadmap.durationBadge', { hours: course.durationHours }) }}
                </span>
              </div>
              <RouterLink :to="`/roadmap/${course.id}`" class="course-title">
                {{ course.title }}
              </RouterLink>
            </div>
            <strong class="nowrap tabular" style="font-size: 15px">{{ course.progress }}%</strong>
          </div>

          <p v-if="course.description" class="course-desc">{{ course.description }}</p>

          <div>
            <ProgressBar
              :value="course.progress"
              :tone="course.progress === 100 ? 'success' : 'accent'"
            />
            <div class="progress-meta mt-8">
              <span class="tabular">
                {{ $t('roadmap.checklist', { done: course.topicsCompleted, total: course.topicsTotal }) }}
                <template v-if="course.topicsTotal === 0">{{ $t('roadmap.manualProgress') }}</template>
              </span>
              <span class="tabular">{{ $t('roadmap.studyRecorded', { duration: formatMinutes(course.studyMinutes) }) }}</span>
            </div>
          </div>

          <div class="list-meta">
            <span v-if="course.startedAt">{{ $t('roadmap.started', { date: formatDate(course.startedAt) }) }}</span>
            <span v-if="course.startedAt && course.completedAt" class="sep">·</span>
            <span v-if="course.completedAt" class="text-success">
              {{ $t('roadmap.completed', { date: formatDate(course.completedAt) }) }}
            </span>
            <span v-if="!course.startedAt && !course.completedAt">{{ $t('roadmap.noStart') }}</span>
            <a
              v-if="course.link"
              :href="course.link"
              target="_blank"
              rel="noopener noreferrer"
              class="cell-link"
              style="margin-top: 0; margin-left: auto"
            >
              <Icon name="external" :size="12" /> {{ $t('course.courseLink') }}
            </a>
          </div>

          <div class="course-footer">
            <select
              class="select input-sm"
              style="max-width: 165px"
              :value="course.status"
              :disabled="statusUpdating === course.id"
              :aria-label="$t('roadmap.statusAria', { title: course.title })"
              @change="changeStatus(course, $event)"
            >
              <option v-for="status in COURSE_STATUSES" :key="status" :value="status">
                {{ courseStatusLabels[status] }}
              </option>
            </select>
            <RouterLink :to="`/roadmap/${course.id}`" class="btn btn-sm">
              {{ $t('roadmap.details') }} <Icon name="chevron-right" :size="14" />
            </RouterLink>
          </div>
        </article>
      </div>
    </section>
  </div>

  <BaseModal v-if="showCreate" :title="$t('roadmap.addCourse')" wide @close="showCreate = false">
    <form id="create-course-form" class="stack" @submit.prevent="submitCreate">
      <div class="form-grid">
        <div class="field span-2">
          <label class="field-label" for="course-title">{{ $t('roadmap.titleField') }}</label>
          <input id="course-title" v-model="createForm.title" class="input" required />
        </div>
        <div class="field">
          <label class="field-label" for="course-category">{{ $t('roadmap.groupField') }}</label>
          <select id="course-category" v-model="createForm.category" class="select">
            <option v-for="category in COURSE_CATEGORIES" :key="category" :value="category">
              {{ categoryLabels[category] }} — {{ categoryDescriptions[category] }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="course-priority">{{ $t('roadmap.priorityField') }}</label>
          <select id="course-priority" v-model="createForm.priority" class="select">
            <option v-for="priority in PRIORITIES" :key="priority" :value="priority">
              {{ priorityLabels[priority] }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="course-duration">{{ $t('roadmap.durationField') }}</label>
          <input
            id="course-duration"
            v-model="createForm.durationHours"
            class="input"
            type="number"
            min="0"
            :placeholder="$t('roadmap.durationPlaceholder')"
          />
        </div>
        <div class="field">
          <label class="field-label" for="course-weight">{{ $t('roadmap.weightField') }}</label>
          <input id="course-weight" v-model="createForm.weight" class="input" type="number" min="0" max="10" />
          <span class="field-hint">{{ $t('roadmap.weightHint') }}</span>
        </div>
        <div class="field span-2">
          <label class="field-label" for="course-description">{{ $t('roadmap.descriptionField') }}</label>
          <textarea id="course-description" v-model="createForm.description" class="textarea" />
        </div>
        <div class="field span-2">
          <label class="field-label" for="course-objectives">{{ $t('course.objectivesField') }}</label>
          <textarea id="course-objectives" v-model="createForm.objectives" class="textarea" />
        </div>
        <div class="field span-2">
          <label class="field-label" for="course-link">{{ $t('course.linkField') }}</label>
          <input id="course-link" v-model="createForm.link" class="input" placeholder="https://…" />
        </div>
        <div class="field span-2">
          <label class="field-label" for="course-notes">{{ $t('jobs.notes') }}</label>
          <textarea id="course-notes" v-model="createForm.notes" class="textarea" />
        </div>
      </div>
      <p v-if="formError" class="form-error">{{ formError }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn" @click="showCreate = false">{{ $t('common.cancel') }}</button>
      <button type="submit" form="create-course-form" class="btn btn-primary" :disabled="saving">
        <span v-if="saving" class="spinner" /> {{ $t('roadmap.addCourse') }}
      </button>
    </template>
  </BaseModal>
</template>
