/**
 * Subscription-based navigation port.
 *
 * The host (Spicetify) exposes a history surface for in-client routing.
 * This port hides the host coupling so `src/store/` and `src/ui/`
 * remain testable as plain TypeScript / React (ADR-0001, ADR-0004).
 *
 * Implementations:
 *   - `SpicetifyNavigation` (production, `src/adapters/spicetify-navigation.ts`):
 *     wraps `Spicetify.Platform.History.listen` and reads `History.location.pathname`.
 *   - `FakeNavigation` (tests, `test/adapters/fake-navigation.ts`): in-memory
 *     event emitter.
 *
 * Both satisfy the parametrised contract at
 * `test/ports/navigation-port-contract.test.ts` (C-1..C-7).
 *
 * Architecture (`test/architecture.test.ts`): ports may NOT import from
 * `adapters/`, `store/`, or `ui/`. This file is interface-only.
 */
export interface NavigationPort {
  /**
   * Subscribe to pathname changes.
   *
   * The listener is invoked synchronously with the new pathname every
   * time the host emits a navigation event. Returns an unsubscribe
   * function that is idempotent (calling it twice is a no-op and never
   * throws).
   *
   * Multiple listeners are supported and independent: each receives its
   * own callbacks; unsubscribing one does not affect the others.
   *
   * Implementations MUST NOT invoke `listener` synchronously at
   * subscription time — events fire only on subsequent *changes*. This
   * is load-bearing for FR-008: the wiring distinguishes "we just
   * subscribed; current path is the dedup app" from "user just
   * navigated to the dedup app" by observing transitions, not the
   * initial value.
   */
  subscribe(listener: (path: string) => void): () => void;

  /**
   * Read the current pathname once, synchronously.
   *
   * Used by the navigation wiring to decide whether the initial mount
   * is already on the dedup app's path (in which case no reset is
   * needed yet) versus navigated in from elsewhere.
   */
  currentPath(): string;
}
