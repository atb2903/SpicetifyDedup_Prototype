---
work_package_id: WP05
title: LoadedView + EmptyView integration coverage
dependencies:
- WP03
- WP04
requirement_refs:
- FR-002
- FR-005
- FR-006
- NFR-004
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T019
- T020
- T021
- T022
- T023
- T024
agent: "claude:opus-4.7:reviewer:reviewer"
shell_pid: "466380"
history:
- date: '2026-06-05'
  note: Drafted by /spec-kitty.tasks.
authoritative_surface: test/ui/LoadedView.test.tsx
execution_mode: code_change
mission_id: 01KTC3GY1VM87DPV0SEDQS24NE
mission_slug: dedup-button-per-playlist-row-01KTC3GY
owned_files:
- test/ui/LoadedView.test.tsx
- test/ui/EmptyView.test.tsx
priority: P1
tags: []
---

# WP05 — LoadedView + EmptyView integration coverage

## Objective

Cement the cross-row integration assertions that pin the spec's success criteria at the view level: boundary coverage on list length (C-005), duplicate-name fixture for SC-001, no-ownership-filter fixture for FR-006, FR-005 empty-library assertion, and the 1001-row scale assertion for FR-002. After this WP, every spec FR/NFR/SC has at least one passing automated test.

## Context

- **Spec**: FR-002 (1-to-1 binding), FR-005 (empty library, no buttons, no logs), FR-006 (no ownership filtering), SC-001 (5-row duplicate-name), SC-002 (empty fixture), C-005 (list-length boundary).
- **Plan**: §Phase 1 Design (the test map at §Test coverage map maps each FR/NFR/SC/C to specific test files; this WP owns the LoadedView and EmptyView entries).
- **Quickstart**: §1 (automated verification table).
- **Existing files**: `test/ui/LoadedView.test.tsx` already has a 1001-row scale test at lines 152-169 and a variety of single-row / 3-row fixtures. `test/ui/EmptyView.test.tsx` covers the empty-load FSM cell.
- **No source-code changes** in this WP. It is a tests-only consolidation.

## Branch strategy

- Planning/base branch: `main`.
- Merge target: `main`.
- Lane base computed by `finalize-tasks` after BOTH WP03 and WP04 merge. This WP needs both rows to render buttons.

## Implementation command

```bash
spec-kitty agent action implement WP05 --agent <name>
```

## Detailed guidance per subtask

### Subtask T019 — Boundary coverage on list length

**Purpose**: C-005 — explicit tests for 0 playlists (zero buttons), 1 playlist (one button), and N≥3 playlists with separate assertions on first / middle / last rows.

**Steps**:

1. In `test/ui/LoadedView.test.tsx`, add a new `describe('LoadedView — Dedup button list-length boundary (WP05)', () => { ... })` block. Set up `vi.spyOn(console, 'log').mockImplementation(() => {})` in `beforeEach`, restore in `afterEach`.
2. Three tests:
   - **(a) 0 playlists, 0 buttons**: render `LoadedView` with a fixture yielding 0 collections (or whatever the existing FSM-state representation calls for — match the pattern from existing tests). Assert `queryAllByRole('button', { name: /^Dedup / })` returns `[]`. Note: in normal flow `LoadedView` is gated on a non-empty load; this assertion documents the bound at the view-component level, complementing T023.
   - **(b) 1 row → 1 button**: render with a fixture yielding just the Liked Songs row (no playlists). Assert `getAllByRole('button', { name: /^Dedup / })` has length 1, and the accessible name matches `/^Dedup Liked Songs$/`. Click it; assert `console.log` was called once with `[Dedup] clicked: Liked Songs (spotify:collection:tracks)`.
   - **(c) ≥3 rows, first/middle/last assertions**: fixture = 1 Liked Songs + 3 playlists (`{ displayName: 'Alpha', key: 'spotify:playlist:1' }`, `{ displayName: 'Bravo', key: 'spotify:playlist:2' }`, `{ displayName: 'Charlie', key: 'spotify:playlist:3' }`). Assert `getAllByRole('button', { name: /^Dedup / })` returns 4 elements. Click index 0 (Liked Songs) → assert the next captured `console.log` call matches `[Dedup] clicked: Liked Songs (spotify:collection:tracks)`. Click index 2 (middle — Bravo) → matches `[Dedup] clicked: Bravo (spotify:playlist:2)`. Click index 3 (last — Charlie) → matches `[Dedup] clicked: Charlie (spotify:playlist:3)`. Use `mockClear()` between assertions or `expect(spy).toHaveBeenNthCalledWith(N, ...)` to keep the assertion explicit.

**Files**:
- `test/ui/LoadedView.test.tsx` (modified — new `describe` block).

**Validation**:
- [ ] All three new tests green.
- [ ] Existing tests in the file still pass.

### Subtask T020 — Duplicate-name fixture (SC-001)

**Purpose**: Confirm that two playlists sharing the same `displayName` each log their own `key` when clicked. The spec's SC-001 is the load-bearing wiring-proof case.

**Steps**:

1. In the same `describe` (or a new sibling `describe('LoadedView — Dedup button SC-001 duplicate names', ...)`), add a single test:
   ```ts
   it('a 5-row fixture with two playlists sharing displayName logs distinct URIs per row', () => {
     // 1 Liked Songs + 4 playlists; playlists 2 and 4 share displayName 'Workout'.
     const fixture = [
       { kind: 'liked-songs', key: 'liked-songs', ... },
       { kind: 'playlist', key: 'spotify:playlist:p1', displayName: 'Morning Mix', ... },
       { kind: 'playlist', key: 'spotify:playlist:p2', displayName: 'Workout', ... },
       { kind: 'playlist', key: 'spotify:playlist:p3', displayName: 'Roadtrip', ... },
       { kind: 'playlist', key: 'spotify:playlist:p4', displayName: 'Workout', ... },
     ];
     render(<LoadedView ... fixture={fixture} />);
     const buttons = screen.getAllByRole('button', { name: /^Dedup / });
     expect(buttons).toHaveLength(5);
     // Click in row order. Assert each captured line matches the clicked row's key.
     buttons.forEach((btn, idx) => {
       (console.log as ReturnType<typeof vi.spyOn>).mockClear();
       fireEvent.click(btn);
       expect(console.log).toHaveBeenCalledTimes(1);
       expect(console.log).toHaveBeenCalledWith(`[Dedup] clicked: ${fixture[idx].displayName ?? 'Liked Songs'} (${fixture[idx].uri ?? fixture[idx].key === 'liked-songs' ? 'spotify:collection:tracks' : fixture[idx].key})`);
     });
   });
   ```
2. Use whatever fixture-construction helpers the file already provides; the example above is illustrative — match the existing patterns.
3. Anchor the assertion on the row's stable `key` so the duplicate-name case can't accidentally hash to the same log line.

**Files**:
- `test/ui/LoadedView.test.tsx` (modified — single test addition).

**Validation**:
- [ ] Test passes; each of the 5 clicks logs the correct URI.
- [ ] Duplicate-name rows log different URIs.

### Subtask T021 — No-ownership-filter fixture (FR-006)

**Purpose**: Confirm that ownership variants (`self`, `other`, `system-library`) all receive a button. The spec's FR-006 explicitly forbids ownership filtering.

**Steps**:

1. Add a test in `LoadedView.test.tsx`:
   ```ts
   it('renders a Dedup button regardless of owner kind (self / other / system-library)', () => {
     const fixture = [
       { kind: 'playlist', key: 'spotify:playlist:s', owner: { kind: 'self' }, displayName: 'My Mix', ... },
       { kind: 'playlist', key: 'spotify:playlist:o', owner: { kind: 'other', displayName: 'Alex' }, displayName: 'Their Mix', ... },
       { kind: 'playlist', key: 'spotify:playlist:sl', owner: { kind: 'system-library' }, displayName: 'Discover Weekly', ... },
     ];
     render(<LoadedView ... fixture={fixture} />);
     expect(screen.getAllByRole('button', { name: /^Dedup / })).toHaveLength(3);
   });
   ```
2. Match the project's existing `owner` type shape — read `src/domain/view-models.ts` for the `OwnerIdentity` discriminated union and use the same kinds.

**Files**:
- `test/ui/LoadedView.test.tsx` (modified — single test addition).

**Validation**:
- [ ] All 3 ownership variants render a Dedup button.
- [ ] No filtering anywhere in the rendered button set.

### Subtask T022 — Extend 1001-row scale test

**Purpose**: FR-002 at scale. The existing 1001-row test at `test/ui/LoadedView.test.tsx:152-169` already validates that the render path handles 1001 rows. Add a single assertion that 1001 Dedup buttons render.

**Steps**:

1. Open `test/ui/LoadedView.test.tsx`. Locate the existing 1001-row scale test (lines 152-169 per plan §Source pointers).
2. Inside the same test (after the existing assertions), add:
   ```ts
   const dedupButtons = screen.getAllByRole('button', { name: /^Dedup / });
   expect(dedupButtons).toHaveLength(1001);
   ```
3. Do NOT change any existing assertion in the scale test. Do NOT split the test.

**Files**:
- `test/ui/LoadedView.test.tsx` (modified — single assertion added to the existing scale test).

**Validation**:
- [ ] Existing scale test passes with the new assertion.
- [ ] Total test count for the file increases by exactly the count of new tests in T019–T022 (the 1001-row test is NOT counted as new — only modified).

### Subtask T023 — Add/verify `EmptyView.test.tsx` no-Dedup-button assertion (FR-005)

**Purpose**: Belt-and-suspenders FR-005 guard at the empty-state FSM cell. `LoadedView` is gated on a non-empty load by the FSM, but `EmptyView` is where the empty-library code path lives.

**Steps**:

1. Open `test/ui/EmptyView.test.tsx`. Read the existing test structure.
2. Add a test:
   ```ts
   it('renders no Dedup buttons in the empty state (FR-005)', () => {
     render(<EmptyView ... />);
     expect(screen.queryAllByRole('button', { name: /^Dedup / })).toHaveLength(0);
   });
   ```
3. If a near-identical assertion already exists, leave the file untouched and document in the WP commit message which test already covers FR-005.

**Files**:
- `test/ui/EmptyView.test.tsx` (modified — single test addition, or no change if already covered).

**Validation**:
- [ ] FR-005 guard exists in `EmptyView.test.tsx` (whether added by this WP or pre-existing).
- [ ] Test passes.

### Subtask T024 — Run full suite + coverage; confirm 100% line/branch

**Purpose**: Final gate. NFR-004 / SC-004 — confirm the entire surface stays at 100% line/branch.

**Steps**:

1. `npm run test:run` — green across every test file. Capture the suite summary.
2. `npm run test:coverage` — capture the coverage report (or its summary table). Confirm:
   - `src/ui/dedup-click-log.ts`: 100/100/100/100.
   - `src/ui/DedupButton.tsx`: 100/100/100/100.
   - `src/ui/DedupButton.module.scss`: N/A (SCSS isn't typically coverage-reported).
   - `src/ui/PlaylistRow.tsx`: 100/100/100/100 (changed lines fully covered).
   - `src/ui/LikedSongsRow.tsx`: 100/100/100/100 (changed lines fully covered).
3. If any file's coverage dipped, identify the uncovered line and add a test. Do NOT lower thresholds.
4. Capture the coverage summary into the WP commit message.

**Files**:
- None (this subtask is verification, not file modification).

**Validation**:
- [ ] `npm run test:run` green.
- [ ] `npm run test:coverage` confirms 100/100 on every new/modified source file.
- [ ] No threshold lowered.

## Definition of Done

- [ ] `test/ui/LoadedView.test.tsx` contains the new `describe` block(s) covering boundary (0/1/≥3), SC-001 duplicate-name, FR-006 ownership, FR-002 scale (1001 buttons), all green.
- [ ] `test/ui/EmptyView.test.tsx` contains an FR-005 guard (added or pre-existing).
- [ ] `npm run test:run` green across the full suite.
- [ ] `npm run test:coverage` confirms 100/100 line/branch on `src/ui/dedup-click-log.ts`, `src/ui/DedupButton.tsx`, `src/ui/PlaylistRow.tsx`, `src/ui/LikedSongsRow.tsx`.
- [ ] No threshold in `vitest.config.ts` was lowered.
- [ ] No new files outside `test/ui/`.
- [ ] WP committed inside the lane worktree.

## Risks

- **Brittle row-ordering assumptions in the duplicate-name test**: clicking buttons by index works ONLY if the fixture order matches the render order. Use `getAllByRole` returns and zip with the same fixture array; do NOT rely on text-based lookup, which would be ambiguous for duplicates.
- **1001-row scale test timeout**: the new `getAllByRole` call walks the DOM; on 1001 rows it adds a small amount of work. If the existing test's timeout is tight, the new assertion may push it over. Symptom: a real perf regression — raise as a finding for the reviewer instead of extending the timeout.
- **Fixture-shape mismatch**: the example fixtures above are illustrative. Read the existing test file for the project's `CollectionViewModel` fixture factory and use it directly.
- **Test runner picking up coverage on the OLD probe**: if WP02 left any probe artefact behind, it would distort coverage. Confirm `DedupButton.test.tsx` contains the production tests only.

## Reviewer guidance

- Confirm new test blocks are scoped under clearly-named `describe` blocks referencing the spec IDs (e.g. "SC-001 duplicate names").
- Confirm the duplicate-name test logs distinct URIs for each of the 5 rows.
- Confirm the 1001-row test gained exactly one new assertion.
- Confirm `EmptyView.test.tsx` either gained the FR-005 guard or the existing equivalent is documented in the commit.
- Confirm coverage on every new/modified source file is 100/100.

## WHEN DONE

```bash
spec-kitty agent action implement-done WP05 --agent <name> --mission dedup-button-per-playlist-row-01KTC3GY
```

## Activity Log

- 2026-06-06T11:15:35Z – claude:opus-4.7:implementer:implementer – shell_pid=462822 – Started implementation via action command
- 2026-06-06T11:21:36Z – claude:opus-4.7:implementer:implementer – shell_pid=462822 – Ready for review: integration coverage (FR-002 FR-005 FR-006 SC-001 boundary), coverage 100/100 across changed UI files
- 2026-06-06T11:22:22Z – claude:opus-4.7:reviewer:reviewer – shell_pid=466380 – Started review via action command
- 2026-06-06T11:24:40Z – claude:opus-4.7:reviewer:reviewer – shell_pid=466380 – Review passed: integration coverage tests pin FR-002/FR-005/FR-006/SC-001/C-005; 23 files / 431 tests green; 100/100/100/100 coverage on dedup-click-log.ts, DedupButton.tsx, PlaylistRow.tsx, LikedSongsRow.tsx; tsc clean; diff scoped to test/ui/LoadedView.test.tsx only; EmptyView.test.tsx left untouched (existing line 27 queryByRole('button') assertion is strict superset of FR-005 anchor).
- 2026-06-06T11:56:33Z – claude:opus-4.7:reviewer:reviewer – shell_pid=466380 – Done override: Mission merged at commit 19fcd0e (squash); auto-transition did not fire
