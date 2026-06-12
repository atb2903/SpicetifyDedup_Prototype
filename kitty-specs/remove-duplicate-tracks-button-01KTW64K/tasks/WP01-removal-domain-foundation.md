---
work_package_id: WP01
title: Removal domain foundation — types, errors, uid, FSM
dependencies: []
requirement_refs:
- FR-011
- FR-012
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-11T20:52:36Z'
subtasks:
- T001
- T002
- T003
- T004
history:
- timestamp: '2026-06-11T20:52:36Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/domain/
execution_mode: code_change
owned_files:
- src/domain/detection-types.ts
- src/domain/detection-state.ts
- src/domain/removal-types.ts
- src/domain/removal-errors.ts
- test/domain/detection-state.test.ts
- test/domain/removal-errors.test.ts
tags: []
---

# WP01 — Removal domain foundation (types, errors, `uid`, FSM)

## Objective

Land the pure-data foundation that every other removal WP imports:

1. **`uid` widening** — add an optional `uid?: string` to `RawTrack` and `EnrichedTrack`
   so a specific occurrence of a repeated playlist URI can be addressed at removal time
   (ADR-0012). Type-only, additive, algorithm-neutral.
2. **Removal value types** — `RemovalTarget`, `TrackRef`, `RemoveSet`, `RemovalOutcome`,
   `RemovalProgressEvent` in a new `removal-types.ts`.
3. **Removal error taxonomy** — `RemovalError` + `RemovalErrorCode` + `isRemovalError`,
   mirroring the existing `DetectionError` shape.
4. **Detection FSM extension** — a nested `RemovalState` on the `loaded` state plus the
   removal sub-actions and their transitions (ADR-0013).

By the end, every type/FSM cell in [`../data-model.md`](../data-model.md) §§1, 2, 4, 5
exists in `src/domain/`, with 100% line+branch coverage on executable modules and
`tsc --noEmit` green.

## Context

Foundational WP — WP02 (transforms), WP03 (port/fake), WP04 (adapter), WP05 (store), and
WP06 (UI) all import from these files. Read first:

- [`../data-model.md`](../data-model.md) §1 (`uid`), §2 (value types), §4 (errors),
  §5 + §5.1 (the FSM + transition table).
- [`../contracts/removal-state-fsm.md`](../contracts/removal-state-fsm.md) — the
  contractual transition rules and the no-auto-run guarantee.
- `src/domain/detection-types.ts` (existing) — the file you widen in T001.
- `src/domain/detection-errors.ts` (existing) — the exact pattern T003 mirrors.
- `src/domain/detection-state.ts` (existing) — the FSM you extend in T004.
- `test/domain/detection-state.test.ts` (existing) — the grid you extend in T004.

**Architectural constraint** (ADR-0001 / `test/architecture.test.ts`): `src/domain/` may
import only from other `src/domain/` files — no React, Zustand, adapters, store, UI, or
Spicetify. The architecture test auto-discovers the new files; no rule edits.

## Branch strategy

Planning base & merge target: **`main`**. The execution workspace/branch is assigned by
`spec-kitty agent action implement WP01 --agent <name>` from `lanes.json`; enter the
assigned workspace before editing. Completes via the implement → review → merge lifecycle.

## Subtasks

### T001 — Widen `RawTrack` / `EnrichedTrack` with `uid` (`src/domain/detection-types.ts`)

**Purpose**: Carry the playlist item occurrence id through enumeration and enrichment so
removal can target a repeated URI's later copies. Additive only — the matching algorithm
must not read `uid`.

**Change** (data-model §1):
- Add to `RawTrack`:
  ```ts
  /**
   * Playlist item occurrence id. Present for playlist tracks (from
   * `PlaylistAPI.getContents` items); `undefined` for Liked Songs tracks,
   * which are addressed by URI alone. Carried unchanged through enrichment
   * so removal can target a specific occurrence of a repeated URI. (ADR-0012)
   */
  uid?: string;
  ```
- Add the mirrored `uid?: string` to `EnrichedTrack` with a JSDoc noting it is preserved
  verbatim through enrichment.
- **Invariant** (document in JSDoc): `uid` is a non-empty string when present; `undefined`
  only for Liked-Songs-origin tracks. The enumerator never fabricates a `uid`.

**Do NOT**: touch `DuplicateGroup` / `DetectionResult` (members are
`ReadonlyArray<EnrichedTrack>`, so `uid` is already reachable per member). Do not change
any matching/grouping code.

**Validation**: `tsc --noEmit` green. This is a types-only module (0/0 coverage expected,
no test file needed for the type itself — its population is covered in WP04, its
consumption in WP02).

**Files**: `src/domain/detection-types.ts` (changed, +~10 lines incl. JSDoc).

### T002 — Removal value types (`src/domain/removal-types.ts`, NEW)

**Purpose**: One types-only module declaring every removal value shape (data-model §2).

**Declare** (verbatim intent from data-model §2 — JSDoc every export and field):
```ts
export type RemovalTarget =
  | { kind: 'liked-songs' }
  | { kind: 'playlist'; playlistUri: string };

export type TrackRef = { uri: string; uid?: string };

export type RemoveSet = {
  collectionKey: string;
  tracks: ReadonlyArray<TrackRef>;
};

export type RemovalOutcome = {
  removed: ReadonlyArray<TrackRef>;
  failed: ReadonlyArray<{ track: TrackRef; reason: string }>;
};

export type RemovalProgressEvent = {
  removedSoFar: number;
  total: number;
};
```
Document the invariants in JSDoc: `RemoveSet.tracks.length === sourceResult.removableTrackCount`;
playlist `TrackRef`s carry a defined `uid`, Liked-Songs ones do not;
`removed.length + failed.length === requested.length` and `removed`/`failed` disjoint.

**Validation**: `tsc --noEmit` green; types-only (0/0 coverage expected). Imports nothing
outside `src/domain/`.

**Files**: `src/domain/removal-types.ts` (new, ~70 lines incl. JSDoc).

### T003 — Removal error taxonomy (`src/domain/removal-errors.ts`, NEW + test)

**Purpose**: A typed error class + classifier mirroring `DetectionError` so store error
handling is uniform (NFR-004 fail-loud companion).

**Declare** (data-model §4):
- `RemovalErrorCode` — closed union, exactly these four:
  - `'malformed-result'` — `computeRemoveSet` input failed `isRemovableResult`/invariants.
  - `'outcome-mismatch'` — `applyRemovalOutcome` got a track not in the result.
  - `'executor-failed'` — `RemovalExecutor` host call rejected (wraps cause).
  - `'host-unavailable'` — `Spicetify.Platform.{LibraryAPI,PlaylistAPI}` absent.
- `class RemovalError extends Error` with `readonly code: RemovalErrorCode`,
  `readonly cause?: unknown`, `readonly context?: Readonly<Record<string, unknown>>`,
  constructor `(code, message, options?: { cause?, context? })`, sets
  `this.name = 'RemovalError'`. Mirror `detection-errors.ts` exactly for the optional
  `cause`/`context` assignment guards.
- `function isRemovalError(x: unknown): x is RemovalError` — `instanceof RemovalError`.

**Tests** (`test/domain/removal-errors.test.ts`):
- Construct with each of the 4 codes; assert `code`, `message`, `name`, `cause`, `context`
  round-trip.
- `isRemovalError` → `true` for an instance, `false` for a plain `Error`, `false` for a
  shape-equal `{ code: 'malformed-result' }` plain object.
- `instanceof Error` holds.
- Cover both branches of the `cause`/`context` assignment guards (present and absent).
- 100% line + branch.

**Files**: `src/domain/removal-errors.ts` (new, ~60 lines);
`test/domain/removal-errors.test.ts` (new, ~90 lines).

### T004 — Extend detection FSM with `RemovalState` (`src/domain/detection-state.ts` + test)

**Purpose**: Add the removal sub-state to the `loaded` state and the removal actions to
`transition`, implementing [`../contracts/removal-state-fsm.md`](../contracts/removal-state-fsm.md)
and data-model §5.1 exactly.

**Declare / change**:
- `RemovalState` (data-model §5):
  ```ts
  export type RemovalState =
    | { phase: 'none' }
    | { phase: 'confirming' }
    | { phase: 'confirming2' }
    | { phase: 'removing'; progress?: RemovalProgressEvent }
    | { phase: 'partial'; outcome: RemovalOutcome };
  ```
- Change the `loaded` variant to carry it:
  `| { kind: 'loaded'; result: DetectionResult; removal: RemovalState }`.
- Extend `DetectionAction` with the removal sub-actions. **Decision (document in JSDoc):**
  `confirmFirst` carries the threshold discriminator the store supplies, keeping the
  `> 25` count logic in the store and the branch pure in the FSM:
  ```ts
  | { type: 'removeRequest' }
  | { type: 'confirmFirst'; requiresSecondConfirm: boolean }
  | { type: 'confirmSecond' }
  | { type: 'removeCancel' }
  | { type: 'removeProgress'; event: RemovalProgressEvent }
  | { type: 'removeComplete'; result: DetectionResult; outcome: RemovalOutcome }
  ```

**Transition rules** (data-model §5.1 + contract §Actions). All removal actions are valid
**only** from `kind: 'loaded'`; from `idle`/`scanning`/`failed` they return the input
state **by reference**. Within `loaded.removal`:

| from \ action | removeRequest | confirmFirst | confirmSecond | removeCancel | removeProgress | removeComplete |
|---|---|---|---|---|---|---|
| `none` | → `confirming` | ignore | ignore | ignore | ignore | ignore |
| `confirming` | ignore (FR-012) | `requiresSecondConfirm ? confirming2 : removing` | ignore | → `none` | ignore | ignore |
| `confirming2` | ignore | ignore | → `removing` | → `none` | ignore | ignore |
| `removing` | ignore (FR-012) | ignore | ignore | ignore | → `removing`(progress) | → `loaded(result, failed.length===0 ? none : partial)` |
| `partial` | → `confirming` (retry) | ignore | ignore | ignore | ignore | ignore |

- `removeComplete` builds `{ kind:'loaded', result: action.result, removal:
  action.outcome.failed.length === 0 ? { phase:'none' } : { phase:'partial', outcome: action.outcome } }`.
  The `result` is the already-applied `applyRemovalOutcome` output (the store computes it).
- The existing scan actions still apply to `loaded`: `cancel` → `{ kind:'idle' }`
  (unconditional, unchanged); `start` → `scanning` (explicit re-scan, discards removal
  state). `progress`/`complete`/`fail` remain ignored from `loaded`.
- **Critical (where `complete` lands `loaded`)**: the `scanning + complete` branch must now
  produce `{ kind:'loaded', result: action.result, removal: { phase:'none' } }`. This is
  the *only* place a `loaded` literal is constructed — no other file builds one (verified:
  the repo narrows on `.kind` and reads `.result`), so this change does not ripple.
- **Immutability**: active cells allocate a fresh state; every ignored cell returns the
  input by reference (no spurious subscriber re-render). The `removing → removing` progress
  cell allocates a new `loaded` object with a new `removal` object.

**No-auto-run guarantee (FR-011)**: there is no time/mount/completion edge into `removing`
— only `confirmFirst` (`requiresSecondConfirm:false`) or `confirmSecond` reach it. State
this in a JSDoc block.

**Tests** (`test/domain/detection-state.test.ts`, extend the existing file):
- Update the existing helper at line ~43 and any `complete` assertions so a `loaded` state
  now includes `removal: { phase:'none' }`.
- Add a removal grid: for each of the 5 `loaded.removal` phases × each of the 6 removal
  actions, one `it()` asserting the resulting state (or reference-equality for ignored
  cells). 30 cells.
- `confirmFirst` boundary: from `confirming`, `requiresSecondConfirm:false` → `removing`;
  `requiresSecondConfirm:true` → `confirming2`. (The 24/25/26 count→boolean mapping is
  tested in WP05; here assert both boolean branches.)
- All removal actions from `idle`/`scanning`/`failed` return the input by reference (one
  `it()` per (non-loaded-state × removal-action) sample; assert `=== before`).
- `removeComplete` with empty `failed` → `removal.phase === 'none'`; with non-empty
  `failed` → `removal.phase === 'partial'` carrying the outcome.
- Re-confirm the existing scan-action cells still pass with the widened `loaded`.
- 100% line + branch.

**Files**: `src/domain/detection-state.ts` (changed, +~90 lines);
`test/domain/detection-state.test.ts` (changed, +~220 lines).

## Test strategy

TDD (`DIRECTIVE_034`): write each failing test first (construct a `RemovalError`, assert
`code`; dispatch `removeRequest` from `loaded.none`, assert `confirming`), watch it fail,
implement, refactor. Coverage gate: 100% line+branch on `removal-errors.ts` and
`detection-state.ts`. Types-only modules (`removal-types.ts`, `detection-types.ts`) emit
no executable code — 0/0 coverage is expected, no `istanbul` pragmas. `test/architecture.test.ts`
picks up the new files automatically.

## Definition of Done

- [ ] `RawTrack`/`EnrichedTrack` carry optional `uid` with JSDoc; algorithm untouched.
- [ ] `removal-types.ts` declares all 5 value types with JSDoc + documented invariants.
- [ ] `removal-errors.ts` matches the `DetectionError` pattern; 4-code taxonomy;
      `isRemovalError` uses `instanceof`; 100% line+branch.
- [ ] `detection-state.ts` carries `RemovalState`, the widened `loaded`, and the 6 removal
      actions; transition matches the table exactly; ignored cells return by reference.
- [ ] FSM test grid is exhaustive (30 removal cells + boundary booleans + non-loaded
      ignores) and the existing scan-action cells still pass.
- [ ] `npm run test:run` and `tsc --noEmit` green; architecture test clean.
- [ ] No imports outside `src/domain/` in any new/changed file.
- [ ] Per-WP review approves; WP reaches `done` via the standard lifecycle.

## Risks

| Risk | Mitigation |
|---|---|
| Adding required `removal` to `loaded` breaks other files | It is constructed only inside `transition`; repo narrows on `.kind`/reads `.result` (verified). `tsc` + full test run confirm. |
| FSM cell omission | Exhaustive 5×6 grid + non-loaded ignores; reviewer checks against the contract table. |
| `uid` leaking into matching | Grep the detector/key code; `uid` must appear only in types here and the adapter/transform later. |

## Reviewer guidance

- Cross-check every type/field against data-model §§1, 2, 4, 5.
- Verify `transition` matches the contract table cell-for-cell, including reference
  equality on ignored cells and the `confirmFirst` discriminator branch.
- Confirm no auto-run edge exists into `removing`.
- JSDoc captures intent + invariants, not shape repetition.

## Implementation command

```bash
spec-kitty agent action implement WP01 --agent <name>
```

## Activity Log
