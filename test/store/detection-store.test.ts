/**
 * Tests for `createDetectionStore` — the Zustand store owning per-row
 * detection state and `AbortController` lifecycle.
 *
 * Each test uses a stub `DetectionScanner` whose `scan` is a controllable
 * Promise so tests can drive scans to a specific moment and assert.
 *
 * Coverage matrix (data-model.md §5.3 + WP06 case matrix):
 * - Initial state
 * - scanCollection from idle → loaded
 * - Progress events
 * - Re-trigger from scanning (atomic replace)
 * - Re-trigger from loaded
 * - Re-trigger from failed
 * - Cancel from scanning
 * - Cancel from idle (no-op)
 * - Cancel from loaded
 * - reset() with multiple rows
 * - Parallel rows (independent)
 * - Parallel cancel (only target affected)
 * - AbortError swallowed (no fail dispatch)
 * - Non-DetectionError wrapped as catalog-rejected
 * - DetectionError passed through
 * - Late callback after cancel ignored
 * - Double click within microtask
 */
import { describe, it, expect, vi } from 'vitest';
import { createDetectionStore } from '../../src/store/detection-store';
import { DetectionError } from '../../src/domain/detection-errors';
import type { DetectionScanner } from '../../src/ports/detection-scanner';
import type { DetectionResult, ProgressEvent } from '../../src/domain/detection-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a `DetectionResult` fixture for the given `collectionKey`. */
function makeResult(collectionKey: string): DetectionResult {
  return {
    collectionKey,
    completedAt: 1_717_200_000_000,
    groups: [],
    duplicateTrackCount: 0,
    removableTrackCount: 0,
    skippedLocalCount: 0,
    unenrichedCount: 0,
    scannedTrackCount: 5,
  };
}

/** A pending scan slot captured from a scanner call. */
type ScanSlot = {
  signal: AbortSignal;
  onProgress: (ev: ProgressEvent) => void;
  resolve: (r: DetectionResult) => void;
  reject: (e: unknown) => void;
};

/**
 * Controllable scanner factory. Each `.scan()` call pushes a `ScanSlot` into
 * the `calls` queue. Tests can resolve/reject slots by dequeuing them.
 *
 * - `calls` — ordered queue of `ScanSlot`s; earliest call first.
 * - `lastSignal()` — convenience: `calls[calls.length-1]?.signal`.
 * - `lastOnProgress()` — convenience: `calls[calls.length-1]?.onProgress`.
 * - `resolveNext(result)` — resolve and remove the oldest pending call.
 * - `rejectNext(err)` — reject and remove the oldest pending call.
 * - `callCount()` — total scan invocations so far (not just queue length).
 */
function makeControllableScanner(): {
  scanner: DetectionScanner;
  calls: ScanSlot[];
  resolveNext: (result: DetectionResult) => void;
  rejectNext: (err: unknown) => void;
  callCount: () => number;
  lastSignal: () => AbortSignal | undefined;
  lastOnProgress: () => ((ev: ProgressEvent) => void) | undefined;
} {
  const calls: ScanSlot[] = [];
  let totalCalls = 0;

  const scanner: DetectionScanner = {
    scan: vi.fn((_request, signal, onProgress) => {
      totalCalls += 1;
      return new Promise<DetectionResult>((resolve, reject) => {
        calls.push({ signal, onProgress, resolve, reject });
      });
    }),
  };

  return {
    scanner,
    calls,
    resolveNext: (result) => {
      const slot = calls.shift();
      slot?.resolve(result);
    },
    rejectNext: (err) => {
      const slot = calls.shift();
      slot?.reject(err);
    },
    callCount: () => totalCalls,
    lastSignal: () => calls[calls.length - 1]?.signal,
    lastOnProgress: () => calls[calls.length - 1]?.onProgress,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createDetectionStore — initial state', () => {
  it('R-initial — rows is an empty object', () => {
    const { scanner } = makeControllableScanner();
    const store = createDetectionStore(scanner);
    expect(store.getState().rows).toEqual({});
  });
});

describe('createDetectionStore — scanCollection from idle → loaded', () => {
  it('R-scan-idle — transitions idle → scanning → loaded on resolve', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    const scanPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });

    // Mid-scan: state should be 'scanning'.
    expect(store.getState().rows[key]?.kind).toBe('scanning');

    ctrl.resolveNext(makeResult(key));
    await scanPromise;

    expect(store.getState().rows[key]?.kind).toBe('loaded');
    const row = store.getState().rows[key];
    if (row?.kind !== 'loaded') throw new Error('Expected loaded');
    expect(row.result.collectionKey).toBe(key);
  });
});

describe('createDetectionStore — progress events', () => {
  it('R-progress — row scanning.progress reflects the latest progress event', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    void store.getState().scanCollection(key, { kind: 'liked-songs' });

    const onProgress = ctrl.lastOnProgress()!;
    expect(onProgress).toBeDefined();

    // Emit 3 progress events.
    const ev1: ProgressEvent = { stage: 'enumerating', processed: 10, total: 100 };
    const ev2: ProgressEvent = { stage: 'enriching', processed: 5, total: 10 };
    const ev3: ProgressEvent = { stage: 'matching', processed: 10, total: 10 };

    onProgress(ev1);
    let row = store.getState().rows[key];
    if (row?.kind !== 'scanning') throw new Error('Expected scanning');
    expect(row.progress).toEqual(ev1);

    onProgress(ev2);
    row = store.getState().rows[key];
    if (row?.kind !== 'scanning') throw new Error('Expected scanning');
    expect(row.progress).toEqual(ev2);

    onProgress(ev3);
    row = store.getState().rows[key];
    if (row?.kind !== 'scanning') throw new Error('Expected scanning');
    expect(row.progress).toEqual(ev3);

    // Clean up — resolve the pending scan so no dangling promise.
    ctrl.resolveNext(makeResult(key));
    await new Promise<void>((res) => setTimeout(res, 0));
  });
});

describe('createDetectionStore — re-trigger from scanning (atomic replace)', () => {
  it('R-retrigger-scanning — second call aborts first; row never observed as loaded between triggers', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    // First scan — stays in flight.
    void store.getState().scanCollection(key, { kind: 'liked-songs' });
    const firstSignal = ctrl.lastSignal()!;
    expect(store.getState().rows[key]?.kind).toBe('scanning');
    expect(firstSignal.aborted).toBe(false);

    // Second scan — should abort the first.
    const secondScanPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });
    const secondSignal = ctrl.lastSignal()!;

    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal).not.toBe(firstSignal);
    expect(store.getState().rows[key]?.kind).toBe('scanning');

    // The first scan's slot (index 0) is still pending (aborted signal, but
    // the fake scanner doesn't auto-reject). Settle it with an AbortError so
    // the store's catch swallows it, then resolve the second scan's slot.
    ctrl.rejectNext(new DOMException('aborted', 'AbortError'));
    ctrl.resolveNext(makeResult(key));
    await secondScanPromise;

    expect(store.getState().rows[key]?.kind).toBe('loaded');
    expect(ctrl.callCount()).toBe(2);
  });
});

describe('createDetectionStore — re-trigger from loaded', () => {
  it('R-retrigger-loaded — atomic replace: row goes back to scanning, old result discarded', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    // First scan — complete it.
    const first = store.getState().scanCollection(key, { kind: 'liked-songs' });
    ctrl.resolveNext(makeResult(key));
    await first;
    expect(store.getState().rows[key]?.kind).toBe('loaded');

    // Second scan — should reset to scanning immediately.
    const secondPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });
    expect(store.getState().rows[key]?.kind).toBe('scanning');

    ctrl.resolveNext(makeResult(key));
    await secondPromise;
    expect(store.getState().rows[key]?.kind).toBe('loaded');
  });
});

describe('createDetectionStore — re-trigger from failed', () => {
  it('R-retrigger-failed — row goes back to scanning from failed', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    // Drive to failed.
    const first = store.getState().scanCollection(key, { kind: 'liked-songs' });
    ctrl.rejectNext(new DetectionError('network-failure', 'simulated failure'));
    await first;
    expect(store.getState().rows[key]?.kind).toBe('failed');

    // Re-trigger from failed.
    const secondPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });
    expect(store.getState().rows[key]?.kind).toBe('scanning');

    ctrl.resolveNext(makeResult(key));
    await secondPromise;
    expect(store.getState().rows[key]?.kind).toBe('loaded');
  });
});

describe('createDetectionStore — cancel from scanning', () => {
  it('R-cancel-scanning — controller aborted; row → idle; AbortError swallowed', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    const scanPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });
    const signal = ctrl.lastSignal()!;
    expect(signal.aborted).toBe(false);

    store.getState().cancelScan(key);
    expect(signal.aborted).toBe(true);
    expect(store.getState().rows[key]?.kind).toBe('idle');

    // The scanner's AbortError should be swallowed (no unhandled rejection).
    ctrl.rejectNext(new DOMException('aborted', 'AbortError'));
    await scanPromise;

    // Row stays idle; no fail dispatch.
    expect(store.getState().rows[key]?.kind).toBe('idle');
  });
});

describe('createDetectionStore — cancel from idle', () => {
  it('R-cancel-idle — no-op: no abort, no state change', () => {
    const { scanner } = makeControllableScanner();
    const store = createDetectionStore(scanner);
    const key = 'liked-songs';

    // Row doesn't exist yet.
    store.getState().cancelScan(key);
    expect(store.getState().rows[key]).toBeUndefined();
  });
});

describe('createDetectionStore — cancel from loaded', () => {
  it('R-cancel-loaded — no controller to abort; FSM cancel from loaded → idle', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    // Complete the scan first.
    const first = store.getState().scanCollection(key, { kind: 'liked-songs' });
    ctrl.resolveNext(makeResult(key));
    await first;
    expect(store.getState().rows[key]?.kind).toBe('loaded');

    // Cancel from loaded: no controller, but FSM still moves to idle.
    store.getState().cancelScan(key);
    expect(store.getState().rows[key]?.kind).toBe('idle');
  });
});

describe('createDetectionStore — reset()', () => {
  it('R-reset — aborts all controllers; rows cleared', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);

    // Start two scans.
    void store
      .getState()
      .scanCollection('liked-songs', { kind: 'liked-songs' });
    // slot index 0 = liked-songs scan

    void store.getState().scanCollection('spotify:playlist:abc', {
      kind: 'playlist',
      playlistUri: 'spotify:playlist:abc',
    });
    // slot index 1 = playlist scan

    const sig1 = ctrl.calls[0]!.signal;
    const sig2 = ctrl.calls[1]!.signal;

    // Drive 'liked-songs' to loaded first (resolve slot 0).
    ctrl.calls[0]!.resolve(makeResult('liked-songs'));
    // Wait several microtask ticks for the async chain to settle.
    await new Promise<void>((res) => setTimeout(res, 0));

    expect(store.getState().rows['liked-songs']?.kind).toBe('loaded');
    expect(store.getState().rows['spotify:playlist:abc']?.kind).toBe('scanning');

    // Reset.
    store.getState().reset();

    expect(sig1.aborted).toBe(false); // first was already resolved, no controller
    expect(sig2.aborted).toBe(true);  // second was still in flight
    expect(store.getState().rows).toEqual({});
  });
});

describe('createDetectionStore — parallel rows', () => {
  it('R-parallel — two rows stay independent; each gets its own AbortController', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);

    // Start scan A (slot index 0).
    void store.getState().scanCollection('liked-songs', { kind: 'liked-songs' });

    // Start scan B (slot index 1).
    void store.getState().scanCollection('spotify:playlist:abc', {
      kind: 'playlist',
      playlistUri: 'spotify:playlist:abc',
    });

    const slotA = ctrl.calls[0]!;
    const slotB = ctrl.calls[1]!;

    expect(slotA.signal).not.toBe(slotB.signal);
    expect(store.getState().rows['liked-songs']?.kind).toBe('scanning');
    expect(store.getState().rows['spotify:playlist:abc']?.kind).toBe('scanning');

    // Resolve B (slot 1) first; A (slot 0) still scanning.
    slotB.resolve(makeResult('spotify:playlist:abc'));
    await new Promise<void>((res) => setTimeout(res, 0));

    expect(store.getState().rows['spotify:playlist:abc']?.kind).toBe('loaded');
    expect(store.getState().rows['liked-songs']?.kind).toBe('scanning');

    // Resolve A (slot 0).
    slotA.resolve(makeResult('liked-songs'));
    await new Promise<void>((res) => setTimeout(res, 0));
    expect(store.getState().rows['liked-songs']?.kind).toBe('loaded');
  });
});

describe('createDetectionStore — parallel cancel', () => {
  it('R-parallel-cancel — cancelScan on one row does not affect the other', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);

    void store.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    void store.getState().scanCollection('spotify:playlist:abc', {
      kind: 'playlist',
      playlistUri: 'spotify:playlist:abc',
    });

    const slotA = ctrl.calls[0]!;
    const slotB = ctrl.calls[1]!;

    // Cancel only liked-songs.
    store.getState().cancelScan('liked-songs');

    expect(slotA.signal.aborted).toBe(true);
    expect(slotB.signal.aborted).toBe(false);
    expect(store.getState().rows['liked-songs']?.kind).toBe('idle');
    expect(store.getState().rows['spotify:playlist:abc']?.kind).toBe('scanning');

    // Clean up.
    slotB.resolve(makeResult('spotify:playlist:abc'));
    await new Promise<void>((res) => setTimeout(res, 0));
  });
});

describe('createDetectionStore — AbortError catch', () => {
  it('R-abort-error — AbortError does NOT dispatch fail; row state from prior cancel preserved', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    const scanPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });

    // Cancel before resolve.
    store.getState().cancelScan(key);
    expect(store.getState().rows[key]?.kind).toBe('idle');

    // Scanner throws AbortError — should be swallowed.
    ctrl.rejectNext(new DOMException('aborted', 'AbortError'));
    await scanPromise;

    // Row stays idle; no fail dispatch.
    expect(store.getState().rows[key]?.kind).toBe('idle');
  });
});

describe('createDetectionStore — non-DetectionError wrapped', () => {
  it('R-non-detection-error — plain Error wrapped as catalog-rejected', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    const scanPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });

    ctrl.rejectNext(new Error('boom'));
    await scanPromise;

    const row = store.getState().rows[key];
    if (row?.kind !== 'failed') throw new Error('Expected failed');
    expect(row.reason.reason).toBe('catalog-rejected');
    expect(row.reason.cause).toBeInstanceOf(Error);
  });
});

describe('createDetectionStore — DetectionError passed through', () => {
  it('R-detection-error-passthrough — DetectionError keeps its original reason', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    const scanPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });

    ctrl.rejectNext(new DetectionError('auth-token-expired', 'token gone'));
    await scanPromise;

    const row = store.getState().rows[key];
    if (row?.kind !== 'failed') throw new Error('Expected failed');
    expect(row.reason.reason).toBe('auth-token-expired');
  });
});

describe('createDetectionStore — late callback after cancel ignored', () => {
  it('R-late-callback — complete after cancelScan leaves row in idle', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    const scanPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });

    // Cancel the scan.
    store.getState().cancelScan(key);
    expect(store.getState().rows[key]?.kind).toBe('idle');

    // Simulate the scanner resolving AFTER cancel (should be ignored).
    ctrl.resolveNext(makeResult(key));
    await scanPromise;

    // Row should remain idle (FSM ignores 'complete' from 'idle').
    expect(store.getState().rows[key]?.kind).toBe('idle');
  });
});

describe('createDetectionStore — double click within microtask', () => {
  it('R-double-click — second call aborts first controller; race resolves cleanly', async () => {
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const key = 'liked-songs';

    // Two synchronous calls.
    void store.getState().scanCollection(key, { kind: 'liked-songs' });
    const firstSignal = ctrl.lastSignal()!;
    const secondPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });
    const secondSignal = ctrl.lastSignal()!;

    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);
    expect(store.getState().rows[key]?.kind).toBe('scanning');

    // Settle the first (aborted) scan slot first so its async frame can
    // exit cleanly; then resolve the second scan's slot.
    ctrl.rejectNext(new DOMException('aborted', 'AbortError'));
    ctrl.resolveNext(makeResult(key));
    await secondPromise;

    expect(store.getState().rows[key]?.kind).toBe('loaded');
  });
});
