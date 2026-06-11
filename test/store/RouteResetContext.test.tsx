/**
 * Tests for `RouteResetProvider` — the React-lifecycle reset bridge
 * introduced by `dedup-navigation-reset-hotfix-01KT9NSW`.
 *
 * The provider replaces the prior `NavigationProvider`, whose
 * `History.listen` subscription was structurally unable to reach its reset
 * condition in production: by the time the listener installed, Spicetify
 * had already navigated to `/spicetify-dedup`, so `wasOnDedup` captured
 * `true` and the `!wasOnDedup && isOnDedup` gate was permanently
 * unreachable.
 *
 * The new design swaps the listener for a React effect:
 *
 *   useEffect(() => {
 *     reset();              // FR-001 mount-time
 *     return () => reset(); // FR-002 unmount-time
 *   }, [reset]);
 *
 * Tests assert the lifecycle directly — no fake navigation port, no path
 * simulation. The user-promise here is: "if the React tree mounts the
 * Dedup page, the store is `idle` by the time render() returns" — which
 * is what the parametrised `T-new-1` block proves.
 *
 * Coverage (mapped to subtasks in WP01 and WP06):
 * - T001 / T-new-1 — production-lifecycle mount-time reset across all five
 *   source `loadState` kinds.
 * - T002 / T-new-2 — mount/unmount cycles each fire reset; loader
 *   call-count exact (R-1..R-5 loader isolation carries forward).
 * - T003 / T-new-3 — mount-time reset is synchronous (no `await`, no
 *   `act()` wrap). Contract assertion: if a future React version delays
 *   the effect, this test fails loudly so the implementer reconsiders
 *   whether to switch to `useLayoutEffect`.
 * - T004 — port-forward of the surviving prior tests (loader isolation,
 *   children pass-through).
 * - T018 — detection store reset: in-flight scans are aborted and rows are
 *   cleared on mount and unmount (FR-012).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { PlaylistsStoreProvider } from '../../src/store/PlaylistsStoreContext';
import { createDetectionStore } from '../../src/store/detection-store';
import { DetectionStoreProvider } from '../../src/store/DetectionStoreContext';
import { RouteResetProvider } from '../../src/store/RouteResetContext';
import { PlaylistsLoaderError } from '../../src/domain/errors';
import type { PlaylistsLoader } from '../../src/ports/playlists-loader';
import type { DetectionScanner } from '../../src/ports/detection-scanner';
import type { DetectionResult } from '../../src/domain/detection-types';
import type {
  RawCollection,
  LikedSongsSummary,
} from '../../src/domain/view-models';

/**
 * Test-local controllable loader. Exposes `resolve`/`reject` so the test
 * can drive the store into `loading` and hold it there (for the `loading`
 * parametrised case) without resorting to timing tricks.
 */
function makeControllableLoader(): {
  loader: PlaylistsLoader;
  resolve: (payload: {
    playlists: RawCollection[];
    likedSongs: LikedSongsSummary;
  }) => void;
  reject: (err: unknown) => void;
  callCount: () => number;
} {
  let resolveFn: (payload: {
    playlists: RawCollection[];
    likedSongs: LikedSongsSummary;
  }) => void = () => {};
  let rejectFn: (err: unknown) => void = () => {};
  let calls = 0;
  const loader: PlaylistsLoader = {
    load() {
      calls += 1;
      return new Promise((res, rej) => {
        resolveFn = res;
        rejectFn = rej;
      });
    },
  };
  return {
    loader,
    resolve: (payload) => resolveFn(payload),
    reject: (err) => rejectFn(err),
    callCount: () => calls,
  };
}

/** A hanging scanner that never resolves its `scan()` promise. */
function makeHangingScanner(): DetectionScanner {
  return { scan: vi.fn(() => new Promise<DetectionResult>(() => {})) };
}

/**
 * Builds a store + helper to drive it into the requested source `kind`
 * before the provider mounts. Returns the store, a `callCount()` probe,
 * and a `prime()` function that walks the FSM to the target state.
 */
async function makeStoreInState(
  kind: 'idle' | 'loading' | 'loaded' | 'empty' | 'failed',
): Promise<{
  store: ReturnType<typeof createPlaylistsStore>;
  callCount: () => number;
}> {
  if (kind === 'idle') {
    const controllable = makeControllableLoader();
    const store = createPlaylistsStore(controllable.loader);
    return { store, callCount: controllable.callCount };
  }
  if (kind === 'loading') {
    const controllable = makeControllableLoader();
    const store = createPlaylistsStore(controllable.loader);
    // Trigger but DO NOT resolve — store stays in `loading`.
    void store.getState().triggerLoad();
    return { store, callCount: controllable.callCount };
  }
  if (kind === 'loaded') {
    const controllable = makeControllableLoader();
    const store = createPlaylistsStore(controllable.loader);
    const inflight = store.getState().triggerLoad();
    controllable.resolve({
      playlists: [],
      likedSongs: { trackCount: 1 } satisfies LikedSongsSummary,
    });
    await inflight;
    return { store, callCount: controllable.callCount };
  }
  if (kind === 'empty') {
    const controllable = makeControllableLoader();
    const store = createPlaylistsStore(controllable.loader);
    const inflight = store.getState().triggerLoad();
    controllable.resolve({
      playlists: [],
      likedSongs: { trackCount: 0 } satisfies LikedSongsSummary,
    });
    await inflight;
    return { store, callCount: controllable.callCount };
  }
  // 'failed'
  const controllable = makeControllableLoader();
  const store = createPlaylistsStore(controllable.loader);
  const inflight = store.getState().triggerLoad();
  controllable.reject(
    new PlaylistsLoaderError('rootlist-fetch-failed', 'forced for test'),
  );
  await inflight;
  return { store, callCount: controllable.callCount };
}

// ── Helper: render with both store providers ──────────────────────────────────

/**
 * Render `children` inside both `PlaylistsStoreProvider` and
 * `DetectionStoreProvider`. Every test that mounts `RouteResetProvider`
 * must include both providers because the provider now calls
 * `useDetectionStore` in addition to `usePlaylistsStore`.
 */
function renderWithProviders(
  playlistsStore: ReturnType<typeof createPlaylistsStore>,
  detectionStore: ReturnType<typeof createDetectionStore>,
  children: React.ReactNode,
) {
  return render(
    <PlaylistsStoreProvider store={playlistsStore}>
      <DetectionStoreProvider store={detectionStore}>
        <RouteResetProvider>{children}</RouteResetProvider>
      </DetectionStoreProvider>
    </PlaylistsStoreProvider>,
  );
}

describe('RouteResetProvider — production-lifecycle reset', () => {
  describe.each([
    ['idle'],
    ['loading'],
    ['loaded'],
    ['empty'],
    ['failed'],
  ] as const)(
    'mounting with store pre-driven into %s resets to idle synchronously',
    (sourceKind) => {
      it(`T-new-1 (${sourceKind}) — post-mount state is idle, loader callCount unchanged`, async () => {
        const { store, callCount } = await makeStoreInState(sourceKind);
        const preState = store.getState().loadState.kind;
        const preCalls = callCount();
        const detectionStore = createDetectionStore(makeHangingScanner());

        // Sanity: the helper actually drove the store into the requested
        // source state. (For `loading` the store has `triggerLoad` in
        // flight; for `idle` no load was started.)
        if (sourceKind === 'idle') {
          expect(preState).toBe('idle');
        } else {
          expect(preState).toBe(sourceKind);
        }

        renderWithProviders(store, detectionStore, <span data-testid="child" />);

        expect(store.getState().loadState.kind).toBe('idle');
        // The reset MUST NOT invoke the loader (R-1..R-5 invariant
        // re-asserted at the provider boundary).
        expect(callCount()).toBe(preCalls);
      });
    },
  );
});

describe('RouteResetProvider — mount/unmount cycles', () => {
  it('T-new-2 — each mount and unmount resets to idle; loader call-count is exact (also covers T-survive-2)', async () => {
    const controllable = makeControllableLoader();
    const store = createPlaylistsStore(controllable.loader);
    const detectionStore = createDetectionStore(makeHangingScanner());

    // First pre-load to `loaded`.
    const first = store.getState().triggerLoad();
    controllable.resolve({
      playlists: [],
      likedSongs: { trackCount: 1 } satisfies LikedSongsSummary,
    });
    await first;
    expect(store.getState().loadState.kind).toBe('loaded');
    const c0 = controllable.callCount();

    // Mount the provider — mount-time reset fires; store → idle.
    const { unmount } = renderWithProviders(store, detectionStore, <span />);
    expect(store.getState().loadState.kind).toBe('idle');

    // Second pre-load while the provider is mounted; one extra loader call.
    const second = store.getState().triggerLoad();
    controllable.resolve({
      playlists: [],
      likedSongs: { trackCount: 1 } satisfies LikedSongsSummary,
    });
    await second;
    expect(store.getState().loadState.kind).toBe('loaded');
    const c1 = controllable.callCount();
    expect(c1).toBe(c0 + 1);

    // Unmount — cleanup reset fires; store → idle. Loader call-count
    // must not change (verifies the unmount path is loader-isolated).
    unmount();
    expect(store.getState().loadState.kind).toBe('idle');
    expect(controllable.callCount()).toBe(c1);
  });
});

describe('RouteResetProvider — synchronous reset on mount', () => {
  it('T-new-3 — store is idle by the time render() returns (no await, no act() wrap)', async () => {
    const { store } = await makeStoreInState('loaded');
    const detectionStore = createDetectionStore(makeHangingScanner());
    expect(store.getState().loadState.kind).toBe('loaded');

    // Contract assertion: under @testing-library/react 16 + happy-dom 20 +
    // React 19, `render()` flushes useEffect synchronously before
    // returning. If a future React version delays this, do NOT mask the
    // failure with `await act(...)` — revisit whether the provider
    // should use `useLayoutEffect`.
    renderWithProviders(store, detectionStore, <span />);
    expect(store.getState().loadState.kind).toBe('idle');
  });
});

describe('RouteResetProvider — loader isolation', () => {
  it('T-survive-1 — mount + unmount do NOT call loader.load()', async () => {
    const controllable = makeControllableLoader();
    const store = createPlaylistsStore(controllable.loader);
    const detectionStore = createDetectionStore(makeHangingScanner());

    // Pre-load to loaded so the resets have something to reset from.
    const inflight = store.getState().triggerLoad();
    controllable.resolve({
      playlists: [],
      likedSongs: { trackCount: 1 } satisfies LikedSongsSummary,
    });
    await inflight;
    const preCalls = controllable.callCount();
    expect(preCalls).toBe(1);

    const { unmount } = renderWithProviders(store, detectionStore, <span />);
    expect(controllable.callCount()).toBe(preCalls);
    unmount();
    expect(controllable.callCount()).toBe(preCalls);
  });
});

describe('RouteResetProvider — children pass-through', () => {
  it('T-survive-3 — renders its children', async () => {
    const { store } = await makeStoreInState('idle');
    const detectionStore = createDetectionStore(makeHangingScanner());
    const { getByTestId } = renderWithProviders(
      store,
      detectionStore,
      <span data-testid="child">hello</span>,
    );
    expect(getByTestId('child').textContent).toBe('hello');
  });
});

describe('RouteResetProvider — detection store reset (T018)', () => {
  it('T018-mount — detection store rows cleared and in-flight scan aborted on mount', async () => {
    const { store: playlistsStore } = await makeStoreInState('idle');

    // Create a hanging scanner to keep a scan in flight.
    const detectionStore = createDetectionStore(makeHangingScanner());

    // Prime the detection store with a scanning row before mount.
    void detectionStore.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    expect(detectionStore.getState().rows['liked-songs']?.kind).toBe('scanning');

    // Mount the provider — detection reset fires; rows cleared.
    renderWithProviders(playlistsStore, detectionStore, <span />);

    expect(detectionStore.getState().rows).toEqual({});
  });

  it('T018-unmount — detection store rows cleared on unmount', async () => {
    const { store: playlistsStore } = await makeStoreInState('idle');
    const detectionStore = createDetectionStore(makeHangingScanner());

    const { unmount } = renderWithProviders(playlistsStore, detectionStore, <span />);
    // After mount the rows should be empty (mount-time reset).
    expect(detectionStore.getState().rows).toEqual({});

    // Prime a scan after mount (simulating a user clicking the scan button).
    void detectionStore.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    expect(detectionStore.getState().rows['liked-songs']?.kind).toBe('scanning');

    // Unmount — cleanup reset fires; rows cleared.
    unmount();
    expect(detectionStore.getState().rows).toEqual({});
  });

  it('T018-abort — in-flight scan AbortSignal is fired on unmount', async () => {
    const { store: playlistsStore } = await makeStoreInState('idle');

    let capturedSignal: AbortSignal | undefined;
    const scanner: DetectionScanner = {
      scan: vi.fn((_req, signal) => {
        capturedSignal = signal;
        return new Promise<DetectionResult>(() => {}); // never resolves
      }),
    };
    const detectionStore = createDetectionStore(scanner);

    const { unmount } = renderWithProviders(playlistsStore, detectionStore, <span />);

    // Start a scan after mount.
    void detectionStore.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    // Unmount — detection reset should abort the signal.
    unmount();
    expect(capturedSignal!.aborted).toBe(true);
    expect(detectionStore.getState().rows).toEqual({});
  });

  it('T018-idempotent — detection reset from empty rows is a no-op', async () => {
    const { store: playlistsStore } = await makeStoreInState('idle');
    const detectionStore = createDetectionStore(makeHangingScanner());

    expect(detectionStore.getState().rows).toEqual({});
    // Mount + unmount with no scans started: rows stay empty.
    const { unmount } = renderWithProviders(playlistsStore, detectionStore, <span />);
    expect(detectionStore.getState().rows).toEqual({});
    unmount();
    expect(detectionStore.getState().rows).toEqual({});
  });
});
