---
work_package_id: WP02
title: 'Results layout: full-width grid-span wrapper'
dependencies: []
requirement_refs:
- FR-003
- FR-004
- FR-005
- FR-006
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T005
- T006
- T007
- T008
- T009
- T010
- T011
history:
- 2026-06-13T09:28:03Z — created by /spec-kitty.tasks
authoritative_surface: src/ui/
execution_mode: code_change
mission_slug: dedup-ui-layout-icon-polish-01KV03WR
owned_files:
- src/ui/LoadedView.module.scss
- src/ui/PlaylistRow.tsx
- src/ui/PlaylistRow.module.scss
- src/ui/LikedSongsRow.tsx
- src/ui/LikedSongsRow.module.scss
- src/ui/DetectionLoadedSummary.module.scss
- test/ui/PlaylistRow.test.tsx
- test/ui/LikedSongsRow.test.tsx
- .claude/adr/0016-grid-span-detail-wrapper.md
priority: P1
tags: []
---

# WP02 — Results layout: full-width grid-span wrapper

## Objective

Make the rendered Dedup results **use the available horizontal width** and read
on **fewer lines**, with three cosmetic moves:

1. **Span** — wrap each row's conditional detection child in a single full-width
   `.detail` element (`grid-column: 1 / -1`) so it no longer flows into the 48px
   first column of an implicit grid row (the cause of the tall, squished stack).
2. **Widen** — remove the `.list` `max-width: 900px` cap so results fill the
   content-area width.
3. **Horizontalize** — relax the forced vertical stacking inside the removal
   surface so its controls read across the width.

**Strictly presentational.** No collection, count, track/artist field, button,
dialog, state, or behavior changes (FR-005, FR-006, C-001). Confined to the
presentation layer; no domain/store/adapter/port logic touched (C-002, C-004).

**Satisfies**: FR-003 (occupy available width), FR-004 (fewer lines), FR-005
(unchanged content), FR-006 (unchanged behavior); NFR-001/002/003 (verified
live); NFR-004 (100% coverage held at the runner).

## Context — the grid-cramming root cause (read `research.md §3`)

Both `PlaylistRow` and `LikedSongsRow` render their `<li>` as a 4-column grid:

```scss
// PlaylistRow.module.scss / LikedSongsRow.module.scss
.row { display: grid; grid-template-columns: 48px 1fr auto auto; /* … */ }
```

Columns = cover/heart · text · count · `DedupButton`. The conditional detection
children — `ScanningView`, `DetectionLoadedSummary` (which itself hosts the
Remove button / confirm dialog / progress / outcome), and `DetectionFailedView`
— are appended as the **5th** grid child. With only 4 explicit columns, the 5th
item flows into an **implicit row's first (48px) column** and is squeezed to
48px wide, wrapping line-by-line. Separately, `LoadedView.module.scss .list` caps
the whole list at `max-width: 900px`, leaving the empty right band on wide windows.

Current `PlaylistRow.tsx` (the relevant tail; `LikedSongsRow.tsx` is structurally
identical with the `liked-songs` sentinel key):

```tsx
<li className={styles.row} data-row-kind="playlist" data-row-name={row.displayName}>
  <Cover imageUrl={row.imageUrl} />
  <div className={styles.text}>…</div>
  <span className={styles.count}>{formatTrackCount(row.trackCount)}</span>
  <DedupButton … />
  {rowState?.kind === 'scanning' && <ScanningView progress={rowState.progress} />}
  {rowState?.kind === 'loaded' && <DetectionLoadedSummary … />}
  {rowState?.kind === 'failed' && <DetectionFailedView reason={rowState.reason} />}
</li>
```

**Fix** (research §3 decision): wrap the three conditional children in **one**
`<div className={styles.detail}>` and give `.detail { grid-column: 1 / -1 }`.
This is the smallest change that fixes every affected surface
(`DetectionLoadedSummary`/`RemovalSurface`, `ScanningView`, `DetectionFailedView`,
`DedupButton` compression) at once. **Do not** reach into the child components'
own CSS modules to set `grid-column` on their roots — that violates file-level
SRP (the row, not the child, owns its grid placement).

> **Render the wrapper unconditionally** (always emit `<div className={styles.detail}>`
> containing the three existing conditionals). This adds **no new branch** — the
> three `&&` conditionals are unchanged — so 100% branch coverage is preserved.
> An empty `.detail` in the `idle` state is harmless (it renders no
> status/summary/alert, so existing idle assertions still hold).

## Branch Strategy

- **Planning/base branch**: `main`.
- **Final merge target**: `main`.
- Execution worktrees are allocated **per computed lane** from `lanes.json`.
  Enter your lane's workspace; do not hand-edit branches.
- Implement command: `spec-kitty agent action implement WP02 --agent <name>`.

## Owned files (do not edit anything outside this list)

- `src/ui/LoadedView.module.scss` — remove the width cap.
- `src/ui/PlaylistRow.tsx`, `src/ui/PlaylistRow.module.scss` — wrapper + `.detail`.
- `src/ui/LikedSongsRow.tsx`, `src/ui/LikedSongsRow.module.scss` — wrapper + `.detail`.
- `src/ui/DetectionLoadedSummary.module.scss` — horizontalize `.removal`.
- `test/ui/PlaylistRow.test.tsx`, `test/ui/LikedSongsRow.test.tsx` — new assertions.
- `.claude/adr/0016-grid-span-detail-wrapper.md` — new ADR (gitignored; create locally).

> Do **not** touch `DetectionLoadedSummary.tsx`, `ScanningView.*`,
> `DetectionFailedView.*`, `DedupButton.*`, the store, domain, ports, or adapters.
> The fix lives entirely in the two rows' markup/CSS, the list CSS, and the
> removal-surface CSS.

## Method — TDD (charter DIRECTIVE_034: red → watch fail → green)

Each structural change is driven by a **failing test first**. happy-dom computes
no CSS layout (`research.md §2`), so tests assert the **structural** invariant —
the detection child renders **inside** the `.detail` wrapper — not pixel
geometry. The visual thresholds (NFR-001/002/003) are bound to live verification
(T011).

**How to assert "inside the wrapper" in happy-dom**: CSS modules are imported as
opaque class-name maps, so `styles.detail` resolves to a stable generated class
string in tests. Prefer one of:
- query the wrapper by a stable hook and assert it contains the child, e.g. give
  the wrapper `data-testid="row-detail"` and assert
  `within(screen.getByTestId('row-detail')).getByRole('status'|'alert'|…)`; **or**
- assert the child's container element carries the module's `detail` class
  (`container.querySelector('[class*="detail"]')` contains the child).
Choose the `data-testid="row-detail"` approach for clarity and stability — it is
a test hook, not new user-facing content (still honors FR-005). Apply the same
`data-testid` to both rows' wrappers.

## Subtasks

### T005 — [TDD red] `PlaylistRow` spanning-wrapper tests

**Purpose**: Pin the invariant that each detection state's child renders inside
the full-width `.detail` wrapper, and that existing content is unchanged.

**Steps** (add to `test/ui/PlaylistRow.test.tsx`, reusing its existing helpers —
`renderRow`, `sample`, `makeHangingScanner`, `seedLoaded`):
1. New `describe('PlaylistRow — detail wrapper')` with:
   - **scanning**: drive `scanCollection` (as the existing scanning test does),
     then assert `screen.getByTestId('row-detail')` exists and
     `within(screen.getByTestId('row-detail')).getByRole('status')` is present.
   - **loaded**: resolve a result (reuse the loaded test's pattern), assert the
     `row-detail` wrapper contains the summary text (e.g. `/No duplicates found/i`
     for the empty case, or the seeded `Remove duplicates from …` button).
   - **failed**: reject with a `DetectionError`, assert the `row-detail` wrapper
     contains `getByRole('alert')`.
2. Add a guard test that **existing content is unchanged** (FR-005): with a
   `loaded` seeded row, the playlist name, owner label, track count, and the
   `Dedup …` button are all still present (they live **outside** the wrapper).
3. Import `within` from `@testing-library/react`.

**Validation**:
- [ ] Run `npm test -- PlaylistRow` (or the watch runner) and **watch the new
      tests fail** (no `row-detail` testid yet). Record that you saw red.

### T006 — [green] `PlaylistRow` wrapper + `.detail` CSS

**Purpose**: Make T005 pass with the minimal structural change.

**Steps**:
1. In `src/ui/PlaylistRow.tsx`, wrap the three conditional detection children in a
   single always-rendered `<div className={styles.detail} data-testid="row-detail">…</div>`,
   placed where the 5th grid child currently sits:
   ```tsx
   <DedupButton … />
   <div className={styles.detail} data-testid="row-detail">
     {rowState?.kind === 'scanning' && <ScanningView progress={rowState.progress} />}
     {rowState?.kind === 'loaded' && <DetectionLoadedSummary … />}
     {rowState?.kind === 'failed' && <DetectionFailedView reason={rowState.reason} />}
   </div>
   ```
   Keep the three conditionals and all their props **exactly** as they are.
2. In `src/ui/PlaylistRow.module.scss`, add:
   ```scss
   .detail {
     grid-column: 1 / -1;   // span all columns (research §3)
     min-width: 0;          // allow children to shrink; no horizontal overflow
   }
   ```
3. Update the component JSDoc to mention the spanning `.detail` wrapper.

**Validation**:
- [ ] T005 tests now pass (green).
- [ ] The existing `PlaylistRow` presentational + detection-state + removal tests
      still pass unchanged.

### T007 — [TDD red] `LikedSongsRow` spanning-wrapper tests

**Purpose**: Same invariant for the pinned Liked Songs row.

**Steps** (add to `test/ui/LikedSongsRow.test.tsx`, reusing its helpers; key is
the `'liked-songs'` sentinel):
1. New `describe('LikedSongsRow — detail wrapper')` mirroring T005:
   scanning → `within(getByTestId('row-detail')).getByRole('status')`; loaded →
   wrapper contains the summary; failed → wrapper contains `getByRole('alert')`.
2. FR-005 guard: `Liked Songs` name, `Your Library` owner, track count, and the
   `Dedup Liked Songs` button remain present (outside the wrapper).
3. Import `within`.

**Validation**:
- [ ] Watch the new `LikedSongsRow` tests **fail** (red) before T008.

### T008 — [green] `LikedSongsRow` wrapper + `.detail` CSS

**Purpose**: Make T007 pass.

**Steps**:
1. In `src/ui/LikedSongsRow.tsx`, wrap the three conditional children in
   `<div className={styles.detail} data-testid="row-detail">…</div>` exactly as in
   T006 (props unchanged).
2. In `src/ui/LikedSongsRow.module.scss`, add the same
   `.detail { grid-column: 1 / -1; min-width: 0; }`.
3. Update the component JSDoc.

**Validation**:
- [ ] T007 tests pass; all existing `LikedSongsRow` tests still pass.

### T009 — Remove the list width cap (`LoadedView.module.scss`)

**Purpose**: Let results fill the content-area width (FR-003 / NFR-001).

**Steps**:
1. In `src/ui/LoadedView.module.scss`, change `.list`:
   ```scss
   .list {
     list-style: none;
     margin: 0;
     padding: 0;
     max-width: none;  // was: 900px — fill the content area (NFR-001)
     width: 100%;
   }
   ```
2. Update the file's top comment to reflect "fills content-area width" instead of
   "constrains to a readable max-width". The page wrapper
   (`DedupPage.module.scss .page`) already provides `padding-inline` gutters
   (research §4) — do not add new gutters here.

**Validation**:
- [ ] No test references the 900px cap; full suite stays green. (If
      `LoadedView.test.tsx` asserts a max-width value, it does not — it cannot,
      happy-dom resolves no layout — but re-run it to be sure.)

### T010 — Horizontalize the removal surface (`DetectionLoadedSummary.module.scss`)

**Purpose**: Let the removal controls read across the available width rather than
as a tall column (FR-004 / NFR-002). CSS-only — `DetectionLoadedSummary.tsx` is
**not** in scope.

**Steps**:
1. In `src/ui/DetectionLoadedSummary.module.scss`, relax `.removal` from a forced
   vertical stack to a horizontal flow that still wraps gracefully:
   ```scss
   .removal {
     display: flex;
     flex-flow: row wrap;     // was: column — read across the width (NFR-002)
     align-items: center;     // was: flex-start
     gap: 8px;
     margin-top: 4px;
   }
   ```
2. Leave `.container`, `.summary`, `.empty`, `.annotation`, `.progress` untouched
   (the summary copy stays stacked above the removal row).

**Validation**:
- [ ] Full suite green (this is a style-only change; no JS/branch impact).

### T011 — ADR-0016, gates, and live verification

**Purpose**: Document the load-bearing layout decision and produce the binding
acceptance evidence.

**Steps**:
1. Create `.claude/adr/0016-grid-span-detail-wrapper.md` (follow the existing ADR
   format): Status / Context / Decision / Consequences / Alternatives. Capture:
   the 5th-grid-child cramming cause; the single full-width `.detail` wrapper as
   the fix (vs. reaching into each child's CSS module — rejected for SRP); the
   `max-width: none` width choice (vs. a high fixed cap — rejected, NFR-001);
   reference FR-003/FR-004/NFR-001/002/003 and research §3/§4.
2. Run the **runner gates**:
   - [ ] `npm run typecheck` passes.
   - [ ] `npm run test:coverage` passes with **100% line and 100% branch**.
   - [ ] `test/architecture.test.ts` green (no new cross-layer imports from `src/ui/`).
3. Drive the **Results layout** + **Edge cases** + **No-regression** sections of
   the `quickstart.md` live-verification checklist in a maximized client against a
   library with duplicates:
   - [ ] Results occupy the content width; no large empty right band (≥~90% at
         ≥1024px) — NFR-001.
   - [ ] Primary fields read on a **single line** (loaded summary, Remove button,
         confirm dialog, progress line, partial-outcome) — NFR-002.
   - [ ] Scanning progress line and a failed row's error also span the width.
   - [ ] No horizontal scrollbar at ≥768px — NFR-003.
   - [ ] Narrow window degrades gracefully; long names truncate with ellipsis;
         "No duplicates found" renders correctly; many-group collection stays
         scannable.
   - [ ] Every row/count/field/button/dialog/progress/outcome has the **same
         identity and count** as before; detection/confirm (incl. bulk >25)/
         removal/progress/outcome behave identically (FR-005, FR-006).

**Validation**:
- [ ] ADR-0016 written; all gates green; live checklist driven and passing.

## Definition of Done

- Both rows wrap their detection child in an always-rendered full-width `.detail`
  wrapper (`grid-column: 1 / -1`); `.list` cap removed; `.removal` horizontalized.
- New `PlaylistRow` and `LikedSongsRow` tests assert the wrapper hosts the child
  in **all three** detection states, and that existing content is unchanged
  (FR-005); they were seen to fail before implementation (TDD).
- No conditional/branch added — `npm run test:coverage` holds **100% line/branch**.
- `npm run typecheck` and `test/architecture.test.ts` green.
- Layout live-verification checklist driven and passing (mandatory — do not mark
  `done` on the unit suite alone; this repo has shipped a CRITICAL defect by
  skipping live verification).
- No file outside `owned_files` modified; no domain/store/adapter/port/child-
  component file touched.

## Risks & reviewer guidance

- **Coverage regression**: confirm the wrapper is rendered **unconditionally**
  (no new `&&`/ternary around the `<div>`); the three child conditionals must be
  byte-for-byte the same logic. Verify the coverage report still reads 100/100.
- **SRP leak**: confirm `grid-column: 1 / -1` lives on the row's own `.detail`,
  not pushed into `ScanningView`/`DetectionFailedView`/`DetectionLoadedSummary`
  CSS modules.
- **Behavior parity (FR-005/FR-006)**: confirm no prop, count, copy, or control
  changed — only wrapping markup and CSS. The removal confirm/second-confirm flow
  must be untouched.
- **Live verification actually driven**: a skipped live-verification artifact is a
  blocking defect here. Confirm NFR-001/002/003 and the no-regression section
  were exercised in the real client, not assumed.
- **No horizontal overflow** (NFR-003): confirm `min-width: 0` is present so the
  text column and `.detail` can shrink on narrow windows.
