import { computed, ref } from 'vue';
import { api, ApiError } from '../lib/api';
import { translate } from '../i18n';
import { useToast } from './useToast';
import {
  completeTimerState,
  computeLoggedMinutes,
  createInitialTimerState,
  formatTimerClock,
  getElapsedMs,
  getRemainingMs,
  isPomodoroDone,
  pauseTimerState,
  resetTimerState,
  resumeTimerState,
  startTimerState,
  type FocusTimerState,
  type TimerMode,
  type TimerPhase,
} from '../lib/focus-timer-core';

const STORAGE_KEY = 'lr-focus-timer';

export interface PendingSessionDraft {
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  courseId: number | null;
  taskId: number | null;
  notes: string;
  updateTaskActual: boolean;
}

function loadPersistedState(): FocusTimerState {
  if (typeof window === 'undefined') return createInitialTimerState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialTimerState();
    const parsed = JSON.parse(raw) as Partial<FocusTimerState>;
    const base = createInitialTimerState();
    return {
      mode: parsed.mode === 'stopwatch' ? 'stopwatch' : 'pomodoro',
      phase: parsed.phase === 'break' ? 'break' : 'work',
      status:
        parsed.status === 'running' ||
        parsed.status === 'paused' ||
        parsed.status === 'completed'
          ? parsed.status
          : 'idle',
      workMinutes:
        typeof parsed.workMinutes === 'number' && parsed.workMinutes >= 1 && parsed.workMinutes <= 240
          ? Math.round(parsed.workMinutes)
          : base.workMinutes,
      breakMinutes:
        typeof parsed.breakMinutes === 'number' && parsed.breakMinutes >= 1 && parsed.breakMinutes <= 60
          ? Math.round(parsed.breakMinutes)
          : base.breakMinutes,
      startedAtIso: typeof parsed.startedAtIso === 'string' ? parsed.startedAtIso : null,
      lastResumedAtMs: typeof parsed.lastResumedAtMs === 'number' ? parsed.lastResumedAtMs : null,
      accumulatedMs:
        typeof parsed.accumulatedMs === 'number' && parsed.accumulatedMs >= 0
          ? parsed.accumulatedMs
          : 0,
      courseId: typeof parsed.courseId === 'number' ? parsed.courseId : null,
      courseTitle: typeof parsed.courseTitle === 'string' ? parsed.courseTitle : null,
      taskId: typeof parsed.taskId === 'number' ? parsed.taskId : null,
      taskTitle: typeof parsed.taskTitle === 'string' ? parsed.taskTitle : null,
    };
  } catch {
    return createInitialTimerState();
  }
}

function persistState(next: FocusTimerState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

function playCompletionTone(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.36);
    });
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Ignore audio errors when autoplay/audio context is blocked
  }
}

const state = ref<FocusTimerState>(loadPersistedState());
const nowMs = ref<number>(Date.now());
const showPanel = ref(false);
const showSaveModal = ref(false);
const savingSession = ref(false);
const pendingSessionDraft = ref<PendingSessionDraft | null>(null);

let intervalId: number | null = null;
let originalTitle: string | null = null;

function syncDocumentTitle(clock: string, active: boolean): void {
  if (typeof document === 'undefined') return;
  if (active) {
    if (originalTitle === null && !document.title.startsWith('⏱ ')) {
      originalTitle = document.title;
    }
    const baseTitle = originalTitle ?? document.title.replace(/^⏱ [^\s]+ · /, '');
    document.title = `⏱ ${clock} · ${baseTitle}`;
  } else if (originalTitle !== null) {
    document.title = originalTitle;
    originalTitle = null;
  } else if (document.title.startsWith('⏱ ')) {
    document.title = document.title.replace(/^⏱ [^\s]+ · /, '');
  }
}

function updateState(next: FocusTimerState): void {
  state.value = next;
  persistState(next);
}

function openSavePrompt(endedAtMs: number): void {
  const elapsed = getElapsedMs(state.value, endedAtMs);
  const startedAt =
    state.value.startedAtIso ?? new Date(Math.max(0, endedAtMs - Math.max(elapsed, 60000))).toISOString();
  const endedAt = new Date(Math.max(Date.parse(startedAt) + 60000, endedAtMs)).toISOString();
  const durationMinutes = computeLoggedMinutes(elapsed);
  pendingSessionDraft.value = {
    startedAt,
    endedAt,
    durationMinutes,
    courseId: state.value.courseId,
    taskId: state.value.taskId,
    notes: state.value.taskTitle ? `${state.value.taskTitle}` : '',
    updateTaskActual: state.value.taskId !== null,
  };
  showSaveModal.value = true;
}

function tick(): void {
  const now = Date.now();
  nowMs.value = now;
  if (isPomodoroDone(state.value, now)) {
    const completed = completeTimerState(state.value, now);
    updateState(completed);
    stopTicker();
    playCompletionTone();
    syncDocumentTitle('', false);
    if (completed.phase === 'work') {
      openSavePrompt(now);
    } else {
      useToast().info(translate('timer.breakDoneToast'));
      updateState(resetTimerState(completed, 'work'));
    }
    return;
  }
  const active = state.value.status === 'running';
  if (active) {
    const displayMs =
      state.value.mode === 'pomodoro'
        ? getRemainingMs(state.value, now)
        : getElapsedMs(state.value, now);
    syncDocumentTitle(formatTimerClock(displayMs), true);
  }
}

function startTicker(): void {
  if (typeof window === 'undefined' || intervalId !== null) return;
  nowMs.value = Date.now();
  intervalId = window.setInterval(tick, 500);
}

function stopTicker(): void {
  if (typeof window === 'undefined' || intervalId === null) return;
  window.clearInterval(intervalId);
  intervalId = null;
}

if (state.value.status === 'running') {
  if (isPomodoroDone(state.value, Date.now())) {
    const completed = completeTimerState(state.value, Date.now());
    updateState(completed);
    if (completed.phase === 'work') {
      openSavePrompt(Date.now());
    }
  } else {
    startTicker();
  }
}

export function useFocusTimer() {
  const toast = useToast();

  const elapsedMs = computed(() => getElapsedMs(state.value, nowMs.value));
  const remainingMs = computed(() => getRemainingMs(state.value, nowMs.value));
  const displayMs = computed(() =>
    state.value.mode === 'pomodoro' ? remainingMs.value : elapsedMs.value,
  );
  const formattedClock = computed(() => formatTimerClock(displayMs.value));
  const isRunning = computed(() => state.value.status === 'running');
  const isActive = computed(() => state.value.status !== 'idle');

  function start(): void {
    const now = Date.now();
    nowMs.value = now;
    updateState(startTimerState(state.value, now));
    startTicker();
    tick();
  }

  function pause(): void {
    const now = Date.now();
    nowMs.value = now;
    updateState(pauseTimerState(state.value, now));
    stopTicker();
    syncDocumentTitle('', false);
  }

  function resume(): void {
    const now = Date.now();
    nowMs.value = now;
    updateState(resumeTimerState(state.value, now));
    startTicker();
    tick();
  }

  function togglePlayPause(): void {
    if (state.value.status === 'running') {
      pause();
    } else if (state.value.status === 'paused') {
      resume();
    } else {
      start();
    }
  }

  function discard(nextPhase: TimerPhase = 'work'): void {
    stopTicker();
    syncDocumentTitle('', false);
    showSaveModal.value = false;
    pendingSessionDraft.value = null;
    updateState(resetTimerState(state.value, nextPhase));
  }

  function stopAndPromptSave(): void {
    const now = Date.now();
    nowMs.value = now;
    if (state.value.status === 'running') {
      updateState(pauseTimerState(state.value, now));
      stopTicker();
      syncDocumentTitle('', false);
    }
    if (state.value.phase === 'break') {
      discard('work');
      return;
    }
    openSavePrompt(now);
  }

  function switchMode(mode: TimerMode): void {
    if (state.value.status !== 'idle') return;
    updateState({
      ...state.value,
      mode,
      phase: 'work',
    });
  }

  function setPreset(workMinutes: number, breakMinutes = 5): void {
    if (state.value.status !== 'idle') return;
    updateState({
      ...state.value,
      mode: 'pomodoro',
      phase: 'work',
      workMinutes: Math.max(1, Math.min(240, Math.round(workMinutes))),
      breakMinutes: Math.max(1, Math.min(60, Math.round(breakMinutes))),
    });
  }

  function setTargetLinks(links: {
    courseId?: number | null;
    courseTitle?: string | null;
    taskId?: number | null;
    taskTitle?: string | null;
  }): void {
    updateState({
      ...state.value,
      courseId: links.courseId !== undefined ? links.courseId : state.value.courseId,
      courseTitle: links.courseTitle !== undefined ? links.courseTitle : state.value.courseTitle,
      taskId: links.taskId !== undefined ? links.taskId : state.value.taskId,
      taskTitle: links.taskTitle !== undefined ? links.taskTitle : state.value.taskTitle,
    });
  }

  function startFocusFor(options: {
    courseId?: number | null;
    courseTitle?: string | null;
    taskId?: number | null;
    taskTitle?: string | null;
    workMinutes?: number;
  }): void {
    const base = state.value.status === 'idle' ? state.value : resetTimerState(state.value, 'work');
    const next: FocusTimerState = {
      ...base,
      phase: 'work',
      workMinutes:
        options.workMinutes && options.workMinutes >= 15 && options.workMinutes <= 180
          ? Math.round(options.workMinutes)
          : base.workMinutes,
      courseId: options.courseId ?? null,
      courseTitle: options.courseTitle ?? null,
      taskId: options.taskId ?? null,
      taskTitle: options.taskTitle ?? null,
    };
    const now = Date.now();
    nowMs.value = now;
    updateState(startTimerState(next, now));
    startTicker();
    tick();
    showPanel.value = true;
  }

  function startBreak(): void {
    const next = resetTimerState(state.value, 'break');
    const now = Date.now();
    nowMs.value = now;
    updateState(startTimerState({ ...next, mode: 'pomodoro' }, now));
    startTicker();
    tick();
  }

  async function savePendingSession(form: {
    courseId: number | null;
    taskId: number | null;
    durationMinutes: number;
    notes: string;
    updateTaskActual: boolean;
  }): Promise<boolean> {
    if (!pendingSessionDraft.value || savingSession.value) return false;
    savingSession.value = true;
    try {
      const duration = Math.max(1, Math.min(1440, Math.round(form.durationMinutes)));
      const startedAt = pendingSessionDraft.value.startedAt;
      const endedAt = new Date(Date.parse(startedAt) + duration * 60000).toISOString();

      await api.createSession({
        startedAt,
        endedAt,
        durationMinutes: duration,
        courseId: form.courseId,
        taskId: form.taskId,
        notes: form.notes.trim(),
      });

      if (form.updateTaskActual && form.taskId !== null) {
        try {
          const res = await api.tasks({ scope: 'all' });
          const target = res.tasks.find((t) => t.id === form.taskId);
          if (target) {
            const nextActual = Math.min(1440, (target.actualMinutes ?? 0) + duration);
            await api.updateTask(target.id, { actualMinutes: nextActual });
          }
        } catch {
          // Non-fatal if task actualMinutes update fails after session was logged
        }
      }

      toast.success(translate('timer.savedToast', { minutes: duration }));
      showSaveModal.value = false;
      pendingSessionDraft.value = null;
      updateState(resetTimerState(state.value, 'work'));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('lr:session-logged'));
      }
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : translate('errors.unexpected'));
      return false;
    } finally {
      savingSession.value = false;
    }
  }

  return {
    state,
    elapsedMs,
    remainingMs,
    formattedClock,
    isRunning,
    isActive,
    showPanel,
    showSaveModal,
    savingSession,
    pendingSessionDraft,
    start,
    pause,
    resume,
    togglePlayPause,
    stopAndPromptSave,
    discard,
    switchMode,
    setPreset,
    setTargetLinks,
    startFocusFor,
    startBreak,
    savePendingSession,
  };
}
