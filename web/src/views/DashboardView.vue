<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { AiStatus, AnalyticsData, DashboardData, JobStatus, Task } from '@shared/types';
import { api, ApiError, streamAiWeeklyCoaching } from '../lib/api';
import { clampPercent, formatDate, formatMinutes } from '../lib/format';
import {
  badgeToneForJobStatus,
  jobStatusLabels,
  taskStatusLabels,
} from '../lib/labels';
import { useToast } from '../composables/useToast';
import { confirmAction } from '../composables/useConfirm';
import { useFocusTimer } from '../composables/useFocusTimer';
import PageHeader from '../components/PageHeader.vue';
import StatCard from '../components/StatCard.vue';
import ProgressBar from '../components/ProgressBar.vue';
import MiniBarChart from '../components/MiniBarChart.vue';
import StudyHeatmap from '../components/StudyHeatmap.vue';
import WeeklyTrendChart from '../components/WeeklyTrendChart.vue';
import TaskRow from '../components/TaskRow.vue';
import EmptyState from '../components/EmptyState.vue';
import MarkdownView from '../components/MarkdownView.vue';
import Icon from '../components/Icon.vue';

const router = useRouter();
const data = ref<DashboardData | null>(null);
const analytics = ref<AnalyticsData | null>(null);
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
const focusTimer = useFocusTimer();

function focusOnTask(task: Task) {
  focusTimer.startFocusFor({
    courseId: task.relatedCourseId,
    courseTitle: task.courseTitle ?? null,
    taskId: task.id,
    taskTitle: task.title,
    workMinutes: task.estimatedMinutes ?? undefined,
  });
}

function handleSessionLogged() {
  void load();
}

const jobOrder: JobStatus[] = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'];

const openTaskCount = computed(() => data.value?.tasks.openCount ?? 0);
const todayTaskCount = computed(() => data.value?.tasks.today.length ?? 0);
const showRoadmapSetup = computed(
  () => data.value !== null && data.value.settings.roadmapStartDate === null,
);
const originalSchedulePassed = computed(
  () => data.value !== null && data.value.today > '2026-11-15',
);
const todayGoalPercent = computed(() => {
  if (!data.value || data.value.settings.dailyGoalMinutes <= 0) return 0;
  return clampPercent(
    (data.value.study.todayMinutes / data.value.settings.dailyGoalMinutes) * 100,
  );
});
const weekGoalPercent = computed(() => {
  if (!data.value || data.value.settings.weeklyGoalMinutes <= 0) return 0;
  return clampPercent(
    (data.value.study.weekMinutes / data.value.settings.weeklyGoalMinutes) * 100,
  );
});
const interviewMasteredPercent = computed(() => {
  if (!data.value || data.value.interview.topicsTotal === 0) return 0;
  return clampPercent(
    (data.value.interview.mastered / data.value.interview.topicsTotal) * 100,
  );
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [dashboardData, status, analyticsData] = await Promise.all([
      api.dashboard(),
      api.aiStatus().catch(() => ({ enabled: false, model: '', baseUrl: '' })),
      api.analytics(180).catch(() => null),
    ]);
    data.value = dashboardData;
    aiStatus.value = status;
    analytics.value = analyticsData;
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

async function copyCoaching() {
  if (!coachMarkdown.value.trim()) return;
  try {
    await navigator.clipboard.writeText(coachMarkdown.value.trim());
    toast.success(t('common.copied'));
  } catch {
    // Ignore clipboard failure in restricted contexts
  }
}

onBeforeUnmount(() => {
  coachAbortController?.abort();
  window.removeEventListener('lr:session-logged', handleSessionLogged);
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

async function startTask(task: Task) {
  if (updatingTask.value !== null) return;
  updatingTask.value = task.id;
  try {
    await api.updateTask(task.id, {
      status: task.status === 'in_progress' ? 'todo' : 'in_progress',
    });
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    updatingTask.value = null;
  }
}

async function removeTask(task: Task) {
  const confirmed = await confirmAction({
    title: t('planner.deleteTaskTitle'),
    message: t('planner.deleteTaskText', { title: task.title }),
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteTask(task.id);
    toast.success(t('planner.taskDeleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

function editInPlanner(task: Task) {
  const date = task.plannedDate ?? data.value?.today;
  void router.push({
    path: '/planner',
    query: date ? { date } : undefined,
  });
}

onMounted(() => {
  window.addEventListener('lr:session-logged', handleSessionLogged);
  void load();
});
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
      <RouterLink to="/planner?action=session" class="btn btn-primary">
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
        :progress="data.roadmap.progress"
        icon="target"
        tone="accent"
        to="/roadmap"
      />
      <StatCard
        :label="$t('dashboard.coursesCompleted')"
        :value="`${data.roadmap.byStatus.completed}/${data.roadmap.totalCourses}`"
        :note="$t('dashboard.coursesNote', { inProgress: data.roadmap.byStatus.in_progress, paused: data.roadmap.byStatus.paused })"
        icon="roadmap"
        tone="success"
        to="/roadmap"
      />
      <StatCard
        :label="$t('dashboard.studyTotal')"
        :value="formatMinutes(data.study.totalMinutes)"
        :note="$t('dashboard.studyWeekNote', { duration: formatMinutes(data.study.weekMinutes) })"
        icon="clock"
        tone="info"
        to="/planner"
      />
      <StatCard
        :label="$t('dashboard.openTasks')"
        :value="openTaskCount"
        :note="$t('dashboard.taskNote', { today: todayTaskCount, overdue: data.tasks.overdue.length })"
        icon="planner"
        :tone="data.tasks.overdue.length > 0 ? 'warning' : 'default'"
        to="/planner"
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
        <RouterLink
          v-for="group in data.roadmap.groups"
          :key="group.category"
          :to="`/roadmap?category=${group.category}`"
          class="card compact card-interactive"
        >
          <div class="row-between" style="align-items: flex-start">
            <div class="stack-sm" style="gap: 4px">
              <div class="row wrap" style="gap: 6px">
                <span class="badge" :class="`badge-cat-${group.category}`">
                  {{ $t(`labels.category.${group.category}`) }}
                </span>
                <span class="card-title" style="font-size: 13.5px">
                  {{ $t(`labels.categoryDescription.${group.category}`) }}
                </span>
              </div>
              <p class="card-hint">
                {{ $t('dashboard.groupMeta', { completed: group.coursesCompleted, total: group.coursesTotal, inProgress: group.coursesInProgress }) }}
              </p>
            </div>
            <strong class="tabular" style="font-size: 15px">{{ group.progress }}%</strong>
          </div>
          <div class="mt-12">
            <ProgressBar
              :value="group.progress"
              :tone="group.progress === 100 ? 'success' : 'accent'"
              size="lg"
            />
          </div>
          <p class="card-hint mt-8 tabular">
            {{ $t('dashboard.groupStudy', { duration: formatMinutes(group.studyMinutes) }) }}
          </p>
        </RouterLink>
      </div>
    </section>

    <section class="card ai-coach-card">
      <div class="card-head">
        <div>
          <div class="row wrap" style="gap: 8px">
            <h2 class="card-title">
              <Icon name="sparkles" :size="16" class="text-info" />
              {{ $t('ai.coachTitle') }}
            </h2>
            <span class="badge" :class="aiStatus?.enabled ? 'badge-info' : 'badge-neutral'">
              {{
                aiStatus?.enabled
                  ? $t('ai.statusConnected', { model: aiStatus.model })
                  : $t('ai.statusDisabled')
              }}
            </span>
          </div>
          <p class="card-hint">{{ $t('ai.coachHint') }}</p>
        </div>
        <div class="row wrap" style="gap: 6px">
          <button
            v-if="coachMarkdown && !coachStreaming"
            type="button"
            class="btn btn-sm"
            :aria-label="$t('common.save')"
            @click="copyCoaching"
          >
            <Icon name="copy" :size="14" />
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
          <button
            v-if="coachMarkdown && !coachStreaming"
            type="button"
            class="btn btn-ghost btn-icon btn-sm"
            :aria-label="$t('common.close')"
            @click="coachMarkdown = ''"
          >
            <Icon name="close" :size="14" />
          </button>
        </div>
      </div>

      <form class="row wrap" style="gap: 8px" @submit.prevent="runAiCoaching">
        <input
          v-model="coachFocus"
          class="input grow"
          :placeholder="$t('ai.coachFocusPlaceholder')"
          :aria-label="$t('ai.coachFocusPlaceholder')"
          :disabled="coachStreaming"
        />
        <button
          v-if="coachStreaming"
          type="button"
          class="btn"
          @click="stopAiCoaching"
        >
          <Icon name="close" :size="14" /> {{ $t('ai.coachStop') }}
        </button>
        <button
          v-else
          type="submit"
          class="btn btn-primary"
          :disabled="aiStatus !== null && !aiStatus.enabled"
        >
          <Icon name="sparkles" :size="15" /> {{ $t('ai.coachAnalyze') }}
        </button>
      </form>

      <div v-if="aiStatus && !aiStatus.enabled" class="row wrap mt-8" style="gap: 8px">
        <p class="field-hint">{{ $t('ai.notConfiguredHint') }}</p>
        <RouterLink to="/settings#ai-settings" class="link-btn">
          {{ $t('ai.openSettingsCta') }} →
        </RouterLink>
      </div>
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
              show-start
              show-focus
              @toggle="toggleTask"
              @start="startTask"
              @focus="focusOnTask"
              @edit="editInPlanner"
              @remove="removeTask"
            />
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('dashboard.studyLast7') }}</h2>
              <p class="card-hint row" style="gap: 5px">
                <Icon name="flame" :size="14" :class="data.study.streakDays > 0 ? 'text-danger' : 'muted'" />
                <span>{{ $t('dashboard.streakNote', { days: data.study.streakDays }) }}</span>
              </p>
            </div>
            <RouterLink to="/planner?action=session" class="link-btn">{{ $t('dashboard.logTime') }}</RouterLink>
          </div>

          <div class="grid cols-2">
            <div>
              <div class="progress-meta">
                <span>{{ $t('common.today') }}</span>
                <span class="tabular">
                  {{ formatMinutes(data.study.todayMinutes) }} / {{ formatMinutes(data.settings.dailyGoalMinutes) }}
                  ({{ todayGoalPercent }}%)
                </span>
              </div>
              <ProgressBar
                :value="todayGoalPercent"
                :tone="todayGoalPercent >= 100 ? 'success' : 'accent'"
              />
            </div>
            <div>
              <div class="progress-meta">
                <span>{{ $t('dashboard.thisWeek') }}</span>
                <span class="tabular">
                  {{ formatMinutes(data.study.weekMinutes) }} / {{ formatMinutes(data.settings.weeklyGoalMinutes) }}
                  ({{ weekGoalPercent }}%)
                </span>
              </div>
              <ProgressBar
                :value="weekGoalPercent"
                :tone="weekGoalPercent >= 100 ? 'success' : 'accent'"
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
          <MiniBarChart
            v-else
            class="mt-16"
            :items="data.study.last7Days"
            :daily-goal-minutes="data.settings.dailyGoalMinutes"
            :today="data.today"
          />
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">{{ $t('dashboard.overdueTitle') }}</h2>
              <p class="card-hint">{{ $t('dashboard.overdueHint') }}</p>
            </div>
            <span class="badge tabular" :class="data.tasks.overdue.length ? 'badge-warning' : 'badge-neutral'">
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
              @edit="editInPlanner"
              @remove="removeTask"
            />
            <RouterLink to="/planner" class="link-btn mt-12">{{ $t('dashboard.rescheduleInPlanner') }}</RouterLink>
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
              <strong class="tabular">{{ data.projects.progress }}%</strong>
            </div>
            <ProgressBar
              :value="data.projects.progress"
              :tone="data.projects.progress === 100 ? 'success' : 'accent'"
              size="lg"
            />
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
              <div class="stat-value tabular">{{ data.interview.mastered }}</div>
              <div class="stat-note">{{ $t('dashboard.mastered') }}</div>
            </div>
            <div>
              <div class="stat-value tabular">{{ data.interview.reviewing }}</div>
              <div class="stat-note">{{ $t('dashboard.reviewing') }}</div>
            </div>
            <div>
              <div class="stat-value tabular">{{ data.interview.questionsTotal }}</div>
              <div class="stat-note">{{ $t('dashboard.questions') }}</div>
            </div>
          </div>
          <div v-if="data.interview.topicsTotal > 0" class="mt-12">
            <ProgressBar
              :value="interviewMasteredPercent"
              :tone="interviewMasteredPercent === 100 ? 'success' : 'accent'"
              size="sm"
            />
          </div>
          <p class="card-hint mt-8">
            {{ $t('dashboard.reviewedWeek', { count: data.interview.reviewedThisWeek }) }}
          </p>
          <div v-if="data.interview.dueQuestionsCount > 0" class="mt-12">
            <RouterLink to="/interview?tab=practice" class="btn btn-sm">
              <Icon name="flip" :size="14" />
              {{ $t('dashboard.dueQuestionsCta', { count: data.interview.dueQuestionsCount }) }}
            </RouterLink>
          </div>
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
            <div class="grid cols-2" style="gap: 8px">
              <div
                v-for="status in jobOrder"
                :key="status"
                class="row-between"
                style="padding: 7px 10px; border-radius: var(--radius-sm); background: var(--surface-2); border: 1px solid var(--border)"
              >
                <span class="badge" :class="`badge-${badgeToneForJobStatus(status)}`">
                  {{ jobStatusLabels[status] }}
                </span>
                <strong class="tabular">{{ data.jobs.byStatus[status] }}</strong>
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
              <strong class="tabular">{{ data.tasks.completedToday }}</strong>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('dashboard.weekCompleted') }}</span>
              <strong class="tabular">{{ data.tasks.weekCompleted }}</strong>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('dashboard.totalSessions') }}</span>
              <span class="row" style="gap: 6px">
                <span class="status-dot" :class="data.study.totalMinutes > 0 ? 'on' : 'off'" />
                <strong>{{ data.study.totalMinutes > 0 ? $t('common.yes') : $t('common.no') }}</strong>
              </span>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('dashboard.notes') }}</span>
              <span class="row" style="gap: 6px">
                <span class="status-dot" :class="data.dataStatus.notes ? 'on' : 'off'" />
                <strong>{{ data.dataStatus.notes ? $t('common.yes') : $t('common.no') }}</strong>
              </span>
            </li>
            <li class="row-between">
              <span class="muted">{{ $t('dashboard.todayTask') }}</span>
              <strong class="tabular">
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

    <section v-if="analytics" class="card">
      <div class="card-head wrap">
        <div>
          <h2 class="card-title">
            <Icon name="bar-chart" :size="16" class="text-info" />
            {{ $t('analytics.title') }}
          </h2>
          <p class="card-hint">{{ $t('analytics.subtitle') }}</p>
        </div>
        <div class="row wrap" style="gap: 8px">
          <span class="badge badge-info tabular">
            {{ $t('analytics.activeDays', { count: analytics.activeDaysCount }) }}
          </span>
          <span class="badge badge-neutral tabular">
            {{ $t('analytics.longestStreak', { days: analytics.longestStreakDays }) }}
          </span>
        </div>
      </div>

      <div class="stack">
        <div>
          <h3 class="mb-8">{{ $t('analytics.heatmapTitle') }}</h3>
          <StudyHeatmap :days="analytics.heatmap" :today="analytics.today" />
        </div>

        <div>
          <h3 class="mb-8">{{ $t('analytics.weeklyTitle') }}</h3>
          <WeeklyTrendChart
            :items="analytics.weeklyTrend"
            :weekly-goal-minutes="analytics.weeklyGoalMinutes"
          />
        </div>

        <div class="grid cols-2">
          <div class="feature-card">
            <h3>{{ $t('analytics.categoryDistribution') }}</h3>
            <div class="row wrap mt-8" style="gap: 8px">
              <span
                v-for="cat in analytics.byCategory"
                :key="cat.category"
                class="badge tabular"
                :class="`badge-cat-${cat.category}`"
              >
                {{ $t(`labels.category.${cat.category}`) }}: {{ formatMinutes(cat.studyMinutes) }}
              </span>
            </div>
            <p v-if="analytics.topCourses.length === 0" class="muted mt-12">
              {{ $t('analytics.noCategoryData') }}
            </p>
            <ul v-else class="stack-sm mt-12">
              <li
                v-for="course in analytics.topCourses.slice(0, 5)"
                :key="course.courseId"
                class="row-between"
                style="gap: 8px"
              >
                <RouterLink :to="`/roadmap/${course.courseId}`" class="task-title">
                  {{ course.title }}
                </RouterLink>
                <span class="muted tabular nowrap">
                  {{ formatMinutes(course.studyMinutes) }} · {{ course.progress }}%
                </span>
              </li>
            </ul>
          </div>

          <div class="feature-card">
            <h3>{{ $t('analytics.forecastTitle') }}</h3>
            <div class="stack-sm mt-12">
              <div>
                <div class="field-label">{{ $t('analytics.taskAccuracyLabel') }}</div>
                <p v-if="analytics.taskAccuracy.ratioPercent !== null" class="mt-8 tabular">
                  {{
                    $t('analytics.taskAccuracyValue', {
                      ratio: analytics.taskAccuracy.ratioPercent,
                      actual: formatMinutes(analytics.taskAccuracy.totalActualMinutes),
                      estimated: formatMinutes(analytics.taskAccuracy.totalEstimatedMinutes),
                      count: analytics.taskAccuracy.completedWithEstimate,
                    })
                  }}
                </p>
                <p v-else class="muted mt-8">{{ $t('analytics.noAccuracyData') }}</p>
              </div>

              <div class="divider" style="margin: 8px 0" />

              <div>
                <div class="field-label">{{ $t('analytics.paceLabel') }}</div>
                <p v-if="analytics.paceForecast.avgWeeklyMinutes > 0" class="mt-8 tabular">
                  {{
                    $t('analytics.paceValue', {
                      duration: formatMinutes(analytics.paceForecast.avgWeeklyMinutes),
                      hours: analytics.paceForecast.remainingCourseHours,
                    })
                  }}
                </p>
                <p v-else class="muted mt-8">{{ $t('analytics.noForecastData') }}</p>

                <template v-if="analytics.paceForecast.estimatedWeeksToFinish !== null">
                  <div class="field-label mt-12">{{ $t('analytics.etaLabel') }}</div>
                  <p class="mt-8 tabular">
                    <strong>
                      {{
                        $t('analytics.etaValue', {
                          weeks: analytics.paceForecast.estimatedWeeksToFinish,
                        })
                      }}
                    </strong>
                  </p>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
