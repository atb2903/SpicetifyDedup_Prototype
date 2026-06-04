/**
 * Navigation-aware reset bridge (FR-008, FR-009).
 *
 * `NavigationProvider` is the only place in the codebase that wires the
 * `NavigationPort` to the playlists store. It lives under `src/store/`
 * (consistent with `PlaylistsStoreContext.tsx`) so the ADR-0001 rule
 * "UI imports neither adapters nor ports" stays intact — `src/store/`
 * is allowed to import from `ports/` but never from `adapters/`.
 *
 * Mechanism:
 *   - On mount, capture whether the *initial* host path is already on
 *     the dedup app (so a same-mount subscription does not spuriously
 *     reset the store).
 *   - Subscribe to navigation events; on every event compare the new
 *     path's "is on dedup" against the previously-tracked value.
 *   - When the user returns to the dedup app from elsewhere
 *     (`!wasOnDedup && isOnDedup`), invoke `store.reset()`. The store's
 *     `reset()` is itself idempotent from `idle` (R-1 in
 *     `playlists-store.test.ts`), so calling it after a no-op return
 *     trip leaves the FSM at `idle` without side effects.
 *   - On unmount, the `useEffect` cleanup invokes the port's unsubscribe
 *     so the subscription does not leak across React StrictMode
 *     double-mounts or test re-renders.
 *
 * The dedup path prefix is derived from `src/settings.json#nameId` at
 * module load — the same identifier Spicetify uses to register the
 * custom-app route. Sourcing it from the registration JSON keeps the
 * provider's gate in lockstep with the route the host actually
 * publishes, eliminating the drift risk called out in the WP risks
 * table.
 *
 * The provider deliberately does NOT inspect the store's `loadState`
 * before calling `reset()`. The store enforces its own idempotence; an
 * extra UI-side guard would only re-encode an invariant the FSM already
 * owns (DIRECTIVE_010).
 *
 * **Graceful degradation**: if the navigation port throws on mount
 * (e.g. a future Spicetify version moves `Platform.History` and the
 * adapter raises `host-unavailable`), the provider catches the throw,
 * skips wiring, and the rest of the page continues to function. The
 * navigation-aware reset is a polish enhancement — losing it should
 * not crash the page. The adapter still raises its typed error; this
 * provider chooses not to propagate it past the React boundary.
 *
 * Architecture (`test/architecture.test.ts`): `src/store/` is forbidden
 * from importing `src/adapters/` or `src/ui/`. This file imports the
 * `NavigationPort` type (allowed: `ports/`) and the bound playlists
 * hook from `./PlaylistsStoreContext` (allowed: same layer).
 */
import React, { useEffect } from 'react';
import type { NavigationPort } from '../ports/navigation';
import { usePlaylistsStore } from './PlaylistsStoreContext';
import settings from '../settings.json';

const DEDUP_PATH_PREFIX = `/${settings.nameId}`;

/**
 * Test seam — exported so the contract tests and WP-DoD reviewers can
 * assert the derived prefix without hard-coding `'/spicetify-dedup'`
 * in two places.
 */
export function dedupPathPrefix(): string {
  return DEDUP_PATH_PREFIX;
}

interface NavigationProviderProps {
  navigation: NavigationPort;
  children: React.ReactNode;
}

/**
 * Wires `navigation.subscribe` to `store.reset()` for the lifetime of
 * the provider's mount. See file-level comment for the transition
 * semantics and graceful-degradation policy.
 */
export function NavigationProvider({
  navigation,
  children,
}: NavigationProviderProps): React.ReactElement {
  const reset = usePlaylistsStore((s) => s.reset);

  useEffect(() => {
    let wasOnDedup: boolean;
    try {
      wasOnDedup = navigation.currentPath().startsWith(DEDUP_PATH_PREFIX);
    } catch (err) {
      // Host unavailable / port misconfigured — fail-soft so the page
      // still renders without the navigation-aware reset polish.
      // eslint-disable-next-line no-console
      console.warn(
        '[NavigationProvider] navigation.currentPath() threw; reset wiring skipped',
        err,
      );
      return;
    }
    let unsubscribe: () => void;
    try {
      unsubscribe = navigation.subscribe((path) => {
        const isOnDedup = path.startsWith(DEDUP_PATH_PREFIX);
        if (!wasOnDedup && isOnDedup) {
          reset();
        }
        wasOnDedup = isOnDedup;
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[NavigationProvider] navigation.subscribe() threw; reset wiring skipped',
        err,
      );
      return;
    }
    return unsubscribe;
  }, [navigation, reset]);

  return <>{children}</>;
}
