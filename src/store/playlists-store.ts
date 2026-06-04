/**
 * Zustand store wiring the `PlaylistsLoader` port to the load-state FSM.
 *
 * Pure factory: `createPlaylistsStore(loader)` returns a vanilla
 * `StoreApi<PlaylistsState>`. Tests instantiate with `FakePlaylistsLoader`;
 * the production singleton lives in `src/app.tsx` (WP09) and is built
 * with `SpicetifyPlaylistsLoader`.
 *
 * Responsibilities (data-model.md §9):
 * - Hold the `LoadState<CollectionViewModel>` and expose action thunks.
 * - On load success, apply domain rules (eligibility → ordering →
 *   view-model transform) and dispatch the right FSM action
 *   (`load-completed-empty` vs `load-succeeded`).
 * - On load failure, distinguish loader errors (preserved verbatim) from
 *   unexpected throws (wrapped as `rootlist-fetch-failed` with `cause`).
 * - Make zero loader calls until `triggerLoad` is invoked (SC-6).
 * - Gate `retry` on the prior state being `failed`; from any other state,
 *   `retry` is a documented no-op (the UI never exposes retry outside
 *   the `failed` state).
 *
 * No shape validation lives here — the adapter owns that at the host
 * boundary. The store consumes already-typed domain values and applies
 * domain rules to them; transformation is not validation.
 *
 * Architecture: `src/store/` may import from `domain/` and `ports/` only
 * (per ADR-0001 and `test/architecture.test.ts`).
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { PlaylistsLoader } from '../ports/playlists-loader';
import type { CollectionViewModel } from '../domain/view-models';
import { toViewModels } from '../domain/view-models';
import { transition, type LoadState } from '../domain/load-state';
import { isPlaylistsLoaderError, PlaylistsLoaderError } from '../domain/errors';
import { isEligible } from '../domain/eligibility';
import { orderRootlist } from '../domain/ordering';

/**
 * Public store shape consumed by UI components.
 *
 * - `loadState` — current FSM state, specialised on
 *   `CollectionViewModel` for the page's rendered rows.
 * - `triggerLoad` — bound to the initial "Load library" affordance
 *   (FR-011). Gated on the FSM being in `idle`; from any other state
 *   it is a documented no-op that neither mutates `loadState` nor
 *   calls the loader (FR-012/FR-013). Defense-in-depth that mirrors
 *   `retry`'s precondition — the UI today only renders the Load button
 *   from `idle`, but the store enforces the invariant unconditionally.
 * - `retry` — bound to the in-line retry affordance on the failed
 *   screen (FR-008). Documented no-op unless the prior state is
 *   `failed`.
 * - `reset` — lifecycle override that returns the FSM to `idle` from
 *   any state without calling the loader (FR-007/FR-009). Wired by
 *   the navigation layer (WP-03) to the route-back transition so that
 *   navigating away from the Dedup page and returning lands the user
 *   on an idle, ready-to-load surface. Synchronous; idempotent from
 *   `idle`.
 */
export type PlaylistsState = {
  loadState: LoadState<CollectionViewModel>;
  triggerLoad: () => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
};

/**
 * Build a fresh load-state store wired to the given loader.
 *
 * The store starts in `{ kind: 'idle' }` and makes no port call until
 * `triggerLoad` is invoked, preserving the explicit-action invariant
 * (SC-6, memory: "explicit fetch trigger required").
 */
export function createPlaylistsStore(
  loader: PlaylistsLoader,
): StoreApi<PlaylistsState> {
  return createStore<PlaylistsState>((set, get) => {
    const runLoad = async (): Promise<void> => {
      try {
        const { playlists, likedSongs } = await loader.load();
        const eligible = playlists.filter(isEligible);
        const ordered = orderRootlist(eligible);
        const items = toViewModels(ordered, likedSongs);
        const isLibraryEffectivelyEmpty =
          eligible.length === 0 && likedSongs.trackCount === 0;
        if (isLibraryEffectivelyEmpty) {
          set({
            loadState: transition(get().loadState, {
              type: 'load-completed-empty',
            }),
          });
        } else {
          set({
            loadState: transition(get().loadState, {
              type: 'load-succeeded',
              items,
            }),
          });
        }
      } catch (err) {
        const reason = isPlaylistsLoaderError(err)
          ? err
          : new PlaylistsLoaderError(
              'rootlist-fetch-failed',
              'Loader threw a non-PlaylistsLoaderError',
              { cause: err },
            );
        set({
          loadState: transition(get().loadState, {
            type: 'load-failed',
            reason,
          }),
        });
      }
    };

    return {
      loadState: { kind: 'idle' },
      /**
       * Dispatch the FSM `trigger` action and run the loader. Gated on
       * the prior state being `idle` (FR-012): from any other state the
       * call returns immediately without mutating `loadState` and
       * without invoking `loader.load()`. Mirrors `retry`'s gate; the
       * gate is unit-tested for every non-idle source state (FR-013).
       */
      async triggerLoad() {
        const before = get().loadState;
        if (before.kind !== 'idle') return;
        set({ loadState: transition(before, { type: 'trigger' }) });
        await runLoad();
      },
      async retry() {
        const before = get().loadState;
        if (before.kind !== 'failed') return;
        set({ loadState: transition(before, { type: 'retry' }) });
        await runLoad();
      },
      /**
       * Lifecycle override — forces `loadState` to `{ kind: 'idle' }`
       * from any state without invoking the loader (FR-007/FR-009).
       * Does NOT flow through the FSM `transition` function because it
       * is a system-driven override, not a user-driven move through the
       * state graph; modeling it as a transition cell would yield
       * `idle` from every source state, a weak fit. Idempotent from
       * `idle`. Synchronous — there is nothing to await.
       *
       * A late `load-succeeded` from an in-flight `runLoad()` that
       * resolves after `reset()` is a no-op because the FSM's
       * `transition` already ignores `load-succeeded` from `idle`; no
       * extra concurrency guard is needed in this layer.
       */
      reset() {
        set({ loadState: { kind: 'idle' } });
      },
    };
  });
}

/**
 * Bind a selector-based React hook to a concrete store instance. WP09
 * builds the production singleton via
 * `createPlaylistsStore(spicetifyLoader)` and calls this helper to
 * expose `usePlaylistsStore` for UI consumers (WP07/WP08).
 *
 * Exporting a factory rather than a module-level singleton hook keeps
 * the store file free of host-side construction side effects, which
 * matters because `src/app.tsx` (the Spicetify entry) is the only place
 * authorised to instantiate the production loader.
 */
export function bindPlaylistsHook(store: StoreApi<PlaylistsState>) {
  return function usePlaylistsStore<T>(
    selector: (state: PlaylistsState) => T,
  ): T {
    return useStore(store, selector);
  };
}
