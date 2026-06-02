# Contract — `PlaylistsLoader` Port

**Mission**: `load-dedupable-playlists-01KT3XW3`
**Date**: 2026-06-02
**Implements**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, NFR-001, NFR-002

This is the stable contract between the domain (the store + the view-model transform) and the host (Spicetify). The production adapter (`src/adapters/spicetify-playlists-loader.ts`) and the test fake (`src/adapters/fake-playlists-loader.ts`) both implement this interface. No code outside `src/adapters/` may call Spicetify globals directly.

---

## Interface

```ts
// src/ports/playlists-loader.ts

import type { RawCollection, LikedSongsSummary } from '../domain/view-models';

export interface PlaylistsLoader {
  /**
   * Fetch the user's full rootlist (all playlists they can see in their library)
   * plus the Liked Songs summary, and return them in two arrays.
   *
   * The port MUST NOT apply eligibility filtering — that is the domain's job
   * (see src/domain/eligibility.ts). The port returns every rootlist item the
   * host knows about, with normalized owner/edit/collaborative flags.
   *
   * The port MUST preserve the host's native order in the returned array. The
   * domain ordering rule pins Liked Songs first; everything else inherits this
   * order.
   *
   * Throws PlaylistsLoaderError on any failure (network, host unavailable,
   * shape drift, expired auth). Never returns a partial result on failure.
   */
  load(): Promise<{
    playlists: RawCollection[];
    likedSongs: LikedSongsSummary;
  }>;
}
```

## Method: `load()`

### Parameters

None. The user has no per-load options in this iteration.

### Returns

A `Promise` resolving to `{ playlists, likedSongs }`:

- `playlists: RawCollection[]` — the full rootlist in host-native order. Items the host has not classified as playlists (folders, separators, etc.) are filtered out by the adapter before this array is returned. May be empty.
- `likedSongs: LikedSongsSummary` — always present (even if `trackCount === 0`).

### Errors

Throws `PlaylistsLoaderError` (from `src/domain/errors.ts`) on any of:

| Reason | When |
| --- | --- |
| `'host-unavailable'` | `Spicetify`, `Spicetify.Platform`, `Spicetify.Platform.RootlistAPI`, or `Spicetify.Platform.LibraryAPI` is missing or `undefined` at call time. |
| `'host-auth-expired'` | Host indicates the session needs re-auth. |
| `'rootlist-fetch-failed'` | The rootlist call rejected, threw, or returned an unrecognized envelope. The original error is preserved as `cause`. |
| `'rootlist-item-missing-name'` / `'rootlist-item-missing-owner'` / `'rootlist-item-invalid-track-count'` / `'rootlist-item-missing-flag'` / `'rootlist-item-unsupported-shape'` | A rootlist item fails the field-level validation rules listed in [`../data-model.md`](../data-model.md) §3. The offending item's URI is included in the error message. |
| `'liked-songs-fetch-failed'` | The Liked Songs call rejected, threw, or returned an unrecognized envelope. |
| `'liked-songs-invalid-track-count'` | The Liked Songs track count is missing or not a non-negative integer. |

### Guarantees

1. **Atomicity.** `load()` either resolves with a complete `{ playlists, likedSongs }` pair or throws. It never returns a partial result.
2. **No mutation.** `load()` is read-only. It never calls `Platform.LibraryAPI.{add,remove}` or any mutation method. (Verified by inspection — the adapter file imports nothing mutation-shaped.)
3. **Order preservation.** The `playlists` array is in host-native order. The domain layer is responsible for pinning Liked Songs above this list.
4. **Algorithmic efficiency** (NFR-001):
   - The adapter SHOULD issue at most one call per Platform resource (one for the rootlist, one for the Liked Songs summary). If pagination is unavoidable, page sizes SHOULD be the maximum the Platform allows (the ecosystem research notes data-porter uses 200 for `LibraryAPI.getTracks`; an analogous bound applies here).
   - The adapter MUST NOT issue redundant calls for already-resolved data within a single `load()` invocation.
   - No total wall-clock budget applies (per spec NFR-001 and SC-1).
5. **No host fetches before `load()` is called.** The adapter MUST NOT issue any Platform call from its constructor, from module-load side effects, or from any other moment in its lifecycle.

### Side effects

None observable to the rest of the system. The adapter MAY log diagnostic information through `Spicetify.showNotification` for true host-unavailable scenarios, but MUST NOT do so during ordinary operation (logging would couple the adapter to a UI surface).

---

## Implementations

### Production: `SpicetifyPlaylistsLoader`

**Location**: `src/adapters/spicetify-playlists-loader.ts`.

**Behavior**:

1. Pre-check `Spicetify`, `Spicetify.Platform`, `Spicetify.Platform.RootlistAPI`, `Spicetify.Platform.LibraryAPI` exist. If any is missing → throw `PlaylistsLoaderError('host-unavailable', …)`.
2. Call `Platform.RootlistAPI` (exact method discovered during TDD — see [`../research.md`](../research.md) "Deferred to implementation"). Normalize each item to `RawCollection` shape, filtering out non-playlist items.
3. Call `Platform.LibraryAPI` to retrieve the Liked Songs track count. Normalize to `LikedSongsSummary`.
4. Return `{ playlists, likedSongs }`.

Validation throws `PlaylistsLoaderError` at the first drift detected. No partial recovery.

### Test fake: `FakePlaylistsLoader`

**Location**: `src/adapters/fake-playlists-loader.ts`.

**Behavior**: An in-memory implementation parameterized at construction with `playlists: RawCollection[]` and `likedSongs: LikedSongsSummary`. `load()` returns those values via `Promise.resolve(...)`.

Variants for failure-mode testing:

```ts
class FakePlaylistsLoader implements PlaylistsLoader {
  constructor(
    private readonly result:
      | { playlists: RawCollection[]; likedSongs: LikedSongsSummary }
      | { throws: PlaylistsLoaderError }
  );

  async load() {
    if ('throws' in this.result) throw this.result.throws;
    return this.result;
  }
}
```

Used by store and UI tests (`test/store/playlists-store.test.ts`, `test/ui/*.test.tsx`). The production adapter has its own test file (`test/adapters/spicetify-playlists-loader.test.ts`) that drives it through `vi.stubGlobal('Spicetify', …)` fixtures.

---

## Contract tests (cross-implementation)

A small shared test suite verifies that *any* `PlaylistsLoader` implementation satisfies the contract:

```
test/ports/playlists-loader-contract.test.ts
```

It runs the same assertions against both the fake adapter and a `vi.stubGlobal`-driven production adapter:

- `load()` resolves for a valid rootlist + Liked Songs response, returns the expected `RawCollection[]` and `LikedSongsSummary`.
- `load()` throws `PlaylistsLoaderError` with the documented `reason` for each failure mode listed above.
- `load()` does not call any mutation API (verified by stubbing `Platform.LibraryAPI.add` and `.remove` and asserting zero calls).
- `load()` issues no Platform calls until invoked (verified by importing the adapter, observing the stubs, then asserting zero calls before invocation).

This is "contract-test the port", per DIRECTIVE_036 (black-box integration testing).

---

## Non-contract (deliberate exclusions)

- **No streaming / progress callback.** The port returns a single resolved value, not a generator or observable. Progress disclosure is a future-iteration concern (called out in the spec's Risks section).
- **No cancellation token.** The page does not currently expose a cancel affordance. If a user navigates away mid-load, the store's `triggerLoad` action result is simply ignored on dispatch (no `AbortController` plumbing yet).
- **No caching across invocations.** Constraint C-005 forbids cross-session persistence and the spec defers manual refresh to a later iteration; each `load()` call is independent.
- **No options parameter.** Eligibility, ordering, and view-model transform are deterministic in this iteration; the port has nothing to vary.

These exclusions are explicit so the implementer doesn't try to design them in "for future flexibility" — they belong in their own future missions.
