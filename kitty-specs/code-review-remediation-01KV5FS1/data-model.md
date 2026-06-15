# Data Model: Code Review Remediation Pass

Phase 1 output. Type- and contract-level deltas, per entity. This pass changes
**existing** shapes; nothing here introduces a new feature surface. Every type
lives where it already lives (domain stays pure — C-004). "Before" reflects the
current `main`; "After" is the remediated shape.

---

## 1. `DetectionErrorReason` (`src/domain/detection-errors.ts`) — FR-004, FR-005, NFR-002

**Before**
```ts
type DetectionErrorReason =
  | 'auth-token-expired'
  | 'rate-limit-unparseable'         // dead (Web-API enricher, ADR-0011)
  | 'network-failure'                // dead
  | 'malformed-enrichment-payload'   // dead
  | 'enumerator-failed'
  | 'catalog-rejected'               // sole producer is an internal fault, mislabelled
  | 'aborted';
```

**After**
```ts
type DetectionErrorReason =
  | 'auth-token-expired'   // reachable: enumerator fetchPage auth-expired
  | 'enumerator-failed'    // reachable: precheck / page / item validation / host reject
  | 'host-unavailable'     // NEW (NFR-002): enumerator requirePlatform fails loud
  | 'internal-error'       // NEW (FR-004): unexpected non-DetectionError fault in scan pipeline
  | 'aborted';             // type-only, defensive UI fallback (store swallows AbortError → idle)
```

**Rules / invariants**
- `internal-error` is the wrap target for a non-`DetectionError` throw caught in
  `detection-store.scanCollection` (replaces the old `catalog-rejected` wrap).
- `host-unavailable` is thrown by the enumerator's new `requirePlatform` before
  any host call.
- Removed members (`rate-limit-unparseable`, `network-failure`,
  `malformed-enrichment-payload`, `catalog-rejected`) MUST have **zero** live
  producers after this change (verified by grep — see research R-2).
- The UI message lookup (`DetectionFailedView`) is exhaustive over this union via
  the `never` check; adding/removing a member is a type-checked edit.

---

## 2. `DetectionError` construction site change — Finding C

| Site | Before | After |
|---|---|---|
| `detection-store.ts:333` scan catch | `new DetectionError('catalog-rejected', 'scanner.scan threw a non-DetectionError', { cause })` | `new DetectionError('internal-error', '<honest internal-error message>', { cause })` |
| `spicetify-tracks-enumerator.ts` platform getter | unsafe `as` cast (hides `undefined`) | `requirePlatform()` → `new DetectionError('host-unavailable', …)` when absent |

No `context.status`/`statusCode` is read for messaging after this change (FR-008).

---

## 3. `RemovalOutcome` (`src/domain/removal-types.ts`) — NFR-004, FR-003, FR-009

**Before**
```ts
type RemovalOutcome = {
  removed: ReadonlyArray<TrackRef>;
  failed: ReadonlyArray<{ track: TrackRef; reason: string }>;
};
```

**After**
```ts
type RemovalOutcomeProvenance =
  | 'host'            // the executor's host-truthful result (full or partial)
  | 'stalled'         // store stall watchdog tripped on a no-progress batch
  | 'executor-failed' // executor rejected with a whole-operation fault
  | 'compute-failed'; // computeRemoveSet threw — no host call was made

type RemovalOutcome = {
  removed: ReadonlyArray<TrackRef>;
  failed: ReadonlyArray<{ track: TrackRef; reason: string }>;
  /** Typed provenance replacing the `stalled:` / `executor-failed:` string prefix (NFR-004). */
  provenance: RemovalOutcomeProvenance;
};
```

**Rules / invariants**
- `provenance: 'host'` — total-accounting invariant holds:
  `removed.length + failed.length === requested.length` (full or boundary-abort partial).
- `provenance: 'stalled'` — `removed` = whatever the executor confirmed before the
  watchdog tripped (FR-003 — **never** forced to `[]`); `failed` = the remainder.
  The UI "timed out" copy is shown only when `removed.length === 0`; otherwise a
  truthful partial count is shown.
- `provenance: 'compute-failed'` (FR-009) — `removed: []`, `failed: []`,
  **no fabricated TrackRef**, count truthfully 0. The view shows a
  "couldn't compute the removal" message that names no track and no count.
- `provenance: 'executor-failed'` — whole-operation executor fault; `removed` =
  none, `failed` = the requested tracks (truthful, real TrackRefs from the
  computed RemoveSet — never synthesised from the collection URI).

**`reason` strings** on `failed[]` become human-readable diagnostics only; no
layer derives control flow from them (no `startsWith`).

---

## 4. `RemovalExecutor.remove` contract (`src/ports/removal-executor.ts`) — FR-003

**Before:** boundary-abort → throws `DOMException('AbortError')` (accumulated
`removed`/`failed` discarded).

**After:** boundary-abort → **resolves** with the accumulated
`{ removed, failed, provenance: 'host' }` gathered so far. Rejection is now
reserved strictly for `host-unavailable` (pre-mutation) and genuine
whole-operation faults the adapter cannot attribute. The store decides whether an
aborted-partial means *stall* (apply, stamp `'stalled'`) or *user-cancel/reset*
(discard — the row already left `removing`).

**Unchanged invariants:** total accounting per resolved outcome; disjointness;
single-collection scope (C-003); `onProgress` once per batch with cumulative
`removedSoFar`; `host-unavailable` before any mutation.

`FakeRemovalExecutor` and the real adapter both adopt the new boundary-abort
semantics; the fake's scripted hang/abort modes are repurposed to exercise the
watchdog + partial-return (Assumptions in spec).

---

## 5. Stall watchdog (`src/store/detection-store.ts`) — FR-002, NFR-007

- `STALL_CEILING_MS = 30_000` retained, **re-scoped** to "max time since last
  batch progress." JSDoc corrected to describe time-since-progress, not
  whole-removal elapsed, and to drop the unbacked `= ms` tie-break guarantee
  (NFR-007 — the watchdog's `= ms` semantics are pinned by boundary tests).
- The watchdog is (re)armed on each `removeProgress` event the store receives from
  the executor's `onProgress`; on trip it `controller.abort()`s and marks the
  termination as a stall so the catch/finish path stamps `provenance: 'stalled'`
  and applies the executor's accumulated partial (FR-003).
- Distinguished from user-cancel/reset: those abort for a different reason and the
  resulting partial is discarded (row already moved away).

**Boundary tests (C-001):** no-progress duration **29 999 / 30 000 / 30 001 ms**;
plus a multi-batch removal with total > 30 000 ms but every inter-progress gap
< 30 000 ms completing successfully.

---

## 6. `host-auth.ts` (NEW, `src/domain/`) — FR-006, FR-007

```ts
/** True iff `cause` looks like a host auth-expired rejection.
 *  Inspects `code` (the field Spicetify.CosmosAsync populates — ADR-0010),
 *  with message-substring fallbacks. Pure; single definition for both adapters. */
export function looksLikeHostAuthExpired(cause: unknown): boolean;
```

- Inspects `code === 401` (corrected from `status`), plus `"401"` in message and
  `"token"` + (`"expired"` | `"invalid"`).
- Consumed by `spicetify-tracks-enumerator.ts` (FR-006) and
  `spicetify-playlists-loader.ts` (FR-007); the per-adapter `looksLikeAuthExpired`
  methods are replaced by calls to it.
- Edge tests: `{ code: 401 }` → true; `{ status: 401 }` → false via code path
  (documents the corrected field); message-only variants → true; unrelated → false.

---

## 7. UI domain-type consumption (`src/ui/*`) — NFR-001

Three components declare local copies of domain types under
`// Types (WP01 domain types are defined locally until WP01 is merged into main)`:

| File | Local re-declaration | After |
|---|---|---|
| `DetectionFailedView.tsx:30` | `DetectionErrorReason`, `DetectionError` (plain-object) | import from `src/domain/detection-errors` |
| `ScanningView.tsx:23` | progress/detection types | import from `src/domain/detection-types` |
| `DetectionLoadedSummary.tsx:47` | `DetectionResult` / `DuplicateGroup` / `GroupMember` | import from `src/domain/` |

**Rule (verified by the NFR-005 import-graph test + a static scan):** zero local
re-declarations of `ProgressEvent`, `DetectionResult`, `DuplicateGroup`/`GroupMember`,
`DetectionError`, `DetectionErrorReason` in `src/ui/`. All consumed by import. The
three "defined locally" comment blocks are removed.

> Note: `src/ui/` importing domain *types* is allowed by ADR-0001 (UI may import
> `src/domain/`); the import-graph test (R-7) must treat type-only imports from
> `src/domain/` as permitted while still forbidding `src/adapters/`/`src/ports/`.

---

## 8. View routing helper (`src/ui/DedupPage.tsx`) — NFR-006

**Before:** inline IIFE `{(() => { switch (kind) { … } })()}` inside JSX.

**After:** a named module-level routing helper (e.g. `renderForKind(kind)` or a
`routeView(kind)` returning the element); the render tree references the helper.
Exhaustiveness preserved (the `switch` keeps no `default`; an unhandled
`LoadState.kind` stays a compile error).

---

## 9. Enumerate-loop track gate (`src/adapters/spicetify-tracks-enumerator.ts`) — FR-001

- Loop skips an item when `isLocalFile(item)` **or** the item is not
  `type === 'track'` (the classifier's leading discriminant). Genuine
  `type === 'track'` items still flow through `parseLibraryTrackItem`, which keeps
  its fail-loud behaviour on malformed genuine tracks.
- Result: episodes (with or without an `artists` array) are excluded, never
  parsed or deduped (SC-001); an all-episode collection yields an empty result,
  no failure.

---

## 10. ADRs (C-005) and docs (C-006)

| Artifact | Covers |
|---|---|
| ADR — per-batch stall model + faithful partial reporting | Finding B (R-1) |
| ADR — detection error-taxonomy reshape (+internal-error, +host-unavailable, −dead reasons) and the corrected auth field | Findings C, D, I (R-2, R-4, R-5) |
| ADR — typed removal-outcome provenance | Finding K (R-3) |
| ADR / comment — `reset()` placement outside the FSM tables | Finding N (R-9) |
| `ports/catalog-enricher.ts` JSDoc fix | C-006 — remove the `SpicetifyCatalogEnricher` adapter reference (no such adapter exists; ADR-0011) |
