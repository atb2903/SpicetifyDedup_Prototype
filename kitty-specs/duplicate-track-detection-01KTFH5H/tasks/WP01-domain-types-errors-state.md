---
work_package_id: WP01
title: Domain Types, Errors, State FSM
dependencies: []
requirement_refs:
- FR-008
- FR-011
- FR-012
- NFR-005
- NFR-006
- NFR-008
- NFR-009
- NFR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-duplicate-track-detection-01KTFH5H
base_commit: 3c497a11e757bfff3f1614a993ec92d14b4d462b
created_at: '2026-06-10T09:23:01.330157+00:00'
subtasks:
- T001
- T002
- T003
shell_pid: "24547"
agent: "claude:claude-sonnet-4-6:reviewer:reviewer"
history:
- timestamp: '2026-06-07T08:24:49Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/domain/
execution_mode: code_change
owned_files:
- src/domain/detection-types.ts
- src/domain/detection-errors.ts
- src/domain/detection-state.ts
- test/domain/detection-errors.test.ts
- test/domain/detection-state.test.ts
tags: []
---

# WP01 — Domain Types, Errors, State FSM

## Objective

Land the pure-data foundation every downstream WP consumes:

1. **Detection types** — every shape the algorithm, ports, store, and UI reference, with no imports outside `src/domain/`.
2. **Detection errors** — a typed error class with a closed reason taxonomy and a paired classifier predicate.
3. **Detection state FSM** — the per-row state union and its exhaustive `transition` function, tested across every cell of the state × action grid.

By the end of this WP, every type and FSM cell in [`../data-model.md`](../data-model.md) exists in `src/domain/`, with 100% line + branch coverage and `tsc --noEmit` green.

## Context

This WP is foundational — WP02 (domain algorithm), WP03 (ports), WP04 (composition adapter), WP06 (store), and WP07 (UI views) all import from the files this WP creates.

Read first:
- [`../data-model.md`](../data-model.md) §§1, 3, 4, 5, 6 — the verbatim type definitions and the FSM transition table.
- [`../research.md`](../research.md) §R-011 — error-taxonomy decisions and the analogy to `PlaylistsLoaderError`.
- `src/domain/errors.ts` (existing) — the pattern this WP mirrors for `DetectionError`.
- `src/domain/load-state.ts` (existing) — the pattern this WP mirrors for the FSM transition function.

Architectural constraints (from ADR-0001 / `test/architecture.test.ts`): `src/domain/` may import from other `src/domain/` files only — no React, no Zustand, no adapters, no store, no UI, no Spicetify.

## Branch strategy

Planning base & merge target: **`main`**. Execution workspace and branch are assigned by `spec-kitty agent action implement WP01 --agent <name>` based on `lanes.json`; enter the assigned workspace before editing. The completed WP merges back to `main` through the standard implement-review-merge lifecycle.

## Subtasks

### T001 — Detection types (`src/domain/detection-types.ts`)

**Purpose**: One file declaring every shared data shape the detection pipeline produces and consumes. Pure TypeScript, no runtime values besides type guards.

**What to declare** (verbatim from data-model §§1, 3, 4):
- `RawTrack` (§1.1) — enumeration output. Includes `position: number` for FR-007 ordering.
- `EnrichedTrack` (§1.2) — enrichment output. Carries `canonicalUri`, `durationMs`, `artists: ReadonlyArray<{ name: string }>`.
- `DuplicateGroup` (§3.1) — finalized group with `members`, `reason: 'same-canonical-uri' | 'name-artist-duration'`, `defaultKeepIndex: 0`.
- `DetectionResult` (§3.2) — full per-collection payload, including `collectionKey`, `completedAt`, `groups`, `duplicateTrackCount`, `removableTrackCount`, `skippedLocalCount`, `unenrichedCount`, `scannedTrackCount`.
- `ProgressEvent` (§4.1) — discriminated union over `stage: 'enumerating' | 'enriching' | 'matching'` plus `processed` / `total` (with `total: number | null` for `enumerating`).
- `ScanRequest` (§8) — discriminated union `{ kind: 'liked-songs' }` | `{ kind: 'playlist'; playlistUri: string }`.

**JSDoc**: every exported type, every field. The data-model already supplies the prose — paraphrase, don't translate verbatim. JSDoc must cover **intent, parameter shape (for objects), and any non-obvious invariant** (NFR-010).

**Validation**:
- `tsc --noEmit` green.
- `import` graph respects architecture rules.
- No runtime exports — this is a pure types-only module.

**Files**:
- `src/domain/detection-types.ts` (new, ~120 lines including JSDoc).

### T002 — Detection errors (`src/domain/detection-errors.ts`)

**Purpose**: A typed error class plus its classifier predicate, mirroring the existing `PlaylistsLoaderError` pattern. This is the failure surface every downstream layer throws from and every UI consumer narrows against.

**What to declare**:
- `DetectionErrorReason` — closed string-literal union, exactly the 7 reasons in data-model §6.1:
  - `'auth-token-expired'`
  - `'rate-limit-unparseable'`
  - `'network-failure'`
  - `'malformed-enrichment-payload'`
  - `'enumerator-failed'`
  - `'catalog-rejected'`
  - `'aborted'`
- `class DetectionError extends Error` with:
  - `readonly reason: DetectionErrorReason`
  - `readonly cause?: unknown`
  - `readonly context?: Readonly<Record<string, unknown>>`
  - constructor `(reason, message, options?: { cause?, context? })`
  - sets `this.name = 'DetectionError'` (allow `error.name === 'DetectionError'` checks)
- `function isDetectionError(x: unknown): x is DetectionError` — uses `instanceof DetectionError`.

**JSDoc** on every export: per-reason `// when this fires` annotations help future debuggers; the table in data-model §6.1 is the source.

**Tests** (`test/domain/detection-errors.test.ts`):
- Construct with each `reason`; assert `reason`, `message`, `name`, `cause`, `context` round-trip.
- `isDetectionError` returns `true` for instances, `false` for plain `Error`, `false` for `{ reason: 'auth-token-expired' }` (shape-equal but not instance).
- `instanceof Error` holds (subclass).
- 100% line + branch coverage.

**Files**:
- `src/domain/detection-errors.ts` (new, ~60 lines).
- `test/domain/detection-errors.test.ts` (new, ~80 lines).

### T003 — Detection state FSM (`src/domain/detection-state.ts`)

**Purpose**: The per-row state union (5 kinds × the underlying payloads) and a pure `transition(state, action)` that implements the table in data-model §5.3 exactly. Twenty cells, four of which return the state by reference (defensive against dispatch races).

**What to declare**:
- `DetectionState` — discriminated union over `kind: 'idle' | 'scanning' | 'loaded' | 'failed'`. The `scanning` variant carries `progress: ProgressEvent`; `loaded` carries `result: DetectionResult`; `failed` carries `reason: DetectionError`. (Per data-model §5.1 — `idle` has no extra payload.)
- `DetectionAction` — discriminated union: `{ type: 'start' }` | `{ type: 'progress'; event: ProgressEvent }` | `{ type: 'complete'; result: DetectionResult }` | `{ type: 'fail'; reason: DetectionError }` | `{ type: 'cancel' }`.
- `function transition(state: DetectionState, action: DetectionAction): DetectionState` — implements data-model §5.3 / §5.4. Reference implementation:

  ```ts
  if (action.type === 'cancel') return { kind: 'idle' };
  switch (state.kind) {
    case 'idle':
      if (action.type === 'start')
        return { kind: 'scanning', progress: { stage: 'enumerating', processed: 0, total: null } };
      return state;
    case 'scanning':
      switch (action.type) {
        case 'progress': return { kind: 'scanning', progress: action.event };
        case 'complete': return { kind: 'loaded',   result: action.result };
        case 'fail':     return { kind: 'failed',   reason: action.reason };
        default:         return state;
      }
    case 'loaded':
    case 'failed':
      if (action.type === 'start')
        return { kind: 'scanning', progress: { stage: 'enumerating', processed: 0, total: null } };
      return state;
  }
  ```

**Tests** (`test/domain/detection-state.test.ts`): exhaustive over the 4×5 grid. Twenty `it()` cases, one per cell. For "ignored" cells, assert `transition(state, action) === state` (reference equality).

**Tests must cover**:
- Every cell in the §5.3 table (20 cells).
- Ignored cells return identical reference (no allocation).
- `start` from `loaded` and `failed` allocates a fresh `{ kind: 'scanning', progress: { stage: 'enumerating', processed: 0, total: null } }` — assert `progress.total === null` and `progress.stage === 'enumerating'`.
- `progress` from `scanning` allocates a new state object (so subscribers see a change) but the inner `progress` is the action's event by reference.

**Files**:
- `src/domain/detection-state.ts` (new, ~100 lines including JSDoc).
- `test/domain/detection-state.test.ts` (new, ~200 lines for the 20-cell grid).

## Test strategy

TDD per `DIRECTIVE_034` and the charter:
1. Write the failing test first (e.g. construct a `DetectionError`, assert `reason === 'auth-token-expired'`).
2. Run the test; watch it fail (red).
3. Implement the smallest change to make it pass (green).
4. Refactor without breaking the test (refactor).

Coverage gate: 100% line + branch on `detection-errors.ts` and `detection-state.ts`. The types-only `detection-types.ts` produces no executable code; coverage tooling skips it by default (no `// istanbul ignore` needed). If coverage reports the file as 0/0, that's expected.

Architecture test (`test/architecture.test.ts`) picks up the new files automatically — no rule changes needed.

## Definition of Done

- [ ] `src/domain/detection-types.ts`, `src/domain/detection-errors.ts`, `src/domain/detection-state.ts` exist with JSDoc on every export.
- [ ] `test/domain/detection-errors.test.ts` and `test/domain/detection-state.test.ts` cover 100% line + branch.
- [ ] All 20 FSM grid cells have explicit `it()` cases.
- [ ] `npm run test:run` and `npm run typecheck` (or `tsc --noEmit`) are green.
- [ ] `test/architecture.test.ts` reports no boundary violations on the new files.
- [ ] No imports outside `src/domain/` in any new file.
- [ ] Per-WP review approves the WP per `spec-kitty.review`.
- [ ] WP transitions to `done` via the standard implement → review → done lifecycle.

## Risks

| Risk | Mitigation |
|---|---|
| Type drift between `data-model.md` and the code | Reviewer cross-checks each field; the data-model is the source of truth. |
| FSM transition cell missed in the test grid | Test file enumerates all 20 (state, action) pairs in nested `describe`/`it` blocks — `vi` will fail loud if any case is missing the expected branch. |
| Premature mutable defaults in `DetectionState.scanning.progress` | `transition` always returns fresh objects on non-ignored cells; ignored cells return state by reference. |

## Reviewer guidance

When reviewing this WP, verify:
- Every type field in [`../data-model.md`](../data-model.md) §§1, 3, 4, 5, 6 has a matching property in the implementation.
- Every reason in §6.1's reason table is present in `DetectionErrorReason`, with no extra reasons.
- The 20 FSM cells are individually tested; "ignored" cells assert reference equality (not just `===` on the kind).
- JSDoc on every export captures intent, not just shape repetition. NFR-010 requires "intent, parameters, return shape, error modes" — the data-model gives the language to use.
- No imports outside `src/domain/` in any new file (architecture test will fail on a violation; reviewer also eyeballs the import block).

## Implementation command

This WP has no dependencies, so the implement command is straightforward:

```bash
spec-kitty agent action implement WP01 --agent <name>
```

## Activity Log

- 2026-06-10T09:23:02Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=18838 – Assigned agent via action command
- 2026-06-10T09:31:20Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=18838 – Ready for review: domain types (detection-types.ts), typed error class with 7-reason taxonomy (detection-errors.ts), and 4-state FSM with exhaustive 20-cell transition grid (detection-state.ts). All 53 new tests pass; 100% line+branch coverage maintained project-wide (502 tests total).
- 2026-06-10T09:31:44Z – claude:claude-sonnet-4-6:reviewer:reviewer – shell_pid=24547 – Started review via action command
- 2026-06-10T09:33:31Z – claude:claude-sonnet-4-6:reviewer:reviewer – shell_pid=24547 – Review passed: all 5 owned files present and correct. Types match data-model §§1,3,4,5,6 exactly (RawTrack, EnrichedTrack, DuplicateGroup, DetectionResult, ProgressEvent, ScanRequest). All 7 DetectionErrorReason literals present, no extras. DetectionError class with reason/cause/context, name='DetectionError', isDetectionError uses instanceof. FSM transition function matches §5.4 reference implementation exactly; 20-cell test grid exhaustive with reference-equality assertions on ignored cells. 502 tests pass, 100% line+branch coverage project-wide, tsc --noEmit green, architecture test (82 cases) green. No imports outside src/domain/ in any new file.
- 2026-06-11T20:10:23Z – claude:claude-sonnet-4-6:reviewer:reviewer – shell_pid=24547 – Done override: Mission integrated via owner-lane-wins and fast-forward-merged to main (fddcd4d); lane/mission branches deleted, so lane ancestry cannot be verified.
