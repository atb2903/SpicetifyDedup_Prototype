/**
 * React context binding for the detection store.
 *
 * Mirrors the pattern in `PlaylistsStoreContext.tsx`. `detection-store.ts`
 * exposes a vanilla Zustand `StoreApi` and a `bindDetectionHook` factory. UI
 * components need a way to reach the bound hook without importing a module-level
 * singleton — both because the production singleton lives in `src/app.tsx`
 * (WP09) and because tests build a fresh store per case.
 *
 * - `DetectionStoreProvider` — wraps children with a React context carrying the
 *   bound hook.
 * - `useDetectionStore` — selector-based hook UI components consume. Throws if
 *   used outside a provider so misuse fails loud at render time rather than
 *   producing silent `undefined` state (fail-loud per charter Input Validation).
 *
 * Architecture: lives under `src/store/` so the ADR-0001 hexagonal rule "UI
 * imports neither adapters nor ports" stays intact — components import this file
 * (a store-layer export), not the scanner port directly.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  bindDetectionHook,
  type DetectionStoreState,
} from './detection-store';

type BoundHook = <T>(selector: (state: DetectionStoreState) => T) => T;

const DetectionStoreContext = createContext<BoundHook | null>(null);

/**
 * Provider component. Binds the supplied `StoreApi` to a React hook once per
 * `store` identity (via `useMemo`) and exposes it through context.
 *
 * @param store    — Vanilla Zustand store instance to bind.
 * @param children — React subtree rendered inside the provider.
 */
export function DetectionStoreProvider({
  store,
  children,
}: {
  /** Vanilla Zustand `StoreApi<DetectionStoreState>` instance. */
  store: StoreApi<DetectionStoreState>;
  /** React children rendered inside the provider. */
  children: React.ReactNode;
}): React.ReactElement {
  const hook = useMemo<BoundHook>(() => bindDetectionHook(store), [store]);
  return (
    <DetectionStoreContext.Provider value={hook}>
      {children}
    </DetectionStoreContext.Provider>
  );
}

/**
 * Selector hook for UI components. Returns the value produced by `selector`
 * applied to the current `DetectionStoreState`, and re-renders when the
 * selected value changes.
 *
 * Fails loud — throws `Error` when called outside a `DetectionStoreProvider`
 * so a wiring mistake in WP09 is impossible to mistake for "no state yet".
 *
 * @param selector — Pure function from `DetectionStoreState` to the desired
 *                   slice.
 * @returns The selected slice; re-evaluates on store mutations.
 *
 * @throws {Error} If called outside a `<DetectionStoreProvider>`.
 *
 * @example
 * const kind = useDetectionStore(s => s.rows['liked-songs']?.kind ?? 'idle');
 */
export function useDetectionStore<T>(
  selector: (state: DetectionStoreState) => T,
): T {
  const hook = useContext(DetectionStoreContext);
  if (hook === null) {
    throw new Error(
      'useDetectionStore must be used inside <DetectionStoreProvider>.',
    );
  }
  return hook(selector);
}
