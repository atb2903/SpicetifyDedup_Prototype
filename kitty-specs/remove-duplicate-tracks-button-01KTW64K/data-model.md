# Phase 1 Data Model — Remove Duplicate Tracks Button

**Mission**: remove-duplicate-tracks-button-01KTW64K · **Date**: 2026-06-11

Every type below is pure TypeScript living under `src/domain/` (no React/Zustand/Spicetify
imports), except where noted as a port (`src/ports/`) or adapter shape. Each entry tags
the FR/NFR/Constraint it serves (`DIRECTIVE_010`).

---

## §1 — Changed: track shapes gain `uid` (ADR-0012)

`src/domain/detection-types.ts`

```ts
export type RawTrack = {
  uri: string;
  id: string;
  name: string;
  artists: ReadonlyArray<{ uri: string; name: string }>;
  album: { uri: string; name: string };
  position: number;
  durationMs: number | null;
  /**
   * Playlist item occurrence id. Present for playlist tracks (from
   * `PlaylistAPI.getContents` items); `undefined` for Liked Songs tracks,
   * which are addressed by URI alone. Carried unchanged through enrichment
   * so removal can target a specific occurrence of a repeated URI. (ADR-0012)
   */
  uid?: string;
};

export type EnrichedTrack = {
  position: number;
  uri: string;
  canonicalUri: string;
  name: string;
  artists: ReadonlyArray<{ name: string }>;
  durationMs: number;
  /** Mirrors `RawTrack.uid`; preserved verbatim through enrichment. */
  uid?: string;
};
```

- **Invariant**: `uid` is a non-empty string when present; `undefined` only for
  Liked-Songs-origin tracks. The enumerator never fabricates a `uid`.
- **Algorithm impact**: none. `uid` participates in neither the same-canonical-URI nor
  the name+artist+duration match. It is metadata for removal only.
- **FR/Constraint**: enables FR-003/FR-004 keep-earliest removal of in-playlist repeats.

`DuplicateGroup.members` is `ReadonlyArray<EnrichedTrack>`, so `uid` is available per
member with no shape change to `DuplicateGroup` / `DetectionResult`.

---

## §2 — New: removal value types

`src/domain/removal-types.ts`

```ts
/** The collection a removal targets. Single-collection scope (C-003). */
export type RemovalTarget =
  | { kind: 'liked-songs' }
  | { kind: 'playlist'; playlistUri: string };

/**
 * A reference to one track to delete.
 * - Liked Songs: `uid` is `undefined`; the URI is the unique key.
 * - Playlist: `uid` is required; it names the specific occurrence.
 */
export type TrackRef = { uri: string; uid?: string };

/** The ordered set of tracks to delete from one collection. */
export type RemoveSet = {
  /** Echoes the source result's collectionKey for traceability. */
  collectionKey: string;
  /** Tracks to delete, ascending by original `position` (later copies). */
  tracks: ReadonlyArray<TrackRef>;
};

/** Per-collection result of a removal attempt (FR-010 / AS-8). */
export type RemovalOutcome = {
  removed: ReadonlyArray<TrackRef>;
  failed: ReadonlyArray<{ track: TrackRef; reason: string }>;
};

/** Progress for large removals (NFR-002). Optional; emitted per batch. */
export type RemovalProgressEvent = {
  removedSoFar: number;
  total: number;
};
```

- **Invariant (RemoveSet)**: `tracks.length === sourceResult.removableTrackCount`
  (FR-004). For a playlist, every `TrackRef` has a defined `uid`; for Liked Songs, none
  do.
- **Invariant (RemovalOutcome)**: `removed.length + failed.length === requested.length`;
  `removed` and `failed` are disjoint by `TrackRef` identity (§3 key function).

---

## §3 — New: pure transforms (NFR-004 fail-loud + classifier)

`src/domain/remove-set.ts`

```ts
/**
 * Classifier predicate — true iff `result` is a well-formed DetectionResult
 * from which a remove-set can be computed. Callers pre-check before
 * `computeRemoveSet` (charter input-validation pattern, NFR-004).
 */
export function isRemovableResult(result: unknown): result is DetectionResult;

/**
 * Compute the ordered remove-set: for each group, every member except
 * `defaultKeepIndex` (always 0 — keep earliest, C-006/FR-004). Throws
 * `RemovalError('malformed-result', …)` on malformed input.
 *
 * @throws RemovalError when `!isRemovableResult(result)`, when any group has
 *   `< 2` members, when `defaultKeepIndex !== 0`, or when a playlist member
 *   lacks a `uid`.
 */
export function computeRemoveSet(
  result: DetectionResult,
  target: RemovalTarget,
): RemoveSet;
```

`src/domain/apply-removal-outcome.ts`

```ts
/**
 * In-client refresh (FR-008 / A-2): produce an updated DetectionResult with
 * the successfully-removed tracks dropped from their groups. Groups that fall
 * below 2 members collapse (no longer duplicates); failed tracks remain
 * visible. Recomputes duplicateTrackCount and removableTrackCount. Does NOT
 * re-fetch or re-scan (FR-009).
 *
 * @throws RemovalError('outcome-mismatch', …) if `outcome` references a track
 *   not present in `result`.
 */
export function applyRemovalOutcome(
  result: DetectionResult,
  outcome: RemovalOutcome,
  target: RemovalTarget,
): DetectionResult;
```

- **Identity** (`trackRefKey(target, ref)`): playlist → `uid`; Liked Songs → `uri`.
  Used to match outcome entries to group members.
- **Recompute rules**: `duplicateTrackCount = Σ members.length` over surviving groups;
  `removableTrackCount = duplicateTrackCount − groups.length`; `completedAt`,
  `skippedLocalCount`, `unenrichedCount`, `scannedTrackCount` are scan-time diagnostics
  and are preserved unchanged (they describe the scan, not the current set).
- **Boundary/edge cases to test**: empty remove-set (no-op), all groups fully removed
  (`removableTrackCount → 0`, button hides — AS-7), partial (some failed, group retains
  ≥2 members), stale outcome referencing an absent track (throws), a group with a failed
  *keep* member is impossible (keep is never in the remove-set).

---

## §4 — New: error taxonomy

`src/domain/removal-errors.ts`

```ts
export type RemovalErrorCode =
  | 'malformed-result'    // computeRemoveSet input failed isRemovableResult / invariants
  | 'outcome-mismatch'    // applyRemovalOutcome got a track not in the result
  | 'executor-failed'     // RemovalExecutor host call rejected (wraps cause)
  | 'host-unavailable';   // Spicetify.Platform.{LibraryAPI,PlaylistAPI} absent

export class RemovalError extends Error {
  constructor(code: RemovalErrorCode, message: string, options?: { cause?: unknown; context?: unknown });
}
export function isRemovalError(x: unknown): x is RemovalError;
```

Mirrors the existing `DetectionError` shape so store error handling is uniform.

---

## §5 — Changed: detection FSM gains a removal sub-state (ADR-0013)

`src/domain/detection-state.ts`

```ts
export type RemovalState =
  | { phase: 'none' }
  | { phase: 'confirming' }                       // first confirm shown (FR-005)
  | { phase: 'confirming2' }                      // second confirm shown, >25 (FR-006)
  | { phase: 'removing'; progress?: RemovalProgressEvent }
  | { phase: 'partial'; outcome: RemovalOutcome };// some failed (FR-010/AS-8)

export type DetectionState =
  | { kind: 'idle' }
  | { kind: 'scanning'; progress: ProgressEvent }
  | { kind: 'loaded'; result: DetectionResult; removal: RemovalState }  // CHANGED
  | { kind: 'failed'; reason: DetectionError };
```

New actions (valid **only** from `loaded`; ignored elsewhere — late-callback safety):

```ts
export type DetectionAction =
  | { type: 'start' } | { type: 'progress'; event } | { type: 'complete'; result }
  | { type: 'fail'; reason } | { type: 'cancel' }
  // ── removal sub-actions ──
  | { type: 'removeRequest' }                       // none → confirming
  | { type: 'confirmFirst' }                        // confirming → removing | confirming2 (store decides by count)
  | { type: 'confirmSecond' }                       // confirming2 → removing
  | { type: 'removeCancel' }                        // confirming|confirming2 → none
  | { type: 'removeProgress'; event: RemovalProgressEvent } // removing → removing
  | { type: 'removeComplete'; result: DetectionResult; outcome: RemovalOutcome }; // removing → loaded(result', none|partial)
```

### §5.1 Transition table (loaded.removal)

| from \ action | removeRequest | confirmFirst | confirmSecond | removeCancel | removeProgress | removeComplete |
|---|---|---|---|---|---|---|
| `none` | → `confirming` | ignore | ignore | ignore | ignore | ignore |
| `confirming` | ignore (FR-012) | → `removing` *(count ≤ 25)* / `confirming2` *(count > 25)* | ignore | → `none` | ignore | ignore |
| `confirming2` | ignore | ignore | → `removing` | → `none` | ignore | ignore |
| `removing` | ignore (FR-012) | ignore | ignore | ignore | → `removing`(progress) | → result' + (`none` if `failed=[]` else `partial`) |
| `partial` | → `confirming` (retry) | ignore | ignore | ignore | ignore | ignore |

- `confirmFirst`'s branch (`removing` vs `confirming2`) is decided by the **store**,
  which knows `result.removableTrackCount`; the FSM accepts a discriminator the store
  supplies, OR exposes two actions. Implementation chooses one and documents it; the
  threshold is `> 25` (FR-006) → boundary-tested at 24/25/26.
- `cancel` (the existing scan-level action) still resets the whole row to `idle`
  regardless of removal phase; entering `scanning` via `start` is also still allowed from
  `loaded` (explicit re-scan), discarding removal state.
- **Concurrency (FR-012)**: `removeRequest` is ignored while phase ∈
  {`confirming`, `confirming2`, `removing`} — the FSM returns the input state by
  reference (no spurious re-render), and the UI disables the button as defense-in-depth.
- **No auto-run (FR-011)**: there is no timer/effect transition into `removing`; only
  `confirmFirst`/`confirmSecond` (user clicks) reach it.

---

## §6 — Port: RemovalExecutor

`src/ports/removal-executor.ts` — see [`contracts/removal-executor-port.md`](./contracts/removal-executor-port.md).

```ts
export interface RemovalExecutor {
  remove(
    target: RemovalTarget,
    tracks: ReadonlyArray<TrackRef>,
    signal: AbortSignal,
    onProgress?: (event: RemovalProgressEvent) => void,
  ): Promise<RemovalOutcome>;
}
```

---

## §7 — Store surface additions

`src/store/detection-store.ts` (extends `DetectionStoreState`)

```ts
requestRemoval(collectionKey: string): void;   // loaded.none → confirming (dispatch removeRequest)
confirmRemoval(collectionKey: string): Promise<void>; // confirming→(confirming2|removing→execute); confirming2→removing→execute
cancelRemoval(collectionKey: string): void;     // confirming|confirming2 → none (dispatch removeCancel)
```

- `confirmRemoval` reads the row's `result`, branches on `removableTrackCount > 25`
  (first call from `confirming` shows the second confirm; the call from `confirming2`
  proceeds), then: `computeRemoveSet` → `RemovalExecutor.remove` → `applyRemovalOutcome`
  → dispatch `removeComplete`. Wraps non-`RemovalError` throws as `executor-failed`.
- Concurrency: guarded by the FSM `removing` phase + a closure-level in-flight guard
  mirroring the existing `controllers` map pattern.
- The store is constructed in `app.tsx` with both `createDetectionScanner(...)` and a
  `SpicetifyRemovalExecutor`.

---

## §8 — UI shapes

- `RemoveDuplicatesButton` props: `{ collectionKey, target, displayName }`; renders only
  when the row is `loaded` with `removableTrackCount > 0` (FR-001/FR-002) and removal
  phase is `none` or `partial`.
- `RemovalConfirmDialog` props: `{ collectionName, count, step: 1 | 2, onConfirm, onCancel }`
  — step 2 only mounts when `count > 25` (FR-006). Copy names the collection + exact
  count (NFR-001).
- `RemovalOutcomeView` props: `{ outcome }` — renders the partial-failure message and
  keeps unremoved copies visible (FR-010/AS-8). See
  [`contracts/removal-confirmation-ui.md`](./contracts/removal-confirmation-ui.md).

---

## §9 — FR / type coverage map

| FR / NFR / C | Realized by |
|---|---|
| FR-001 / FR-002 | `RemoveDuplicatesButton` gating on `loaded && removableTrackCount > 0` |
| FR-003 / C-003 | single `RemovalTarget` per `RemovalExecutor.remove`; no global path |
| FR-004 / C-006 | `computeRemoveSet` keeps `defaultKeepIndex === 0`, removes rest; size = `removableTrackCount` |
| FR-005 / NFR-001 | `RemovalConfirmDialog` step 1 (name + count) |
| FR-006 | FSM `confirming2`; threshold `> 25`; boundary 24/25/26 |
| FR-007 | `removeCancel` → `none`; no executor call on cancel |
| FR-008 / A-2 / FR-009 | `applyRemovalOutcome` (in-client, no re-fetch/re-scan) |
| FR-010 / AS-8 | `RemovalOutcome.failed` + `RemovalOutcomeView`; failed copies retained |
| FR-011 / C-002 | only `confirmFirst/confirmSecond` reach `removing`; no auto trigger |
| FR-012 | FSM ignores `removeRequest` during confirming/removing + UI disable |
| NFR-002 | `removing` phase + `RemovalProgressEvent` + terminal outcome |
| NFR-004 | `computeRemoveSet` fail-loud + `isRemovableResult` classifier |
| C-004 | local files already excluded upstream; never in `RemoveSet` |
| C-005 | removal uses only in-client Platform APIs (ADR-0011) |
