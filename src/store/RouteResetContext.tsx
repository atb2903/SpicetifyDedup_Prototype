/**
 * React-lifecycle reset bridge for the Dedup page.
 *
 * Replaces the prior `NavigationProvider` (superseded by ADR-0005). The
 * prior design subscribed to `Platform.History` events and gated its
 * reset on a `!wasOnDedup && isOnDedup` transition; in production
 * Spicetify navigates to `/spicetify-dedup` BEFORE mounting the custom-
 * app React tree, so by the time the subscription installed `wasOnDedup`
 * was already `true` and the transition condition was permanently
 * unreachable. The 2026-06-04 live-client diagnostic captured two
 * distinct navigation-adapter `subscribe` calls across one navigate-
 * away/back cycle, confirming the React tree DOES re-mount on every
 * Dedup navigation — which makes a React-lifecycle reset both correct
 * and load-bearing.
 *
 * Architecture (`test/architecture.test.ts`): lives under `src/store/`;
 * imports only `react` and `./PlaylistsStoreContext` (same layer). No
 * cross-layer imports — no `../adapters/`, no `../ports/`, no `../ui/`.
 */
import React, { useEffect } from 'react';
import { usePlaylistsStore } from './PlaylistsStoreContext';

interface RouteResetProviderProps {
  children: React.ReactNode;
}

/**
 * Reset the playlists store on mount and on unmount.
 *
 * Wires `usePlaylistsStore((s) => s.reset)` into a React lifecycle effect
 * so that every entry into and exit from the Dedup React tree lands the
 * store on `{ kind: 'idle' }`. The mount-time reset handles the production
 * lifecycle observed in the 2026-06-04 live-client diagnostic (Spicetify
 * mounts the tree AFTER navigating to /spicetify-dedup, so any in-band
 * "transition" event has already fired by mount time). The unmount-time
 * cleanup handles the hypothetical alternative where Spicetify ever keeps
 * the tree mounted across navigation (the reset runs as the tree tears
 * down, leaving the store idle for whatever boundary comes next).
 *
 * Idempotent from `idle` (see R-1 in `playlists-store.test.ts`), so the
 * cold-start cold-mount case (store already idle) is a safe no-op rather
 * than a redundant state mutation.
 *
 * See `.claude/adr/0005-react-lifecycle-reset.md` for the full decision
 * rationale and `.claude/adr/0004-navigation-port.md` for the superseded
 * port-based design.
 *
 * @param children - React subtree to render inside the provider.
 */
export function RouteResetProvider({
  children,
}: RouteResetProviderProps): React.ReactElement {
  const reset = usePlaylistsStore((s) => s.reset);
  useEffect(() => {
    reset();
    return () => reset();
  }, [reset]);
  return <>{children}</>;
}
