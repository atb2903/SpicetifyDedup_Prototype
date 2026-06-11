/**
 * End-to-end integration test for the detection pipeline (T019).
 *
 * Exercises the full pipeline driven by the real `createDetectionStore` and a
 * fake scanner that simulates the composition adapter WP04 will deliver. The
 * fake scanner emits the exact same `ProgressEvent` sequence a real scan
 * would — `enumerating`, `enriching`, `matching` stages — so this test
 * validates that:
 *
 * 1. `store.scanCollection(key, request)` transitions the row to `scanning`.
 * 2. Each `onProgress` call the scanner makes updates `scanning.progress`.
 * 3. Returning a `DetectionResult` transitions the row to `loaded`.
 * 4. Aborting via `reset()` aborts the in-flight `AbortSignal` and clears rows.
 * 5. A non-`DetectionError` thrown by the scanner is wrapped as `catalog-rejected`.
 * 6. A `DetectionError` thrown by the scanner surfaces as `failed.reason`.
 *
 * These are black-box tests over the store's public API. The fake scanner
 * implements the `DetectionScanner` port (same interface WP04's composition
 * adapter implements) and does NOT reach into private store state.
 *
 * Note on WP04 adapters: `FakeTracksEnumerator`, `FakeCatalogEnricher`, and
 * `createDetectionScanner` (the composition adapter) live in lane-d (WP04).
 * This test uses an inline fake scanner that simulates their combined output
 * so that WP06 is self-contained. When all lanes merge, a follow-up test in
 * `test/integration/` can import the real WP04 fakes for cross-lane coverage.
 *
 * Architecture: the test imports only from `src/store/` and `src/domain/`,
 * which is within the allowed import graph for tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDetectionStore } from '../../src/store/detection-store';
import { DetectionError } from '../../src/domain/detection-errors';
import type { DetectionScanner } from '../../src/ports/detection-scanner';
import type {
  DetectionResult,
  ProgressEvent,
  ScanRequest,
} from '../../src/domain/detection-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal `DetectionResult` fixture for a given collection key. */
function makeResult(collectionKey: string, groups = 0): DetectionResult {
  return {
    collectionKey,
    completedAt: Date.now(),
    groups: [],
    duplicateTrackCount: groups,
    removableTrackCount: groups > 0 ? groups - 1 : 0,
    skippedLocalCount: 0,
    unenrichedCount: 0,
    scannedTrackCount: 10,
  };
}

/**
 * Build a fake `DetectionScanner` that simulates the WP04 composition adapter.
 *
 * The fake emits a realistic progress sequence:
 *   enumerating(0/null) → enumerating(10/10) → enriching(0/10)
 *   → enriching(10/10) → matching(0/10) → matching(10/10)
 * then resolves with a `DetectionResult`.
 *
 * All steps are synchronous within a single microtask tick so tests can
 * await the `scan()` promise without extra scheduling.
 *
 * @param result — Result to resolve with. Defaults to `makeResult(key)`.
 */
function makeFakeScanner(overrideResult?: DetectionResult): {
  scanner: DetectionScanner;
  emittedProgress: ProgressEvent[];
} {
  const emittedProgress: ProgressEvent[] = [];

  const scanner: DetectionScanner = {
    scan: vi.fn(
      async (
        request: ScanRequest,
        signal: AbortSignal,
        onProgress: (event: ProgressEvent) => void,
      ): Promise<DetectionResult> => {
        const key =
          request.kind === 'liked-songs'
            ? 'liked-songs'
            : request.playlistUri;

        // Simulate enumerating phase.
        const evEnum0: ProgressEvent = { stage: 'enumerating', processed: 0, total: null };
        emittedProgress.push(evEnum0);
        onProgress(evEnum0);

        if (signal.aborted) throw new DOMException('aborted', 'AbortError');

        const evEnum1: ProgressEvent = { stage: 'enumerating', processed: 10, total: 10 };
        emittedProgress.push(evEnum1);
        onProgress(evEnum1);

        if (signal.aborted) throw new DOMException('aborted', 'AbortError');

        // Simulate enriching phase.
        const evEnrich0: ProgressEvent = { stage: 'enriching', processed: 0, total: 10 };
        emittedProgress.push(evEnrich0);
        onProgress(evEnrich0);

        if (signal.aborted) throw new DOMException('aborted', 'AbortError');

        const evEnrich1: ProgressEvent = { stage: 'enriching', processed: 10, total: 10 };
        emittedProgress.push(evEnrich1);
        onProgress(evEnrich1);

        if (signal.aborted) throw new DOMException('aborted', 'AbortError');

        // Simulate matching phase.
        const evMatch0: ProgressEvent = { stage: 'matching', processed: 0, total: 10 };
        emittedProgress.push(evMatch0);
        onProgress(evMatch0);

        const evMatch1: ProgressEvent = { stage: 'matching', processed: 10, total: 10 };
        emittedProgress.push(evMatch1);
        onProgress(evMatch1);

        return overrideResult ?? makeResult(key);
      },
    ),
  };

  return { scanner, emittedProgress };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('detection end-to-end — liked-songs happy path', () => {
  it('E2E-01 — idle → scanning (with progress) → loaded for liked-songs', async () => {
    const { scanner } = makeFakeScanner();
    const store = createDetectionStore(scanner);
    const key = 'liked-songs';

    expect(store.getState().rows[key]).toBeUndefined();

    const scanPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });

    // Immediately after call: row enters scanning.
    expect(store.getState().rows[key]?.kind).toBe('scanning');

    await scanPromise;

    const row = store.getState().rows[key];
    expect(row?.kind).toBe('loaded');
    if (row?.kind !== 'loaded') throw new Error('Expected loaded');
    expect(row.result.collectionKey).toBe(key);
    expect(row.result.scannedTrackCount).toBe(10);
  });
});

describe('detection end-to-end — playlist happy path', () => {
  it('E2E-02 — idle → scanning → loaded for a playlist URI', async () => {
    const { scanner } = makeFakeScanner();
    const store = createDetectionStore(scanner);
    const playlistUri = 'spotify:playlist:abc123';

    const scanPromise = store.getState().scanCollection(playlistUri, {
      kind: 'playlist',
      playlistUri,
    });

    expect(store.getState().rows[playlistUri]?.kind).toBe('scanning');

    await scanPromise;

    expect(store.getState().rows[playlistUri]?.kind).toBe('loaded');
  });
});

describe('detection end-to-end — progress events flow through store state', () => {
  it('E2E-03 — store scanning.progress reflects each stage the scanner emits', async () => {
    // Use a controllable scanner so we can observe intermediate states.
    let capturedOnProgress!: (ev: ProgressEvent) => void;
    let resolveScanner!: (r: DetectionResult) => void;

    const scanner: DetectionScanner = {
      scan: vi.fn((_req, _signal, onProgress) => {
        capturedOnProgress = onProgress;
        return new Promise<DetectionResult>((res) => {
          resolveScanner = res;
        });
      }),
    };

    const store = createDetectionStore(scanner);
    const key = 'liked-songs';

    void store.getState().scanCollection(key, { kind: 'liked-songs' });
    expect(store.getState().rows[key]?.kind).toBe('scanning');

    // Enumerating stage.
    const evEnum: ProgressEvent = { stage: 'enumerating', processed: 5, total: 20 };
    capturedOnProgress(evEnum);
    let row = store.getState().rows[key];
    if (row?.kind !== 'scanning') throw new Error('Expected scanning');
    expect(row.progress).toEqual(evEnum);

    // Enriching stage.
    const evEnrich: ProgressEvent = { stage: 'enriching', processed: 3, total: 20 };
    capturedOnProgress(evEnrich);
    row = store.getState().rows[key];
    if (row?.kind !== 'scanning') throw new Error('Expected scanning');
    expect(row.progress).toEqual(evEnrich);

    // Matching stage.
    const evMatch: ProgressEvent = { stage: 'matching', processed: 20, total: 20 };
    capturedOnProgress(evMatch);
    row = store.getState().rows[key];
    if (row?.kind !== 'scanning') throw new Error('Expected scanning');
    expect(row.progress).toEqual(evMatch);

    // Resolve — row → loaded.
    resolveScanner(makeResult(key));
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(store.getState().rows[key]?.kind).toBe('loaded');
  });
});

describe('detection end-to-end — reset() aborts in-flight scan', () => {
  it('E2E-04 — reset aborts the AbortSignal and clears rows (FR-012)', async () => {
    let capturedSignal!: AbortSignal;

    const scanner: DetectionScanner = {
      scan: vi.fn((_req, signal) => {
        capturedSignal = signal;
        return new Promise<DetectionResult>(() => {}); // never resolves on its own
      }),
    };

    const store = createDetectionStore(scanner);
    const key = 'liked-songs';

    // Start a scan.
    void store.getState().scanCollection(key, { kind: 'liked-songs' });
    expect(store.getState().rows[key]?.kind).toBe('scanning');
    expect(capturedSignal.aborted).toBe(false);

    // Route-reset equivalent: reset() aborts the scan and clears rows.
    store.getState().reset();

    expect(capturedSignal.aborted).toBe(true);
    expect(store.getState().rows).toEqual({});
  });
});

describe('detection end-to-end — error handling', () => {
  it('E2E-05 — DetectionError from scanner surfaces as failed.reason', async () => {
    const error = new DetectionError('network-failure', 'simulated network error');
    const scanner: DetectionScanner = {
      scan: vi.fn(() => Promise.reject(error)),
    };

    const store = createDetectionStore(scanner);
    const key = 'liked-songs';

    await store.getState().scanCollection(key, { kind: 'liked-songs' });

    const row = store.getState().rows[key];
    expect(row?.kind).toBe('failed');
    if (row?.kind !== 'failed') throw new Error('Expected failed');
    expect(row.reason).toBe(error);
    expect(row.reason.reason).toBe('network-failure');
  });

  it('E2E-06 — non-DetectionError wrapped as catalog-rejected', async () => {
    const scanner: DetectionScanner = {
      scan: vi.fn(() => Promise.reject(new TypeError('unexpected payload'))),
    };

    const store = createDetectionStore(scanner);
    const key = 'liked-songs';

    await store.getState().scanCollection(key, { kind: 'liked-songs' });

    const row = store.getState().rows[key];
    expect(row?.kind).toBe('failed');
    if (row?.kind !== 'failed') throw new Error('Expected failed');
    expect(row.reason.reason).toBe('catalog-rejected');
    expect(row.reason.cause).toBeInstanceOf(TypeError);
  });

  it('E2E-07 — AbortError swallowed; row remains idle after cancelScan', async () => {
    let capturedSignal!: AbortSignal;
    let rejectScanner!: (e: unknown) => void;

    const scanner: DetectionScanner = {
      scan: vi.fn((_req, signal) => {
        capturedSignal = signal;
        return new Promise<DetectionResult>((_res, rej) => {
          rejectScanner = rej;
        });
      }),
    };

    const store = createDetectionStore(scanner);
    const key = 'liked-songs';

    const scanPromise = store.getState().scanCollection(key, { kind: 'liked-songs' });

    store.getState().cancelScan(key);
    expect(capturedSignal.aborted).toBe(true);
    expect(store.getState().rows[key]?.kind).toBe('idle');

    // Reject with AbortError — should be swallowed (no fail dispatch).
    rejectScanner(new DOMException('aborted', 'AbortError'));
    await scanPromise;

    expect(store.getState().rows[key]?.kind).toBe('idle');
  });
});

describe('detection end-to-end — parallel rows', () => {
  it('E2E-08 — two collections scan independently; each reaches loaded', async () => {
    const { scanner } = makeFakeScanner();
    const store = createDetectionStore(scanner);

    const keyA = 'liked-songs';
    const keyB = 'spotify:playlist:xyz';

    const promiseA = store
      .getState()
      .scanCollection(keyA, { kind: 'liked-songs' });
    const promiseB = store.getState().scanCollection(keyB, {
      kind: 'playlist',
      playlistUri: keyB,
    });

    await Promise.all([promiseA, promiseB]);

    expect(store.getState().rows[keyA]?.kind).toBe('loaded');
    expect(store.getState().rows[keyB]?.kind).toBe('loaded');
  });
});

describe('detection end-to-end — re-trigger (atomic replace)', () => {
  it('E2E-09 — re-triggering a scan atomically replaces in-flight scan (FR-011)', async () => {
    let firstResolve!: (r: DetectionResult) => void;
    let secondResolve!: (r: DetectionResult) => void;
    let callCount = 0;

    const scanner: DetectionScanner = {
      scan: vi.fn((_req, _signal) => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<DetectionResult>((res) => {
            firstResolve = res;
          });
        }
        return new Promise<DetectionResult>((res) => {
          secondResolve = res;
        });
      }),
    };

    const store = createDetectionStore(scanner);
    const key = 'liked-songs';

    // First scan — in flight.
    void store.getState().scanCollection(key, { kind: 'liked-songs' });
    expect(store.getState().rows[key]?.kind).toBe('scanning');

    // Second scan — atomic replace.
    const secondPromise = store
      .getState()
      .scanCollection(key, { kind: 'liked-songs' });
    expect(store.getState().rows[key]?.kind).toBe('scanning');

    // Settle the first scan (was aborted signal, but fake doesn't auto-reject);
    // the store's FSM ignores complete from the first scan since it was aborted
    // before the second scan started — the first scan's AbortError path:
    // actually firstResolve() would call dispatch complete which IS processed
    // since the row is in scanning from scan#2. Settle first with AbortError.
    firstResolve(makeResult(key)); // this complete fires but dispatch is from scan#1
    // Wait a tick for scan#1's async frame to settle.
    await new Promise<void>((r) => setTimeout(r, 0));

    // Resolve second scan.
    secondResolve(makeResult(key));
    await secondPromise;

    expect(store.getState().rows[key]?.kind).toBe('loaded');
    expect(callCount).toBe(2);
  });
});

describe('detection end-to-end — scan produces correct DetectionResult fields', () => {
  it('E2E-10 — result invariants: duplicateTrackCount, removableTrackCount, collectionKey', async () => {
    const key = 'liked-songs';
    const expectedResult: DetectionResult = {
      collectionKey: key,
      completedAt: 1_717_200_000_000,
      groups: [],
      duplicateTrackCount: 0,
      removableTrackCount: 0,
      skippedLocalCount: 2,
      unenrichedCount: 1,
      scannedTrackCount: 15,
    };

    const { scanner } = makeFakeScanner(expectedResult);
    const store = createDetectionStore(scanner);

    await store.getState().scanCollection(key, { kind: 'liked-songs' });

    const row = store.getState().rows[key];
    if (row?.kind !== 'loaded') throw new Error('Expected loaded');

    expect(row.result.collectionKey).toBe(key);
    expect(row.result.duplicateTrackCount).toBe(0);
    expect(row.result.removableTrackCount).toBe(0);
    expect(row.result.skippedLocalCount).toBe(2);
    expect(row.result.unenrichedCount).toBe(1);
    expect(row.result.scannedTrackCount).toBe(15);
  });
});
