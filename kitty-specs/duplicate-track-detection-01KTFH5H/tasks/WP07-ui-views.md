---
work_package_id: WP07
title: 'UI Views: Scanning, LoadedSummary, FailedView'
dependencies:
- WP01
requirement_refs:
- FR-009
- NFR-006
- NFR-009
- NFR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-duplicate-track-detection-01KTFH5H
base_commit: 3c497a11e757bfff3f1614a993ec92d14b4d462b
created_at: '2026-06-10T09:23:50.070363+00:00'
subtasks:
- T020
- T021
- T022
shell_pid: "19710"
agent: "claude:claude-sonnet-4-6:implementer:implementer"
history:
- timestamp: '2026-06-07T08:24:49Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/ui/
execution_mode: code_change
owned_files:
- src/ui/ScanningView.tsx
- src/ui/ScanningView.module.scss
- src/ui/DetectionLoadedSummary.tsx
- src/ui/DetectionLoadedSummary.module.scss
- src/ui/DetectionFailedView.tsx
- src/ui/DetectionFailedView.module.scss
- test/ui/ScanningView.test.tsx
- test/ui/DetectionLoadedSummary.test.tsx
- test/ui/DetectionFailedView.test.tsx
tags: []
---

# WP07 — UI Views

## Objective

Three presentational React components that render per-row detection state:

1. `ScanningView` — stage label + processed/total counter, ARIA-live.
2. `DetectionLoadedSummary` — group count + tracks-to-remove count, or "No duplicates found".
3. `DetectionFailedView` — typed-error-to-label lookup with exhaustiveness.

All three are pure (props in → JSX out). No store imports, no port imports — enforced by `test/architecture.test.ts`. WP08 wires them into the row components.

## Context

These views consume only `src/domain/` types (`ProgressEvent`, `DetectionResult`, `DetectionError`). The labels and copy come straight from the data-model and spec — no design freedom beyond layout / SCSS.

Read first:
- [`../data-model.md`](../data-model.md) §§3.2, 4.1, 6 — the shapes consumed; the user-visible labels for each `DetectionErrorReason`.
- [`../spec.md`](../spec.md) §Acceptance scenarios — AS-1 (No duplicates), AS-2 (group count + remove count), AS-8 (failed state discriminable).
- `src/ui/LoadedView.tsx`, `src/ui/FailedView.tsx`, `src/ui/EmptyView.tsx` (existing) — the pattern these mirror.

Architectural constraints: `src/ui/` may NOT import from `src/adapters/` or `src/ports/`. Domain imports are allowed (and required — types come from there).

## Branch strategy

Planning base & merge target: **`main`**. Depends only on WP01 (consumes `ProgressEvent`, `DetectionResult`, `DetectionError`). Can lane in parallel with WP02–WP06 since it has no other dependencies — but WP08 (UI wiring) depends on this WP, so it must complete before WP08.

## Subtasks

### T020 — Scanning view (`src/ui/ScanningView.tsx` + `ScanningView.module.scss`)

**Purpose**: Render `ProgressEvent` as a user-visible status line.

**Props**:
```ts
export type ScanningViewProps = { progress: ProgressEvent };
```

**Render rules**:
- Stage label: `'enumerating'` → "Enumerating tracks"; `'enriching'` → "Enriching catalog data"; `'matching'` → "Matching duplicates".
- Counter:
  - If `total === null` → render `processed` alone (e.g. "Enumerating tracks · 42 so far").
  - If `total === 0` → render "0 / 0" (boundary; do not divide by zero).
  - Otherwise → render `processed / total` (e.g. "Enriching catalog data · 150 / 478").
- Container: `<div role="status" aria-live="polite">…</div>` so screen readers announce stage transitions.
- Optional indeterminate spinner glyph (e.g. an SVG or a CSS-only loading indicator) — accessibility is the priority, not visual richness.

**Tests** (`test/ui/ScanningView.test.tsx`):
- Each stage renders its label.
- `total === null` renders no denominator.
- `total === 0` renders "0 / 0".
- `total > 0` renders `processed / total`.
- Container has `role="status"` and `aria-live="polite"`.
- Re-render with new progress event updates the displayed counter (regression check for prop-change handling).

**Files**:
- `src/ui/ScanningView.tsx` (new, ~70 lines).
- `src/ui/ScanningView.module.scss` (new, ~30 lines).
- `test/ui/ScanningView.test.tsx` (new, ~140 lines).

### T021 — Loaded summary (`src/ui/DetectionLoadedSummary.tsx` + `.module.scss`)

**Purpose**: Render the AS-1 / AS-2 summary at the row level.

**Props**:
```ts
export type DetectionLoadedSummaryProps = { result: DetectionResult };
```

**Render rules** (data-model §3.2, AS-1, AS-2):
- `result.groups.length === 0` → render "No duplicates found".
- Otherwise → primary line:
  - `groups.length === 1` → "1 duplicate group"; else "{N} duplicate groups".
  - `removableTrackCount === 1` → "1 track to remove"; else "{M} tracks to remove".
  - Combined: "{N} duplicate groups · {M} tracks to remove" (or singular variants).
- Secondary annotations (only render if non-zero):
  - `skippedLocalCount > 0` → "Skipped {count} local file(s)".
  - `unenrichedCount > 0` → "{count} track(s) couldn't be looked up".
- Use `<dl>` / `<dt>` / `<dd>` or `<ul>` semantics — whatever reads cleanly. Keep markup simple.

**Tests** (`test/ui/DetectionLoadedSummary.test.tsx`):
- Empty groups → "No duplicates found".
- 1 group / 2 tracks (removable = 1) → "1 duplicate group · 1 track to remove".
- 2 groups / 5 tracks (removable = 3) → "2 duplicate groups · 3 tracks to remove".
- `skippedLocalCount: 0` → annotation NOT rendered.
- `skippedLocalCount: 7` → "Skipped 7 local files" annotation present.
- `unenrichedCount: 1` → "1 track couldn't be looked up" annotation; "track" singular.
- `unenrichedCount: 3` → "3 tracks couldn't be looked up"; plural.
- Both annotations present when both > 0.
- AS-1 (empty groups) wording: literal "No duplicates found" substring (the spec uses this phrase verbatim).
- AS-2 (counts visible): test asserts both numbers are present and visible.

**Files**:
- `src/ui/DetectionLoadedSummary.tsx` (new, ~110 lines).
- `src/ui/DetectionLoadedSummary.module.scss` (new, ~40 lines).
- `test/ui/DetectionLoadedSummary.test.tsx` (new, ~220 lines).

### T022 — Failed view (`src/ui/DetectionFailedView.tsx` + `.module.scss`)

**Purpose**: Render `DetectionError` as a user-visible message via the closed reason-to-label table.

**Props**:
```ts
export type DetectionFailedViewProps = { reason: DetectionError };
```

**Render rules** (data-model §6.1 table):
| `reason.reason` | Label |
|---|---|
| `'auth-token-expired'` | "Spotify signed out mid-scan — sign back in and retry." |
| `'rate-limit-unparseable'` | "Spotify is throttling and didn't tell us when to retry. Try again in a minute." |
| `'network-failure'` | "Couldn't reach Spotify. Check your connection and retry." |
| `'malformed-enrichment-payload'` | "Spotify returned unexpected data. This is a bug — please report it." |
| `'enumerator-failed'` | "Couldn't read the playlist contents. Try again." |
| `'catalog-rejected'` | "Spotify rejected the catalog lookup (status {N}). Try again." (interpolate `reason.context?.status` if present; else omit "(status …)"). |
| `'aborted'` | (never rendered — assert at runtime; see note below) |

For `'aborted'`: the store catches `AbortError` and never dispatches `fail`. Defensive handling: if the component is somehow rendered with `'aborted'`, render a fallback "Scan cancelled" message; cover this in a test, but document that this path indicates a bug elsewhere.

**Exhaustiveness**: the switch / map should be type-checked exhaustive via a `never` catch clause, so adding a new `DetectionErrorReason` to the union without updating this view becomes a compile error.

**Tests** (`test/ui/DetectionFailedView.test.tsx`):
- One `it()` per non-`aborted` reason — assert the literal label substring is present.
- `'catalog-rejected'` with `context.status === 403` → label includes "(status 403)".
- `'catalog-rejected'` with no `context.status` → label omits status fragment.
- `'aborted'` → defensive fallback rendered.
- Exhaustiveness: assert all 7 reasons have a rendering (test iterates over a literal array of all 7).

**Files**:
- `src/ui/DetectionFailedView.tsx` (new, ~90 lines).
- `src/ui/DetectionFailedView.module.scss` (new, ~30 lines).
- `test/ui/DetectionFailedView.test.tsx` (new, ~180 lines).

## Test strategy

TDD per `DIRECTIVE_034`. All three subtasks are independent files; pick any order or parallelize.

Tests use `@testing-library/react` + happy-dom (existing setup in `test/setup.ts`). Pattern:
```ts
import { render, screen } from '@testing-library/react';
render(<ScanningView progress={{ stage: 'enriching', processed: 50, total: 100 }} />);
expect(screen.getByRole('status')).toHaveTextContent(/Enriching catalog data/);
expect(screen.getByRole('status')).toHaveTextContent(/50 \/ 100/);
```

Coverage gate: 100% line + branch on all three components.

## Definition of Done

- [ ] Six files (three components + three scss modules) exist with JSDoc on every exported component.
- [ ] Each component has a matching `*.test.tsx` covering the case matrix.
- [ ] `aria-live="polite"` on `ScanningView`.
- [ ] AS-1 ("No duplicates found") wording verbatim in `DetectionLoadedSummary`.
- [ ] `DetectionFailedView` exhaustiveness enforced via `never`-catch.
- [ ] `npm run test:run` and `npm run typecheck` green; 100% coverage on the three components.
- [ ] `test/architecture.test.ts` reports no violations (no `src/adapters/` or `src/ports/` imports in any of the three components).

## Risks

| Risk | Mitigation |
|---|---|
| ARIA-live announcing every progress event creates announcement spam | Container is `aria-live="polite"`; per-event re-renders are governed by React; testing-library cannot assert announcement cadence — only ARIA shape. Document that practical announcement happens at stage transitions; counter updates are silent enough for users. |
| `catalog-rejected` interpolation breaks if `context.status` is not a number | Type-narrow `context.status` to `number` before interpolating; fall back to no-status suffix. |
| Plural/singular drift between `groups.length === 1` and `groups.length > 1` | Test cases lock both singular and plural forms; reviewer eyeballs the copy. |
| `aborted` rendering in production indicates a store bug | Defensive fallback prevents a crash; reviewer flags any test that exercises this path through the production store (should never happen). |

## Reviewer guidance

- Confirm `aria-live="polite"` on `ScanningView`'s container.
- Confirm AS-1 phrase "No duplicates found" is present in `DetectionLoadedSummary`.
- Confirm exhaustiveness check in `DetectionFailedView` — a quick way to verify is to remove a case temporarily and observe the `tsc` error.
- Confirm `skippedLocalCount: 0` and `unenrichedCount: 0` produce NO annotations (not "Skipped 0 local files").
- Confirm catalog-rejected with status interpolates; without status omits the fragment.

## Implementation command

```bash
spec-kitty agent action implement WP07 --agent <name>
```

## Activity Log

- 2026-06-10T09:23:50Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19710 – Assigned agent via action command
- 2026-06-10T14:15:36Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19710 – Moved to planned
