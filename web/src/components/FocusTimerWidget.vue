<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { CourseSummary, Task } from '@shared/types';
import { api } from '../lib/api';
import { useFocusTimer } from '../composables/useFocusTimer';
import BaseModal from './BaseModal.vue';
import Icon from './Icon.vue';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const {
  state,
  formattedClock,
  isRunning,
  isActive,
  showPanel,
  showSaveModal,
  savingSession,
  pendingSessionDraft,
  togglePlayPause,
  stopAndPromptSave,
  discard,
  switchMode,
  setPreset,
  setTargetLinks,
  startBreak,
  savePendingSession,
} = useFocusTimer();

const courses = ref<CourseSummary[]>([]);
const tasks = ref<Task[]>([]);
const refsLoaded = ref(false);

const saveForm = reactive({
  courseId: '',
  taskId: '',
  durationMinutes: '25',
  notes: '',
  updateTaskActual: false,
});

async function ensureRefs() {
  if (refsLoaded.value) return;
  try {
    const [coursesRes, tasksRes] = await Promise.all([
      api.courses(),
      api.tasks({ scope: 'all' }),
    ]);
    courses.value = coursesRes.courses;
    tasks.value = tasksRes.tasks.filter(
      (task) => task.status === 'todo' || task.status === 'in_progress',
    );
    refsLoaded.value = true;
  } catch {
    // Allow timer to function offline or before login
  }
}

watch(showPanel, (open) => {
  if (open) void ensureRefs();
});

watch(showSaveModal, (open) => {
  if (!open || !pendingSessionDraft.value) return;
  void ensureRefs();
  saveForm.courseId = pendingSessionDraft.value.courseId
    ? String(pendingSessionDraft.value.courseId)
    : '';
  saveForm.taskId = pendingSessionDraft.value.taskId
    ? String(pendingSessionDraft.value.taskId)
    : '';
  saveForm.durationMinutes = String(pendingSessionDraft.value.durationMinutes);
  saveForm.notes = pendingSessionDraft.value.notes;
  saveForm.updateTaskActual = pendingSessionDraft.value.updateTaskActual;
});

function onCourseChange(event: Event) {
  const val = (event.target as HTMLSelectElement).value;
  if (!val) {
    setTargetLinks({ courseId: null, courseTitle: null });
    return;
  }
  const found = courses.value.find((c) => c.id === Number(val));
  setTargetLinks({ courseId: Number(val), courseTitle: found?.title ?? null });
}

function onTaskChange(event: Event) {
  const val = (event.target as HTMLSelectElement).value;
  if (!val) {
    setTargetLinks({ taskId: null, taskTitle: null });
    return;
  }
  const found = tasks.value.find((t) => t.id === Number(val));
  setTargetLinks({
    taskId: Number(val),
    taskTitle: found?.title ?? null,
    ...(found?.relatedCourseId
      ? { courseId: found.relatedCourseId, courseTitle: found.courseTitle ?? null }
      : {}),
  });
}

function onSaveTaskChange() {
  if (!saveForm.taskId) return;
  const found = tasks.value.find((t) => t.id === Number(saveForm.taskId));
  if (found?.relatedCourseId && !saveForm.courseId) {
    saveForm.courseId = String(found.relatedCourseId);
  }
}

async function submitSave() {
  const duration = Number(saveForm.durationMinutes);
  if (!Number.isFinite(duration) || duration < 1 || duration > 1440) return;
  await savePendingSession({
    courseId: saveForm.courseId ? Number(saveForm.courseId) : null,
    taskId: saveForm.taskId ? Number(saveForm.taskId) : null,
    durationMinutes: duration,
    notes: saveForm.notes,
    updateTaskActual: saveForm.updateTaskActual && Boolean(saveForm.taskId),
  });
}
</script>

<template>
  <button
    v-if="compact"
    type="button"
    class="btn btn-sm timer-compact-pill"
    :class="{ 'is-running': isRunning }"
    :aria-label="$t('timer.title')"
    @click="showPanel = true"
  >
    <Icon name="timer" :size="14" />
    <span class="tabular">{{ formattedClock }}</span>
  </button>

  <div v-else class="timer-sidebar-card" :class="{ 'is-running': isRunning }">
    <div class="row-between" style="gap: 6px">
      <button
        type="button"
        class="timer-sidebar-trigger"
        @click="showPanel = !showPanel"
      >
        <Icon name="timer" :size="15" :class="isRunning ? 'text-info' : 'muted'" />
        <span class="tabular timer-clock">{{ formattedClock }}</span>
        <span class="badge" :class="isRunning ? 'badge-info' : 'badge-neutral'">
          {{
            state.phase === 'break'
              ? $t('timer.breakShort')
              : state.mode === 'pomodoro'
                ? $t('timer.pomoShort')
                : $t('timer.stopwatchShort')
          }}
        </span>
      </button>
      <div class="row" style="gap: 2px">
        <button
          type="button"
          class="btn btn-ghost btn-icon btn-sm"
          :title="isRunning ? $t('timer.pause') : $t('timer.start')"
          :aria-label="isRunning ? $t('timer.pause') : $t('timer.start')"
          @click="togglePlayPause"
        >
          <Icon :name="isRunning ? 'pause' : 'play'" :size="14" />
        </button>
        <button
          v-if="isActive"
          type="button"
          class="btn btn-ghost btn-icon btn-sm"
          :title="$t('timer.stopAndLog')"
          :aria-label="$t('timer.stopAndLog')"
          @click="stopAndPromptSave"
        >
          <Icon name="stop" :size="14" />
        </button>
      </div>
    </div>
    <p v-if="state.taskTitle || state.courseTitle" class="timer-target-label">
      {{ state.taskTitle ?? state.courseTitle }}
    </p>
  </div>

  <BaseModal
    v-if="!compact && showPanel"
    :title="$t('timer.title')"
    @close="showPanel = false"
  >
    <div class="stack">
      <div class="row-between wrap" style="gap: 8px">
        <div class="tabs">
          <button
            type="button"
            class="tab"
            :class="{ active: state.mode === 'pomodoro' }"
            :disabled="isActive"
            @click="switchMode('pomodoro')"
          >
            {{ $t('timer.pomodoro') }}
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: state.mode === 'stopwatch' }"
            :disabled="isActive"
            @click="switchMode('stopwatch')"
          >
            {{ $t('timer.stopwatch') }}
          </button>
        </div>

        <div v-if="state.mode === 'pomodoro' && !isActive" class="pill-group">
          <button
            type="button"
            class="pill-btn"
            :class="{ active: state.workMinutes === 25 }"
            @click="setPreset(25, 5)"
          >
            25/5
          </button>
          <button
            type="button"
            class="pill-btn"
            :class="{ active: state.workMinutes === 50 }"
            @click="setPreset(50, 10)"
          >
            50/10
          </button>
          <button
            type="button"
            class="pill-btn"
            :class="{ active: state.workMinutes === 15 }"
            @click="setPreset(15, 3)"
          >
            15/3
          </button>
        </div>
      </div>

      <div class="timer-display-box">
        <span class="badge" :class="state.phase === 'break' ? 'badge-success' : 'badge-info'">
          {{ state.phase === 'break' ? $t('timer.breakPhase') : $t('timer.workPhase') }}
        </span>
        <div class="timer-display-digits tabular">{{ formattedClock }}</div>
        <div class="row wrap" style="gap: 8px; justify-content: center">
          <button type="button" class="btn btn-primary" @click="togglePlayPause">
            <Icon :name="isRunning ? 'pause' : 'play'" :size="15" />
            {{
              isRunning
                ? $t('timer.pause')
                : state.status === 'paused'
                  ? $t('timer.resume')
                  : $t('timer.start')
            }}
          </button>
          <button
            v-if="isActive"
            type="button"
            class="btn"
            @click="stopAndPromptSave"
          >
            <Icon name="stop" :size="15" />
            {{ state.phase === 'break' ? $t('timer.endBreak') : $t('timer.stopAndLog') }}
          </button>
          <button
            v-if="isActive"
            type="button"
            class="btn btn-ghost"
            @click="discard('work')"
          >
            {{ $t('timer.reset') }}
          </button>
          <button
            v-if="!isActive && state.mode === 'pomodoro'"
            type="button"
            class="btn btn-ghost btn-sm"
            @click="startBreak"
          >
            {{ $t('timer.takeBreak', { minutes: state.breakMinutes }) }}
          </button>
        </div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="timer-course">{{ $t('course.courseLink') }}</label>
          <select
            id="timer-course"
            class="select"
            :value="state.courseId ? String(state.courseId) : ''"
            @change="onCourseChange"
          >
            <option value="">{{ $t('planner.noLink') }}</option>
            <option v-for="course in courses" :key="course.id" :value="String(course.id)">
              [{{ course.category }}] {{ course.title }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="timer-task">{{ $t('planner.sessionTask') }}</label>
          <select
            id="timer-task"
            class="select"
            :value="state.taskId ? String(state.taskId) : ''"
            @change="onTaskChange"
          >
            <option value="">{{ $t('planner.noLink') }}</option>
            <option v-for="task in tasks" :key="task.id" :value="String(task.id)">
              {{ task.title }}
            </option>
          </select>
        </div>
      </div>

      <p class="field-hint">{{ $t('timer.hint') }}</p>
    </div>
  </BaseModal>

  <BaseModal
    v-if="!compact && showSaveModal && pendingSessionDraft"
    :title="$t('timer.saveModalTitle')"
    @close="showSaveModal = false"
  >
    <form id="timer-save-form" class="stack" @submit.prevent="submitSave">
      <p class="card-hint">{{ $t('timer.saveModalHint') }}</p>
      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="timer-save-duration">{{ $t('planner.sessionDuration') }}</label>
          <input
            id="timer-save-duration"
            v-model="saveForm.durationMinutes"
            class="input"
            type="number"
            min="1"
            max="1440"
            required
          />
        </div>
        <div class="field">
          <label class="field-label" for="timer-save-course">{{ $t('course.courseLink') }}</label>
          <select id="timer-save-course" v-model="saveForm.courseId" class="select">
            <option value="">{{ $t('planner.noLink') }}</option>
            <option v-for="course in courses" :key="course.id" :value="String(course.id)">
              {{ course.title }}
            </option>
          </select>
        </div>
        <div class="field span-2">
          <label class="field-label" for="timer-save-task">{{ $t('planner.sessionTask') }}</label>
          <select id="timer-save-task" v-model="saveForm.taskId" class="select" @change="onSaveTaskChange">
            <option value="">{{ $t('planner.noLink') }}</option>
            <option v-for="task in tasks" :key="task.id" :value="String(task.id)">
              {{ task.title }}
            </option>
          </select>
        </div>
        <div class="field span-2">
          <label class="field-label" for="timer-save-notes">{{ $t('planner.sessionNotes') }}</label>
          <textarea id="timer-save-notes" v-model="saveForm.notes" class="textarea" />
        </div>
      </div>

      <label v-if="saveForm.taskId" class="check-item" style="border: 0; padding: 4px 0">
        <input v-model="saveForm.updateTaskActual" type="checkbox" />
        <span class="check-label">{{ $t('timer.updateTaskActual') }}</span>
      </label>
    </form>
    <template #footer>
      <button type="button" class="btn btn-ghost" @click="discard('work')">
        {{ $t('timer.discard') }}
      </button>
      <button type="button" class="btn" @click="showSaveModal = false">
        {{ $t('common.cancel') }}
      </button>
      <button type="submit" form="timer-save-form" class="btn btn-primary" :disabled="savingSession">
        <span v-if="savingSession" class="spinner" /> {{ $t('planner.saveSession') }}
      </button>
    </template>
  </BaseModal>
</template>
