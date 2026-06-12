---
work_package_id: WP02
title: Pure transforms — computeRemoveSet + applyRemovalOutcome
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-008
- FR-009
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-11T20:52:36Z'
subtasks:
- T005
- T006
- T007
- T008
agent: "claude:opus:reviewer:reviewer"
shell_pid: "25130"
history:
- timestamp: '2026-06-11T20:52:36Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/domain/
execution_mode: code_change
owned_files:
- src/domain/remove-set.ts
- src/domain/apply-removal-outcome.ts
- test/domain/remove-set.test.ts
- test/domain/apply-removal-outcome.test.ts
tags: []
---

# WP02 — Pure transforms (`computeRemoveSet` + `applyRemovalOutcome`)

## Objective

Implement the two pure domain transforms that carry all of the removal decision logic,
plus the fail-loud classifier that gates the first one:

1. **`isRemovableResult`** — total classifier predicate (NFR-004) that callers pre-check.
2. **`computeRemoveSet`** — `DetectionResult + RemovalTarget → RemoveSet`: keep-earliest,
   size-invariant, playlist-`uid` enforcement, fail-loud on malformed input (FR-004 / C-006).
3. **`trackRefKey` + `applyRemovalOutcome`** — `DetectionResult + RemovalOutcome → DetectionResult`:
   the in-client refresh that drops removed copies, collapses sub-2 groups, retains failed
   copies, and recomputes counts — no host read, no re-scan (FR-008 / FR-009 / A-2 / A-5).

Both live under `src/domain/` and are exercised with no host and no DOM. 100% line + branch
on both modules; `tsc --noEmit` green.

## Context

These transforms sit between the store and the executor: the store calls `computeRemoveSet`
to build what to delete, hands it to the `RemovalExecutor`, then calls `applyRemovalOutcome`
to refresh the row. Read first:

- [`../contracts/remove-set-transform.md`](../contracts/remove-set-transform.md) — the
  authoritative behavioral contract for both functions (read it cell-for-cell).
- [`../data-model.md`](../data-model.md) §2 (value types), §3 (transform signatures + recompute
  rules), §4 (error codes).
- `src/domain/detection-types.ts` — `DetectionResult`, `DuplicateGroup`, `EnrichedTrack`
  (now carrying optional `uid` from WP01). Read the exact field names; do not assume.
- `src/domain/removal-types.ts` (WP01) — `RemovalTarget`, `TrackRef`, `RemoveSet`, `RemovalOutcome`.
- `src/domain/removal-errors.ts` (WP01) — `RemovalError`, `isRemovalError`.

**Architectural constraint** (ADR-0001 / `test/architecture.test.ts`): `src/domain/` may
import only from other `src/domain/` files. No React, Zustand, adapters, ports, Spicetify.

**Inputs are trusted-by-construction but validated anyway** (NFR-004 fail-loud). The
detector produces `DuplicateGroup`s with `members.length >= 2`, `defaultKeepIndex === 0`,
and members ordered ascending by `position`; these transforms re-assert those invariants and
throw `RemovalError('malformed-result', …)` rather than producing a wrong remove-set.

## Branch strategy

Planning base & merge target: **`main`**. The execution workspace/branch is assigned by
`spec-kitty agent action implement WP02 --agent <name>` from `lanes.json`; enter the assigned
workspace before editing. Depends on **WP01** — branch from the dependency base it resolves.

## Subtasks

### T005 — `isRemovableResult` classifier (`src/domain/remove-set.ts`, NEW)

**Purpose**: Pure, total predicate (no throw) that returns `true` iff `result` is a
well-formed `DetectionResult` from which a remove-set can be safely computed. Callers
pre-check before `computeRemoveSet` (charter input-validation pattern, NFR-004).

**Signature**: `export function isRemovableResult(result: unknown): result is DetectionResult`

**Truth conditions** (contract §`isRemovableResult`):
- `result` is a non-null object with the `DetectionResult` shape: `collectionKey: string`,
  `groups: array`, numeric `duplicateTrackCount` / `removableTrackCount` /
  `skippedLocalCount` / `unenrichedCount` / `scannedTrackCount` / `completedAt`.
- **Every** group satisfies: `members` is an array with `length >= 2`;
  `defaultKeepIndex === 0`; members ordered ascending by `position` (each member's
  `position` strictly greater than the previous — assert non-decreasing/ascending per the
  detector's contract; use `>` if positions are unique post-filter, `>=` is wrong — verify
  against `duplicate-detector.ts` ordering before deciding, and document the choice in JSDoc).
- An empty `groups` array is **valid** (returns `true`) — a zero-removable result is
  well-formed; `computeRemoveSet` then yields an empty set.

**Validation**: 100% line+branch — every false-returning branch needs a test (non-object,
missing field, wrong field type, a group with <2 members, non-zero `defaultKeepIndex`,
out-of-order members).

### T006 — `computeRemoveSet` (`src/domain/remove-set.ts`)

**Purpose**: Build the ordered set of `TrackRef`s to delete (FR-004 / C-006).

**Signature**: `export function computeRemoveSet(result: DetectionResult, target: RemovalTarget): RemoveSet`

**Algorithm** (contract §`computeRemoveSet`):
1. **Fail-loud guard**: if `!isRemovableResult(result)` → throw
   `RemovalError('malformed-result', '<message>', { context: { reason: 'not-removable-result' } })`.
2. For each group, emit a `TrackRef` for **every member except index `defaultKeepIndex`**
   (which is always 0 — keep earliest). Build `{ uri: member.uri, uid: member.uid }`.
3. **Playlist `uid` enforcement**: when `target.kind === 'playlist'`, every emitted member
   MUST have a non-empty-string `uid`; otherwise throw
   `RemovalError('malformed-result', …, { context: { reason: 'playlist-member-missing-uid' } })`.
   For `target.kind === 'liked-songs'`, omit `uid` from the `TrackRef` (do not copy it).
4. **Order**: the emitted refs are ascending by original `position` across all groups
   (later copies in iteration order). Collect `(position, ref)` then sort by `position`,
   OR rely on the detector's existing ascending order if groups+members are already ordered —
   document which, and test it.
5. **Size invariant**: assert `result.removableTrackCount === Σ(group.members.length − 1)
   === removeSet.tracks.length`. On mismatch → throw
   `RemovalError('malformed-result', …, { context: { reason: 'size-mismatch', expected, actual } })`.
6. Return `{ collectionKey: result.collectionKey, tracks }`.

**Boundary / edge tests** (contract bullet list):
- `groups = []` → `{ collectionKey, tracks: [] }` (total; no throw).
- a group of **exactly 2** → exactly **1** removed; the kept (index-0) ref never appears.
- a group of **N** → **N−1** removed.
- `liked-songs` target → `TrackRef`s have `uid === undefined`.
- `playlist` target with a member missing `uid` → throws `malformed-result`
  (`reason: 'playlist-member-missing-uid'`).
- `playlist` target with all members carrying `uid` → refs carry the `uid`.
- `removableTrackCount` disagreeing with the derived count → throws (`reason: 'size-mismatch'`).
- `!isRemovableResult` input (e.g. a group of 1) → throws (`reason: 'not-removable-result'`).

**Files**: `src/domain/remove-set.ts` (new, ~110 lines incl. JSDoc);
`test/domain/remove-set.test.ts` (new, ~180 lines).

### T007 — `trackRefKey` + `applyRemovalOutcome` (`src/domain/apply-removal-outcome.ts`, NEW)

**Purpose**: The in-client refresh (FR-008 / A-2) — produce an updated `DetectionResult`
with successfully-removed tracks dropped, sub-2 groups collapsed, failed copies retained,
and counts recomputed. No host read, no re-scan (FR-009).

**Helpers + signature**:
```ts
/** Identity key for matching an outcome ref to a group member.
 *  Playlist → uid; Liked Songs → uri. */
export function trackRefKey(target: RemovalTarget, ref: TrackRef): string;

export function applyRemovalOutcome(
  result: DetectionResult,
  outcome: RemovalOutcome,
  target: RemovalTarget,
): DetectionResult;
```

**`trackRefKey`** (contract §Identity): `target.kind === 'playlist'` → `ref.uid` (assert
defined — a playlist ref without `uid` is a defect; throw `malformed-result` or rely on the
upstream guarantee and document it); `liked-songs` → `ref.uri`.

**`applyRemovalOutcome` algorithm** (contract §`applyRemovalOutcome`):
1. Build `removedKeys = new Set(outcome.removed.map(r => trackRefKey(target, r)))`.
2. **Validation (fail-loud, A-5)**: every key in `removedKeys` MUST be present on some
   group member of `result`; if any removed key matches no member → throw
   `RemovalError('outcome-mismatch', …, { context: { key } })`. (See contract note: the
   adapter only reports tracks it was asked to remove, so a mismatch is a real defect — the
   store guards against double-apply, documented in T018.)
3. For each group: drop members whose key ∈ `removedKeys`; **keep** members referenced in
   `outcome.failed` (they were not removed — FR-010 / AS-8). A group whose surviving
   membership `< 2` collapses (excluded from the new `groups`).
4. **Recompute**: `duplicateTrackCount = Σ surviving members` over surviving groups;
   `removableTrackCount = duplicateTrackCount − survivingGroups.length`. Preserve
   `collectionKey`, `completedAt`, `skippedLocalCount`, `unenrichedCount`, `scannedTrackCount`
   unchanged (scan-time diagnostics — they describe the scan, not the current set).
5. Re-index nothing about `position` (positions are scan-time; leave member positions as-is).
6. Return the new `DetectionResult` (fresh object; do not mutate the input).

**Boundary / edge tests** (contract bullet list):
- **full success** (all removable removed) → every multi-member group collapses to ≤1
  survivor → all groups gone → `removableTrackCount === 0`, `groups.length === 0` (button
  hides — AS-7).
- **partial** → a group with ≥2 survivors remains; `removableTrackCount` reflects survivors;
  failed copies still present.
- **empty outcome** (`removed=[] failed=[]`) → result returned structurally unchanged (same
  counts; assert deep-equal contents, new object identity is fine).
- **all-failed** (`removed=[]`, `failed` non-empty) → counts unchanged; failed copies visible.
- **outcome-mismatch**: `outcome.removed` references a key absent from every group → throws
  `RemovalError('outcome-mismatch')`.
- **playlist vs liked-songs keying**: same URI repeated in a playlist (two members, same
  `uri`, different `uid`) — removing one `uid` drops exactly that member and keeps the other;
  the liked-songs path keys by `uri`.
- **idempotence note**: applying the same all-success outcome twice → the second call's
  `removed` keys are now absent → throws `outcome-mismatch`. This is the documented reason
  the store applies an outcome exactly once (cross-reference WP05/T018).

**Files**: `src/domain/apply-removal-outcome.ts` (new, ~120 lines incl. JSDoc);
`test/domain/apply-removal-outcome.test.ts` (new, ~200 lines).

### T008 — Boundary/edge consolidation + count-invariant assertions

**Purpose**: Ensure the two test files together cover every boundary the contract enumerates
and explicitly assert the count-recompute invariant so drift is caught.

**Steps**:
- In `apply-removal-outcome.test.ts`, after each scenario assert the invariant
  `result.removableTrackCount === result.duplicateTrackCount − result.groups.length`.
- Add a fixture builder helper (local to each test file, not a shared module — keep SRP) that
  constructs a `DetectionResult` with N groups of given sizes so the boundary cases (group of
  2, group of N, mixed) are concise.
- Confirm `remove-set.test.ts` covers: size = `removableTrackCount` after collapse equals the
  remove-set length for the same fixture (the two transforms agree).
- Run coverage; fill any uncovered branch (e.g. the `liked-songs` `uid`-omission path, the
  ascending-order sort path).

**Files**: extends `test/domain/remove-set.test.ts` and
`test/domain/apply-removal-outcome.test.ts` (no new files).

## Test strategy

TDD (`DIRECTIVE_034`): for each function write the failing test first — e.g. assert
`computeRemoveSet` on a 2-member group yields 1 ref, watch it fail (function absent), then
implement. Vitest, no happy-dom (pure domain). Coverage gate: 100% line+branch on
`remove-set.ts` and `apply-removal-outcome.ts`. `test/architecture.test.ts` auto-discovers
the new files and asserts the import boundary.

## Definition of Done

- [ ] `isRemovableResult` is total (never throws); every false branch tested.
- [ ] `computeRemoveSet` keeps index 0, removes the rest, enforces playlist `uid`, asserts
      the size invariant, fails loud via `RemovalError('malformed-result')` with a `reason`
      context on every malformed path.
- [ ] `applyRemovalOutcome` drops removed, retains failed, collapses sub-2 groups, recomputes
      `duplicateTrackCount`/`removableTrackCount`, preserves scan diagnostics, and throws
      `RemovalError('outcome-mismatch')` on an unknown removed key.
- [ ] `trackRefKey` keys by `uid` (playlist) / `uri` (liked-songs).
- [ ] Every boundary/edge case in the contract has a test; the count invariant is asserted.
- [ ] 100% line+branch on both modules; `npm run test:run` and `tsc --noEmit` green;
      architecture test clean.
- [ ] No imports outside `src/domain/`.

## Risks

| Risk | Mitigation |
|---|---|
| Count-recompute drift | Assert `removableTrackCount === duplicateTrackCount − groups.length` after every transform in tests. |
| Ordering assumption wrong (sort vs trust detector order) | Verify against `duplicate-detector.ts`; document the chosen approach in JSDoc and test the order explicitly. |
| `uid` accidentally copied for liked-songs `TrackRef`s | Test asserts `uid === undefined` for the liked-songs path. |
| Mutating the input `DetectionResult` | Return a fresh object; test asserts the input is unchanged (frozen-input or deep-equal-before/after). |

## Reviewer guidance

- Check both functions against `contracts/remove-set-transform.md` cell-for-cell.
- Verify the fail-loud paths throw `RemovalError` with the correct `code` and a useful
  `context.reason`, and that `isRemovableResult` never throws.
- Confirm the size invariant and the count recompute are asserted, not just implied.
- Confirm no input mutation and no imports outside `src/domain/`.

## Implementation command

```bash
spec-kitty agent action implement WP02 --agent <name>
```

## Activity Log
- 2026-06-12T13:45:45Z – claude:opus:implementer:implementer – shell_pid=21567 – Started implementation via action command
- 2026-06-12T13:51:27Z – claude:opus:implementer:implementer – shell_pid=21567 – Ready for review
- 2026-06-12T13:51:57Z – claude:opus:reviewer:reviewer – shell_pid=25130 – Started review via action command
- 2026-06-12T13:54:44Z – claude:opus:reviewer:reviewer – shell_pid=25130 – Review passed: contract-faithful computeRemoveSet/applyRemovalOutcome + total isRemovableResult; strict-> ordering verified against detector's unique-position sort; all fail-loud reasons (not-removable-result, playlist-member-missing-uid, size-mismatch, playlist-ref-missing-uid, outcome-mismatch) thrown as RemovalError and tested; count invariant asserted; no input mutation; no imports outside src/domain/; 961 tests green, tsc clean, 100% line+branch global gate passes
