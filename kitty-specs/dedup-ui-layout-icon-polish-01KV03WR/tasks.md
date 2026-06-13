# Tasks: Dedup UI Layout & Icon Polish

**Mission**: `dedup-ui-layout-icon-polish-01KV03WR`
**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`research.md`](./research.md),
[`quickstart.md`](./quickstart.md)
**Branch contract**: started on `main`; planning/base branch `main`; merges into
`main` (`branch_matches_target: true`). Solo project — no separate feature branch.

This is a **strictly presentational** mission. Two independent presentation
problems → two work packages:

- **WP01** — replace the placeholder sidebar glyph with the native `library` icon.
- **WP02** — make the Dedup results fill the page width (grid-span wrapper + width cap removal).

The two WPs touch disjoint files and have **no dependency** on each other; either
can be implemented first. Both branch from `main`.

> **Live verification is binding.** The visual NFRs (≥90% width, single-line
> fields, no horizontal scrollbar) are **not** observable in happy-dom (no CSS
> layout — see `research.md §2`). The live-verification checklist in
> `quickstart.md` MUST be driven during review before either WP reaches `done`.
> This repo has previously shipped a CRITICAL defect by skipping live
> verification — do not skip it.

---

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | Capture native `library` glyph markup from `Spicetify.SVGIcons.library` | WP01 | | [D] |
| T002 | Replace `src/css/icon.svg` contents with the native glyph (`currentColor`, native viewBox) | WP01 | | [D] |
| T003 | Write ADR-0015 (native-icon delivery via existing inline-SVG mechanism) | WP01 | [D] |
| T004 | Live-verify sidebar icon (AS-1/AS-2: default + active state) and confirm gates unaffected | WP01 | |
| T005 | [TDD red] Failing tests — `PlaylistRow` renders detection child (scanning/loaded/failed) inside a full-width `.detail` wrapper; existing content unchanged | WP02 | |
| T006 | [green] `PlaylistRow.tsx` wrap detection children in `.detail`; `PlaylistRow.module.scss` add `.detail { grid-column: 1 / -1 }` | WP02 | |
| T007 | [TDD red] Failing tests — `LikedSongsRow` spanning wrapper per detection state | WP02 | |
| T008 | [green] `LikedSongsRow.tsx` wrap + `LikedSongsRow.module.scss` `.detail` | WP02 | |
| T009 | `LoadedView.module.scss` — remove the `max-width: 900px` cap; fill content-area width | WP02 | |
| T010 | `DetectionLoadedSummary.module.scss` — horizontalize the `.removal` stacking | WP02 | |
| T011 | Write ADR-0016 (grid-span `.detail` wrapper), run gates, drive layout live-verification | WP02 | |

The `[P]` marker indicates parallel-safe work; it is **not** a status marker.
Status is tracked by the per-WP checkbox rows below.

---

## Phase 1 — Presentation polish

### WP01 — Native sidebar `library` icon

- **Goal**: Replace the placeholder sidebar glyph with the Spotify client's
  native `library` icon, delivered through the existing inline-SVG mechanism so
  the Dedup entry reads as a native, deduplication-appropriate sidebar icon in
  both default and active states.
- **Priority**: P1 (independent; smallest surface).
- **Requirements**: FR-001, FR-002; C-003.
- **Independent test**: In the live client, the Dedup sidebar entry shows the
  native `library` glyph (monochrome, `currentColor`, native weight/sizing) in
  both default and active/selected states — no longer the placeholder. The unit
  suite, typecheck, and coverage are unchanged (no TS touched).
- **Prompt**: [`tasks/WP01-native-sidebar-library-icon.md`](./tasks/WP01-native-sidebar-library-icon.md)
- **Estimated prompt size**: ~230 lines.
- **Dependencies**: none.

**Included subtasks**:
- [x] T001 Capture native `library` glyph markup from `Spicetify.SVGIcons.library` (WP01)
- [x] T002 Replace `src/css/icon.svg` contents with the native glyph (`currentColor`, native viewBox) (WP01)
- [x] T003 Write ADR-0015 (native-icon delivery via existing inline-SVG mechanism) (WP01)
- [ ] T004 Live-verify sidebar icon (AS-1/AS-2: default + active state) and confirm gates unaffected (WP01)

**Implementation sketch**:
1. In the running Spotify client devtools console, `copy(Spicetify.SVGIcons["library"])`
   and read the value to learn the native viewBox the paths are authored for.
2. Wrap the captured inner markup in `<svg viewBox="…" fill="currentColor">…</svg>`
   and write it into `src/css/icon.svg`, fully replacing the placeholder.
3. Draft ADR-0015 recording why the icon is delivered by replacing the
   inline-SVG file's contents (build pipeline treats `settings.icon` as a path,
   not a built-in name) rather than referencing a name or adding a dependency.
4. Drive the sidebar portion of the `quickstart.md` live-verification checklist.

**Risks**: shipping a near-miss glyph (mitigated: capture the exact live path,
do not guess); active-state recolor failing (mitigated: keep `currentColor`).

---

### WP02 — Results layout: full-width grid-span wrapper

- **Goal**: Make the rendered Dedup results occupy the page's available
  horizontal width and read on few lines, by (a) wrapping each row's conditional
  detection child in a single full-width grid-spanning `.detail` element,
  (b) removing the list's `max-width: 900px` cap, and (c) relaxing the forced
  vertical stacking of the removal surface. Strictly cosmetic — no field, count,
  control, state, or behavior changes.
- **Priority**: P1.
- **Requirements**: FR-003, FR-004, FR-005, FR-006; NFR-001/002/003; C-001, C-002, C-004.
- **Independent test**: New row tests assert that in each detection state
  (`scanning`/`loaded`/`failed`) the detection child renders inside the
  full-width `.detail` wrapper for both `PlaylistRow` and `LikedSongsRow`, and
  that all existing counts/fields/buttons/dialog copy are unchanged. In the live
  client, results span the content width with no empty right band, primary
  fields read on a single line, and no horizontal scrollbar appears ≥768px.
- **Prompt**: [`tasks/WP02-results-full-width-grid-span.md`](./tasks/WP02-results-full-width-grid-span.md)
- **Estimated prompt size**: ~520 lines.
- **Dependencies**: none.

**Included subtasks**:
- [ ] T005 [TDD red] Failing tests — `PlaylistRow` renders detection child (scanning/loaded/failed) inside a full-width `.detail` wrapper; existing content unchanged (WP02)
- [ ] T006 [green] `PlaylistRow.tsx` wrap detection children in `.detail`; `PlaylistRow.module.scss` add `.detail { grid-column: 1 / -1 }` (WP02)
- [ ] T007 [TDD red] Failing tests — `LikedSongsRow` spanning wrapper per detection state (WP02)
- [ ] T008 [green] `LikedSongsRow.tsx` wrap + `LikedSongsRow.module.scss` `.detail` (WP02)
- [ ] T009 `LoadedView.module.scss` — remove the `max-width: 900px` cap; fill content-area width (WP02)
- [ ] T010 `DetectionLoadedSummary.module.scss` — horizontalize the `.removal` stacking (WP02)
- [ ] T011 Write ADR-0016 (grid-span `.detail` wrapper), run gates, drive layout live-verification (WP02)

**Implementation sketch** (TDD throughout):
1. Red: add `PlaylistRow` tests asserting a `.detail` wrapper (full-width, by
   class/testid) hosts the scanning/loaded/failed child; watch them fail.
2. Green: wrap the three conditional children in one `<div className={styles.detail}>`;
   add `.detail { grid-column: 1 / -1; min-width: 0; }`.
3. Repeat red→green for `LikedSongsRow`.
4. Remove the `.list` `max-width: 900px` cap (→ `max-width: none; width: 100%`).
5. Horizontalize `.removal` (flex-row + wrap) so the button/dialog/progress/
   outcome read across the width.
6. ADR-0016, run `npm run typecheck` + `npm run test:coverage` (100% line/branch)
   + confirm `test/architecture.test.ts` green, then drive the layout
   live-verification checklist.

**Risks**: a new conditional inadvertently dropping coverage (mitigated: render
the wrapper unconditionally — no new branch); reaching into another component's
CSS module (mitigated: the wrapper keeps grid placement the row's own
responsibility — research §3); horizontal overflow on narrow windows (mitigated:
keep `min-width: 0` on text/detail; verify NFR-003 live).

---

## Parallelization

- WP01 and WP02 are fully independent (disjoint files, no shared state) and may
  be implemented in either order or in parallel lanes. Per the operator's
  standing preference, dispatch them **sequentially** unless told otherwise.

## MVP scope

Both WPs are small and required for the mission's two goals. If a single MVP slice
is wanted, **WP02** (the layout fix) addresses the more impactful complaint
(squished results / empty right band); **WP01** is a quick standalone polish.

## Requirements coverage

| FR | WP |
|----|----|
| FR-001 | WP01 |
| FR-002 | WP01 |
| FR-003 | WP02 |
| FR-004 | WP02 |
| FR-005 | WP02 |
| FR-006 | WP02 |

NFR-001/002/003 are verified live (WP02); NFR-004 (100% coverage) is the runner
gate on WP02. Constraints C-001…C-004 are honored by both WPs by construction
(presentation-layer-only, no new dependency).
