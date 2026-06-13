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
import { RemovalError, isRemovalError } from '../../src/domain/removal-errors';
import {
  FakeRemovalExecutor,
  FAKE_FAIL_REASON,
  type FakeRemovalScript,
} from '../../src/adapters/fake-removal-executor';
import type { DetectionScanner } from '../../src/ports/detection-scanner';
import type { RemovalExecutor } from '../../src/ports/removal-executor';
import type {
  RemovalTarget,
  TrackRef,
  RemovalOutcome,
  RemovalProgressEvent,
} from '../../src/domain/removal-types';
import type {
  DetectionResult,
  DuplicateGroup,
  EnrichedTrack,
  ProgressEvent,
} from '../../src/domain/detection-types';

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

// ═══════════════════════════════════════════════════════════════════════════
// Removal flow (WP05) — requestRemoval / confirmRemoval / cancelRemoval
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build one `EnrichedTrack` member at the given `position`. For playlist
 * targets a `uid` is required by `computeRemoveSet`/`applyRemovalOutcome`, so
 * derive a stable `uid` from the position when `withUid` is set.
 */
function makeMember(position: number, uri: string, withUid: boolean): EnrichedTrack {
  return {
    position,
    uri,
    canonicalUri: uri,
    name: `track-${position}`,
    artists: [{ name: 'artist' }],
    durationMs: 200_000,
    ...(withUid ? { uid: `uid-${position}` } : {}),
  };
}

/**
 * Build a `DetectionResult` whose groups together contribute exactly
 * `removableCount` removable tracks (every group is a 2-member group → one
 * removable each). `withUid` controls whether members carry `uid` (playlist).
 */
function makeRemovableResult(
  collectionKey: string,
  removableCount: number,
  withUid: boolean,
): DetectionResult {
  const groups: DuplicateGroup[] = [];
  let pos = 0;
  for (let g = 0; g < removableCount; g++) {
    const keep = makeMember(pos++, `spotify:track:${g}-keep`, withUid);
    const dup = makeMember(pos++, `spotify:track:${g}-dup`, withUid);
    groups.push({
      id: `group-${g}`,
      reason: 'same-canonical-uri',
      members: [keep, dup],
      defaultKeepIndex: 0,
    });
  }
  const duplicateTrackCount = removableCount * 2;
  return {
    collectionKey,
    completedAt: 1_717_200_000_000,
    groups,
    duplicateTrackCount,
    removableTrackCount: removableCount,
    skippedLocalCount: 0,
    unenrichedCount: 0,
    scannedTrackCount: duplicateTrackCount + 3,
  };
}

/** An always-pending scanner — scans never resolve; only used for seeding. */
function makeIdleScanner(): DetectionScanner {
  return { scan: vi.fn(() => new Promise<DetectionResult>(() => {})) };
}

/**
 * Build a store, seed a single `loaded` row at `key` carrying `result` by
 * driving a real `scanCollection` against a controllable scanner that resolves
 * with `result`. Returns the store for assertions.
 */
async function seedLoaded(
  key: string,
  result: DetectionResult,
  executor?: RemovalExecutor,
): Promise<ReturnType<typeof createDetectionStore>> {
  const ctrl = makeControllableScanner();
  const store = createDetectionStore(ctrl.scanner, executor);
  const p = store.getState().scanCollection(key, { kind: 'liked-songs' });
  ctrl.resolveNext(result);
  await p;
  const row = store.getState().rows[key];
  if (row?.kind !== 'loaded') throw new Error('seed failed: expected loaded');
  return store;
}

/** Read the removal phase of a row known to be `loaded`. */
function removalPhase(
  store: ReturnType<typeof createDetectionStore>,
  key: string,
): string {
  const row = store.getState().rows[key];
  if (row?.kind !== 'loaded') throw new Error('expected loaded row');
  return row.removal.phase;
}

describe('createDetectionStore — removal: single-collection scope (AS-4)', () => {
  it('confirmRemoval calls the executor exactly once, with the acted target only', async () => {
    const fake = new FakeRemovalExecutor();
    const keyA = 'spotify:playlist:A';
    const keyB = 'spotify:playlist:B';
    const store = await seedLoaded(keyA, makeRemovableResult(keyA, 2, true), fake);

    store.getState().requestRemoval(keyA);
    await store.getState().confirmRemoval(keyA);

    expect(fake.calls.length).toBe(1);
    expect(fake.calls[0]!.target).toEqual({ kind: 'playlist', playlistUri: keyA });
    // No other row exists in this store.
    expect(store.getState().rows[keyB]).toBeUndefined();
  });
});

describe('createDetectionStore — removal: happy path full success (AS-7)', () => {
  it('removes all duplicates → phase none, removableTrackCount 0, groups gone', async () => {
    const fake = new FakeRemovalExecutor(); // default ok
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 3, false), fake);

    store.getState().requestRemoval(key);
    expect(removalPhase(store, key)).toBe('confirming');

    await store.getState().confirmRemoval(key);

    expect(fake.calls.length).toBe(1);
    const row = store.getState().rows[key];
    if (row?.kind !== 'loaded') throw new Error('expected loaded');
    expect(row.removal.phase).toBe('none');
    expect(row.result.removableTrackCount).toBe(0);
    expect(row.result.groups).toEqual([]);
    // Executor was called with exactly the computed remove-set (3 dup tracks).
    expect(fake.calls[0]!.tracks.length).toBe(3);
  });
});

describe('createDetectionStore — removal: partial failure (AS-8 / FR-010)', () => {
  it('keeps failed copies visible and records the partial outcome', async () => {
    // Fail the first group's dup copy (uri spotify:track:0-dup).
    const script: FakeRemovalScript = {
      kind: 'partial',
      failUris: ['spotify:track:0-dup'],
    };
    const fake = new FakeRemovalExecutor(script);
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false), fake);

    store.getState().requestRemoval(key);
    await store.getState().confirmRemoval(key);

    const row = store.getState().rows[key];
    if (row?.kind !== 'loaded') throw new Error('expected loaded');
    expect(row.removal.phase).toBe('partial');
    if (row.removal.phase !== 'partial') throw new Error('expected partial');
    // The failed copy stays present: its group survives (still 2 members).
    const stillPresent = row.result.groups.some((g) =>
      g.members.some((m) => m.uri === 'spotify:track:0-dup'),
    );
    expect(stillPresent).toBe(true);
    // Outcome on the partial state carries the failure.
    expect(row.removal.outcome.failed.length).toBe(1);
    expect(row.removal.outcome.failed[0]!.reason).toBe(FAKE_FAIL_REASON);
  });
});

describe('createDetectionStore — removal: executor throws (surfaced as partial)', () => {
  it('wraps the throw as an all-failed partial; no unhandled rejection', async () => {
    const thrown = new RemovalError('host-unavailable', 'host gone');
    const fake = new FakeRemovalExecutor({ kind: 'throw', error: thrown });
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false), fake);

    store.getState().requestRemoval(key);
    // Must resolve (not reject) — confirmRemoval surfaces the fault as partial.
    await expect(store.getState().confirmRemoval(key)).resolves.toBeUndefined();

    const row = store.getState().rows[key];
    if (row?.kind !== 'loaded') throw new Error('expected loaded');
    expect(row.removal.phase).toBe('partial');
    if (row.removal.phase !== 'partial') throw new Error('expected partial');
    // Every requested track is in failed; none removed.
    expect(row.removal.outcome.removed.length).toBe(0);
    expect(row.removal.outcome.failed.length).toBe(2);
    // All groups still present (nothing actually removed).
    expect(row.result.removableTrackCount).toBe(2);
  });

  it('wraps a non-RemovalError throw as executor-failed in the failure reasons', async () => {
    const fake = new FakeRemovalExecutor({ kind: 'throw', error: new Error('boom') });
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 1, false), fake);

    store.getState().requestRemoval(key);
    await store.getState().confirmRemoval(key);

    const row = store.getState().rows[key];
    if (row?.kind !== 'loaded' || row.removal.phase !== 'partial')
      throw new Error('expected partial');
    expect(row.removal.outcome.failed[0]!.reason).toContain('executor-failed');
  });
});

describe('createDetectionStore — removal: no auto-run (FR-011 / AS-9 / C-002)', () => {
  it('seeding a loaded row and requesting removal makes zero executor calls', async () => {
    const fake = new FakeRemovalExecutor();
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false), fake);

    // After setup: no executor call.
    expect(fake.calls.length).toBe(0);

    // requestRemoval alone only shows the dialog (confirming); no executor call.
    store.getState().requestRemoval(key);
    expect(removalPhase(store, key)).toBe('confirming');
    expect(fake.calls.length).toBe(0);
  });
});

describe('createDetectionStore — removal: concurrency lock (FR-012)', () => {
  it('a second confirm during removing is a no-op — exactly one executor call', async () => {
    // A fake whose remove never resolves, so the row stays in `removing`.
    let resolveRemove!: (o: RemovalOutcome) => void;
    let calls = 0;
    const executor: RemovalExecutor = {
      remove: vi.fn(
        (
          _target: RemovalTarget,
          _tracks: ReadonlyArray<TrackRef>,
          _signal: AbortSignal,
          _onProgress?: (e: RemovalProgressEvent) => void,
        ) => {
          calls += 1;
          return new Promise<RemovalOutcome>((res) => {
            resolveRemove = res;
          });
        },
      ),
    };
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false), executor);

    store.getState().requestRemoval(key);
    const first = store.getState().confirmRemoval(key);
    // Now in `removing` (executor pending).
    expect(removalPhase(store, key)).toBe('removing');
    expect(calls).toBe(1);

    // A second request/confirm during removing must be ignored.
    store.getState().requestRemoval(key);
    await store.getState().confirmRemoval(key);
    expect(calls).toBe(1);

    // Resolve the pending removal and let the first settle.
    resolveRemove({ removed: [], failed: [] });
    await first;
  });
});

describe('createDetectionStore — removal: cancel (FR-007)', () => {
  it('requestRemoval then cancelRemoval returns to none with zero executor calls', async () => {
    const fake = new FakeRemovalExecutor();
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false), fake);

    store.getState().requestRemoval(key);
    expect(removalPhase(store, key)).toBe('confirming');

    store.getState().cancelRemoval(key);
    expect(removalPhase(store, key)).toBe('none');
    expect(fake.calls.length).toBe(0);
  });
});

describe('createDetectionStore — removal: >25 boundary (NFR-003)', () => {
  it('24 removable → single confirm executes', async () => {
    const fake = new FakeRemovalExecutor();
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 24, false), fake);

    store.getState().requestRemoval(key);
    await store.getState().confirmRemoval(key);

    expect(fake.calls.length).toBe(1);
    expect(removalPhase(store, key)).toBe('none');
  });

  it('25 removable → single confirm executes', async () => {
    const fake = new FakeRemovalExecutor();
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 25, false), fake);

    store.getState().requestRemoval(key);
    await store.getState().confirmRemoval(key);

    expect(fake.calls.length).toBe(1);
    expect(removalPhase(store, key)).toBe('none');
  });

  it('26 removable → first confirm goes to confirming2 (no execute); second executes', async () => {
    const fake = new FakeRemovalExecutor();
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 26, false), fake);

    store.getState().requestRemoval(key);
    await store.getState().confirmRemoval(key);
    // First confirm: bulk → confirming2, NOT executed.
    expect(removalPhase(store, key)).toBe('confirming2');
    expect(fake.calls.length).toBe(0);

    // Second confirm executes.
    await store.getState().confirmRemoval(key);
    expect(fake.calls.length).toBe(1);
    expect(removalPhase(store, key)).toBe('none');
  });
});

describe('createDetectionStore — removal: confirmRemoval no-op guards', () => {
  it('confirmRemoval on a non-loaded (idle) row is a no-op', async () => {
    const fake = new FakeRemovalExecutor();
    const store = createDetectionStore(makeIdleScanner(), fake);
    await store.getState().confirmRemoval('absent-key');
    expect(fake.calls.length).toBe(0);
    expect(store.getState().rows['absent-key']).toBeUndefined();
  });

  it('confirmRemoval from removal phase none is a no-op (no dialog open)', async () => {
    const fake = new FakeRemovalExecutor();
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false), fake);

    // No requestRemoval first → phase is `none`.
    await store.getState().confirmRemoval(key);
    expect(fake.calls.length).toBe(0);
    expect(removalPhase(store, key)).toBe('none');
  });

  it('requestRemoval / cancelRemoval on a non-loaded row are inert (FSM ignores)', async () => {
    const fake = new FakeRemovalExecutor();
    const store = createDetectionStore(makeIdleScanner(), fake);
    store.getState().requestRemoval('absent-key');
    store.getState().cancelRemoval('absent-key');
    expect(fake.calls.length).toBe(0);
    expect(store.getState().rows['absent-key']?.kind).toBe('idle');
  });
});

describe('createDetectionStore — removal: progress dispatch', () => {
  it('forwards executor onProgress into the removing phase before completion', async () => {
    let resolveRemove!: (o: RemovalOutcome) => void;
    let progressCb: ((e: RemovalProgressEvent) => void) | undefined;
    const executor: RemovalExecutor = {
      remove: vi.fn(
        (
          _t: RemovalTarget,
          _tracks: ReadonlyArray<TrackRef>,
          _s: AbortSignal,
          onProgress?: (e: RemovalProgressEvent) => void,
        ) => {
          progressCb = onProgress;
          return new Promise<RemovalOutcome>((res) => {
            resolveRemove = res;
          });
        },
      ),
    };
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false), executor);

    store.getState().requestRemoval(key);
    const p = store.getState().confirmRemoval(key);

    progressCb!({ removedSoFar: 1, total: 2 });
    const row = store.getState().rows[key];
    if (row?.kind !== 'loaded' || row.removal.phase !== 'removing')
      throw new Error('expected removing');
    expect(row.removal.progress).toEqual({ removedSoFar: 1, total: 2 });

    resolveRemove({
      removed: [{ uri: 'spotify:track:0-dup' }, { uri: 'spotify:track:1-dup' }],
      failed: [],
    });
    await p;
    expect(removalPhase(store, key)).toBe('none');
  });
});

describe('createDetectionStore — removal: abort swallow', () => {
  it('an AbortError from the executor is swallowed (no failure dispatch)', async () => {
    let rejectRemove!: (e: unknown) => void;
    const executor: RemovalExecutor = {
      remove: vi.fn(
        () =>
          new Promise<RemovalOutcome>((_res, rej) => {
            rejectRemove = rej;
          }),
      ),
    };
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false), executor);

    store.getState().requestRemoval(key);
    const p = store.getState().confirmRemoval(key);
    expect(removalPhase(store, key)).toBe('removing');

    rejectRemove(new DOMException('aborted', 'AbortError'));
    await p;

    // Abort swallowed: row stays in `removing` (no failure dispatch).
    expect(removalPhase(store, key)).toBe('removing');
  });

  it('reset() during a removal aborts it; the late settle is a no-op (own-entry guard)', async () => {
    let resolveRemove!: (o: RemovalOutcome) => void;
    let lastSignal: AbortSignal | undefined;
    const executor: RemovalExecutor = {
      remove: vi.fn(
        (_t: RemovalTarget, _tr: ReadonlyArray<TrackRef>, signal: AbortSignal) => {
          lastSignal = signal;
          return new Promise<RemovalOutcome>((res) => {
            resolveRemove = res;
          });
        },
      ),
    };
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false), executor);

    store.getState().requestRemoval(key);
    const p = store.getState().confirmRemoval(key);
    expect(removalPhase(store, key)).toBe('removing');

    // reset() aborts the removal controller and clears all rows.
    store.getState().reset();
    expect(lastSignal!.aborted).toBe(true);
    expect(store.getState().rows).toEqual({});

    // The executor resolves late (it never observed the abort) — the finally's
    // own-entry guard sees the controller is no longer owned and does nothing;
    // the row stays cleared.
    resolveRemove({
      removed: [{ uri: 'spotify:track:0-dup' }, { uri: 'spotify:track:1-dup' }],
      failed: [],
    });
    await p;
    // The late `removeComplete` targets the now-absent (idle) row; the FSM
    // ignores it (no loaded result reappears). The row never returns to
    // `loaded` — the removal did not silently complete after reset.
    expect(store.getState().rows[key]?.kind).not.toBe('loaded');
  });
});

describe('createDetectionStore — removal: optional-executor back-compat', () => {
  it('createDetectionStore(scanner) constructs; request/cancel work without an executor', async () => {
    const key = 'liked-songs';
    // No executor passed at all.
    const ctrl = makeControllableScanner();
    const store = createDetectionStore(ctrl.scanner);
    const p = store.getState().scanCollection(key, { kind: 'liked-songs' });
    ctrl.resolveNext(makeRemovableResult(key, 2, false));
    await p;

    store.getState().requestRemoval(key);
    expect(removalPhase(store, key)).toBe('confirming');
    store.getState().cancelRemoval(key);
    expect(removalPhase(store, key)).toBe('none');
  });

  it('confirmRemoval that would execute fails loud when no executor is configured', async () => {
    const key = 'liked-songs';
    const store = await seedLoaded(key, makeRemovableResult(key, 2, false));

    store.getState().requestRemoval(key);
    // ≤25 → would fall through to execute → fail loud (no executor).
    await expect(store.getState().confirmRemoval(key)).rejects.toSatisfy(
      (e: unknown) => isRemovalError(e) && e.code === 'executor-failed',
    );
  });
});
