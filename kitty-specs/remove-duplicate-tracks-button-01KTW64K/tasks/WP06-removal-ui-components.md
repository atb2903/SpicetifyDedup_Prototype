---
work_package_id: WP06
title: Removal UI — button, confirm dialog, outcome view, summary host
dependencies:
- WP01
- WP05
requirement_refs:
- FR-001
- FR-002
- FR-005
- FR-006
- FR-007
- FR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-11T20:52:36Z'
subtasks:
- T020
- T021
- T022
- T023
agent: "claude:opus:reviewer:reviewer"
shell_pid: "77778"
history:
- timestamp: '2026-06-11T20:52:36Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/ui/
execution_mode: code_change
owned_files:
- src/ui/RemoveDuplicatesButton.tsx
- src/ui/RemoveDuplicatesButton.module.scss
- src/ui/RemovalConfirmDialog.tsx
- src/ui/RemovalConfirmDialog.module.scss
- src/ui/RemovalOutcomeView.tsx
- src/ui/RemovalOutcomeView.module.scss
- src/ui/DetectionLoadedSummary.tsx
- src/ui/DetectionLoadedSummary.module.scss
- test/ui/RemoveDuplicatesButton.test.tsx
- test/ui/RemovalConfirmDialog.test.tsx
- test/ui/RemovalOutcomeView.test.tsx
- test/ui/DetectionLoadedSummary.test.tsx
tags: []
---

# WP06 — Removal UI (button, confirm dialog, outcome view, summary host)

## Objective

Build the user-facing removal surface, all driven by the WP05 store actions through the
`DetectionStoreContext`:

1. **`RemoveDuplicatesButton`** — gated button that calls `requestRemoval` (FR-001/FR-002/FR-012).
2. **`RemovalConfirmDialog`** — one-step + `>25` two-step confirmation naming the collection and
   exact count (FR-005/FR-006/NFR-001).
3. **`RemovalOutcomeView`** — partial-failure messaging (FR-010/AS-8).
4. **`DetectionLoadedSummary`** (changed) — host the button/dialog/outcome by removal phase.

happy-dom + @testing-library/react; 100% line+branch on every component; `tsc --noEmit` green.

## Context

The UI reads removal phase from the store like `DedupButton` reads scan state. Read first:

- [`../contracts/removal-confirmation-ui.md`](../contracts/removal-confirmation-ui.md) — the
  authoritative per-component contract (props, visibility, copy, affordances, boundaries).
- [`../data-model.md`](../data-model.md) §8 (UI shapes).
- `src/ui/DedupButton.tsx` (existing) — the store-reading pattern (`useDetectionStore(selector)`,
  `aria-label`, disabled-from-store). Mirror it for `RemoveDuplicatesButton`.
- `src/ui/DetectionLoadedSummary.tsx` (existing) — the file you change in T023; currently takes
  only `{ result }`. Note it presently declares **local** copies of the result types — when WP01
  is merged you may import the canonical `DetectionResult` from `src/domain/detection-types`;
  keep it compiling either way.
- `src/store/DetectionStoreContext.tsx` (existing) — `useDetectionStore` hook; the store actions
  `requestRemoval`/`confirmRemoval`/`cancelRemoval` (WP05) and `removal` phase on the `loaded` row.
- `src/domain/removal-types.ts` (WP01) — `RemovalTarget`, `RemovalOutcome`.
- Existing `*.module.scss` + their `test/ui/*.test.tsx` for the SCSS-module + RTL idiom and the
  `_tokens.module.scss` design tokens.

**Architectural constraint** (ADR-0001): `src/ui/` imports `src/domain/` + the store context
only — **no adapters, no ports**. Components reach the executor only indirectly via the store.

**Ownership note (keep WP06 independently green):** `DetectionLoadedSummary` gains **optional**
new props (`collectionKey?`, `target?`, `displayName?`). The existing row call sites
(`PlaylistRow`/`LikedSongsRow`) are **owned by WP07** and still pass only `{ result }`; making the
new props optional keeps those callers compiling until WP07 threads them. When the new props are
absent, the summary renders exactly as today (no removal UI). WP07/T025 supplies them.

## Branch strategy

Planning base & merge target: **`main`**. Workspace/branch assigned by
`spec-kitty agent action implement WP06 --agent <name>` from `lanes.json`. Depends on **WP01**,
**WP05**.

## Subtasks

### T020 — `RemoveDuplicatesButton` (`RemoveDuplicatesButton.tsx` + `.module.scss`, NEW)

**Purpose**: The gated entry point (contract §RemoveDuplicatesButton).

**Props**: `{ collectionKey: string; target: RemovalTarget; displayName: string }`.

**Behavior**:
- Read the row: `const row = useDetectionStore(s => s.rows[collectionKey])`.
- **Visibility (FR-001/FR-002, AS-1/AS-2)**: render the button **only** when
  `row?.kind === 'loaded'`, `row.result.removableTrackCount > 0`, and
  `row.removal.phase ∈ {'none','partial'}`. Otherwise render `null` (hidden when
  unscanned/scanning/failed, when count is 0, and while confirming/removing).
- **Disabled (FR-012)**: if you choose to render-but-disable while
  `phase ∈ {confirming,confirming2,removing}` instead of unmounting, wire `disabled`
  accordingly — but the contract's primary rule is *not shown* during confirming/removing, so
  returning `null` for those phases is the cleaner default. Document the choice.
- **onClick**: `useDetectionStore(s => s.requestRemoval)` then `requestRemoval(collectionKey)` —
  FSM `none → confirming`. **No host/executor call here.**
- **Label**: `Remove {removableTrackCount} duplicate{s}` (pluralize). `aria-label` should name
  the collection, e.g. `Remove duplicates from {displayName}` (NFR-002 parity with `DedupButton`).

**Tests** (`RemoveDuplicatesButton.test.tsx`): render under a `DetectionStoreProvider` with a
seeded store (build a real store with a stub scanner + `FakeRemovalExecutor`, or a minimal store
stub):
- Not rendered when row is idle/scanning/failed/absent.
- Not rendered when `removableTrackCount === 0`.
- Rendered when `loaded` + count > 0 + phase `none`; rendered in phase `partial`.
- Not rendered (or disabled) in phase `confirming`/`confirming2`/`removing`.
- Click → `requestRemoval(collectionKey)` called once with the right key.
- Label shows the exact count; singular vs plural at count 1.
- 100% line+branch.

### T021 — `RemovalConfirmDialog` (`RemovalConfirmDialog.tsx` + `.module.scss`, NEW)

**Purpose**: The confirmation(s) (contract §RemovalConfirmDialog; FR-005/FR-006/FR-007/NFR-001).

**Props**: `{ collectionName: string; count: number; step: 1 | 2; onConfirm: () => void;
onCancel: () => void }`.

**Behavior**:
- **Copy (FR-005/NFR-001)**: step 1 states the target collection name and the **exact** count and
  that the earliest copy of each group is kept — e.g. *"Remove {count} tracks from
  '{collectionName}'? The earliest copy of each duplicate is kept."* Step 2 is an explicit bulk
  reconfirmation naming the count again (only mounted when `count > 25`, FR-006).
- **Affordances (NFR-001)**: distinct `Cancel` and `Remove` controls; the destructive `Remove`
  must **not** be the auto-focused single-keypress default (no removal from one accidental
  activation) — e.g. focus `Cancel` by default, or do not autofocus `Remove`. Document and test.
- `onConfirm` → wired by the host to `store.confirmRemoval(collectionKey)`; `onCancel` → wired to
  `store.cancelRemoval(collectionKey)` (FR-007 — nothing removed).
- Pluralize "track(s)"; render the count verbatim.

**Tests** (`RemovalConfirmDialog.test.tsx`) — pure props (no store needed here; the host wires
callbacks):
- Step 1 copy includes `collectionName` and the exact `count`.
- Step 2 copy is the bulk reconfirmation with the count.
- `Cancel` click → `onCancel` once; `Remove` click → `onConfirm` once.
- `Remove` is not the autofocused element (assert `document.activeElement` is not the Remove
  button on mount, or that Cancel is focused) — the NFR-001 accidental-activation guard.
- Boundary copy at `count = 24, 25, 26` renders the exact number.
- 100% line+branch.

### T022 — `RemovalOutcomeView` (`RemovalOutcomeView.tsx` + `.module.scss`, NEW) [P]

**Purpose**: Partial-failure messaging (contract §RemovalOutcomeView; FR-010/AS-8).

**Props**: `{ outcome: RemovalOutcome }`.

**Behavior**:
- States that the removal partially failed and how many did **not** complete
  (`outcome.failed.length`). The still-present duplicates remain rendered by the summary over the
  updated `result` (failed copies were retained by `applyRemovalOutcome`) — this view is just the
  message. On full success there is **no** outcome view (the host only mounts it in phase
  `partial`).
- Pluralize the failed count; optionally summarize a reason.

**Tests** (`RemovalOutcomeView.test.tsx`):
- With an outcome containing N failures → message names N and conveys partial failure.
- Singular vs plural at 1 failure.
- 100% line+branch.

### T023 — `DetectionLoadedSummary` host (`DetectionLoadedSummary.tsx`, CHANGED)

**Purpose**: Mount the button/dialog/outcome under the existing summary, by removal phase, while
staying backward-compatible with the current `{ result }`-only callers (see Ownership note).

**Changes**:
- Widen props to `{ result; collectionKey?; target?; displayName? }` (the three new ones
  **optional**). When `collectionKey`/`target`/`displayName` are all present **and** the store
  row is `loaded`, render the removal surface; otherwise render exactly as today.
- Read the removal phase from the store:
  `const phase = useDetectionStore(s => { const r = s.rows[collectionKey]; return r?.kind ===
  'loaded' ? r.removal.phase : 'none'; })` (guard `collectionKey` undefined). Note: this makes
  the summary store-aware — that is acceptable per the contract; keep the new wiring minimal.
- Render by phase:
  - always render the existing summary copy (unchanged).
  - `RemoveDuplicatesButton` (it self-gates on visibility; mount it when the new props exist).
  - `phase === 'confirming'` → `RemovalConfirmDialog step={1}` with
    `count = result.removableTrackCount`, `onConfirm = () => confirmRemoval(collectionKey)`,
    `onCancel = () => cancelRemoval(collectionKey)`.
  - `phase === 'confirming2'` → `RemovalConfirmDialog step={2}` (same wiring).
  - `phase === 'removing'` → a non-blocking progress indicator (NFR-002) — indeterminate is fine
    when no `RemovalProgressEvent` is present; show `removedSoFar/total` when it is.
  - `phase === 'partial'` → `RemovalOutcomeView outcome={row.removal.outcome}` (and the button is
    visible again for retry).
- Derive `collectionName` for the dialog from `displayName`.
- Keep the component's existing pure summary path intact for the no-removal-props case.

**Tests** (`DetectionLoadedSummary.test.tsx`, extend existing): wrap in a `DetectionStoreProvider`
with a seeded store:
- **Back-compat**: rendering with only `{ result }` (no removal props) behaves exactly as the
  existing tests expect (existing assertions still pass).
- With removal props + `loaded` + count > 0 + phase `none` → button shown, no dialog.
- Phase `confirming` → step-1 dialog shown; confirm → `confirmRemoval` called; cancel →
  `cancelRemoval` called.
- Phase `confirming2` → step-2 dialog.
- Phase `removing` → progress indicator; button hidden.
- Phase `partial` → outcome view shown; button shown again (retry).
- **Boundary 24/25/26**: drive the store through `requestRemoval` then `confirmRemoval` and
  assert that 24/25 reach `removing` after one confirm while 26 shows the step-2 dialog before
  removing (the count→step mapping is the store's, exercised here through the UI).
- 100% line+branch.

**Files**: `DetectionLoadedSummary.tsx` (changed); `DetectionLoadedSummary.module.scss` (changed
if styling the new region); `DetectionLoadedSummary.test.tsx` (changed).

## Test strategy

TDD (`DIRECTIVE_034`): failing RTL test first (e.g. button hidden at count 0), watch it fail,
implement. happy-dom + @testing-library/react + userEvent. Prefer a **real** store
(`createDetectionStore(stubScanner, new FakeRemovalExecutor(...))`) inside a
`DetectionStoreProvider` over hand-mocked hooks, so the UI is exercised through the genuine store
surface (`DIRECTIVE_036`). Coverage gate: 100% line+branch on all four components. The
architecture test auto-checks the new files import no adapters/ports.

## Definition of Done

- [ ] `RemoveDuplicatesButton` gates on `loaded && removableTrackCount > 0 && phase ∈
      {none,partial}`; click → `requestRemoval`; label shows the exact count; no executor call.
- [ ] `RemovalConfirmDialog` names the collection + exact count, has distinct Cancel/Remove,
      `Remove` is not the accidental single-keypress default; step 2 only for `>25`.
- [ ] `RemovalOutcomeView` surfaces partial failure with the failed count.
- [ ] `DetectionLoadedSummary` hosts the surface by phase, **new props optional** (back-compat
      preserved), existing summary path unchanged.
- [ ] 24/25/26 boundary exercised through the UI; full RTL coverage of every phase.
- [ ] 100% line+branch on all four components; `npm run test:run` + `tsc --noEmit` green;
      architecture test clean; no adapter/port imports.

## Risks

| Risk | Mitigation |
|---|---|
| `DetectionLoadedSummary` becoming store-aware breaks existing pure-prop tests | New props optional + a back-compat test renders with `{ result }` only and keeps the old assertions. |
| Destructive `Remove` auto-focused → accidental one-keypress deletion (NFR-001) | Focus `Cancel` / don't autofocus `Remove`; assert `activeElement` in the dialog test. |
| Button visible during removing → double-trigger | Self-gate on phase; `removing`/`confirming` hide the button; FR-012 also enforced in store/FSM. |
| Hand-mocking the store hides real wiring | Use a real store + `FakeRemovalExecutor` under the provider. |

## Reviewer guidance

- Check each component against `contracts/removal-confirmation-ui.md`.
- Confirm the back-compat path: `DetectionLoadedSummary` with only `{ result }` is unchanged.
- Confirm the NFR-001 affordance (no accidental single-activation) is tested, not just coded.
- Confirm the button never calls the executor directly and the UI imports no adapters/ports.

## Implementation command

```bash
spec-kitty agent action implement WP06 --agent <name>
```

## Activity Log
- 2026-06-12T20:11:31Z – claude:opus:implementer:implementer – shell_pid=68964 – Started implementation via action command
- 2026-06-12T20:22:30Z – claude:opus:implementer:implementer – shell_pid=68964 – Ready for review: removal UI (button, confirm dialog, outcome view, summary host); 1081 tests green, 100% line+branch on all four components, tsc clean
- 2026-06-12T20:22:58Z – claude:opus:reviewer:reviewer – shell_pid=77778 – Started review via action command
