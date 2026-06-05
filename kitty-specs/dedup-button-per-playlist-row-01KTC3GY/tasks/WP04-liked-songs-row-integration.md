---
work_package_id: WP04
title: LikedSongsRow mounts DedupButton
dependencies:
- WP02
requirement_refs:
- FR-001
- NFR-002
- NFR-003
planning_base_branch: main
merge_target_branch: main
branch_strategy: Workflow start branch main → planning/base main → merge target main. Branches off the lane base computed by finalize-tasks (after WP02 merges). Runs in parallel with WP03.
subtasks:
- T015
- T016
- T017
- T018
history:
- date: '2026-06-05'
  note: Drafted by /spec-kitty.tasks.
authoritative_surface: src/ui/LikedSongsRow.tsx
execution_mode: code_change
mission_id: 01KTC3GY1VM87DPV0SEDQS24NE
mission_slug: dedup-button-per-playlist-row-01KTC3GY
owned_files:
- src/ui/LikedSongsRow.tsx
- src/ui/LikedSongsRow.module.scss
- test/ui/LikedSongsRow.test.tsx
priority: P2
tags: []
---

# WP04 — LikedSongsRow mounts DedupButton

## Objective

Mount `<DedupButton playlistName="Liked Songs" playlistUri="spotify:collection:tracks" />` inside `LikedSongsRow` (Reading B, user-confirmed in research §7). Extend the row's CSS grid from 3 to 4 columns, mirroring WP03's change. Add per-row assertions covering button presence, the accessible name `Dedup Liked Songs`, and the hardcoded URI literal log line. Tests RED first per C-004.

## Context

- **Spec**: FR-001 (button per row, includes the pinned row per Reading B), NFR-002 (accessible name), NFR-003 (layout non-regression).
- **Plan**: §Phase 1 Design (`src/ui/LikedSongsRow.tsx` / `LikedSongsRow.module.scss` modifications), §Test coverage map.
- **Research**: Decision 7 (Liked Songs row also gets a button; URI literal is `spotify:collection:tracks`; aria-label uses uniform `Dedup <name>` format; layout mirrors PlaylistRow).
- **Data model**: §5 (`LikedSongsRowProps` unchanged; literals hardcoded at the call site).
- **Existing file context**: `src/ui/LikedSongsRow.tsx` is the pinned synthetic row; it already hardcodes the display name (`"Liked Songs"`), the owner label (`"Your Library"`), and the heart glyph. The URI literal fits the same pattern. `src/ui/LikedSongsRow.module.scss` defines the grid at `.row { grid-template-columns: 48px 1fr auto; ... }`.
- **Architectural rule**: same as WP03 — `src/ui/` ↔ `src/ui/` is permitted; `DedupButton` is in `src/ui/`.

## Branch strategy

- Planning/base branch: `main`.
- Merge target: `main`.
- Lane base computed by `finalize-tasks` after WP02 merges. Parallel cohort with WP03 — disjoint file ownership.

## Implementation command

```bash
spec-kitty agent action implement WP04 --agent <name>
```

## Detailed guidance per subtask

### Subtask T015 — Write failing assertions in `LikedSongsRow.test.tsx`

**Purpose**: TDD RED step. Pin down the per-row assertions for the Liked Songs Dedup button without disturbing existing tests for heart-glyph rendering and track-count formatting.

**Steps**:

1. Open `test/ui/LikedSongsRow.test.tsx`. Read the existing structure to learn fixture / render-helper conventions.
2. Add a new `describe('LikedSongsRow — Dedup button (WP04)', () => { ... })` block. Set up `vi.spyOn(console, 'log').mockImplementation(() => {})` in `beforeEach`, restore in `afterEach`.
3. Tests:
   - **(a)** `it('renders a Dedup button with accessible name "Dedup Liked Songs"', ...)` — render with any plausible fixture (`trackCount` doesn't matter for this assertion). Assert `getByRole('button', { name: /^Dedup Liked Songs$/ })` resolves. (FR-001 + NFR-002 for the pinned row.)
   - **(b)** `it('logs [Dedup] clicked: Liked Songs (spotify:collection:tracks) on click', ...)` — render. `fireEvent.click(button)`. Assert `console.log` was called exactly once with the exact string `'[Dedup] clicked: Liked Songs (spotify:collection:tracks)'`. (FR-003 + FR-004 — the hardcoded literals must propagate verbatim.)
   - **(c)** `it('preserves Liked Songs / Your Library copy and the heart icon alongside the button', ...)` — assert `screen.getByText('Liked Songs')`, `screen.getByText('Your Library')`, and `screen.getByRole('img', { name: /Liked Songs icon/ })` all resolve. (NFR-003 mirror.)
   - **(d)** `it('keeps the data-row-kind="liked-songs" routing attribute intact', ...)` — assert the `<li>` carries `data-row-kind="liked-songs"`. (Likely already covered by an existing test; skip and document if so.)
4. Save. Run `npm run test:run -- test/ui/LikedSongsRow.test.tsx`. The new tests should fail. RED confirmed.

**Files**:
- `test/ui/LikedSongsRow.test.tsx` (modified — new `describe` block only).

**Validation**:
- [ ] New tests added; all fail.
- [ ] Existing tests still pass.

### Subtask T016 — Update `src/ui/LikedSongsRow.tsx` to mount the button

**Purpose**: TDD GREEN step. Add the import and render a `<DedupButton>` with the hardcoded literals at the call site (per research §7.1).

**Steps**:

1. At the top of `src/ui/LikedSongsRow.tsx`, add: `import { DedupButton } from './DedupButton';`.
2. In the JSX, after the `<span className={styles.count}>...</span>` line, add:
   ```tsx
   <DedupButton playlistName="Liked Songs" playlistUri="spotify:collection:tracks" />
   ```
3. Extend the existing JSDoc on `LikedSongsRow` with one line noting: "Mounts a `<DedupButton>` in the trailing grid cell using hardcoded `Liked Songs` / `spotify:collection:tracks` literals at the call site per research §7.1; the synthetic-row pattern already hardcodes the display name and owner label, and threading a `canonicalUri` field through `CollectionViewModel` would have a wide blast radius for a one-call-site value." Keep it tight — one block paragraph is fine.
4. Do NOT change `LikedSongsRowProps`. Do NOT broaden `CollectionViewModel`. Do NOT extract a constant — the literal is intentional at the call site.
5. Confirm imports remain limited to `react`, `../domain/view-models` (type-only), `./LikedSongsRow.module.scss`, and the new `./DedupButton`.

**Files**:
- `src/ui/LikedSongsRow.tsx` (modified — 2-3 added lines + JSDoc tweak).

**Validation**:
- [ ] T015 tests pass.
- [ ] Existing tests in `LikedSongsRow.test.tsx` still pass.
- [ ] `LikedSongsRowProps` unchanged.
- [ ] `npm run typecheck` passes.

### Subtask T017 — Update `src/ui/LikedSongsRow.module.scss` grid

**Purpose**: Extend the grid to 4 columns, mirroring WP03's change so both row variants share identical column geometry.

**Steps**:

1. In `src/ui/LikedSongsRow.module.scss`, find the `.row { ... }` block (lines 11-25 currently).
2. Change `grid-template-columns: 48px 1fr auto;` to `grid-template-columns: 48px 1fr auto auto;` — that is the ONLY rule change.
3. Append a one-line update to the comment block at the top of the file noting the fourth column hosts the Dedup button (WP04).
4. Do NOT change `gap`, `padding`, `align-items`, or any non-`.row` selector. The change mirrors WP03 verbatim.

**Files**:
- `src/ui/LikedSongsRow.module.scss` (modified — single `grid-template-columns` value change + comment).

**Validation**:
- [ ] Diff shows only the `grid-template-columns` value change and the comment update.

### Subtask T018 — Verify LikedSongsRow tests green; coverage 100% on touched ranges

**Purpose**: Lock in NFR-004 / SC-004 coverage on the modified file.

**Steps**:

1. `npm run test:run -- test/ui/LikedSongsRow.test.tsx` — green.
2. `npm run test:run` — full suite green (no regressions to `LoadedView.test.tsx`, `PlaylistRow.test.tsx`, etc.).
3. `npm run test:coverage` — confirm `src/ui/LikedSongsRow.tsx` reports 100% line / 100% branch.
4. Capture the coverage row.

**Validation**:
- [ ] `src/ui/LikedSongsRow.tsx`: 100/100/100/100.
- [ ] Full test suite green.

## Definition of Done

- [ ] `src/ui/LikedSongsRow.tsx` mounts `<DedupButton playlistName="Liked Songs" playlistUri="spotify:collection:tracks" />`.
- [ ] `src/ui/LikedSongsRow.module.scss` grid is `48px 1fr auto auto`.
- [ ] `test/ui/LikedSongsRow.test.tsx` has the new `describe('LikedSongsRow — Dedup button (WP04)', ...)` block with 3-4 assertions, all green.
- [ ] No regressions in any other test file.
- [ ] `npm run test:coverage` reports 100/100 on `src/ui/LikedSongsRow.tsx`.
- [ ] `LikedSongsRowProps` unchanged. `CollectionViewModel` unchanged.
- [ ] WP committed inside the lane worktree.

## Risks

- **URI literal correctness for the live client**: `spotify:collection:tracks` is the documented URI form, but the next mission (real dedup) must verify against `Spicetify.Platform.LibraryAPI`. This iteration only logs the string; no host call is made with it, so there is no behavioural risk here. Flagged for the next mission in research §8.
- **Accessible-name wording**: `Dedup Liked Songs` reads natively; the spec's example phrasing `Dedup playlist <name>` is illustrative (research §7.2). Reviewer should consult research §7.2 if they flag the wording.
- **Coverage `includeUntested` artefacts**: if vitest flags a coverage delta on `LikedSongsRow.tsx` due to the new JSX node, the missed coverage points to a missing test, not a threshold problem. Add the test.

## Reviewer guidance

- Confirm the diff to `src/ui/LikedSongsRow.tsx` is minimal: one import, one JSX line, one JSDoc paragraph.
- Confirm the diff to `src/ui/LikedSongsRow.module.scss` is exactly the `grid-template-columns` value change.
- Confirm `LikedSongsRowProps` and `CollectionViewModel` are unchanged.
- Confirm coverage on the modified file is 100/100.
- Confirm the hardcoded URI literal `spotify:collection:tracks` is at the call site (not threaded through the view model).

## WHEN DONE

```bash
spec-kitty agent action implement-done WP04 --agent <name> --mission dedup-button-per-playlist-row-01KTC3GY
```
