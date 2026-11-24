<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { AiStatus, DashboardData, JobStatus, Task } from '@shared/types';
import { api, ApiError, streamAiWeeklyCoaching } from '../lib/api';
import { formatDate, formatMinutes } from '../lib/format';
import {
  badgeToneForJobStatus,
  jobStatusLabels,
  taskStatusLabels,
} from '../lib/labels';
import { useToast } from '../composables/useToast';
import PageHeader from '../components/PageHeader.vue';
import StatCard from '../components/StatCard.vue';
import ProgressBar from '../components/ProgressBar.vue';
import MiniBarChart from '../components/MiniBarChart.vue';
import TaskRow from '../components/TaskRow.vue';
import EmptyState from '../components/EmptyState.vue';
import MarkdownView from '../components/MarkdownView.vue';
import Icon from '../components/Icon.vue';

const data = ref<DashboardData | null>(null);
const aiStatus = ref<AiStatus | null>(null);
const loading = ref(true);
const error = ref('');
const updatingTask = ref<number | null>(null);
const coachFocus = ref('');
const coachMarkdown = ref('');
const coachStreaming = ref(false);
const coachSavingNote = ref(false);
const coachError = ref('');
let coachAbortController: AbortController | null = null;
const toast = useToast();
const { t } = useI18n();

const jobOrder: JobStatus[] = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'];

const openTaskCount = computed(() => data.value?.tasks.openCount ?? 0);
const todayTaskCount = computed(() => data.value?.tasks.today.length ?? 0);
const showRoadmapSetup = computed(
  () => data.value !== null && data.value.settings.roadmapStartDate === null,
);
const originalSchedulePassed = computed(
  () => data.value !== null && data.value.today > '2026-11-15',
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [dashboardData, status] = await Promise.all([
      api.dashboard(),
      api.aiStatus().catch(() => ({ enabled: false, model: '', baseUrl: '' })),
    ]);
    data.value = dashboardData;
    aiStatus.value = status;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.dashboardLoad');
  } finally {
    loading.value = false;
  }
}

async function runAiCoaching() {
  if (coachStreaming.value) return;
  coachError.value = '';
  coachMarkdown.value = '';
  coachStreaming.value = true;
  coachAbortController = new AbortController();

  try {
    await streamAiWeeklyCoaching(
      { focusNote: coachFocus.value.trim() || undefined },
      {
        signal: coachAbortController.signal,
        onChunk: (chunk) => {
          coachMarkdown.value += chunk;
        },
      },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      toast.info(t('ai.coachAborted'));
    } else {
      coachError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
    }
  } finally {
    coachStreaming.value = false;
    coachAbortController = null;
  }
}

function stopAiCoaching() {
  coachAbortController?.abort();
}

async function saveCoachingToNotes() {
  if (!coachMarkdown.value.trim() || coachSavingNote.value) return;
  coachSavingNote.value = true;
  try {
    await api.createNote({
      title: t('ai.coachSavedNoteTitle', { date: formatDate(data.value?.today ?? new Date().toISOString()) }),
      contentMarkdown: coachMarkdown.value.trim(),
      relatedType: 'general',
      relatedId: null,
    });
    toast.success(t('ai.coachSavedToast'));
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    coachSavingNote.value = false;
  }
}

onBeforeUnmount(() => {
  coachAbortController?.abort();
});

async function toggleTask(task: Task) {
  if (updatingTask.value !== null) return;
  updatingTask.value = task.id;
  try {
    await api.updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    updatingTask.value = null;
  }
}

onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('nav.dashboard')"
    :subtitle="$t('dashboard.subtitle')"
  >
    <template #actions>
      <button type="button" class="btn" :disabled="loading" @click="load">
        <Icon name="refresh" :size="16" /> {{ $t('common.refresh') }}
      </button>
      <RouterLink to="/planner" class="btn btn-primary">
        <Icon name="plus" :size="16" /> {{ $t('dashboard.addSession') }}
      </RouterLink>
    </template>
  </PageHeader>

  <div v-if="loading" class="stack">
    <div class="grid stats-grid">
      <div v-for="index in 4" :key="index" class="skeleton skeleton-card" />
    </div>
    <div class="skeleton" style="height: 220px" />
    <div class="skeleton" style="height: 260px" />
  </div>

  <div v-else-if="error" class="card">
    <EmptyState :title="$t('errors.dashboardLoad')" :text="error" icon="alert">
      <button type="button" class="btn btn-primary" @click="load">{{ $t('common.retry') }}</button>
    </EmptyState>
  </div>

  <div v-else-if="data" class="stack">
    <div v-if="showRoadmapSetup" class="alert alert-warning">
      <Icon name="alert" :size="18" />
      <div class="alert-body">
        <strong>{{ $t('dashboard.setupTitle') }}</strong>
        <span v-if="originalSchedulePassed">
          {{ $t('dashboard.setupPast') }}
        </span>
        <span v-else>
          {{ $t('dashboard.setupFuture') }}
        </span>
      </div>
      <RouterLink to="/settings" class="btn btn-sm">{{ $t('dashboard.chooseStart') }}</RouterLink>
    </div>

    <div class="grid stats-grid">
      <StatCard
        :label="$t('dashboard.roadmapProgress')"
        :value="`${data.roadmap.progress}%`"
        :note="$t('dashboard.roadmapProgressNote')"
      />
      <StatCard
        :label="$t('dashboard.coursesCompleted')"
        :value="`${data.roadmap.byStatus.completed}/${data.roadmap.totalCourses}`"
        :note="$t('dashboard.coursesNote', { inProgress: data.roadmap.byStatus.in_progress, paused: data.roadmap.byStatus.paused })"
      />
      <StatCard
        :label="$t('dashboard.studyTotal')"
        :value="formatMinutes(data.study.totalMinutes)"
        :note="$t('dashboard.studyWeekNote', { duration: formatMinutes(data.study.weekMinutes) })"
      />
      <StatCard
        :label="$t('dashboard.openTasks')"
        :value="openTaskCount"
        :note="$t('dashboard.taskNote', { today: todayTaskCount, overdue: data.tasks.overdue.length })"
      />
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h2 class="card-title">{{ $t('dashboard.groupsTitle') }}</h2>
          <p class="card-hint">
            {{ $t('dashboard.groupsHint') }}
          </p>
        </div>
        <RouterLink to="/roadmap" class="btn btn-sm">{{ $t('dashboard.openRoadmap') }}</RouterLink>
      </div>
      <div class="grid cols-3">
        <div v-for="group in data.roadmap.groups" :key="group.category" class="card compact">
          <div class="row-between">
            <div>
              <RouterLink :to="`/roadmap?category=${group.category}`" class="card-title">
                {{ $t(`labels.category.${group.category}`) }} —
                {{ $t(`labels.categoryDescription.${group.category}`) }}
              </RouterLink>
              <p class="card-hint">
                {{ $t('dashboard.groupMeta', { completed: group.coursesCompleted, total: group.coursesTotal, inProgress: group.coursesInProgress }) }}
              </p>
            </div>
            <strong>{{ group.progress }}%</strong>
          </div>
          <div class="mt-16">
            <ProgressBar :value="group.progress" size="lg" />
          </div>
          <p class="card-hint mt-8">
            {{ $t('dashboard.groupStudy', { duration: formatMinutes(group.studyMinutes) }) }}
          </p>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <div class="row wrap" style="gap: 8px">
            <h2 class="card-title">{{ $t('ai.coachTitle') }}</h2>
            <span class="badge" :class="aiStatus?.enabled ? 'badge-info' : 'badge-neutral'">
              <Icon name="sparkles" :size="13" />
              {{
                aiStatus?.enabled
                  ? $t('ai.statusConnected', { model: aiStatus.model })
                  : $t('ai.statusDisabled')
              }}
            </span>
          </div>
          <p class="card-hint">{{ $t('ai.coachHint') }}</p>
        </div>
        <div class="row wrap" style="gap: 8px">
          <button
            v-if="coachStreaming"
            type="button"
            class="btn btn-sm"
            @click="stopAiCoaching"
          >
            <Icon name="close" :size="14" /> {{ $t('ai.coachStop') }}
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="aiStatus !== null && !aiStatus.enabled"
            @click="runAiCoaching"
          >
            <Icon name="sparkles" :size="14" /> {{ $t('ai.coachAnalyze') }}
          </button>
          <button
            v-if="coachMarkdown && !coachStreaming"
            type="button"
            class="btn btn-sm"
            :disabled="coachSavingNote"
            @click="saveCoachingToNotes"
          >
            <span v-if="coachSavingNote" class="spinner" />
            <Icon v-else name="notes" :size="14" />
            {{ $t('ai.coachSaveNote') }}
          </button>
        </div>
      </div>

      <div class="row wrap" style="gap: 8px">
        <input
          v-model="coachFocus"
          class="input"
          :placeholder="$t('ai.coachFocusPlaceholder')"
          :aria-label="$t('ai.coachFocusPlaceholder')"
          :disabled="coachStreaming"
          @keydown.enter.prevent="runAiCoaching"
        />
      </div>

      <p v-if="aiStatus && !aiStatus.enabled" class="field-hint mt-8">
        {{ $t('ai.notConfiguredHint') }}
      </p>
      <p v-if="coachError" class="form-error mt-8">{{ coachError }}</p>

      <div v-if="coachMarkdown || coachStreaming" class="feature-card mt-16">
        <MarkdownView v-if="coachMarkdown" :content="coachMarkdown" />
        <div v-else class="row" style="gap: 8px">
          <span class="spinner" />
          <span class="muted">{{ $t('common.loading') }}</span>
        </div>
      </div>
    </section>

    <div class="grid cols-main">
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('dashboard.todayTasks') }}</h2>
              <p class="card-hint">
                {{ $t('dashboard.todayHint', { date: formatDate(data.today), goal: formatMinutes(data.settings.dailyGoalMinutes) }) }}
              </p>
            </div>
            <RouterLink to="/planner" class="btn btn-sm">{{ $t('dashboard.openPlanner') }}</RouterLink>
          </div>

          <div v-if="data.tasks.today.length === 0">
            <EmptyState
              :title="$t('dashboard.emptyTodayTitle')"
              :text="$t('dashboard.emptyTodayText')"
              icon="planner"
            >
              <RouterLink to="/planner" class="btn btn-primary btn-sm">{{ $t('dashboard.createTask') }}</RouterLink>
            </EmptyState>
          </div>
          <div v-else>
            <TaskRow
              v-for="task in data.tasks.today"
              :key="task.id"
              :task="task"
              :today="data.today"
              @toggle="toggleTask"
              @edit="() => $router.push('/planner')"
              @remove="() => $router.push('/planner')"
            />
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('dashboard.studyLast7') }}</h2>
              <p class="card-hint">
                {{ $t('dashboard.streakNote', { days: data.study.streakDays }) }}
              </p>
            </div>
            <RouterLink to="/planner" class="link-btn">{{ $t('dashboard.logTime') }}</RouterLink>
          </div>

          <div class="grid cols-2">
            <div>
              <div class="progress-meta">
                <span>{{ $t('common.today') }}</span>
                <span>{{ formatMinutes(data.study.todayMinutes) }} / {{ formatMinutes(data.settings.dailyGoalMinutes) }}</span>
              </div>
              <ProgressBar
                :value="
                  data.settings.dailyGoalMinutes > 0
                    ? (data.study.todayMinutes / data.settings.dailyGoalMinutes) * 100
                    : 0
                "
              />
            </div>
            <div>
              <div class="progress-meta">
                <span>{{ $t('dashboard.thisWeek') }}</span>
                <span>{{ formatMinutes(data.study.weekMinutes) }} / {{ formatMinutes(data.settings.weeklyGoalMinutes) }}</span>
              </div>
              <ProgressBar
                :value="
                  data.settings.weeklyGoalMinutes > 0
                    ? (data.study.weekMinutes / data.settings.weeklyGoalMinutes) * 100
                    : 0
                "
              />
            </div>
          </div>

          <div v-if="data.study.totalMinutes === 0" class="mt-16">
            <EmptyState
              :title="$t('dashboard.noSessionsTitle')"
              :text="$t('dashboard.noSessionsText')"
              icon="clock"
            />
          </div>
          <MiniBarChart v-else class="mt-16" :items="data.study.last7Days" />
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('dashboard.overdueTitle') }}</h2>
              <p class="card-hint">{{ $t('dashboard.overdueHint') }}</p>
            </div>
            <span class="badge" :class="data.tasks.overdue.length ? 'badge-warning' : 'badge-neutral'">
              {{ data.tasks.overdue.length }}
            </span>
          </div>
          <div v-if="data.tasks.overdue.length === 0">
            <p class="muted">{{ $t('dashboard.noOverdue') }}</p>
          </div>
          <div v-else>
            <TaskRow
              v-for="task in data.tasks.overdue"
              :key="task.id"
              :task="task"
              :today="data.today"
              show-date
              @toggle="toggleTask"
              @edit="() => $router.push('/planner')"
              @remove="() => $router.push('/planner')"
            />
            <RouterLink to="/planner" class="link-btn mt-8">{{ $t('dashboard.rescheduleInPlanner') }}</RouterLink>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('dashboard.portfolioTitle') }}</h2>
              <p class="card-hint">{{ $t('dashboard.portfolioHint') }}</p>
            </div>
            <RouterLink to="/projects" class="link-btn">{{ $t('common.details') }}</RouterLink>
          </div>
          <div v-if="data.projects.totalFeatures === 0">
            <p class="muted">{{ $t('dashboard.noProject') }}</p>
          </div>
          <div v-else>
            <div class="progress-meta">
              <span>{{ $t('dashboard.portfolioProgress', { done: data.projects.completedFeatures, total: data.projects.totalFeatures }) }}</span>
              <strong>{{ data.projects.progress }}%</strong>
            </div>
            <ProgressBar :value="data.projects.progress" size="lg" />
            <p class="card-hint mt-8">
              {{ $t('dashboard.portfolioCount', { count: data.projects.projectsTotal }) }}
            </p>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('dashboard.interviewTitle') }}</h2>
              <p class="card-hint">{{ $t('dashboard.interviewHint') }}</p>
            </div>
            <RouterLink to="/interview" class="link-btn">{{ $t('common.details') }}</RouterLink>
          </div>
          <div class="grid cols-3">
            <div>
              <div class="stat-value">{{ data.interview.mastered }}</div>
              <div class="stat-note">{{ $t('dashboard.mastered') }}</div>
            </div>
            <div>
              <div class="stat-value">{{ data.interview.reviewing }}</div>
              <div class="stat-note">{{ $t('dashboard.reviewing') }}</div>
            </div>
            <div>
              <div class="stat-value">{{ data.interview.questionsTotal }}</div>
              <div class="stat-note">{{ $t('dashboard.questions') }}</div>
            </div>
          </div>
          <p class="card-hint mt-8">
            {{ $t('dashboard.reviewedWeek', { count: data.interview.reviewedThisWeek }) }}
          </p>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('dashboard.jobsTitle') }}</h2>
              <p class="card-hint">{{ $t('dashboard.jobsHint', { count: data.jobs.total }) }}</p>
            </div>
            <RouterLink to="/jobs" class="link-btn">{{ $t('common.details') }}</RouterLink>
          </div>
          <div v-if="data.jobs.total === 0">
            <EmptyState
              :title="$t('dashboard.noJobsTitle')"
              :text="$t('dashboard.noJobsText')"
              icon="jobs"
            >
              <RouterLink to="/jobs" class="btn btn-sm">{{ $t('dashboard.addApplication') }}</RouterLink>
            </EmptyState>
          </div>
          <div v-else>
            <div class="grid cols-3">
              <div v-for="status in jobOrder" :key="status">
                <div class="stat-value">{{ data.jobs.byStatus[status] }}</div>
                <div class="stat-note">{{ jobStatusLabels[status] }}</div>
              </div>
            </div>
            <div class="divider" />
            <h3>{{ $t('dashboard.followUps') }}</h3>
            <div v-if="data.jobs.followUps.length === 0" class="muted mt-8">
              {{ $t('dashboard.noFollowUps') }}
            </div>
            <ul v-else class="mt-8">
              <li v-for="job in data.jobs.followUps" :key="job.id" class="list-item">
                <div class="grow">
                  <div class="row-between">
                    <strong>{{ job.company }}</strong>
                    <span class="badge" :class="`badge-${badgeToneForJobStatus(job.status)}`">
                      {{ jobStatusLabels[job.status] }}
                    </span>
                  </div>
                  <div class="list-meta">
                    <span>{{ job.position }}</span>
                    <span class="sep">·</span>
                    <span class="text-danger">{{ $t('dashboard.followUp', { date: formatDate(job.followUpAt) }) }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section class="card">
          <h2 class="card-title">{{ $t('dashboard.dataStatusTitle') }}</h2>
          <p class="card-hint">{{ $t('dashboard.dataStatusHint') }}</p>
          <ul class="mt-16 stack-sm">
            <li class="row-between">
              <span class="muted">{{ $t('dashboard.completedToday') }}</span>
              <strong>{{ data.tasks.completedToday }}</strong>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('dashboard.weekCompleted') }}</span>
              <strong>{{ data.tasks.weekCompleted }}</strong>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('dashboard.totalSessions') }}</span>
              <strong>{{ data.study.totalMinutes > 0 ? $t('common.yes') : $t('common.no') }}</strong>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('dashboard.notes') }}</span>
              <strong>{{ data.dataStatus.notes ? $t('common.yes') : $t('common.no') }}</strong>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('dashboard.todayTask') }}</span>
              <strong>
                {{ $t('dashboard.todoCount', { label: taskStatusLabels.todo, count: data.tasks.today.filter((t) => t.status === 'todo').length }) }}
              </strong>
            </li>
          </ul>
          <p class="card-hint mt-16">
            {{ $t('dashboard.todayLine', { date: formatDate(data.today) }) }}
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
