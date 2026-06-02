# Phase 1 Data Model — Load Dedup-able Playlists

**Mission**: `load-dedupable-playlists-01KT3XW3`
**Date**: 2026-06-02

This file defines every domain type touched by this iteration, the validation rules attached to them, and the load-state finite state machine. Everything here lives under `src/domain/`, `src/ports/`, or `src/store/`. The Spicetify adapter is the only module that translates between these types and the host runtime; see [`contracts/playlists-loader-port.md`](contracts/playlists-loader-port.md) for the port contract.

All types are TypeScript with `strict: true`. Domain modules MUST NOT import anything from `react`, `zustand`, `Spicetify`, or any adapter. They MAY import from `src/types/` (ambient) and each other.

---

## 1. `CollectionKind`

A discriminator for the two shapes of row the page can render.

```ts
type CollectionKind = 'playlist' | 'liked-songs';
```

- `'playlist'` — any user-owned or collaborative-editable playlist row.
- `'liked-songs'` — the user's Liked Songs collection. Always pinned first (FR-003, FR-006).

There is exactly one `'liked-songs'` row per session.

---

## 2. `OwnerIdentity`

Drives the per-row owner label rendered by `PlaylistRow` and `LikedSongsRow` (FR-005).

```ts
type OwnerIdentity =
  | { kind: 'self'; displayName: string }            // user owns the playlist
  | { kind: 'other'; displayName: string }           // user has edit rights on a collaborative playlist owned by someone else
  | { kind: 'system-library' };                      // Liked Songs; the row label is literally "Your Library"
```

`displayName` is whatever the host returned for the owner's user-facing name. Empty strings and missing names fail validation at the adapter boundary (see §7).

---

## 3. `RawCollection`

The shape the `PlaylistsLoader` port returns for each enumerated rootlist item, *before* eligibility filtering or ordering. Produced by the adapter; consumed by the domain.

```ts
type RawCollection = {
  uri: string;              // spotify:playlist:<id>; passed through Spicetify.URI for validation
  name: string;             // raw playlist name
  owner: OwnerIdentity;     // pre-normalized at the adapter boundary
  trackCount: number;       // ≥ 0
  imageUrl: string | null;  // best-effort cover URL; null falls back to placeholder in UI
  isOwnedByMe: boolean;     // adapter-determined; primary eligibility input
  isCollaborative: boolean; // host-reported flag; eligibility uses canEdit, not this directly
  canEdit: boolean;         // adapter-normalized "user can mutate this playlist"
};
```

**Validation rules** (enforced by the adapter on every item; failure throws `PlaylistsLoaderError`):

| Field | Rule |
| --- | --- |
| `uri` | Non-empty; `Spicetify.URI.fromString(uri).type === 'playlist'` or `'playlist-v2'`; otherwise drop the item silently (it isn't a playlist row at all). |
| `name` | Non-empty string. Empty → `PlaylistsLoaderError('rootlist-item-missing-name', …)`. |
| `owner.displayName` | When `kind` is `'self'` or `'other'`, non-empty. Empty → `PlaylistsLoaderError('rootlist-item-missing-owner', …)`. |
| `trackCount` | Integer, ≥ 0. Negative → `PlaylistsLoaderError('rootlist-item-invalid-track-count', …)`. |
| `imageUrl` | `null` OR a non-empty string. Other values are normalized to `null`. |
| `isOwnedByMe`, `isCollaborative`, `canEdit` | Strict booleans. Missing → `PlaylistsLoaderError('rootlist-item-missing-flag', …)`. |

The classifier predicate `isRawCollection(x: unknown): x is RawCollection` is exported from `src/domain/errors.ts` so the adapter can pre-check before calling `assertRawCollection(x)`.

---

## 4. `LikedSongsSummary`

What the port returns for the Liked Songs row.

```ts
type LikedSongsSummary = {
  trackCount: number;  // integer; ≥ 0
};
```

Liked Songs has no `uri` in this iteration (it is conceptually a virtual collection), no editable name (system-owned), and no per-row image (the UI renders a constant heart icon).

**Validation**: `trackCount` integer ≥ 0; otherwise `PlaylistsLoaderError('liked-songs-invalid-track-count', …)`.

---

## 5. `CollectionViewModel`

The shape `LoadedView` iterates over. One per row. Produced by `domain/view-models.ts` from a filtered+ordered list of `RawCollection`s plus the `LikedSongsSummary`.

```ts
type CollectionViewModel = {
  key: string;              // stable React key; uri for playlists, the literal 'liked-songs' for the pinned row
  kind: CollectionKind;
  displayName: string;      // 'Liked Songs' for the system row; otherwise the playlist's name
  owner: OwnerIdentity;
  trackCount: number;
  imageUrl: string | null;  // null → UI shows placeholder
};
```

**Transform rule**: `toViewModels(eligible: RawCollection[], likedSongs: LikedSongsSummary): CollectionViewModel[]`:

1. Yield the Liked Songs view model first (`kind: 'liked-songs'`, `key: 'liked-songs'`, `owner: { kind: 'system-library' }`).
2. Then yield each eligible playlist in input order (the input is already ordered by `domain/ordering.ts`).

The transform is total — every input produces an output; no item can be silently dropped. (Drops happen earlier, in the eligibility filter.)

---

## 6. `LoadState` — finite state machine

The page's user-visible state. Lives in the Zustand store. Defined in `src/domain/load-state.ts` as a discriminated union with a pure `transition` function so it tests without React.

```ts
type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; items: CollectionViewModel[] }
  | { kind: 'empty' }
  | { kind: 'failed'; reason: PlaylistsLoaderError };

type LoadAction =
  | { type: 'trigger' }                              // user activates the load-trigger button
  | { type: 'load-succeeded'; items: CollectionViewModel[] }
  | { type: 'load-completed-empty' }
  | { type: 'load-failed'; reason: PlaylistsLoaderError }
  | { type: 'retry' };                               // user clicks Retry from the failure state
```

### Transition table

| From state | Action | → To state | Notes |
| --- | --- | --- | --- |
| `idle` | `trigger` | `loading` | The sole exit from `idle` in this iteration (FR-011, C-006). |
| `idle` | any other | `idle` | Ignored. Defensive; production code should never dispatch them. |
| `loading` | `load-succeeded` (items.length > 0) | `loaded` | Happy path. |
| `loading` | `load-completed-empty` | `empty` | Successful load, zero eligible items (FR-009). |
| `loading` | `load-failed` | `failed` | NFR-004 satisfied — `loading` is exited as soon as failure is observed. |
| `loading` | any other | `loading` | Ignored. |
| `loaded` | any | `loaded` | Terminal in this iteration; refresh is out of scope. |
| `empty` | any | `empty` | Terminal in this iteration. |
| `failed` | `retry` | `loading` | Re-enters loading; FR-008. |
| `failed` | any other | `failed` | Ignored. |

`transition(state: LoadState, action: LoadAction): LoadState` is a pure function. Every cell of the transition table is covered by a test in `test/domain/load-state.test.ts`, and the table itself is the basis for that file's test cases.

### Boundary tests (per charter)

The only numeric bound in this FSM is `items.length` distinguishing `loaded` from `empty`. Boundary cases:

- `items.length === 0` → MUST yield `'empty'` (handled by `load-completed-empty` action, not `load-succeeded` with an empty array — the store enforces this dispatch rule).
- `items.length === 1` → `loaded` with one row.
- `items.length === 2` (nominal) → `loaded`.
- A large array (e.g. 1,000 items per NFR-002) → `loaded` with all items present.

The store's `triggerLoad` action verifies the empty/non-empty dispatch decision; this is the single point where the boundary is read. Covered by tests in `test/store/playlists-store.test.ts`.

---

## 7. `PlaylistsLoaderError` — typed error class

Defined in `src/domain/errors.ts`. The single error type produced by the loader port; the adapter throws it on any shape-drift or network failure.

```ts
type PlaylistsLoaderErrorReason =
  | 'rootlist-fetch-failed'              // generic network/host error
  | 'rootlist-item-missing-name'
  | 'rootlist-item-missing-owner'
  | 'rootlist-item-invalid-track-count'
  | 'rootlist-item-missing-flag'
  | 'rootlist-item-unsupported-shape'    // truly unknown item; classifier fell through
  | 'liked-songs-fetch-failed'
  | 'liked-songs-invalid-track-count'
  | 'host-unavailable'                   // Spicetify.Platform or required sub-namespace missing
  | 'host-auth-expired';                 // host indicates the session needs re-auth

class PlaylistsLoaderError extends Error {
  readonly reason: PlaylistsLoaderErrorReason;
  readonly cause?: unknown;              // original error if any; preserved for diagnostics
  constructor(reason: PlaylistsLoaderErrorReason, message: string, options?: { cause?: unknown });
}

function isPlaylistsLoaderError(x: unknown): x is PlaylistsLoaderError;
```

The page's `FailedView` renders a user-friendly explanation derived from `reason` (a small lookup table), with the raw `message` available as a tooltip / collapsed detail for diagnostics. The retry button does not depend on `reason` — every failure is retryable from the user's point of view (per the spec's risk discussion: "all map to the same failure state and retry affordance").

---

## 8. State transitions — full diagram

```
                              user clicks Load
                                    ↓
        ┌──────┐  trigger  ┌─────────┐  load-succeeded(items)  ┌────────┐
        │ idle │ ────────> │ loading │ ──────────────────────> │ loaded │
        └──────┘           └─────────┘                          └────────┘
                            │   │  │
              load-          │   │  │ load-failed(reason)
              completed-     │   │  ↓
              empty          │   │  ┌────────┐
                             ↓   │  │ failed │ <───┐
                          ┌────────┐ └────────┘     │
                          │ empty  │     │          │
                          └────────┘     │ retry    │
                                         └──────────┘
```

`loaded` and `empty` are terminal for this iteration. Future iterations may add a `manual-refresh` transition out of either; that work is explicitly deferred per spec Out-of-Scope.

---

## 9. Module boundary contract (where validation lives)

Per the charter's "fail-loud at module boundaries" rule:

- **Adapter (`src/adapters/spicetify-playlists-loader.ts`)** — validates every field of every host response. Throws `PlaylistsLoaderError` on any drift. Exports a paired `isPlatformLikeRootlistResponse(x): boolean` classifier so callers can pre-check before triggering a throw if they wish.
- **Domain** — trusts its inputs (types are honored by construction). No runtime validation in `eligibility.ts`, `ordering.ts`, `view-models.ts`, or `load-state.ts`. The compiler enforces shape there.
- **Store (`src/store/playlists-store.ts`)** — does not validate; calls the port, catches `PlaylistsLoaderError`, dispatches `load-failed` with the error as `reason`. Any non-`PlaylistsLoaderError` thrown from the loader is treated as a programming bug, wrapped into `PlaylistsLoaderError('rootlist-fetch-failed', …)` with the original preserved as `cause`, and dispatched.
- **UI** — never sees raw host shapes; consumes only view models.

This concentrates all "untrusted shape" logic in one file (the adapter), one error class, and one classifier — exactly where the charter wants it.
