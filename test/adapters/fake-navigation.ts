/**
 * In-memory `NavigationPort` implementation used by every test in this
 * mission that asserts the navigation-aware reset behaviour (FR-008).
 *
 * Lives under `test/adapters/` (not `src/adapters/`) because it is a
 * test-only construct — production code never instantiates it, so it
 * intentionally does not ship in the bundle. The architecture test only
 * walks `src/`, so co-locating it with the other tests keeps the source
 * tree free of dead code paths.
 *
 * Semantics chosen to satisfy the port contract documented in
 * `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/contracts/navigation-port.md`
 * (the same contract `SpicetifyNavigation` honors):
 *
 * - `subscribe(listener)` records the listener and returns an idempotent
 *   unsubscribe (calling twice is a no-op, never throws).
 * - `subscribe` does NOT invoke the listener synchronously — the contract
 *   pins "events fire on changes only" (C-7) because the
 *   `NavigationProvider` distinguishes "just subscribed" from "navigated
 *   to the dedup app" by observing transitions, not the initial state.
 * - `currentPath()` reads the current pathname without firing listeners.
 * - `setPath(p)` is the test-side mutator: updates the path and
 *   synchronously notifies every subscriber. This is the only listener
 *   trigger; there is no time-based behaviour.
 */
import type { NavigationPort } from '../../src/ports/navigation';

export class FakeNavigation implements NavigationPort {
  private listeners = new Set<(path: string) => void>();
  private path: string;

  constructor(initialPath: string = '/') {
    this.path = initialPath;
  }

  subscribe(listener: (path: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  currentPath(): string {
    return this.path;
  }

  /**
   * Test helper — updates the current path and synchronously notifies
   * every active subscriber. Not part of the `NavigationPort` interface;
   * production code MUST NOT depend on this method.
   */
  setPath(p: string): void {
    this.path = p;
    this.listeners.forEach((l) => l(p));
  }

  /** Test helper — reports the number of active subscribers. Used by the
   * unmount-cleanup test to assert the provider unsubscribed. */
  listenerCount(): number {
    return this.listeners.size;
  }
}
