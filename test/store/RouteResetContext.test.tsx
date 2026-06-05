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
 * Coverage (mapped to subtasks in WP01):
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
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { PlaylistsStoreProvider } from '../../src/store/PlaylistsStoreContext';
import { RouteResetProvider } from '../../src/store/RouteResetContext';
import { PlaylistsLoaderError } from '../../src/domain/errors';
import type { PlaylistsLoader } from '../../src/ports/playlists-loader';
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

        // Sanity: the helper actually drove the store into the requested
        // source state. (For `loading` the store has `triggerLoad` in
        // flight; for `idle` no load was started.)
        if (sourceKind === 'idle') {
          expect(preState).toBe('idle');
        } else {
          expect(preState).toBe(sourceKind);
        }

        render(
          <PlaylistsStoreProvider store={store}>
            <RouteResetProvider>
              <span data-testid="child" />
            </RouteResetProvider>
          </PlaylistsStoreProvider>,
        );

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
    const { unmount } = render(
      <PlaylistsStoreProvider store={store}>
        <RouteResetProvider>
          <span />
        </RouteResetProvider>
      </PlaylistsStoreProvider>,
    );
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
    expect(store.getState().loadState.kind).toBe('loaded');

    // Contract assertion: under @testing-library/react 16 + happy-dom 20 +
    // React 19, `render()` flushes useEffect synchronously before
    // returning. If a future React version delays this, do NOT mask the
    // failure with `await act(...)` — revisit whether the provider
    // should use `useLayoutEffect`.
    render(
      <PlaylistsStoreProvider store={store}>
        <RouteResetProvider>
          <span />
        </RouteResetProvider>
      </PlaylistsStoreProvider>,
    );
    expect(store.getState().loadState.kind).toBe('idle');
  });
});

describe('RouteResetProvider — loader isolation', () => {
  it('T-survive-1 — mount + unmount do NOT call loader.load()', async () => {
    const controllable = makeControllableLoader();
    const store = createPlaylistsStore(controllable.loader);

    // Pre-load to loaded so the resets have something to reset from.
    const inflight = store.getState().triggerLoad();
    controllable.resolve({
      playlists: [],
      likedSongs: { trackCount: 1 } satisfies LikedSongsSummary,
    });
    await inflight;
    const preCalls = controllable.callCount();
    expect(preCalls).toBe(1);

    const { unmount } = render(
      <PlaylistsStoreProvider store={store}>
        <RouteResetProvider>
          <span />
        </RouteResetProvider>
      </PlaylistsStoreProvider>,
    );
    expect(controllable.callCount()).toBe(preCalls);
    unmount();
    expect(controllable.callCount()).toBe(preCalls);
  });
});

describe('RouteResetProvider — children pass-through', () => {
  it('T-survive-3 — renders its children', async () => {
    const { store } = await makeStoreInState('idle');
    const { getByTestId } = render(
      <PlaylistsStoreProvider store={store}>
        <RouteResetProvider>
          <span data-testid="child">hello</span>
        </RouteResetProvider>
      </PlaylistsStoreProvider>,
    );
    expect(getByTestId('child').textContent).toBe('hello');
  });
});
