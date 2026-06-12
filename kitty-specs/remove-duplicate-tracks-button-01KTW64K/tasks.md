# Tasks — Remove Duplicate Tracks Button

**Mission**: remove-duplicate-tracks-button-01KTW64K · **Date**: 2026-06-11
**Spec**: [`spec.md`](./spec.md) · **Plan**: [`plan.md`](./plan.md) ·
**Data model**: [`data-model.md`](./data-model.md) · **Research**: [`research.md`](./research.md) ·
**Contracts**: [`contracts/`](./contracts/)

Architecture: hexagonal / ports-and-adapters (ADR-0001), import graph enforced by
`test/architecture.test.ts` (auto-picks up new files; no rule edits needed). TDD is
mandatory (`DIRECTIVE_034`): failing test first, watch it fail, then implement. 100%
line + branch coverage on every new/changed module (NFR-003). JSDoc on every export
(`DIRECTIVE_003`).

## Work-package overview

| WP | Title | Subtasks | Depends on | Est. lines |
|----|-------|----------|------------|------------|
| WP01 | Removal domain foundation — types, errors, `uid`, FSM | T001–T004 | — | ~470 |
| WP02 | Pure transforms — `computeRemoveSet` + `applyRemovalOutcome` | T005–T008 | WP01 | ~430 |
| WP03 | `RemovalExecutor` port + `FakeRemovalExecutor` | T009–T011 | WP01 | ~280 |
| WP04 | Spicetify removal adapter + `uid` capture + platform typings (live-verify) | T012–T015 | WP01, WP03 | ~520 |
| WP05 | Detection store removal actions | T016–T019 | WP01, WP02, WP03 | ~520 |
| WP06 | Removal UI — button, confirm dialog, outcome view, summary host | T020–T023 | WP01, WP05 | ~560 |
| WP07 | App wiring, row props, ADRs, README | T024–T027 | WP04, WP05, WP06 | ~360 |

**Dependency DAG / execution lanes**

```
WP01 ──┬─► WP02 ──┐
       ├─► WP03 ──┼─► WP05 ──► WP06 ──┐
       │          │                   ├─► WP07
       └─► WP04 ───────────────────────┘   (WP04 also needs WP03)
```

WP01 is the foundation (MVP enabler). WP02/WP03/WP04 can proceed in parallel once WP01
lands. WP05 needs WP01+WP02+WP03 (it drives the Fake, not the live adapter). WP06 needs
the store actions (WP05). WP07 is the final integration and needs the production adapter
(WP04), the store (WP05), and the UI (WP06).

> **Per global preference, run implementation agents one at a time** (sequential, not
> parallel fan-out), reviewing each WP before dispatching the next — even where the DAG
> permits parallelism.

---

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | Widen `RawTrack`/`EnrichedTrack` with optional `uid` (ADR-0012) | WP01 | | [D] |
| T002 | New `removal-types.ts` value types | WP01 | [D] |
| T003 | New `removal-errors.ts` taxonomy + `isRemovalError` | WP01 | [D] |
| T004 | Extend detection FSM with `RemovalState` + removal actions (ADR-0013) | WP01 | | [D] |
| T005 | `isRemovableResult` classifier (NFR-004) | WP02 | | [D] |
| T006 | `computeRemoveSet` (keep-earliest, size invariant, playlist-uid, fail-loud) | WP02 | | [D] |
| T007 | `trackRefKey` + `applyRemovalOutcome` (in-client refresh) | WP02 | | [D] |
| T008 | Boundary/edge tests for both transforms | WP02 | | [D] |
| T009 | `RemovalExecutor` port interface | WP03 | | [D] |
| T010 | `FakeRemovalExecutor` (scripted per-batch results, call recorder) | WP03 | | [D] |
| T011 | `FakeRemovalExecutor` tests | WP03 | | [D] |
| T012 | Widen `spicetify-platform.d.ts` (`remove` methods, `uid` items) | WP04 | [D] |
| T013 | Capture `uid` in `SpicetifyTracksEnumerator` | WP04 | | [D] |
| T014 | `SpicetifyRemovalExecutor` — dispatch, batching, partial failure, abort | WP04 | | [D] |
| T015 | Live-client verification (mandatory DoD) | WP04 | | [D] |
| T016 | Extend store state + inject optional `RemovalExecutor` | WP05 | |
| T017 | `requestRemoval` / `cancelRemoval` | WP05 | |
| T018 | `confirmRemoval` orchestration + concurrency lock | WP05 | |
| T019 | Store tests w/ Fake — scope, concurrency, no-auto-run, 24/25/26 | WP05 | |
| T020 | `RemoveDuplicatesButton` (gating, disable, onClick) | WP06 | |
| T021 | `RemovalConfirmDialog` (1-step + >25 2-step, copy, boundary) | WP06 | |
| T022 | `RemovalOutcomeView` (partial-failure messaging) | WP06 | [P] |
| T023 | `DetectionLoadedSummary` host (mount button/dialog/outcome by phase) | WP06 | |
| T024 | App wiring — construct + inject `SpicetifyRemovalExecutor` | WP07 | |
| T025 | Row props — pass `target`/`displayName` to summary | WP07 | |
| T026 | ADR-0012, ADR-0013, ADR-0014 | WP07 | [P] |
| T027 | README — document the Remove-duplicates action | WP07 | [P] |

---

## WP01 — Removal domain foundation (types, errors, `uid`, FSM)

**Goal**: Land the pure-data foundation every downstream WP imports — the `uid` widening,
the removal value/error types, and the extended detection FSM with its removal sub-state.
**Priority**: P0 (blocks everything). **Prompt**: [`tasks/WP01-removal-domain-foundation.md`](./tasks/WP01-removal-domain-foundation.md)
**Independent test**: `npm run test -- detection-state removal-errors` green; `tsc --noEmit`
green; architecture test clean. FSM grid exhaustive (every cell incl. ignored → reference equality).

Subtasks:

- [x] T001 Widen `RawTrack`/`EnrichedTrack` with optional `uid` (WP01)
- [x] T002 New `removal-types.ts` value types (WP01)
- [x] T003 New `removal-errors.ts` taxonomy + `isRemovalError` (WP01)
- [x] T004 Extend detection FSM with `RemovalState` + removal actions (WP01)

Dependencies: none. Risks: FSM cell omission (mitigate with exhaustive grid); the
required `removal` field on `loaded` is set inside `transition` only, so no other file
constructs it (verified — repo narrows on `.kind` and reads `.result`).

## WP02 — Pure transforms (`computeRemoveSet` + `applyRemovalOutcome`)

**Goal**: The two pure domain transforms that decide what to delete and how the row looks
afterward, plus the fail-loud classifier. **Priority**: P0. **Prompt**: [`tasks/WP02-remove-set-and-apply-outcome.md`](./tasks/WP02-remove-set-and-apply-outcome.md)
**Independent test**: `npm run test -- remove-set apply-removal-outcome` green; 100%
line/branch; boundary (group of 2 / group of N / missing uid / empty / full / partial /
all-failed / outcome-mismatch).

Subtasks:

- [x] T005 `isRemovableResult` classifier (WP02)
- [x] T006 `computeRemoveSet` (WP02)
- [x] T007 `trackRefKey` + `applyRemovalOutcome` (WP02)
- [x] T008 Boundary/edge tests for both transforms (WP02)

Dependencies: WP01. Risks: count-recompute drift (assert `removableTrackCount =
duplicateTrackCount − groups.length` after collapse).

## WP03 — `RemovalExecutor` port + `FakeRemovalExecutor`

**Goal**: Define the single mutation port and a scripted in-memory fake so the store and
UI WPs can be built and tested without a live host or the live-verification gate.
**Priority**: P0 (unblocks WP05). **Prompt**: [`tasks/WP03-removal-executor-port-and-fake.md`](./tasks/WP03-removal-executor-port-and-fake.md)
**Independent test**: `npm run test -- fake-removal-executor` green; 100% line/branch;
fake records calls (target, batch boundaries) and honors scripted ok/partial/throw.

Subtasks:

- [x] T009 `RemovalExecutor` port interface (WP03)
- [x] T010 `FakeRemovalExecutor` (WP03)
- [x] T011 `FakeRemovalExecutor` tests (WP03)

Dependencies: WP01. Risks: fake diverging from the port contract (mitigate: fake test
asserts `removed.length + failed.length === requested.length`).

## WP04 — Spicetify removal adapter + `uid` capture + platform typings (live-verify)

**Goal**: The production mutation adapter (`LibraryAPI.remove` / `PlaylistAPI.remove`,
batching, partial-failure aggregation), the enumerator change that captures playlist
`uid`, and the platform typings — gated on the mandatory live-client verification.
**Priority**: P1. **Prompt**: [`tasks/WP04-spicetify-removal-adapter.md`](./tasks/WP04-spicetify-removal-adapter.md)
**Independent test**: `npm run test -- spicetify-removal-executor spicetify-tracks-enumerator`
green; 100% line/branch; **plus** the `research.md` §5 live checks recorded in the WP
before it reaches `done`.

Subtasks:

- [x] T012 Widen `spicetify-platform.d.ts` (WP04)
- [x] T013 Capture `uid` in `SpicetifyTracksEnumerator` (WP04)
- [x] T014 `SpicetifyRemovalExecutor` (WP04)
- [x] T015 Live-client verification (mandatory DoD) (WP04)

Dependencies: WP01, WP03. Risks: host shape drift (runtime guard authoritative, ADR-0011
pattern); atomicity unknown until §5 — drives `BATCH_SIZE` + per-track fallback.

## WP05 — Detection store removal actions

**Goal**: Wire the removal sub-state into the store: `requestRemoval` / `confirmRemoval`
/ `cancelRemoval`, the >25 two-step branch, the executor call, the in-client refresh, and
the concurrency lock — all driven by an **optional** injected `RemovalExecutor`.
**Priority**: P0. **Prompt**: [`tasks/WP05-detection-store-removal-actions.md`](./tasks/WP05-detection-store-removal-actions.md)
**Independent test**: `npm run test -- detection-store` green; 100% line/branch;
single-collection scope, concurrency no-op, no-auto-run, boundary 24/25/26, partial/throw
all exercised with `FakeRemovalExecutor`.

Subtasks:

- [ ] T016 Extend store state + inject optional `RemovalExecutor` (WP05)
- [ ] T017 `requestRemoval` / `cancelRemoval` (WP05)
- [ ] T018 `confirmRemoval` orchestration + concurrency lock (WP05)
- [ ] T019 Store tests w/ Fake (WP05)

Dependencies: WP01, WP02, WP03. Risks: making `removalExecutor` required would break ~10
existing test files — it MUST be an optional second parameter (back-compat).

## WP06 — Removal UI (button, confirm dialog, outcome view, summary host)

**Goal**: The user-facing surface — the gated button, the one/two-step confirmation, the
partial-failure view, and the change to `DetectionLoadedSummary` that hosts them by
removal phase. **Priority**: P0. **Prompt**: [`tasks/WP06-removal-ui-components.md`](./tasks/WP06-removal-ui-components.md)
**Independent test**: `npm run test -- RemoveDuplicatesButton RemovalConfirmDialog
RemovalOutcomeView DetectionLoadedSummary` green; 100% line/branch; boundary 24/25/26 on
the dialog; gating per AS-1/AS-2.

Subtasks:

- [ ] T020 `RemoveDuplicatesButton` (WP06)
- [ ] T021 `RemovalConfirmDialog` (WP06)
- [ ] T022 `RemovalOutcomeView` (WP06)
- [ ] T023 `DetectionLoadedSummary` host (WP06)

Dependencies: WP01, WP05. Risks: `DetectionLoadedSummary` becomes store-aware (was pure)
— keep the new props minimal (`target`, `displayName`) and let child components read the
store like `DedupButton` does.

## WP07 — App wiring, row props, ADRs, README

**Goal**: Final integration — construct and inject the production `SpicetifyRemovalExecutor`,
thread `target`/`displayName` from the rows into the summary, write the three ADRs, and
document the action in the README. **Priority**: P1 (last). **Prompt**: [`tasks/WP07-app-wiring-adrs-readme.md`](./tasks/WP07-app-wiring-adrs-readme.md)
**Independent test**: `npm run test` (full) + `npm run typecheck` green;
`test/app.test.tsx` imports `src/app.tsx` without Spicetify globals; ADRs present; README
updated.

Subtasks:

- [ ] T024 App wiring — construct + inject `SpicetifyRemovalExecutor` (WP07)
- [ ] T025 Row props — pass `target`/`displayName` to summary (WP07)
- [ ] T026 ADR-0012, ADR-0013, ADR-0014 (WP07)
- [ ] T027 README — document the Remove-duplicates action (WP07)

Dependencies: WP04, WP05, WP06. Risks: app construction must stay side-effect-free (no
`Spicetify.*` at module load) so `test/app.test.tsx` keeps passing.

---

## MVP scope

WP01→WP02→WP03→WP05→WP06 with a wired `FakeRemovalExecutor` demonstrates the entire
in-client behavior under test (compute → confirm → execute → refresh). WP04 (live adapter)
and WP07 (production wiring) turn it into a shippable, real-library feature. The smallest
coherent first slice is **WP01**.
