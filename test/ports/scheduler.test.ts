/**
 * Unit tests for the `defaultScheduler` real-timer default.
 *
 * The `Scheduler` port is a pure type contract; the only executable surface in
 * the module is `defaultScheduler`, which must delegate to the platform's real
 * `setTimeout`/`clearTimeout`. We drive it under `vi.useFakeTimers()` so the
 * delegation is asserted deterministically (research §R-6 rejected real wall
 * clocks and `AbortSignal.timeout` for this seam).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaultScheduler } from '../../src/ports/scheduler';

afterEach(() => {
  vi.useRealTimers();
});

describe('defaultScheduler', () => {
  it('schedules fn via the real setTimeout (fires after advancing ms)', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    defaultScheduler.setTimeout(fn, 100);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clearTimeout cancels a pending timer (fn never fires)', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const handle = defaultScheduler.setTimeout(fn, 100);
    defaultScheduler.clearTimeout(handle);
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
