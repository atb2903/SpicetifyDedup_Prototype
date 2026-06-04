# Phase 1 Data Model — Dedup Navigation Reset Hotfix

**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**Date**: 2026-06-04

This mission introduces **no new domain entities** and modifies no existing domain types. It changes one **type definition** (`NavigationProviderProps` → `RouteResetProviderProps`) and removes one **port type** (`NavigationPort`).

The prior mission's data-model file (`kitty-specs/dedup-page-live-client-polish-01KT6ZCR/data-model.md`) remains the authoritative reference for `CollectionKind`, `OwnerIdentity`, `RawCollection`, `LikedSongsSummary`, `CollectionViewModel`, `LoadState`, `LoadAction`, `transition`, `PlaylistsLoaderError`, `PlaylistsState`. None of those change.

---

## 1. `RouteResetProviderProps` (RENAMED + NARROWED)

Replaces the prior mission's `NavigationProviderProps` in the renamed file `src/store/RouteResetContext.tsx`.

### Before (prior mission, `src/store/NavigationContext.tsx`)

```ts
interface NavigationProviderProps {
  navigation: NavigationPort;
  children: React.ReactNode;
}
```

### After (this mission, `src/store/RouteResetContext.tsx`)

```ts
interface RouteResetProviderProps {
  children: React.ReactNode;
}
```

### Semantics

- The `navigation` prop is removed entirely. The provider no longer consumes a `NavigationPort` instance.
- `children` is the only prop; the provider just wraps the page subtree.
- The exported symbol changes from `NavigationProvider` to `RouteResetProvider`. The exported test seam `dedupPathPrefix()` is deleted (its only consumer was the prior listener body, which no longer exists).
- No new types are introduced. The prior mission's `NavigationPort` (in `src/ports/navigation.ts`) is **deleted**, not modified.

---

## 2. `NavigationPort` (DELETED)

Removed in this mission. The file `src/ports/navigation.ts` is deleted entirely.

### Prior shape (for record)

```ts
export interface NavigationPort {
  subscribe(listener: (path: string) => void): () => void;
  currentPath(): string;
}
```

### Why deleted

- No production consumer remains after `RouteResetProvider` ceases to subscribe to navigation events.
- No test consumer remains after the contract test (`test/ports/navigation-port-contract.test.ts`) is deleted.
- C-001 keeps the prior ADRs in force except ADR-0004, which this mission supersedes. The port type was introduced by ADR-0004; with ADR-0004 superseded, the type's reason for existing is also gone.

If a future iteration needs in-client routing awareness, a fresh ADR + mission can re-introduce a port suited to that iteration's needs. This mission does not pre-build for hypothetical future requirements (per the project's anti-speculative-engineering stance in CLAUDE.md and the project's general "no half-finished implementations" guidance).

---

## 3. Store action shapes — unchanged

The `PlaylistsState` interface (in `src/store/playlists-store.ts`) is unchanged by this mission. In particular, the `reset()` action that this mission newly consumes from a different call site retains its existing signature:

```ts
reset: () => void;
```

Its behavior contract is unchanged:

- Sets `loadState` to `{ kind: 'idle' }` from any source state.
- Idempotent from `idle` (R-1 in `playlists-store.test.ts:328-341`).
- Does NOT call `loader.load()` directly or transitively (R-1..R-5 prove this).
- Returns `void` (synchronous).

The new `RouteResetProvider` calls `reset()` at two points (mount-time effect body; unmount cleanup function); both calls satisfy the existing contract.

---

## 4. CSS module shapes — narrow change

### `src/ui/LoadingView.module.scss` — spinner size change (FR-011)

The `.spinner` rule's `width` and `height` change from `32px` to `64px`. The `border` width may scale proportionally (3px → 5px or 6px) — exact value tuned during the WP's live-client probe. No other rules change.

```scss
// Before (prior mission)
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--dedup-card-hover);
  border-top-color: var(--dedup-button);
  ...
}

// After (this mission)
.spinner {
  width: 64px;
  height: 64px;
  border: 5px solid var(--dedup-card-hover);  // exact thickness tuned in WP
  border-top-color: var(--dedup-button);
  ...
}
```

### Existing test impact

- `test/ui/LoadingView.test.tsx:43-50` asserts the spinner has `animation` style containing `infinite`. Size change doesn't affect the animation property. Test stays green without modification.
- No new test is needed for FR-011 at the unit level; visual fidelity is validated via NFR-006's screenshot evidence in the mission-DoD live-verification artefact.

---

## 5. Module boundary contract — unchanged

Per ADR-0001 and the prior mission's data-model §9:

- **Adapter** owns all host shape validation. Unchanged (this mission removes one adapter without touching the validation surface of the remaining adapter, `SpicetifyPlaylistsLoader`).
- **Domain** trusts its inputs. Unchanged.
- **Store** does not validate. Unchanged.
- **UI** never sees raw host shapes. Unchanged.

`RouteResetProvider` lives under `src/store/`. It imports only `react`, `./PlaylistsStoreContext` (same layer), and TypeScript types. No cross-layer imports.

---

## 6. Boundary tests — none required

The charter mandates min−1 / min / nominal / max / max+1 testing for every numeric bound. This mission introduces no new numeric bounds:

- The spinner size change (32→64) is not a tested bound; it's a CSS pixel value.
- No new counts, thresholds, or capacities are introduced.

The prior mission's existing boundary tests (`trackCount`, `items.length`, etc.) carry forward unchanged.

---

## 7. Type-level invariants

- `RouteResetProviderProps`'s only field is `children: React.ReactNode`. This matches the React-standard pattern for a passthrough provider.
- The prior `NavigationPort` type's deletion is a TS-strict-safe removal: every prior import site is also being removed in this mission (the port file's only importers were the adapter, the fake, the contract test, the provider, and `app.tsx` — all of which lose the import in this mission). `npm run typecheck` is the gate that catches any missed call site.
