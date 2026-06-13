# Implementation Plan: Dedup UI Layout & Icon Polish

**Branch**: `main` | **Date**: 2026-06-13 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `kitty-specs/dedup-ui-layout-icon-polish-01KV03WR/spec.md`

**Branch contract**: Workflow started on `main`; planning/base branch is `main`;
completed changes merge into `main`. (`branch_matches_target: true`.) This is a
solo project with no separate feature branch for this mission.

The planner did not begin filling later phases until all planning questions were
answered and the Engineering Alignment was confirmed by the user (see Summary).

## Summary

A **strictly presentational** revision of the in-client Dedup UI. Two confirmed
decisions drive it:

1. **Sidebar icon** → use the Spotify client's native built-in **`library`**
   glyph (from `Spicetify.SVGIcons`) instead of the current placeholder. Delivered
   through the *existing* icon mechanism: replace the contents of
   `src/css/icon.svg` with the native `library` markup (`currentColor`, native
   `viewBox`). `src/settings.json` wiring is unchanged. (FR-001, FR-002, C-003.)

2. **Results layout** → the **"Minimal: widen + span"** approach, extended to the
   full per-row control region. Three CSS/markup moves, all cosmetic:
   - **Widen**: remove the `max-width: 900px` cap on `.list`
     (`LoadedView.module.scss`) so results fill the content-area width (NFR-001).
   - **Span**: each per-row detection child currently renders as the *5th* item
     of the row's 4-column grid (`48px 1fr auto auto`) and lands in the **48px**
     first column, wrapping into a tall stack. Wrap those children in a
     full-width spanning region (`grid-column: 1 / -1`) in `PlaylistRow` and
     `LikedSongsRow` so the summary, the Remove button, the confirm dialog, the
     progress line, the outcome, the scan-progress line, and the per-row error
     all get the full width (NFR-002).
   - **Horizontalize**: relax the forced vertical stacking inside the removal
     surface (`DetectionLoadedSummary.module.scss .removal`) so the controls read
     across the available width rather than as a tall column.

No data, fields, counts, copy, controls, states, or behavior change (C-001,
FR-005, FR-006). The work is confined to the presentation layer (`src/ui/` CSS
modules + two row components' markup, plus the icon asset) — no domain, store,
adapter, or port logic is touched (C-002, C-004).

### Affected GUI surfaces (full inventory)

Same grid-cramming root cause; all fixed by the span change:

| Surface | Row state | File |
|---|---|---|
| `DetectionLoadedSummary` + `RemovalSurface` (Remove button / confirm dialog / progress / outcome) | `loaded` | `src/ui/DetectionLoadedSummary.*` |
| `ScanningView` (scan-progress line) | `scanning` | `src/ui/ScanningView.*` |
| `DetectionFailedView` (per-row error) | `failed` | `src/ui/DetectionFailedView.*` |
| `DedupButton` (compressed when row is narrow) | any | `src/ui/DedupButton.*` |

**Checked and intentionally excluded** (render outside the grid/list; centered
full-width by design, not squished): `IdleView`, `LoadingView`, `EmptyView`, and
the page-level `FailedView`.

## Technical Context

**Language/Version**: TypeScript 6 (strict). React 19.
**Primary Dependencies**: React 19, CSS Modules (SCSS) via spicetify-creator; no
new runtime dependency (C-003).
**Storage**: N/A (no persistence; cosmetic only).
**Testing**: Vitest 4 + happy-dom + @testing-library/react; `npm run test:coverage`
enforces 100% line/branch at the runner. `npm run typecheck` (`tsc --noEmit`).
**Target Platform**: Spicetify Custom App inside the Spotify desktop client
(primary dev surface Linux; must also work on macOS/Windows Spicetify builds).
**Project Type**: single project; presentation layer under `src/ui/`.
**Performance Goals**: N/A beyond "no regression"; correctness/visual-only change.
**Constraints**: Presentation layer only; no behavior/data/copy change; native
icon mechanism reused; 100% line/branch coverage preserved; architecture
import-rule tests remain green.
**Scale/Scope**: ~6 files changed (1 asset, ~3 SCSS modules, 2 TSX row
components), plus paired tests. No new files expected beyond test additions.

**Architectural pattern (charter Quality Gate — must be declared):**
**Layered architecture** with a dedicated **presentation layer** (`src/ui/`) whose
import rules are fixed by **ADR-0001** (`ui → domain` + `store` only; never
`adapters`/`ports`, enforced by `test/architecture.test.ts`). Styling uses **one
CSS Module per component** (strict file-level SRP — each `*.module.scss` owns
exactly one component's presentation). This revision stays entirely within that
pattern: it edits existing presentation-layer files and adds no cross-layer
imports.

## Charter Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Charter gate | Status | Notes |
|---|---|---|
| TDD (red→green) | ✅ planned | Each markup/structural change is driven by a failing component test first (the spanning wrapper element/class per detection state). |
| 100% line/branch coverage at runner | ✅ preserved | Changes are CSS + static `className`/wrapper markup. New JSX lines are covered by existing + new row render tests; no new conditional branches introduced. Verified via `npm run test:coverage`. |
| Boundary testing for numeric bounds | ✅ N/A→addressed | No new numeric bounds in code. The NFR width breakpoints (768/1024px) are **layout geometry**, which happy-dom does not compute (see research §2) → verified by the live-verification artifact, not unit assertions. |
| Fail-loud parsers + classifier | ✅ N/A | No parsers/transforms added or changed. |
| TypeScript strict; no implicit/leaking `any` | ✅ | No type surface change; row prop types unchanged. |
| SOLID / strict file-level SRP | ✅ | One CSS module per component preserved; no file accretes a second concern. |
| Named architectural pattern declared | ✅ | Layered + presentation layer (ADR-0001), declared above. |
| Docs sync (README, JSDoc, ADR) | ✅ planned | JSDoc on any changed component reflects the new spanning wrapper; an ADR is drafted for the layout-placement decision (grid-span wrapper) and the native-icon delivery choice (DIRECTIVE_003). README updated if any user-facing description of the UI exists. |
| Risk boundaries (no silent mutation, confirms) | ✅ untouched | Removal confirmation flow, bulk second-confirm, and per-action confirm are **unchanged** — only their container width/placement changes. |
| No new runtime dependency | ✅ | Native glyph reuses the existing icon-file mechanism (C-003). |

No gate violations → **Complexity Tracking is empty** (no justifications needed).

## Project Structure

### Documentation (this feature)

```
kitty-specs/dedup-ui-layout-icon-polish-01KV03WR/
├── plan.md              # This file (/spec-kitty.plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (N/A rationale)
├── quickstart.md        # Phase 1 output (build + verify)
├── contracts/           # Phase 1 output (N/A rationale)
└── tasks.md             # Phase 2 — created by /spec-kitty.tasks (NOT here)
```

### Source Code (repository root)

```
src/
├── settings.json                       # unchanged (icon wiring stays css/icon.svg)
├── css/
│   └── icon.svg                        # REPLACE contents → native `library` glyph
└── ui/
    ├── LoadedView.module.scss          # EDIT: remove 900px cap; fill width
    ├── PlaylistRow.tsx                 # EDIT: wrap detection children in spanning region
    ├── PlaylistRow.module.scss         # EDIT: add .detail { grid-column: 1 / -1 }
    ├── LikedSongsRow.tsx               # EDIT: wrap detection children in spanning region
    ├── LikedSongsRow.module.scss       # EDIT: add .detail { grid-column: 1 / -1 }
    └── DetectionLoadedSummary.module.scss  # EDIT: horizontalize .removal stacking

test/
└── ui/                                 # ADD/EDIT: assert spanning wrapper per state
                                        #   (PlaylistRow + LikedSongsRow, loaded/scanning/failed)
```

**Structure Decision**: No new source modules or layers. All edits land in the
existing presentation layer (`src/ui/`) plus the icon asset (`src/css/icon.svg`).
Tests live alongside the existing `test/ui/` suites. This matches the repo's
established layout and ADR-0001 import rules.

## Phase 0 — Research

See [`research.md`](./research.md). Resolved unknowns:

1. **Native icon delivery** — how `library` reaches the sidebar given
   spicetify-creator inlines `settings.icon` file contents; exact markup capture
   procedure + `currentColor`/active-state behavior (FR-001/FR-002/C-003).
2. **happy-dom layout limitation** — why NFR width/line/overflow thresholds are
   live-verified rather than unit-asserted, and what the unit tests *do* assert.
3. **Grid-cramming root cause** — the precise mechanism behind the verticality.
4. **Width strategy** — `max-width: none` + fill vs. a high cap; choice and why.

## Phase 1 — Design & Contracts

- **Data model** — [`data-model.md`](./data-model.md): N/A (no entities; cosmetic).
- **Contracts** — [`contracts/`](./contracts/): N/A (no new endpoints/actions;
  the user actions, store API, and removal contract are unchanged).
- **Quickstart** — [`quickstart.md`](./quickstart.md): build/install/iterate
  (`npm run watch` / `spicetify watch -a -l`) and the live-verification checklist
  for AS-1/AS-2 (icon) and NFR-001/002/003 (layout).

### Re-check after design

Charter Check re-evaluated post-design: no new gaps. The only items that cannot
be expressed as runner-enforced unit assertions are the visual NFR thresholds;
these are bound to the live-verification artifact in `quickstart.md`, consistent
with the repo's standing rule that DoD-mandated live verification must be driven
before any WP reaches `done`.

## Complexity Tracking

*No Charter Check violations — section intentionally empty.*
