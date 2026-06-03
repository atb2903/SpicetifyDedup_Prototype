# Contract: `NavigationPort` (port + production adapter + fake)

**Mission**: `dedup-page-live-client-polish-01KT6ZCR`
**Files (NEW, owned by WP-03)**:
- `src/ports/navigation.ts`
- `src/adapters/spicetify-navigation.ts`
- `test/adapters/fake-navigation.ts`
- `test/ports/navigation-port-contract.test.ts`
- `.claude/adr/0004-navigation-port.md`

Supports: FR-007 (`reset` action), FR-008 (navigation-aware idle return), FR-009 (`reset` MUST NOT call loader).

---

## 1. Port type

```ts
// src/ports/navigation.ts

/**
 * Subscription-based navigation port.
 *
 * The host (Spicetify) exposes a history surface for in-client routing.
 * This port hides the host coupling so `src/store/` and `src/ui/`
 * remain testable as plain TypeScript / React (ADR-0001).
 *
 * Implementations:
 *   - `SpicetifyNavigation` (production): wraps `Spicetify.Platform.History.listen`.
 *   - `FakeNavigation` (tests): in-memory event emitter.
 *
 * Both satisfy the same `navigation-port-contract.test.ts` suite.
 */
export interface NavigationPort {
  /**
   * Subscribe to pathname changes.
   *
   * The listener is invoked synchronously with the new pathname every
   * time the host emits a navigation event. Returns an unsubscribe
   * function that is idempotent (calling it twice is a no-op).
   *
   * Multiple listeners are supported and independent: each receives its
   * own callbacks; unsubscribing one does not affect the others.
   */
  subscribe(listener: (path: string) => void): () => void;

  /**
   * Read the current pathname once, synchronously.
   *
   * Used by the navigation wiring to decide whether the initial mount
   * is already on the dedup app's path (in which case no reset is
   * needed) versus navigated in from elsewhere.
   */
  currentPath(): string;
}
```

---

## 2. Production adapter contract

`SpicetifyNavigation implements NavigationPort` in `src/adapters/spicetify-navigation.ts`.

### Pre-conditions

- The adapter checks `globalThis.Spicetify?.Platform?.History` before any subscription. Missing → throw a typed error with `kind: 'host-unavailable'` (mirroring `SpicetifyPlaylistsLoader.requirePlatform`'s pattern). A new error class is NOT introduced; the loader's existing `PlaylistsLoaderError` is reused via a `'host-unavailable'` reason. (Reason: error catalog stays unified at one class.)

  Alternative if a single error class becomes awkward: introduce `NavigationPortError` as a sibling typed error. WP-03 picks the lower-churn path at implementation time, with a note in the WP DoD if a new class lands.

### Behavioral contract

| Behavior | Adapter requirement |
|---|---|
| `subscribe(listener)` | Calls `Spicetify.Platform.History.listen((loc) => listener(loc.pathname))` and returns the value `History.listen` returned (which is the unsubscribe function). |
| Returned unsubscribe | Calling it stops further `listener` invocations. Calling twice is a no-op. |
| `currentPath()` | Returns `Spicetify.Platform.History.location.pathname`. |
| Host-unavailable | If `Spicetify`, `Spicetify.Platform`, or `Spicetify.Platform.History` is missing/null/wrong type, throws `host-unavailable`. |

### Out of contract

- No buffering of events.
- No retry on host failure (the host owns its own navigation reliability).
- No path normalization (the path returned is whatever the host gives — typically `/spicetify-dedup` for the Dedup app and other prefixes for Spotify-native views).

---

## 3. Fake adapter for tests

`FakeNavigation implements NavigationPort` in `test/adapters/fake-navigation.ts`.

```ts
export class FakeNavigation implements NavigationPort {
  private listeners = new Set<(path: string) => void>();
  private path: string;
  constructor(initialPath = '/') { this.path = initialPath; }
  subscribe(listener: (path: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  currentPath() { return this.path; }
  /** Test helper — fires the event to every subscriber. */
  setPath(p: string) { this.path = p; this.listeners.forEach(l => l(p)); }
}
```

The fake is the canonical test surface for FR-008's "navigation-aware reset" tests. The store/page wiring is exercised end-to-end against the fake without touching `Spicetify`.

---

## 4. Contract test (`test/ports/navigation-port-contract.test.ts`)

Mirrors the existing `test/ports/playlists-loader-contract.test.ts` pattern. Asserts the following for **every** `NavigationPort` implementation under test (the suite is parameterized over `[FakeNavigation]` initially; `SpicetifyNavigation` is exercised via its own focused adapter test that stubs `globalThis.Spicetify`):

| # | Assertion |
|---|---|
| C-1 | `subscribe(l1)` followed by `setPath('/x')` delivers `'/x'` to `l1`. |
| C-2 | The unsubscribe returned by `subscribe(l1)` stops further calls to `l1`. |
| C-3 | Calling the unsubscribe a second time is a no-op (no throw). |
| C-4 | Two distinct listeners both receive events; unsubscribing one does not affect the other. |
| C-5 | `currentPath()` returns the initial path before any `setPath` call. |
| C-6 | After `setPath('/y')`, `currentPath()` returns `'/y'`. |
| C-7 | `subscribe(l)` MUST NOT invoke `l` synchronously at subscription time (the listener is informed only of *changes*, not the current value). |

C-7 matters for FR-008: if subscription fires synchronously, the listener can't distinguish "we just subscribed; the current path is the dedup app's path" from "user just navigated to the dedup app." The fake-path semantic stays "events only fire on change."

---

## 5. Architecture-test rule additions

`test/architecture.test.ts` already encodes `src/ports/` cannot import from `src/adapters/`/`src/store/`/`src/ui/`. No new rules required; `src/ports/navigation.ts` complies (interface-only, no imports beyond TypeScript types).

`src/adapters/spicetify-navigation.ts` is governed by the existing `src/adapters/` rule (no `src/store/` or `src/ui/` imports).

The wiring (`NavigationProvider` or equivalent) lives in `src/store/` (consistent with `PlaylistsStoreContext.tsx`'s precedent), so the `src/store/` rule applies — no imports from `src/adapters/`. Construction of the adapter happens in `src/app.tsx`, which is the existing exception point.

---

## 6. Wiring sketch (informative — exact ownership at tasks-phase)

`src/app.tsx` (modified by WP-03):

```tsx
const productionStore = createPlaylistsStore(new SpicetifyPlaylistsLoader());
const productionNavigation = new SpicetifyNavigation();

const App = () => (
  <PlaylistsStoreProvider store={productionStore}>
    <NavigationProvider navigation={productionNavigation}>
      <DedupPage />
    </NavigationProvider>
  </PlaylistsStoreProvider>
);
```

`NavigationProvider` (new, in `src/store/NavigationContext.tsx` or similar):

```tsx
export function NavigationProvider({ navigation, children }: Props) {
  const reset = usePlaylistsStore((s) => s.reset);
  React.useEffect(() => {
    const DEDUP_PATH_PREFIX = '/spicetify-dedup';
    let wasOnDedup = navigation.currentPath().startsWith(DEDUP_PATH_PREFIX);
    return navigation.subscribe((path) => {
      const isOnDedup = path.startsWith(DEDUP_PATH_PREFIX);
      if (!wasOnDedup && isOnDedup) {
        // Returned to the dedup app from elsewhere — reset if not idle.
        reset();
      }
      wasOnDedup = isOnDedup;
    });
  }, [navigation, reset]);
  return <>{children}</>;
}
```

Alternative (chosen if WP-03's live probe confirms unmount-on-navigate): a plain `useEffect(() => () => store.reset(), [])` in `DedupPage` and no port at all. The probe decides; both designs satisfy FR-008.
