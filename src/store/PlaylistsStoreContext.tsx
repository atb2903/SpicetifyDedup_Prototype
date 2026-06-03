/**
 * React context binding for the load-state store.
 *
 * `playlists-store.ts` (WP06) exposes a vanilla Zustand `StoreApi` and a
 * `bindPlaylistsHook` factory. UI components (WP07/WP08) need a way to
 * reach the bound hook without importing a module-level singleton — both
 * because the production singleton lives in `src/app.tsx` (WP09) and
 * because tests build a fresh store per case.
 *
 * This file provides that bridge:
 *
 * - `PlaylistsStoreProvider` — wraps children with a React context
 *   carrying the bound hook.
 * - `usePlaylistsStore` — selector-based hook UI components consume.
 *   Throws if used outside a provider so misuse fails loud at render time
 *   rather than producing silent undefined state.
 *
 * Architecture: lives under `src/store/` so the ADR-0001 hexagonal rule
 * "UI imports neither adapters nor ports" stays intact — components import
 * this file (a store-layer export), not the loader port directly.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  bindPlaylistsHook,
  type PlaylistsState,
} from './playlists-store';

type BoundHook = <T>(selector: (state: PlaylistsState) => T) => T;

const PlaylistsStoreContext = createContext<BoundHook | null>(null);

/**
 * Provider component. Binds the supplied `StoreApi` to a React hook once
 * per `store` identity (via `useMemo`) and exposes it through context.
 */
export function PlaylistsStoreProvider({
  store,
  children,
}: {
  store: StoreApi<PlaylistsState>;
  children: React.ReactNode;
}) {
  const hook = useMemo<BoundHook>(() => bindPlaylistsHook(store), [store]);
  return (
    <PlaylistsStoreContext.Provider value={hook}>
      {children}
    </PlaylistsStoreContext.Provider>
  );
}

/**
 * Selector hook UI components consume. Fails loud (throws) when used
 * outside a `PlaylistsStoreProvider` so the misuse is impossible to
 * mistake for "no state yet".
 */
export function usePlaylistsStore<T>(
  selector: (state: PlaylistsState) => T,
): T {
  const hook = useContext(PlaylistsStoreContext);
  if (hook === null) {
    throw new Error(
      'usePlaylistsStore must be used inside <PlaylistsStoreProvider>.',
    );
  }
  return hook(selector);
}
