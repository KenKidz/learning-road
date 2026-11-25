import { describe, expect, it } from 'vitest';
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
} from './focus-timer-core';

describe('focus timer core', () => {
  it('tracks wall-clock elapsed and remaining milliseconds across pause and resume', () => {
    const initial = createInitialTimerState();
    const t0 = 1_000_000;

    const running = startTimerState(initial, t0);
    expect(running.status).toBe('running');
    expect(getElapsedMs(running, t0 + 90_000)).toBe(90_000);
    expect(getRemainingMs(running, t0 + 90_000)).toBe(25 * 60_000 - 90_000);
    expect(formatTimerClock(getRemainingMs(running, t0 + 90_000))).toBe('23:30');

    const paused = pauseTimerState(running, t0 + 90_000);
    expect(paused.status).toBe('paused');
    expect(getElapsedMs(paused, t0 + 300_000)).toBe(90_000);

    const resumed = resumeTimerState(paused, t0 + 300_000);
    expect(getElapsedMs(resumed, t0 + 330_000)).toBe(120_000);
    expect(computeLoggedMinutes(getElapsedMs(resumed, t0 + 330_000))).toBe(2);
  });

  it('detects pomodoro completion and resets cleanly', () => {
    const initial = { ...createInitialTimerState(), workMinutes: 1 };
    const t0 = 2_000_000;
    const running = startTimerState(initial, t0);

    expect(isPomodoroDone(running, t0 + 59_000)).toBe(false);
    expect(isPomodoroDone(running, t0 + 60_000)).toBe(true);

    const completed = completeTimerState(running, t0 + 65_000);
    expect(completed.status).toBe('completed');
    expect(completed.accumulatedMs).toBe(60_000);

    const reset = resetTimerState(completed, 'work');
    expect(reset.status).toBe('idle');
    expect(reset.accumulatedMs).toBe(0);
    expect(reset.startedAtIso).toBeNull();
  });

  it('clamps logged duration between 1 and 1440 minutes', () => {
    expect(computeLoggedMinutes(5_000)).toBe(1);
    expect(computeLoggedMinutes(2000 * 60_000)).toBe(1440);
  });
});
