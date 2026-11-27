<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute } from 'vue-router';
import type {
  AiStatus,
  AiSuggestedTask,
  CourseSummary,
  Project,
  StudySession,
  Task,
  TaskStatus,
  TaskType,
  UserSettings,
} from '@shared/types';
import { PRIORITIES, TASK_STATUSES, TASK_TYPES } from '@shared/types';
import { api, ApiError } from '../lib/api';
import {
  addDays,
  clampPercent,
  combineDateTime,
  dateInTimezone,
  formatDate,
  formatMinutes,
  localTimeString,
  relativeDayLabel,
  startOfWeek,
  todayInTimezone,
} from '../lib/format';
import {
  priorityLabels,
  taskStatusLabels,
  taskTypeLabels,
} from '../lib/labels';
import { useToast } from '../composables/useToast';
import { confirmAction } from '../composables/useConfirm';
import { useFocusTimer } from '../composables/useFocusTimer';
import PageHeader from '../components/PageHeader.vue';
import StatCard from '../components/StatCard.vue';
import TaskRow from '../components/TaskRow.vue';
import EmptyState from '../components/EmptyState.vue';
import BaseModal from '../components/BaseModal.vue';
import Icon from '../components/Icon.vue';

type Tab = 'today' | 'week' | 'history';

interface TaskFormState {
  title: string;
  description: string;
  type: TaskType;
  relatedCourseId: string;
  relatedProjectId: string;
  plannedDate: string;
  dueDate: string;
  estimatedMinutes: string;
  actualMinutes: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high';
}

const route = useRoute();
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

const settings = ref<UserSettings | null>(null);
const today = ref('');
const selectedDate = ref('');
const tab = ref<Tab>('today');

const tasks = ref<Task[]>([]);
const overdue = ref<Task[]>([]);
const sessions = ref<StudySession[]>([]);
const taskOptions = ref<Task[]>([]);
const courses = ref<CourseSummary[]>([]);
const projects = ref<Project[]>([]);
const summary = ref({ open: 0, done: 0, estimatedMinutes: 0, actualMinutes: 0 });
const sessionTotal = ref(0);

const loading = ref(true);
const contentLoading = ref(false);
const error = ref('');
const busy = ref(false);
const formError = ref('');
const sessionError = ref('');

const showTaskModal = ref(false);
const showSessionModal = ref(false);
const showAiPlanModal = ref(false);
const editingTask = ref<Task | null>(null);
const editingSession = ref<StudySession | null>(null);
const quickTitle = ref('');
const quickCourseId = ref('');
const quickEstimate = ref<number | null>(null);
const quickAdding = ref(false);

const quickDurationOptions = [30, 45, 60, 90];

const aiStatus = ref<AiStatus | null>(null);
const aiGenerating = ref(false);
const aiApplying = ref(false);
const aiError = ref('');
const aiSummary = ref('');
const aiSuggestedTasks = ref<(AiSuggestedTask & { selected: boolean })[]>([]);
const aiPlanForm = reactive({
  courseId: '',
  startDate: '',
  days: '3',
  focusNote: '',
});

const taskForm = reactive<TaskFormState>({
  title: '',
  description: '',
  type: 'study',
  relatedCourseId: '',
  relatedProjectId: '',
  plannedDate: '',
  dueDate: '',
  estimatedMinutes: '',
  actualMinutes: '',
  status: 'todo',
  priority: 'medium',
});

const sessionForm = reactive({
  courseId: '',
  taskId: '',
  date: '',
  time: '19:00',
  durationMinutes: '60',
  notes: '',
});

const weekStart = computed(() => startOfWeek(selectedDate.value || today.value));
const weekDays = computed(() => {
  if (tab.value !== 'week') return [];
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart.value, index);
    return {
      date,
      tasks: tasks.value.filter((task) => task.plannedDate === date),
      minutes: minutesOnDate(date),
    };
  });
});

const historySessions = computed(() => sessions.value.slice(0, 40));
const isTodaySelected = computed(() => selectedDate.value === today.value);
const dayEstimate = computed(() => summary.value.estimatedMinutes);
const dayActual = computed(() => summary.value.actualMinutes);
const dailyGoalPercent = computed(() => {
  if (!settings.value || settings.value.dailyGoalMinutes <= 0) return 0;
  return clampPercent((sessionTotal.value / settings.value.dailyGoalMinutes) * 100);
});
const weeklyGoalPercent = computed(() => {
  if (!settings.value || settings.value.weeklyGoalMinutes <= 0) return 0;
  return clampPercent((sessionTotal.value / settings.value.weeklyGoalMinutes) * 100);
});

function minutesOnDate(date: string): number {
  if (!settings.value) return 0;
  return sessions.value
    .filter((session) => dateInTimezone(session.startedAt, settings.value!.timezone) === date)
    .reduce((total, session) => total + session.durationMinutes, 0);
}

function resetTaskForm(date: string) {
  editingTask.value = null;
  taskForm.title = '';
  taskForm.description = '';
  taskForm.type = 'study';
  taskForm.relatedCourseId = '';
  taskForm.relatedProjectId = '';
  taskForm.plannedDate = date;
  taskForm.dueDate = '';
  taskForm.estimatedMinutes = '';
  taskForm.actualMinutes = '';
  taskForm.status = 'todo';
  taskForm.priority = 'medium';
  formError.value = '';
}

async function loadReferences() {
  const [settingsResponse, coursesResponse, projectsResponse, tasksResponse, aiStatusResponse] =
    await Promise.all([
      api.settings(),
      api.courses(),
      api.projects(),
      api.tasks({ scope: 'all' }),
      api.aiStatus().catch(() => ({ enabled: false, model: '', baseUrl: '' })),
    ]);
  settings.value = settingsResponse;
  today.value = todayInTimezone(settingsResponse.timezone);
  const queryDate =
    typeof route.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date)
      ? route.query.date
      : '';
  if (!selectedDate.value) selectedDate.value = queryDate || today.value;
  courses.value = coursesResponse.courses;
  projects.value = projectsResponse.projects;
  taskOptions.value = tasksResponse.tasks;
  aiStatus.value = aiStatusResponse;
}

const selectedAiTaskCount = computed(
  () => aiSuggestedTasks.value.filter((item) => item.selected).length,
);
const allAiSelected = computed(
  () => aiSuggestedTasks.value.length > 0 && selectedAiTaskCount.value === aiSuggestedTasks.value.length,
);

function toggleAllAiTasks() {
  const next = !allAiSelected.value;
  for (const item of aiSuggestedTasks.value) {
    item.selected = next;
  }
}

function openAiPlanModal() {
  aiPlanForm.courseId =
    typeof route.query.courseId === 'string' ? route.query.courseId : '';
  aiPlanForm.startDate = selectedDate.value || today.value;
  aiPlanForm.days = '3';
  aiPlanForm.focusNote = '';
  aiError.value = '';
  aiSummary.value = '';
  aiSuggestedTasks.value = [];
  showAiPlanModal.value = true;
}

async function generateAiPlan() {
  if (aiGenerating.value) return;
  aiGenerating.value = true;
  aiError.value = '';
  try {
    const result = await api.aiStudyPlan({
      courseId: aiPlanForm.courseId ? Number(aiPlanForm.courseId) : null,
      startDate: aiPlanForm.startDate || selectedDate.value || today.value,
      days: Number(aiPlanForm.days) || 3,
      focusNote: aiPlanForm.focusNote.trim() || undefined,
    });
    aiSummary.value = result.summary;
    aiSuggestedTasks.value = result.tasks.map((task) => ({
      ...task,
      selected: true,
    }));
  } catch (err) {
    aiError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    aiGenerating.value = false;
  }
}

async function applyAiSelectedTasks() {
  const chosen = aiSuggestedTasks.value.filter((item) => item.selected);
  if (chosen.length === 0 || aiApplying.value) return;
  aiApplying.value = true;
  aiError.value = '';
  try {
    for (const item of chosen) {
      await api.createTask({
        title: item.title,
        description: item.description,
        type: item.type,
        relatedCourseId: item.relatedCourseId,
        plannedDate: item.plannedDate,
        estimatedMinutes: item.estimatedMinutes,
        priority: item.priority,
        status: 'todo',
      });
    }
    toast.success(t('ai.plannerCreatedToast', { count: chosen.length }));
    showAiPlanModal.value = false;
    await Promise.all([loadCurrent(), refreshOptions()]);
  } catch (err) {
    aiError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    aiApplying.value = false;
  }
}

async function loadCurrent() {
  if (!settings.value) return;
  contentLoading.value = true;
  error.value = '';
  try {
    if (tab.value === 'today') {
      const [dayTasks, overdueTasks, daySessions] = await Promise.all([
        api.tasks({ scope: 'today', date: selectedDate.value }),
        api.tasks({ scope: 'overdue' }),
        api.sessions({ from: selectedDate.value, to: selectedDate.value }),
      ]);
      tasks.value = dayTasks.tasks;
      summary.value = dayTasks.summary;
      overdue.value = overdueTasks.tasks;
      sessions.value = daySessions.sessions;
      sessionTotal.value = daySessions.totalMinutes;
    } else if (tab.value === 'week') {
      const start = startOfWeek(selectedDate.value);
      const end = addDays(start, 6);
      const [weekTasks, weekSessions] = await Promise.all([
        api.tasks({ scope: 'week', date: selectedDate.value }),
        api.sessions({ from: start, to: end }),
      ]);
      tasks.value = weekTasks.tasks;
      summary.value = weekTasks.summary;
      sessions.value = weekSessions.sessions;
      sessionTotal.value = weekSessions.totalMinutes;
      overdue.value = [];
    } else {
      const [historyTasks, allSessions] = await Promise.all([
        api.tasks({ scope: 'history' }),
        api.sessions(),
      ]);
      tasks.value = historyTasks.tasks;
      summary.value = historyTasks.summary;
      sessions.value = allSessions.sessions;
      sessionTotal.value = allSessions.totalMinutes;
      overdue.value = [];
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.plannerLoad');
  } finally {
    contentLoading.value = false;
  }
}

async function switchTab(next: Tab) {
  tab.value = next;
  await loadCurrent();
}

function shiftDate(amount: number) {
  selectedDate.value = addDays(
    selectedDate.value || today.value,
    tab.value === 'week' ? amount * 7 : amount,
  );
  void loadCurrent();
}

function goToday() {
  selectedDate.value = today.value;
  void loadCurrent();
}

async function refreshOptions() {
  const response = await api.tasks({ scope: 'all' });
  taskOptions.value = response.tasks;
}

async function quickAdd() {
  if (!quickTitle.value.trim()) return;
  quickAdding.value = true;
  try {
    await api.createTask({
      title: quickTitle.value.trim(),
      type: 'study',
      plannedDate: selectedDate.value,
      relatedCourseId: quickCourseId.value ? Number(quickCourseId.value) : null,
      estimatedMinutes: quickEstimate.value,
    });
    quickTitle.value = '';
    toast.success(t('planner.taskAdded'));
    await Promise.all([loadCurrent(), refreshOptions()]);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    quickAdding.value = false;
  }
}

function openTaskCreate(date = selectedDate.value || today.value) {
  resetTaskForm(date);
  showTaskModal.value = true;
}

function openTaskEdit(task: Task) {
  editingTask.value = task;
  taskForm.title = task.title;
  taskForm.description = task.description;
  taskForm.type = task.type;
  taskForm.relatedCourseId = task.relatedCourseId ? String(task.relatedCourseId) : '';
  taskForm.relatedProjectId = task.relatedProjectId ? String(task.relatedProjectId) : '';
  taskForm.plannedDate = task.plannedDate ?? '';
  taskForm.dueDate = task.dueDate ?? '';
  taskForm.estimatedMinutes = task.estimatedMinutes === null ? '' : String(task.estimatedMinutes);
  taskForm.actualMinutes = String(task.actualMinutes);
  taskForm.status = task.status;
  taskForm.priority = task.priority;
  formError.value = '';
  showTaskModal.value = true;
}

async function saveTask() {
  if (!taskForm.title.trim()) {
    formError.value = t('planner.taskTitleRequired');
    return;
  }
  busy.value = true;
  formError.value = '';
  try {
    const payload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      type: taskForm.type,
      relatedCourseId: taskForm.relatedCourseId ? Number(taskForm.relatedCourseId) : null,
      relatedProjectId: taskForm.relatedProjectId ? Number(taskForm.relatedProjectId) : null,
      plannedDate: taskForm.plannedDate || null,
      dueDate: taskForm.dueDate || null,
      estimatedMinutes: taskForm.estimatedMinutes ? Number(taskForm.estimatedMinutes) : null,
      actualMinutes: taskForm.actualMinutes ? Number(taskForm.actualMinutes) : 0,
      status: taskForm.status,
      priority: taskForm.priority,
    };
    if (editingTask.value) {
      await api.updateTask(editingTask.value.id, payload);
      toast.success(t('planner.taskUpdated'));
    } else {
      await api.createTask(payload);
      toast.success(t('planner.taskCreated'));
    }
    showTaskModal.value = false;
    await Promise.all([loadCurrent(), refreshOptions()]);
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    busy.value = false;
  }
}

async function toggleTask(task: Task) {
  try {
    await api.updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
    await loadCurrent();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function startTask(task: Task) {
  try {
    await api.updateTask(task.id, {
      status: task.status === 'in_progress' ? 'todo' : 'in_progress',
    });
    await loadCurrent();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
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
    await Promise.all([loadCurrent(), refreshOptions()]);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function rescheduleOverdue() {
  if (overdue.value.length === 0) return;
  const confirmed = await confirmAction({
    title: t('planner.rescheduleTitle'),
    message: t('planner.rescheduleText', { count: overdue.value.length, date: formatDate(selectedDate.value) }),
    confirmLabel: t('planner.rescheduleAction'),
  });
  if (!confirmed) return;
  busy.value = true;
  try {
    for (const task of overdue.value) {
      await api.rescheduleTask(task.id, selectedDate.value);
    }
    toast.success(t('planner.rescheduled'));
    await loadCurrent();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    busy.value = false;
  }
}

function resetSessionForm() {
  editingSession.value = null;
  sessionForm.courseId =
    typeof route.query.courseId === 'string' ? route.query.courseId : '';
  sessionForm.taskId = '';
  sessionForm.date = selectedDate.value || today.value;
  sessionForm.time = '19:00';
  sessionForm.durationMinutes = '60';
  sessionForm.notes = '';
  sessionError.value = '';
}

function openSessionCreate() {
  resetSessionForm();
  showSessionModal.value = true;
}

function openSessionForTask(task: Task) {
  resetSessionForm();
  sessionForm.taskId = String(task.id);
  sessionForm.courseId = task.relatedCourseId ? String(task.relatedCourseId) : '';
  sessionForm.date = task.plannedDate || selectedDate.value || today.value;
  sessionForm.durationMinutes = task.estimatedMinutes ? String(task.estimatedMinutes) : '60';
  showSessionModal.value = true;
}

function openSessionEdit(session: StudySession) {
  editingSession.value = session;
  sessionForm.courseId = session.courseId ? String(session.courseId) : '';
  sessionForm.taskId = session.taskId ? String(session.taskId) : '';
  sessionForm.date = settings.value
    ? dateInTimezone(session.startedAt, settings.value.timezone)
    : session.startedAt.slice(0, 10);
  sessionForm.time = localTimeString(session.startedAt) || '19:00';
  sessionForm.durationMinutes = String(session.durationMinutes);
  sessionForm.notes = session.notes;
  sessionError.value = '';
  showSessionModal.value = true;
}

function onSessionTaskChange() {
  if (!sessionForm.taskId) return;
  const task = taskOptions.value.find((item) => item.id === Number(sessionForm.taskId));
  if (task?.relatedCourseId && !sessionForm.courseId) {
    sessionForm.courseId = String(task.relatedCourseId);
  }
}

async function saveSession() {
  const duration = Number(sessionForm.durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) {
    sessionError.value = t('planner.durationInvalid');
    return;
  }
  busy.value = true;
  sessionError.value = '';
  try {
    const payload = {
      startedAt: combineDateTime(sessionForm.date, sessionForm.time),
      durationMinutes: duration,
      courseId: sessionForm.courseId ? Number(sessionForm.courseId) : null,
      taskId: sessionForm.taskId ? Number(sessionForm.taskId) : null,
      notes: sessionForm.notes.trim(),
    };
    if (editingSession.value) {
      await api.updateSession(editingSession.value.id, payload);
      toast.success(t('planner.sessionUpdated'));
    } else {
      await api.createSession(payload);
      toast.success(t('planner.sessionSaved'));
    }
    showSessionModal.value = false;
    await loadCurrent();
  } catch (err) {
    sessionError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    busy.value = false;
  }
}

async function removeSession(session: StudySession) {
  const confirmed = await confirmAction({
    title: t('course.deleteSessionTitle'),
    message: t('planner.deleteSessionText', { duration: formatMinutes(session.durationMinutes), date: formatDate(session.startedAt) }),
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteSession(session.id);
    toast.success(t('course.sessionDeleted'));
    await loadCurrent();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

function handleSessionLogged() {
  void loadCurrent();
}

onMounted(async () => {
  window.addEventListener('lr:session-logged', handleSessionLogged);
  loading.value = true;
  try {
    await loadReferences();
    await loadCurrent();
    if (route.query.action === 'session') {
      openSessionCreate();
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.plannerLoad');
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('lr:session-logged', handleSessionLogged);
});
</script>

<template>
  <PageHeader
    :title="$t('nav.planner')"
    :subtitle="$t('planner.subtitle')"
  >
    <template #actions>
      <button type="button" class="btn" @click="openAiPlanModal">
        <Icon name="sparkles" :size="16" /> {{ $t('ai.plannerButton') }}
      </button>
      <button type="button" class="btn" @click="openSessionCreate">
        <Icon name="clock" :size="16" /> {{ $t('dashboard.addSession') }}
      </button>
      <button type="button" class="btn btn-primary" @click="openTaskCreate()">
        <Icon name="plus" :size="16" /> {{ $t('planner.newTask') }}
      </button>
    </template>
  </PageHeader>

  <div v-if="loading" class="stack">
    <div class="skeleton" style="height: 70px" />
    <div class="skeleton" style="height: 300px" />
  </div>

  <div v-else-if="error && !settings" class="card">
    <EmptyState :title="$t('errors.plannerLoad')" :text="error" icon="alert">
      <button type="button" class="btn btn-primary" @click="loadReferences().then(loadCurrent)">
        {{ $t('common.retry') }}
      </button>
    </EmptyState>
  </div>

  <template v-else-if="settings">
    <div class="card compact">
      <div class="row-between wrap" style="gap: 12px">
        <div class="tabs">
          <button type="button" class="tab" :class="{ active: tab === 'today' }" @click="switchTab('today')">
            {{ $t('common.today') }}
          </button>
          <button type="button" class="tab" :class="{ active: tab === 'week' }" @click="switchTab('week')">
            {{ $t('planner.tabWeek') }}
          </button>
          <button type="button" class="tab" :class="{ active: tab === 'history' }" @click="switchTab('history')">
            {{ $t('planner.tabHistory') }}
          </button>
        </div>

        <div v-if="tab !== 'history'" class="row wrap" style="gap: 6px">
          <button type="button" class="btn btn-ghost btn-icon btn-sm" :aria-label="$t('planner.prev')" @click="shiftDate(-1)">
            <Icon name="chevron-left" :size="16" />
          </button>
          <input v-model="selectedDate" class="input input-sm" type="date" style="width: 150px" @change="loadCurrent" />
          <button type="button" class="btn btn-ghost btn-icon btn-sm" :aria-label="$t('planner.next')" @click="shiftDate(1)">
            <Icon name="chevron-right" :size="16" />
          </button>
          <button type="button" class="btn btn-sm" :disabled="isTodaySelected" @click="goToday">
            {{ $t('common.today') }}
          </button>
        </div>
      </div>
      <p class="card-hint mt-8">
        {{ $t('planner.timezoneGoals', { timezone: settings.timezone, goal: formatMinutes(settings.dailyGoalMinutes) }) }}
        <template v-if="tab === 'week'">
          · {{ $t('planner.weekRange', { start: formatDate(weekStart), end: formatDate(addDays(weekStart, 6)) }) }}
        </template>
      </p>
    </div>

    <div v-if="error" class="alert alert-danger mt-16">
      <Icon name="alert" :size="18" />
      <div class="alert-body">
        <strong>{{ $t('errors.plannerLoad') }}</strong>
        {{ error }}
      </div>
      <button type="button" class="btn btn-sm" @click="loadCurrent">{{ $t('common.retry') }}</button>
    </div>

    <div v-if="tab === 'today'" class="stack mt-16">
      <div class="grid stats-grid">
        <StatCard
          :label="$t('planner.openTasks')"
          :value="summary.open"
          :note="$t('planner.doneInDay', { count: summary.done })"
          icon="planner"
          tone="accent"
        />
        <StatCard
          :label="$t('planner.estimated')"
          :value="formatMinutes(dayEstimate)"
          :note="$t('planner.actualOnTasks', { duration: formatMinutes(dayActual) })"
          icon="target"
        />
        <StatCard
          :label="$t('planner.sessionsInDay')"
          :value="formatMinutes(sessionTotal)"
          :note="$t('planner.sessionsSource')"
          icon="clock"
          tone="info"
        />
        <StatCard
          :label="$t('planner.dailyGoal')"
          :value="`${dailyGoalPercent}%`"
          :progress="dailyGoalPercent"
          icon="check-circle"
          :tone="dailyGoalPercent >= 100 ? 'success' : 'accent'"
        />
      </div>

      <div v-if="overdue.length > 0" class="alert alert-warning">
        <Icon name="alert" :size="18" />
        <div class="alert-body">
          <strong>{{ $t('planner.overdueTitle', { count: overdue.length }) }}</strong>
          {{ $t('planner.overdueText') }}
        </div>
        <button type="button" class="btn btn-sm" :disabled="busy" @click="rescheduleOverdue">
          {{ $t('planner.rescheduleTo', { date: formatDate(selectedDate) }) }}
        </button>
      </div>

      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ relativeDayLabel(selectedDate, today) }} · {{ formatDate(selectedDate) }}</h2>
            <p class="card-hint">{{ $t('planner.quickHint') }}</p>
          </div>
          <button type="button" class="btn btn-sm" @click="openTaskCreate()">{{ $t('planner.detailedTask') }}</button>
        </div>

        <form class="stack-sm" @submit.prevent="quickAdd">
          <div class="row" style="gap: 8px">
            <input
              v-model="quickTitle"
              class="input"
              :placeholder="$t('planner.quickPlaceholder')"
              :aria-label="$t('planner.quickAria')"
            />
            <button type="submit" class="btn btn-primary" :disabled="quickAdding || !quickTitle.trim()">
              <span v-if="quickAdding" class="spinner" /> {{ $t('common.add') }}
            </button>
          </div>
          <div class="row wrap" style="gap: 8px">
            <select
              v-model="quickCourseId"
              class="select input-sm"
              style="max-width: 240px"
              :aria-label="$t('planner.quickCourseLabel')"
            >
              <option value="">{{ $t('planner.quickCourseLabel') }}</option>
              <option v-for="course in courses" :key="course.id" :value="String(course.id)">
                [{{ course.category }}] {{ course.title }}
              </option>
            </select>
            <div class="row wrap" style="gap: 5px">
              <span class="muted">{{ $t('planner.quickMinutesLabel') }}</span>
              <button
                v-for="mins in quickDurationOptions"
                :key="mins"
                type="button"
                class="pill-btn"
                style="padding: 3px 9px; font-size: 11.5px"
                :class="{ active: quickEstimate === mins }"
                @click="quickEstimate = quickEstimate === mins ? null : mins"
              >
                {{ mins }}m
              </button>
            </div>
          </div>
        </form>

        <div v-if="contentLoading" class="mt-16">
          <div class="skeleton skeleton-line" />
          <div class="skeleton skeleton-line" />
          <div class="skeleton skeleton-line short" />
        </div>
        <div v-else-if="tasks.length === 0" class="mt-16">
          <EmptyState
            :title="$t('planner.emptyDayTitle')"
            :text="$t('planner.emptyDayText')"
            icon="calendar"
          />
        </div>
        <div v-else class="mt-16">
          <TaskRow
            v-for="task in tasks"
            :key="task.id"
            :task="task"
            :today="today"
            show-start
            show-focus
            show-log-session
            @toggle="toggleTask"
            @start="startTask"
            @focus="focusOnTask"
            @log-session="openSessionForTask"
            @edit="openTaskEdit"
            @remove="removeTask"
          />
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ $t('planner.sessionsTitle', { date: formatDate(selectedDate) }) }}</h2>
            <p class="card-hint tabular">{{ $t('planner.total', { duration: formatMinutes(sessionTotal) }) }}</p>
          </div>
          <button type="button" class="btn btn-sm" @click="openSessionCreate">
            <Icon name="plus" :size="14" /> {{ $t('course.logTime') }}
          </button>
        </div>
        <div v-if="sessions.length === 0">
          <EmptyState :title="$t('course.noSessionsTitle')" :text="$t('planner.noSessionsText')" icon="clock" />
        </div>
        <ul v-else class="list">
          <li v-for="session in sessions" :key="session.id" class="list-item">
            <div class="grow">
              <div class="row-between">
                <div>
                  <strong class="tabular">{{ formatMinutes(session.durationMinutes) }}</strong>
                  <span class="muted tabular"> · {{ localTimeString(session.startedAt) }}</span>
                </div>
                <div class="row" style="gap: 2px">
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" :aria-label="$t('planner.editSession')" @click="openSessionEdit(session)">
                    <Icon name="edit" :size="14" />
                  </button>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-hover" :aria-label="$t('common.delete')" @click="removeSession(session)">
                    <Icon name="trash" :size="14" />
                  </button>
                </div>
              </div>
              <div v-if="session.courseId || session.taskTitle" class="list-meta">
                <RouterLink
                  v-if="session.courseId"
                  :to="`/roadmap/${session.courseId}`"
                  class="chip chip-link"
                >
                  {{ session.courseTitle }}
                </RouterLink>
                <span v-if="session.taskTitle" class="chip">{{ session.taskTitle }}</span>
              </div>
              <p v-if="session.notes" class="muted mt-8">{{ session.notes }}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <div v-else-if="tab === 'week'" class="stack mt-16">
      <div class="grid stats-grid">
        <StatCard
          :label="$t('planner.weekTasks')"
          :value="summary.open + summary.done"
          :note="$t('planner.weekOpen', { count: summary.open })"
          icon="planner"
          tone="accent"
        />
        <StatCard
          :label="$t('planner.weekStudy')"
          :value="formatMinutes(sessionTotal)"
          :note="$t('planner.weekGoal', { duration: formatMinutes(settings.weeklyGoalMinutes) })"
          icon="clock"
          tone="info"
        />
        <StatCard
          :label="$t('planner.estimated')"
          :value="formatMinutes(dayEstimate)"
          :note="$t('planner.actualOnTasks', { duration: formatMinutes(dayActual) })"
          icon="target"
        />
        <StatCard
          :label="$t('planner.weeklyGoal')"
          :value="`${weeklyGoalPercent}%`"
          :progress="weeklyGoalPercent"
          icon="check-circle"
          :tone="weeklyGoalPercent >= 100 ? 'success' : 'accent'"
        />
      </div>

      <div class="grid cols-2">
        <section
          v-for="day in weekDays"
          :key="day.date"
          class="card compact week-day-card"
          :class="{ 'is-today': day.date === today }"
        >
          <div class="card-head" style="margin-bottom: 10px">
            <div>
              <div class="row" style="gap: 6px">
                <h3>{{ relativeDayLabel(day.date, today) }}</h3>
                <span v-if="day.date === today" class="badge badge-info">{{ $t('common.today') }}</span>
              </div>
              <p class="card-hint tabular">{{ $t('planner.daySessions', { date: formatDate(day.date), duration: formatMinutes(day.minutes) }) }}</p>
            </div>
            <div class="row" style="gap: 6px">
              <span class="badge badge-neutral tabular">{{ $t('planner.taskCount', { count: day.tasks.length }) }}</span>
              <button
                type="button"
                class="btn btn-ghost btn-icon btn-sm"
                :title="$t('planner.addForDay')"
                :aria-label="$t('planner.addForDay')"
                @click="openTaskCreate(day.date)"
              >
                <Icon name="plus" :size="14" />
              </button>
            </div>
          </div>
          <div v-if="day.tasks.length === 0" class="muted">{{ $t('planner.noTasks') }}</div>
          <div v-else>
            <TaskRow
              v-for="task in day.tasks"
              :key="task.id"
              :task="task"
              :today="today"
              show-start
              show-focus
              show-log-session
              @toggle="toggleTask"
              @start="startTask"
              @focus="focusOnTask"
              @log-session="openSessionForTask"
              @edit="openTaskEdit"
              @remove="removeTask"
            />
          </div>
        </section>
      </div>
    </div>

    <div v-else class="stack mt-16">
      <div class="grid stats-grid">
        <StatCard
          :label="$t('planner.historyTasks')"
          :value="summary.done"
          icon="check-circle"
          tone="success"
        />
        <StatCard
          :label="$t('planner.historyStudy')"
          :value="formatMinutes(sessionTotal)"
          icon="clock"
          tone="info"
        />
        <StatCard
          :label="$t('planner.historySessions')"
          :value="sessions.length"
          icon="calendar"
        />
        <StatCard
          :label="$t('planner.historyActual')"
          :value="formatMinutes(dayActual)"
          icon="target"
        />
      </div>

      <div class="grid cols-2">
        <section class="card">
          <h2 class="card-title">{{ $t('planner.historyTaskTitle') }}</h2>
          <div v-if="tasks.length === 0" class="mt-16">
            <EmptyState :title="$t('planner.noHistoryTitle')" :text="$t('planner.noHistoryText')" icon="check" />
          </div>
          <div v-else class="mt-16">
            <TaskRow
              v-for="task in tasks"
              :key="task.id"
              :task="task"
              :today="today"
              show-date
              @toggle="toggleTask"
              @edit="openTaskEdit"
              @remove="removeTask"
            />
          </div>
        </section>

        <section class="card">
          <h2 class="card-title">{{ $t('planner.sessionHistoryTitle') }}</h2>
          <div v-if="historySessions.length === 0" class="mt-16">
            <EmptyState :title="$t('dashboard.noSessionsTitle')" :text="$t('planner.noSessionHistoryText')" icon="clock" />
          </div>
          <ul v-else class="list mt-16">
            <li v-for="session in historySessions" :key="session.id" class="list-item">
              <div class="grow">
                <div class="row-between">
                  <strong class="tabular">{{ formatMinutes(session.durationMinutes) }}</strong>
                  <div class="row" style="gap: 2px">
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" :aria-label="$t('jobs.edit')" @click="openSessionEdit(session)">
                      <Icon name="edit" :size="14" />
                    </button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-hover" :aria-label="$t('jobs.delete')" @click="removeSession(session)">
                      <Icon name="trash" :size="14" />
                    </button>
                  </div>
                </div>
                <div class="list-meta">
                  <span class="tabular">{{ formatDate(session.startedAt) }} · {{ localTimeString(session.startedAt) }}</span>
                  <template v-if="session.courseTitle">
                    <span class="sep">·</span>
                    <span>{{ session.courseTitle }}</span>
                  </template>
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
      </div>
    </div>

    <BaseModal v-if="showTaskModal" :title="editingTask ? $t('taskRow.edit') : $t('planner.createTask')" wide @close="showTaskModal = false">
      <form id="task-form" class="stack" @submit.prevent="saveTask">
        <div class="form-grid">
          <div class="field span-2">
            <label class="field-label" for="task-title">{{ $t('planner.taskTitle') }}</label>
            <input id="task-title" v-model="taskForm.title" class="input" required autofocus />
          </div>
          <div class="field">
            <label class="field-label" for="task-type">{{ $t('planner.taskType') }}</label>
            <select id="task-type" v-model="taskForm.type" class="select">
              <option v-for="type in TASK_TYPES" :key="type" :value="type">{{ taskTypeLabels[type] }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="task-status">{{ $t('jobs.status') }}</label>
            <select id="task-status" v-model="taskForm.status" class="select">
              <option v-for="status in TASK_STATUSES" :key="status" :value="status">
                {{ taskStatusLabels[status] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="task-course">{{ $t('course.courseLink') }}</label>
            <select id="task-course" v-model="taskForm.relatedCourseId" class="select">
              <option value="">{{ $t('planner.noLink') }}</option>
              <option v-for="course in courses" :key="course.id" :value="String(course.id)">
                {{ course.title }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="task-project">{{ $t('planner.taskProject') }}</label>
            <select id="task-project" v-model="taskForm.relatedProjectId" class="select">
              <option value="">{{ $t('planner.noLink') }}</option>
              <option v-for="project in projects" :key="project.id" :value="String(project.id)">
                {{ project.name }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="task-planned">{{ $t('planner.taskPlanned') }}</label>
            <input id="task-planned" v-model="taskForm.plannedDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="task-due">{{ $t('planner.taskDue') }}</label>
            <input id="task-due" v-model="taskForm.dueDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="task-estimate">{{ $t('planner.taskEstimate') }}</label>
            <input id="task-estimate" v-model="taskForm.estimatedMinutes" class="input" type="number" min="0" max="1440" />
          </div>
          <div class="field">
            <label class="field-label" for="task-actual">{{ $t('planner.taskActual') }}</label>
            <input id="task-actual" v-model="taskForm.actualMinutes" class="input" type="number" min="0" max="1440" />
          </div>
          <div class="field">
            <label class="field-label" for="task-priority">{{ $t('planner.taskPriority') }}</label>
            <select id="task-priority" v-model="taskForm.priority" class="select">
              <option v-for="priority in PRIORITIES" :key="priority" :value="priority">
                {{ priorityLabels[priority] }}
              </option>
            </select>
          </div>
          <div class="field span-2">
            <label class="field-label" for="task-description">{{ $t('course.descriptionField') }}</label>
            <textarea id="task-description" v-model="taskForm.description" class="textarea" />
          </div>
        </div>
        <p class="field-hint">
          {{ $t('planner.taskActualHint') }}
        </p>
        <p v-if="formError" class="form-error">{{ formError }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn" @click="showTaskModal = false">{{ $t('common.cancel') }}</button>
        <button type="submit" form="task-form" class="btn btn-primary" :disabled="busy">
          <span v-if="busy" class="spinner" /> {{ $t('planner.saveTask') }}
        </button>
      </template>
    </BaseModal>

    <BaseModal
      v-if="showSessionModal"
      :title="editingSession ? $t('planner.editSession') : $t('dashboard.addSession')"
      @close="showSessionModal = false"
    >
      <form id="session-form" class="stack" @submit.prevent="saveSession">
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="session-date">{{ $t('planner.sessionDate') }}</label>
            <input id="session-date" v-model="sessionForm.date" class="input" type="date" required />
          </div>
          <div class="field">
            <label class="field-label" for="session-time">{{ $t('planner.sessionTime') }}</label>
            <input id="session-time" v-model="sessionForm.time" class="input" type="time" required />
          </div>
          <div class="field">
            <label class="field-label" for="session-duration">{{ $t('planner.sessionDuration') }}</label>
            <input
              id="session-duration"
              v-model="sessionForm.durationMinutes"
              class="input"
              type="number"
              min="1"
              max="1440"
              required
            />
          </div>
          <div class="field">
            <label class="field-label" for="session-course">{{ $t('course.courseLink') }}</label>
            <select id="session-course" v-model="sessionForm.courseId" class="select">
              <option value="">{{ $t('planner.noLink') }}</option>
              <option v-for="course in courses" :key="course.id" :value="String(course.id)">
                {{ course.title }}
              </option>
            </select>
          </div>
          <div class="field span-2">
            <label class="field-label" for="session-task">{{ $t('planner.sessionTask') }}</label>
            <select id="session-task" v-model="sessionForm.taskId" class="select" @change="onSessionTaskChange">
              <option value="">{{ $t('planner.noLink') }}</option>
              <option v-for="task in taskOptions" :key="task.id" :value="String(task.id)">
                {{ task.title }}
              </option>
            </select>
          </div>
          <div class="field span-2">
            <label class="field-label" for="session-notes">{{ $t('planner.sessionNotes') }}</label>
            <textarea id="session-notes" v-model="sessionForm.notes" class="textarea" />
          </div>
        </div>
        <p v-if="sessionError" class="form-error">{{ sessionError }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn" @click="showSessionModal = false">{{ $t('common.cancel') }}</button>
        <button type="submit" form="session-form" class="btn btn-primary" :disabled="busy">
          <span v-if="busy" class="spinner" /> {{ $t('planner.saveSession') }}
        </button>
      </template>
    </BaseModal>

    <BaseModal
      v-if="showAiPlanModal"
      :title="$t('ai.plannerModalTitle')"
      wide
      @close="showAiPlanModal = false"
    >
      <div class="stack">
        <p class="card-hint">{{ $t('ai.plannerModalHint') }}</p>
        <div v-if="aiStatus && !aiStatus.enabled" class="alert alert-warning">
          <Icon name="alert" :size="18" />
          <div class="alert-body">
            <strong>{{ $t('ai.notConfiguredTitle') }}</strong>
            {{ $t('ai.notConfiguredHint') }}
            <div class="mt-8">
              <RouterLink
                to="/settings#ai-settings"
                class="link-btn"
                @click="showAiPlanModal = false"
              >
                {{ $t('ai.openSettingsCta') }} →
              </RouterLink>
            </div>
          </div>
        </div>

        <form class="form-grid" @submit.prevent="generateAiPlan">
          <div class="field span-2">
            <label class="field-label" for="ai-plan-course">{{ $t('ai.plannerCourseLabel') }}</label>
            <select id="ai-plan-course" v-model="aiPlanForm.courseId" class="select">
              <option value="">{{ $t('ai.plannerAllActiveCourses') }}</option>
              <option v-for="course in courses" :key="course.id" :value="String(course.id)">
                [{{ course.category }}] {{ course.title }} ({{ course.progress }}%)
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="ai-plan-date">{{ $t('ai.plannerStartDate') }}</label>
            <input id="ai-plan-date" v-model="aiPlanForm.startDate" class="input" type="date" required />
          </div>
          <div class="field">
            <label class="field-label" for="ai-plan-days">{{ $t('ai.plannerDays') }}</label>
            <select id="ai-plan-days" v-model="aiPlanForm.days" class="select">
              <option v-for="d in [1, 3, 5, 7]" :key="d" :value="String(d)">
                {{ $t('ai.plannerDaysOption', { count: d }) }}
              </option>
            </select>
          </div>
          <div class="field span-2">
            <label class="field-label" for="ai-plan-focus">{{ $t('ai.plannerFocusLabel') }}</label>
            <input
              id="ai-plan-focus"
              v-model="aiPlanForm.focusNote"
              class="input"
              :placeholder="$t('ai.plannerFocusPlaceholder')"
            />
          </div>
          <div class="field span-2" style="justify-content: flex-end">
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="aiGenerating || (aiStatus !== null && !aiStatus.enabled)"
            >
              <span v-if="aiGenerating" class="spinner" />
              <Icon v-else name="sparkles" :size="15" />
              {{ aiGenerating ? $t('ai.plannerGenerating') : $t('ai.plannerGenerate') }}
            </button>
          </div>
        </form>

        <p v-if="aiError" class="form-error">{{ aiError }}</p>

        <div v-if="aiSummary" class="alert alert-info">
          <Icon name="sparkles" :size="18" />
          <div class="alert-body">{{ aiSummary }}</div>
        </div>

        <div v-if="aiSuggestedTasks.length > 0" class="stack-sm">
          <div class="row-between">
            <strong>
              {{
                $t('ai.plannerSelectCount', {
                  selected: selectedAiTaskCount,
                  total: aiSuggestedTasks.length,
                })
              }}
            </strong>
            <button type="button" class="link-btn" @click="toggleAllAiTasks">
              {{ allAiSelected ? $t('common.deselectAll') : $t('common.selectAll') }}
            </button>
          </div>
          <div
            v-for="(item, idx) in aiSuggestedTasks"
            :key="idx"
            class="check-item"
          >
            <input
              :id="`ai-task-${idx}`"
              v-model="item.selected"
              type="checkbox"
            />
            <label :for="`ai-task-${idx}`" class="check-label">
              <div>
                <strong>{{ item.title }}</strong>
              </div>
              <p v-if="item.description" class="muted">{{ item.description }}</p>
              <div class="row wrap mt-8" style="gap: 6px">
                <span class="badge badge-outline tabular">{{ formatDate(item.plannedDate) }}</span>
                <span class="badge badge-neutral tabular">{{ formatMinutes(item.estimatedMinutes) }}</span>
                <span class="badge badge-info">{{ taskTypeLabels[item.type] }}</span>
                <span class="badge badge-outline">{{ priorityLabels[item.priority] }}</span>
                <span v-if="item.courseTitle" class="chip">{{ item.courseTitle }}</span>
              </div>
            </label>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn" @click="showAiPlanModal = false">{{ $t('common.cancel') }}</button>
        <button
          v-if="aiSuggestedTasks.length > 0"
          type="button"
          class="btn btn-primary"
          :disabled="aiApplying || selectedAiTaskCount === 0"
          @click="applyAiSelectedTasks"
        >
          <span v-if="aiApplying" class="spinner" />
          {{ $t('ai.plannerApplySelected', { count: selectedAiTaskCount }) }}
        </button>
      </template>
    </BaseModal>
  </template>
</template>
