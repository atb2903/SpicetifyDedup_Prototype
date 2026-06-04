# Contract: `RouteResetProvider` (behavior + tests)

**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**File (NEW, owned by the impl WP)**: `src/store/RouteResetContext.tsx`
**File (NEW, owned by the impl WP)**: `test/store/RouteResetContext.test.tsx` (renamed + augmented from prior `test/store/NavigationContext.test.tsx`)
**Files (RETIRED)**: `src/store/NavigationContext.tsx`, prior test path, plus the five port/adapter files (see `data-model.md` §2).

Supports: **FR-001** (mount-time reset), **FR-002** (unmount-time reset), **FR-003** (round-trip from every source state), **FR-004** (production-lifecycle test), **FR-005** (port/adapter retirement), **FR-006** (provider props narrowed).

---

## 1. Component signature

```tsx
import React, { useEffect } from 'react';
import { usePlaylistsStore } from './PlaylistsStoreContext';

interface RouteResetProviderProps {
  children: React.ReactNode;
}

export function RouteResetProvider({
  children,
}: RouteResetProviderProps): React.ReactElement {
  const reset = usePlaylistsStore((s) => s.reset);
  useEffect(() => {
    reset();              // FR-001: mount-time reset
    return () => reset(); // FR-002: unmount-time cleanup
  }, [reset]);
  return <>{children}</>;
}
```

JSDoc on the exported function MUST satisfy NFR-008:

- One-line summary stating "reset the playlists store on mount and on unmount, ensuring the page lands on idle whenever the React tree boundaries the Dedup route."
- Note on idempotence (R-1 covers the cold-start no-op).
- Note on belt-and-suspenders rationale (covers both the production lifecycle where the tree re-mounts AND the hypothetical future where it stays mounted).
- Reference to ADR-0005 for the full decision history.

---

## 2. Behavioral contract

| Property | Requirement |
|---|---|
| Mount-time reset | On every mount, `useEffect`'s body MUST call `reset()` synchronously before any other effect work. (There is no other effect work in this provider — the body has exactly that one call.) |
| Unmount-time reset | On every unmount, the returned cleanup function MUST call `reset()`. |
| Totality | Defined for every value of `loadState.kind`. Reset from any non-idle state lands at idle; reset from idle is a no-op (R-1). |
| Loader isolation | Reset MUST NOT call `loader.load()` directly or transitively. (Inherited from `PlaylistsState.reset`'s contract; verified by the existing R-1..R-5 tests.) |
| Synchronicity | Reset returns `void`. The cleanup returns `void`. |
| Dependency stability | The `useEffect` deps array is `[reset]`. `reset` is a stable function reference because Zustand 5's `set` does not replace action references (this mission's assumption §6.2). Effect therefore runs once per mount, cleanup once per unmount. |
| Children pass-through | `children` is rendered inside a React Fragment. The provider has no DOM footprint of its own. |
| No prop other than children | `RouteResetProviderProps` has exactly one field. No `navigation` prop. No optional props. |

---

## 3. Tests (drive the impl WP's TDD loop)

All tests live in `test/store/RouteResetContext.test.tsx`. The file is renamed from `test/store/NavigationContext.test.tsx`; the existing test cases are **rewritten** to match the new mechanism (they cannot survive as-is — the FakeNavigation-driven cases test a port that no longer exists).

### Existing tests that survive (rewritten to new mechanism)

| # | Old description | New description (this mission) | Asserts |
|---|------|--------|---------|
| T-survive-1 | "FR-009 — reset triggered by navigation does NOT call loader.load()" | "FR-002/FR-009 — RouteResetProvider mount and unmount do NOT call loader.load()" | After mount + manual unmount, `loader.callCount` is unchanged from pre-mount. |
| T-survive-2 | "cleans up its navigation subscription on unmount" | "calls reset() on unmount" | Pre-load store to loaded state; mount provider; unmount; assert `store.getState().loadState.kind === 'idle'` post-unmount. |
| T-survive-3 | "renders its children" | "renders its children" (unchanged shape) | A `data-testid="child"` element rendered inside `<RouteResetProvider>` is visible in the DOM. |
| T-survive-4 | "FR-008 — navigate-away then navigate-back from idle leaves state at idle (idempotent)" | "T-idempotent — mounting RouteResetProvider while store is already idle leaves state at idle" | Pre-state is idle; mount; post-state is idle; loader call count unchanged. |

### Existing tests that are DELETED (no longer make sense without a port)

| Old test | Why deleted |
|---|---|
| "FR-008 — navigate-away then navigate-back resets a loaded store to idle" | Tested the FakeNavigation setPath path. No setPath path in new design; production-lifecycle test (T-new-1) covers the same user promise. |
| "FR-008 — navigating within the dedup app sub-paths does NOT reset the store" | The new design has no path-prefix check; sub-route navigation in Spicetify's custom-app slot causes a re-mount which triggers a reset — that's the intended behavior. The sub-path-no-reset semantic is gone with the listener. |
| "FR-008 — navigate-away alone (no return) does NOT reset the store" | Same — the new design resets on every unmount (FR-002) by design. |
| "FR-008 — mounting with the initial path off the dedup app, then navigating to it, resets the store" | This is the test with the structural blind spot the prior mission shipped. It's *replaced* by T-new-1 below. |
| "FR-008 — repeated away/back cycles each reset the store once" | Same — the new design resets per mount/unmount, which produces equivalent observable behavior; covered by T-new-2. |
| "graceful degradation — port currentPath() throws → wiring skipped" | No port. No graceful degradation needed. |
| "graceful degradation — port subscribe() throws → wiring skipped" | No port. No graceful degradation needed. |
| "derived dedup path prefix matches /\<settings.nameId\>" | The `dedupPathPrefix()` test seam is deleted. No derived prefix in the new design. |

### NEW tests added in this mission

| # | Description | Asserts |
|---|------|---------|
| T-new-1 | "FR-001/FR-003/FR-004 — mounting RouteResetProvider with store pre-loaded into a non-idle state resets to idle synchronously on mount (production-lifecycle simulation)" | Pre-state: non-idle (parametrise across `loading`, `loaded`, `empty`, `failed`). Mount provider. Post-state: idle. Loader call count unchanged. **No `setPath` call. No subscription event simulation. Pure mount-then-assert.** This is the test the prior mission's suite was missing. |
| T-new-2 | "FR-002 — repeated mount/unmount cycles each reset the store" | Mount; pre-load to loaded; unmount (cleanup fires reset); mount again (mount-time reset re-fires); pre-load to loaded again; unmount again. Each unmount → idle. Each mount post-state → idle. Loader call count = exactly the number of pre-loads (no extra calls). |
| T-new-3 | "FR-001 — mount-time reset is synchronous (state is idle by the time render() returns)" | After `render(<RouteResetProvider>...)`, the `store.getState().loadState.kind === 'idle'` assertion holds without an `await` or `act()` wait. (Important because the production user clicks Dedup and expects the page to render idle in the same React commit, not after a microtask.) |

### Parametrisation across source states (FR-003 coverage)

T-new-1 is parametrised over `['idle', 'loading', 'loaded', 'empty', 'failed']` via `describe.each(...)`. Five cases run; each asserts post-mount kind is idle. The idle case is the cold-start cold-mount scenario; the other four are the production navigate-back-to-dedup-with-stale-state scenarios.

### Removed-file tests (cleanup)

`test/adapters/spicetify-navigation.test.ts`, `test/ports/navigation-port-contract.test.ts`, and `test/adapters/fake-navigation.ts` are deleted with no replacement. The files they tested are also deleted (data-model.md §2). Coverage gate stays green because the deleted source files no longer exist (nothing to cover).

---

## 4. Architecture-test compliance

- `src/store/RouteResetContext.tsx` lives in `src/store/`. No imports from `src/adapters/` or `src/ui/`. Compliant with the existing rule.
- The file's imports are `react`, `./PlaylistsStoreContext` (same layer). Both allowed.
- The deletion of 5 files cannot violate the rules table (deletion reduces surface).

`test/architecture.test.ts` requires no rule-table edit. Verification: `npm run test:run -- test/architecture.test.ts` exits 0.

---

## 5. JSDoc requirements (NFR-008)

The exported `RouteResetProvider` function MUST carry JSDoc with at minimum:

- A one-line summary.
- A `@param` for `children`.
- A reference to ADR-0005 for the design rationale.
- A note about R-1 idempotence covering the cold-start case.

Example outline:

```tsx
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
 * Idempotent from `idle` (see R-1 in `playlists-store.test.ts`).
 *
 * See `.claude/adr/0005-react-lifecycle-reset.md` for the full decision
 * rationale and `.claude/adr/0004-navigation-port.md` for the superseded
 * port-based design.
 *
 * @param children - React subtree to render inside the provider.
 */
export function RouteResetProvider({ children }: RouteResetProviderProps): React.ReactElement {
  ...
}
```
