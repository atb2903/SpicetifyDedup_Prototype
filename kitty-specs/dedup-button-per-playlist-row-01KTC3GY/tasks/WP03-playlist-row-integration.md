---
work_package_id: WP03
title: PlaylistRow mounts DedupButton
dependencies:
- WP02
requirement_refs:
- FR-001
- NFR-002
- NFR-003
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T011
- T012
- T013
- T014
agent: "claude:opus-4.7:reviewer:reviewer"
shell_pid: "457458"
history:
- date: '2026-06-05'
  note: Drafted by /spec-kitty.tasks.
authoritative_surface: src/ui/PlaylistRow.tsx
execution_mode: code_change
mission_id: 01KTC3GY1VM87DPV0SEDQS24NE
mission_slug: dedup-button-per-playlist-row-01KTC3GY
owned_files:
- src/ui/PlaylistRow.tsx
- src/ui/PlaylistRow.module.scss
- test/ui/PlaylistRow.test.tsx
priority: P2
tags: []
---

# WP03 — PlaylistRow mounts DedupButton

## Objective

Mount `<DedupButton playlistName={row.displayName} playlistUri={row.key} />` at the trailing edge of every `PlaylistRow`. Extend the row's CSS grid from 3 columns to 4 columns (`48px 1fr auto auto`). Add per-row assertions covering FR-001 (button renders), NFR-002 (accessible name), and NFR-003 (existing fields not truncated). Tests RED first per C-004.

## Context

- **Spec**: FR-001 (button per row), FR-002 (1-to-1 binding at the row level), FR-004 (correct binding), NFR-002 (accessible name `Dedup <name>`), NFR-003 (layout non-regression).
- **Plan**: §Phase 1 Design (`src/ui/PlaylistRow.tsx` / `PlaylistRow.module.scss` modifications), §Test coverage map.
- **Research**: Decision 3 (button receives `row.displayName` and `row.key`), Decision 4 (grid extension).
- **Data model**: §3 (`PlaylistRowProps` unchanged), §6 (grid change).
- **Existing file context**: `src/ui/PlaylistRow.tsx` is a presentational `<li>` that renders cover / text / count in a 3-column grid; this WP appends a `<DedupButton>` as the fourth child. `src/ui/PlaylistRow.module.scss` defines the grid at `.row { grid-template-columns: 48px 1fr auto; ... }`.
- **Architectural rule**: `src/ui/` ↔ `src/ui/` import permitted. `DedupButton` is in `src/ui/`. No new architecture-test concerns.

## Branch strategy

- Planning/base branch: `main`.
- Merge target: `main`.
- Lane base computed by `finalize-tasks` after WP02 merges. WP03 and WP04 share a parallel cohort — disjoint file ownership.

## Implementation command

```bash
spec-kitty agent action implement WP03 --agent <name>
```

## Detailed guidance per subtask

### Subtask T011 — Write failing assertions in `PlaylistRow.test.tsx`

**Purpose**: TDD RED step. Add per-row assertions for the new button without disturbing existing assertions (which already cover cover-rendering, owner labelling, count formatting).

**Steps**:

1. Open `test/ui/PlaylistRow.test.tsx`. Read the existing test structure to learn the project's helper patterns (fixture factories, render helpers).
2. Add a new `describe('PlaylistRow — Dedup button (WP03)', () => { ... })` block. Set up `vi.spyOn(console, 'log')` with `mockImplementation(() => {})` in `beforeEach`, restore in `afterEach`.
3. Tests:
   - **(a)** `it('renders a Dedup button on every playlist row', ...)` — render with a single playlist fixture (`displayName: 'My Playlist'`, `key: 'spotify:playlist:abc'`). Assert `getByRole('button', { name: /^Dedup My Playlist$/ })` resolves. (FR-001.)
   - **(b)** `it('binds the button to the row's display name and key (URI)', ...)` — same render. Click the button. Assert `console.log` was called exactly once with `[Dedup] clicked: My Playlist (spotify:playlist:abc)`. (FR-002, FR-004.)
   - **(c)** `it('does not truncate the playlist name, owner label, or track count when the button is present', ...)` — render with the existing long-name / multi-track fixture used elsewhere in this file. Assert (i) the row's name text node is in the document and equals the full display name, (ii) the owner label is in the document, (iii) the formatted track count (`X tracks` or `1 track`) is in the document. (NFR-003.)
   - **(d)** `it('keeps the data-row-kind="playlist" routing attribute intact', ...)` — render any playlist fixture. Assert the `<li>` carries `data-row-kind="playlist"` (existing behaviour; new button must not break it). Probably already covered by an existing test; if so, skip and document.
4. Save. Run `npm run test:run -- test/ui/PlaylistRow.test.tsx`. The new tests should fail (no button rendered). RED confirmed.

**Files**:
- `test/ui/PlaylistRow.test.tsx` (modified — only the new `describe` block is added; existing tests untouched).

**Validation**:
- [ ] New tests added in their own `describe` block.
- [ ] All new tests fail with "no element with role 'button'" or equivalent.
- [ ] Existing tests in this file still pass (no regressions).

### Subtask T012 — Update `src/ui/PlaylistRow.tsx` to mount the button

**Purpose**: TDD GREEN step. Add the `<DedupButton>` import and render it as the fourth grid cell.

**Steps**:

1. At the top of `src/ui/PlaylistRow.tsx`, add: `import { DedupButton } from './DedupButton';`.
2. In the JSX, after the `<span className={styles.count}>...</span>` line, add:
   ```tsx
   <DedupButton playlistName={row.displayName} playlistUri={row.key} />
   ```
3. Extend the existing JSDoc on `PlaylistRow` with one line acknowledging the trailing Dedup button (e.g. "Mounts a `<DedupButton>` in the trailing grid cell for per-row dedup affordance — see ADR-0006.").
4. Do NOT change `PlaylistRowProps`. The row already has `row.displayName` and `row.key`.
5. Do NOT add memoisation. Primitive props on `<DedupButton>` keep re-renders proportional.

**Files**:
- `src/ui/PlaylistRow.tsx` (modified — 2-3 added lines + JSDoc tweak).

**Validation**:
- [ ] T011 tests pass.
- [ ] Existing tests in `PlaylistRow.test.tsx` still pass.
- [ ] `npm run typecheck` passes.
- [ ] No changes to `PlaylistRowProps` shape.

### Subtask T013 — Update `src/ui/PlaylistRow.module.scss` grid

**Purpose**: Extend the row's CSS grid to a fourth column so the Dedup button sits at the trailing edge without breaking the existing layout.

**Steps**:

1. In `src/ui/PlaylistRow.module.scss`, find the `.row { ... }` block (lines 15-29 in the current file).
2. Change `grid-template-columns: 48px 1fr auto;` to `grid-template-columns: 48px 1fr auto auto;` — that is the ONLY rule change.
3. Append a one-line update to the comment block at the top of the file noting that the fourth column hosts the Dedup button (WP03).
4. Do NOT change `gap`, `padding`, `align-items`, or any non-`.row` selector.

**Files**:
- `src/ui/PlaylistRow.module.scss` (modified — single `grid-template-columns` value change + comment).

**Validation**:
- [ ] Diff shows only the `grid-template-columns` value change and the comment update.
- [ ] No other selectors modified.

### Subtask T014 — Verify PlaylistRow tests green; coverage 100% on touched ranges

**Purpose**: Lock in NFR-004 / SC-004 coverage on the modified component.

**Steps**:

1. `npm run test:run -- test/ui/PlaylistRow.test.tsx` — all tests green.
2. `npm run test:run` — full suite green (no regressions to `LoadedView.test.tsx`, `LikedSongsRow.test.tsx`, or other files).
3. `npm run test:coverage` — confirm `src/ui/PlaylistRow.tsx` reports 100% line / 100% branch. The new `<DedupButton>` line is exercised by T011 (b).
4. Capture the coverage row into the WP commit message.

**Validation**:
- [ ] `src/ui/PlaylistRow.tsx`: 100/100/100/100 in coverage.
- [ ] Full test suite green.

## Definition of Done

- [ ] `src/ui/PlaylistRow.tsx` mounts `<DedupButton>` with `row.displayName` and `row.key`.
- [ ] `src/ui/PlaylistRow.module.scss` grid is `48px 1fr auto auto`.
- [ ] `test/ui/PlaylistRow.test.tsx` has the new `describe('PlaylistRow — Dedup button (WP03)', ...)` block with the 3-4 assertions described above, all green.
- [ ] No regressions in any other test file.
- [ ] `npm run test:coverage` reports 100/100 on `src/ui/PlaylistRow.tsx`.
- [ ] `npm run typecheck` and architecture test both pass.
- [ ] WP committed inside the lane worktree.

## Risks

- **Off-by-one row-ordering assumption**: tests that locate the button by `getAllByRole('button', { name: /^Dedup / })[N]` assume the rendering order matches the fixture order. The existing `PlaylistRow` rendering is deterministic; this is safe.
- **`row.key` ambiguity**: `CollectionViewModel.key` is `'liked-songs'` for the synthetic row but `row.uri` for playlist rows. `PlaylistRow` is dispatched only for `kind === 'playlist'` by `LoadedView`, so `row.key` is always a URI here. If a future regression routes a Liked Songs row through `PlaylistRow`, the button would log a non-URI key — but the existing `data-row-kind` test catches the routing regression long before this matters. Out of scope.
- **CSS grid regression at narrow widths**: NFR-003 only requires no truncation at the existing test viewport; happy-dom doesn't simulate viewport sizing. Live verification in WP06 confirms visual correctness in the real client.

## Reviewer guidance

- Confirm the diff to `src/ui/PlaylistRow.tsx` is minimal: one import, one JSX line, one JSDoc line.
- Confirm the diff to `src/ui/PlaylistRow.module.scss` is exactly the `grid-template-columns` value change.
- Confirm `PlaylistRowProps` is unchanged.
- Confirm coverage on the modified file is 100/100.
- Confirm no test in this WP asserts internal component state — all assertions are DOM-level (C-006).

## WHEN DONE

```bash
spec-kitty agent action implement-done WP03 --agent <name> --mission dedup-button-per-playlist-row-01KTC3GY
```

## Activity Log

- 2026-06-05T20:26:44Z – claude:opus-4.7:implementer:implementer – shell_pid=454405 – Started implementation via action command
- 2026-06-06T11:05:41Z – claude:opus-4.7:implementer:implementer – shell_pid=454405 – Ready for review: PlaylistRow mounts DedupButton, grid 4-col, coverage 100/100
- 2026-06-06T11:06:03Z – claude:opus-4.7:reviewer:reviewer – shell_pid=457458 – Started review via action command
