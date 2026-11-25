export type TimerMode = 'pomodoro' | 'stopwatch';
export type TimerPhase = 'work' | 'break';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface FocusTimerState {
  mode: TimerMode;
  phase: TimerPhase;
  status: TimerStatus;
  workMinutes: number;
  breakMinutes: number;
  startedAtIso: string | null;
  lastResumedAtMs: number | null;
  accumulatedMs: number;
  courseId: number | null;
  courseTitle: string | null;
  taskId: number | null;
  taskTitle: string | null;
}

export function createInitialTimerState(): FocusTimerState {
  return {
    mode: 'pomodoro',
    phase: 'work',
    status: 'idle',
    workMinutes: 25,
    breakMinutes: 5,
    startedAtIso: null,
    lastResumedAtMs: null,
    accumulatedMs: 0,
    courseId: null,
    courseTitle: null,
    taskId: null,
    taskTitle: null,
  };
}

export function getTargetDurationMs(state: FocusTimerState): number {
  const minutes = state.phase === 'break' ? state.breakMinutes : state.workMinutes;
  return Math.max(1, minutes) * 60 * 1000;
}

export function getElapsedMs(state: FocusTimerState, nowMs: number): number {
  const runningDelta =
    state.status === 'running' && state.lastResumedAtMs !== null
      ? Math.max(0, nowMs - state.lastResumedAtMs)
      : 0;
  return Math.max(0, state.accumulatedMs + runningDelta);
}

export function getRemainingMs(state: FocusTimerState, nowMs: number): number {
  if (state.mode !== 'pomodoro') return 0;
  return Math.max(0, getTargetDurationMs(state) - getElapsedMs(state, nowMs));
}

export function isPomodoroDone(state: FocusTimerState, nowMs: number): boolean {
  return (
    state.mode === 'pomodoro' &&
    state.status === 'running' &&
    getElapsedMs(state, nowMs) >= getTargetDurationMs(state)
  );
}

export function formatTimerClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function computeLoggedMinutes(elapsedMs: number): number {
  return Math.max(1, Math.min(1440, Math.round(elapsedMs / 60000)));
}

export function startTimerState(state: FocusTimerState, nowMs: number): FocusTimerState {
  return {
    ...state,
    status: 'running',
    startedAtIso: state.startedAtIso ?? new Date(nowMs).toISOString(),
    lastResumedAtMs: nowMs,
    accumulatedMs: state.status === 'completed' ? 0 : state.accumulatedMs,
  };
}

export function pauseTimerState(state: FocusTimerState, nowMs: number): FocusTimerState {
  if (state.status !== 'running') return state;
  return {
    ...state,
    status: 'paused',
    accumulatedMs: getElapsedMs(state, nowMs),
    lastResumedAtMs: null,
  };
}

export function resumeTimerState(state: FocusTimerState, nowMs: number): FocusTimerState {
  if (state.status !== 'paused') return state;
  return {
    ...state,
    status: 'running',
    lastResumedAtMs: nowMs,
  };
}

export function completeTimerState(state: FocusTimerState, nowMs: number): FocusTimerState {
  const target = state.mode === 'pomodoro' ? getTargetDurationMs(state) : getElapsedMs(state, nowMs);
  return {
    ...state,
    status: 'completed',
    accumulatedMs: Math.min(getElapsedMs(state, nowMs), target),
    lastResumedAtMs: null,
  };
}

export function resetTimerState(state: FocusTimerState, nextPhase?: TimerPhase): FocusTimerState {
  return {
    ...state,
    phase: nextPhase ?? state.phase,
    status: 'idle',
    startedAtIso: null,
    lastResumedAtMs: null,
    accumulatedMs: 0,
  };
}
