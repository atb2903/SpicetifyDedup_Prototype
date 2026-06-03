---
work_package_id: WP02
title: State View Styling (CSS Modules)
dependencies: []
requirement_refs:
- FR-003
- FR-004
- FR-005
- FR-006
- NFR-006
- NFR-007
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T007
- T008
- T009
- T010
- T011
- T012
- T013
history:
- timestamp: '2026-06-03T19:01:12Z'
  actor: tasks-generator
  note: Initial work package created from plan.md WP-02 (P2 CSS-modules styling).
authoritative_surface: src/ui/
execution_mode: code_change
mission_slug: dedup-page-live-client-polish-01KT6ZCR
owned_files:
- src/ui/IdleView.tsx
- src/ui/IdleView.module.scss
- src/ui/LoadingView.tsx
- src/ui/LoadingView.module.scss
- src/ui/LoadedView.tsx
- src/ui/LoadedView.module.scss
- src/ui/EmptyView.tsx
- src/ui/EmptyView.module.scss
- src/ui/FailedView.tsx
- src/ui/FailedView.module.scss
- src/ui/PlaylistRow.tsx
- src/ui/PlaylistRow.module.scss
- src/ui/LikedSongsRow.tsx
- src/ui/LikedSongsRow.module.scss
- src/styles/_tokens.module.scss
- test/ui/IdleView.test.tsx
- test/ui/LoadingView.test.tsx
- test/ui/LoadedView.test.tsx
- test/ui/EmptyView.test.tsx
- test/ui/FailedView.test.tsx
- test/ui/PlaylistRow.test.tsx
- test/ui/LikedSongsRow.test.tsx
priority: P2-MEDIUM
tags: []
---

# WP-02 — State View Styling (CSS Modules)

**Closes**: spec §1 P2 (MEDIUM) — "None of the dedup component classes have CSS. Every state view ships in browser-default styling; rows collapse adjacent inline spans into a single visual word."
**Requirements**: FR-003, FR-004, FR-005, FR-006. Also NFR-006 (visual evidence at mission DoD — captured at accept time via quickstart.md), NFR-007 (README portion).
**Acceptance test (independent)**: from a single glance, all five state views are visually distinguishable; rows have visible separation; spinner + retry are recognizable as their respective controls.

This WP styles seven view components: the five FSM state views (Idle, Loading, Loaded, Empty, Failed) and the two row components (PlaylistRow, LikedSongsRow). Each view gets its own `.module.scss` per the per-component CSS-modules pattern locked in research §2. A shared `_tokens.module.scss` aliases the `--spice-*` host variables so the views theme correctly under any Spicetify theme.

**Important — no Spotify chrome classnames**. The CSS rules must rely on stable selectors only (the CSS-module's own classes, `--spice-*` variables, structural selectors). Hashed Spotify class names rotate per build (research §1).

---

## Branch Strategy

- **Planning base / merge target**: `get_library`.
- **This lane's workspace and branch**: assigned by `finalize-tasks` (see `lanes.json`).
- **Merge cadence**: lane merges back to `get_library` on done.

---

## Context — what changes

Today every view component renders with literal string classNames like `"dedup-idle__copy"` or `"dedup-row"`, but no CSS file targets those selectors. The result: browser-default styling everywhere. The five state views are visually indistinguishable; rows collapse into a single visual word.

After this WP:
- Each view imports `styles` from its own `.module.scss` and uses `styles.copy`, `styles.row`, etc.
- The seven views together cover the five visually distinct states FR-003 demands.
- Rows have a grid layout with cover / name / owner / count columns, separated by borders/spacing per FR-004.
- Null `imageUrl` rows render a placeholder cover (FR-005).
- The Loading view's spinner and Failed view's retry button are visually recognizable (FR-006).
- A shared `_tokens.module.scss` aliases `--spice-text`, `--spice-button`, `--spice-main`, `--spice-card`, `--spice-sidebar` for use across the seven view modules.

**Assertion guidance**: tests use `@testing-library/react` queries (accessible role, accessible name) plus `getComputedStyle()` numerical bounds. Tests do NOT inspect classnames directly (CSS-module hashing makes this brittle) and do NOT depend on Spotify's chrome classes.

---

## Subtasks

### T007 — Create `src/styles/_tokens.module.scss`

**Purpose**: shared variable aliasing so the seven view modules pull from one source of truth.

**File**: `src/styles/_tokens.module.scss` (NEW).

**Content sketch**:
```scss
:root {
  --dedup-text: var(--spice-text, #fff);
  --dedup-subtext: var(--spice-subtext, #b3b3b3);
  --dedup-button: var(--spice-button, #1db954);
  --dedup-button-disabled: var(--spice-button-disabled, #535353);
  --dedup-card: var(--spice-card, #181818);
  --dedup-card-hover: var(--spice-card-hover, #282828);
  --dedup-main: var(--spice-main, #121212);
  --dedup-sidebar: var(--spice-sidebar, #000);
  --dedup-error: var(--spice-notification-error, #e22134);
}
```
The fallback colors are Spotify-default greens/grays so the page is legible even when a theme does not declare the `--spice-*` variables. Each view module references `var(--dedup-*)` instead of `var(--spice-*)` directly — a single point of theme contract.

**Validation**: the file is imported (or `@use`'d) by each view module without SCSS errors; `npm run build` succeeds.

---

### T008 — IdleView styling (TDD: distinct-styling)

**Files**:
- `test/ui/IdleView.test.tsx` (existing — extend)
- `src/ui/IdleView.module.scss` (NEW)
- `src/ui/IdleView.tsx` (existing — minor edit: import styles, swap classNames)

**Steps**:
1. Add failing test: `it('FR-003 — Idle view is visually distinct (Load button is the visual primary)', …)`. Assert via `getComputedStyle(button).backgroundColor` or similar that the Load button has a non-default background (use the `--dedup-button` fallback color as the expected value; the test asserts non-`rgba(0,0,0,0)` and matches the token value).
2. Run — must fail on current code.
3. Write `IdleView.module.scss` with a `.container`, `.copy`, `.button` rule set. Button styling: primary background using `var(--dedup-button)`, sufficient padding, `:hover` darkening, `cursor: pointer`.
4. Edit `IdleView.tsx`: `import styles from './IdleView.module.scss';` and swap each `className="dedup-idle__…"` to `className={styles.…}`.
5. Re-run — green.

**Validation**: assertion uses accessible-role queries only; no class-name inspection.

---

### T009 — LoadingView styling (TDD: spinner visible — FR-006)

**Files**:
- `test/ui/LoadingView.test.tsx` (existing — extend)
- `src/ui/LoadingView.module.scss` (NEW)
- `src/ui/LoadingView.tsx` (existing — minor edit)

**Steps**:
1. Add failing test: `it('FR-006 — Loading view renders a recognisable spinner', …)`. Assert via `screen.getByRole('status')` (or `screen.getByLabelText(/loading/i)`) that a spinner element is present. Optional: assert `getComputedStyle(spinner).animationName` is non-`none`.
2. Run — must fail (current `LoadingView` likely has no `role="status"` or no animation).
3. Write `LoadingView.module.scss`. Use a simple CSS spinner (border-based, ~32px) with a `@keyframes` rotation. Center the spinner with the copy below.
4. Edit `LoadingView.tsx`: add `role="status"` (or similar accessible affordance) on the spinner element; swap classNames to module styles.
5. Re-run — green.

**Constraint** (spec §7): the only animation allowed in this mission is a basic spinner. No other motion design.

**Validation**: spinner has an accessible role; CSS animation is local (not relying on host classes).

---

### T010 — LoadedView + PlaylistRow + LikedSongsRow styling (TDD: row separation FR-004, placeholder FR-005)

**Files**:
- `test/ui/LoadedView.test.tsx`, `test/ui/PlaylistRow.test.tsx`, `test/ui/LikedSongsRow.test.tsx` (existing — extend)
- `src/ui/LoadedView.module.scss`, `src/ui/PlaylistRow.module.scss`, `src/ui/LikedSongsRow.module.scss` (NEW)
- `src/ui/LoadedView.tsx`, `src/ui/PlaylistRow.tsx`, `src/ui/LikedSongsRow.tsx` (existing — minor edits)

This is the largest subtask because the loaded surface composes three components.

**Steps**:
1. **PlaylistRow tests (failing first)**:
   - `it('FR-004 — Row has visible separation from siblings (border-bottom or non-zero gap)', …)`. Render two rows in a `<ul>`; assert `getComputedStyle(row).borderBottomWidth` is non-zero OR sibling-gap via flex/grid is non-zero.
   - `it('FR-004 — Row spans (cover, name, owner, count) are not collapsed into a single visual word', …)`. Assert spans render in a grid/flex layout, not as inline siblings. Verify via `display` computed value of the row's children container.
   - `it('FR-005 — Null imageUrl renders a placeholder cover, not a broken image', …)`. Render a row whose `imageUrl` is `null`. Assert NO `<img>` element with empty `src`; assert the placeholder element has a recognizable accessible name (`aria-label`) like "No cover image" or similar.
2. Run — must fail.
3. Write `PlaylistRow.module.scss` with grid layout (`grid-template-columns: 48px 1fr auto auto;` or equivalent), `border-bottom: 1px solid rgba(255,255,255,0.06)`, `padding: 8px 12px`, `:hover { background: var(--dedup-card-hover); }`. No selection — per C-003 row selection is out of scope.
4. Placeholder cover: when `imageUrl` is `null`, render a `<div className={styles.placeholder} aria-label="No cover image" />` styled as a 48×48 neutral square with a music-note glyph (use a unicode character — keep dependencies thin).
5. Edit `PlaylistRow.tsx` to import styles + swap class names + render the placeholder branch.
6. Repeat the same pattern for `LikedSongsRow.tsx` (same row contract; the only difference is that LikedSongs has no owner field and uses a different cover treatment).
7. **LoadedView test**: extend existing to assert the rendered `<ul>` has at least one row + the row grid layout cascades (sanity check).
8. Write `LoadedView.module.scss` with the list container styling (margin, `list-style: none`, max-width, etc.).
9. Edit `LoadedView.tsx` to import styles + swap class names.
10. Re-run — green.

**Validation**:
- Tests pass without referencing Spotify chrome classes.
- The three components together render a visually coherent loaded surface; from a glance the row layout is recognizable as a list (FR-003).
- Null-imageUrl rows do NOT render an empty `<img>` — they render the placeholder.

---

### T011 — EmptyView styling (TDD: distinct from Failed)

**Files**:
- `test/ui/EmptyView.test.tsx` (existing — extend)
- `src/ui/EmptyView.module.scss` (NEW)
- `src/ui/EmptyView.tsx` (existing — minor edit)

**Steps**:
1. Add failing test: `it('FR-003 — Empty view reads as a normal outcome (not an error)', …)`. Assert NO `role="alert"` element is rendered; assert the visible copy is positive in tone (matches existing copy contract).
2. Add second failing test: visual distinctiveness — assert the container has a non-default styled background or layout (e.g. centered text, generous padding).
3. Run — must fail.
4. Write `EmptyView.module.scss`: centered layout, calm color, neutral copy treatment. Distinct from Failed via absence of red/alert color.
5. Edit `EmptyView.tsx` — swap class names.
6. Re-run — green.

**Validation**: rendered Empty view contains no `role="alert"`; styling reads as "everything is fine, you just have nothing here."

---

### T012 — FailedView styling (TDD: retry visible per FR-006, distinct from Empty)

**Files**:
- `test/ui/FailedView.test.tsx` (existing — extend)
- `src/ui/FailedView.module.scss` (NEW)
- `src/ui/FailedView.tsx` (existing — minor edit)

**Steps**:
1. Add failing test: `it('FR-006 — Retry affordance is visually distinguishable as a control', …)`. Assert via `screen.getByRole('button', { name: /retry/i })` that the retry button exists; assert `getComputedStyle(retry).backgroundColor` is non-transparent and matches an actionable color (use the `--dedup-button` fallback as the expected token).
2. Add second failing test: `it('FR-003 — Failed view reads as an error (alert role present)', …)`. Assert `screen.getByRole('alert')` exists.
3. Run — must fail.
4. Write `FailedView.module.scss`: alert-styled container (red-ish accent on a neutral background, or use `var(--dedup-error)`), centered layout, retry button styled with primary affordance treatment.
5. Edit `FailedView.tsx` — swap class names; ensure the alert container has `role="alert"` and the retry button has accessible name "Retry".
6. Re-run — green.

**Validation**: rendered Failed view contains a `role="alert"` element AND a visible retry button.

---

### T013 — README (NFR-007 portion)

**File**: `README.md` (existing).

**Steps**:
1. Add a single line in the relevant section: "Each FSM state view (idle / loading / loaded / empty / failed) ships its own CSS module styled against the host's `--spice-*` variables, so the page theming follows the user's active Spicetify theme."
2. Keep minimal; do not restructure.

**Validation**: README diff present and concise.

---

## Definition of Done

This WP is done when **all** of the following hold:

1. T007 tokens file lands; T008..T012 each follow the TDD loop (failing test → green); T013 README line committed.
2. `npm run test:run` exits 0 with the new tests included.
3. `npm run typecheck` exits 0.
4. `npm run test:coverage` reports `lines: 100%` and `branches: 100%`.
5. Architecture test green (no new `ui` → `adapters`/`ports` imports).
6. JSDoc on the seven view components reflects their new styling responsibilities (NFR-008).
7. Per NFR-001: failing-test commits precede the corresponding fix commits within this WP.
8. **NFR-006 evidence is captured at mission DoD, not in this WP** — quickstart.md §2 instructs the user to capture five state screenshots into the dated artifact at `kitty-specs/.../live-verification.<YYYY-MM-DD>.md`. This WP does not gate on the screenshots; it gates on the tests being green so the screenshots will look right at accept time.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Tests rely on hashed Spotify classnames | Forbidden. Use role-based queries + `getComputedStyle` numerical bounds. Reviewer rejects any test that targets `.main-*` selectors. |
| Spinner animation flaky in happy-dom | Assert spinner *element* presence + accessible role; do NOT assert animation frame timing. `getComputedStyle(spinner).animationName !== 'none'` is acceptable as a structural assertion. |
| `--spice-*` variables undefined in tests | The `_tokens.module.scss` provides fallbacks; tests assert *either* the `--spice-*` value or the fallback (use a token alias check, not an exact color). |
| Existing view tests break when classNames change | Tests already query by role/accessible-name (the prior mission's pattern); the swap is mechanical. If any existing test queries by literal classname, update it to use a stable query in the same commit. |
| Tokens file imports/`@use` breaks under SCSS build | Validate locally with `npm run build` after T007 before moving on; this catches SCSS syntax issues early. |

---

## Reviewer Guidance

A reviewer should check:

1. **NFR-001**: failing test commits precede fix commits per subtask.
2. **No hashed classnames**: grep the new `.module.scss` files for `.main-` or other Spotify chrome prefixes — must be zero hits.
3. **Theme variables**: views reference `var(--dedup-*)` (or `var(--spice-*)` direct), never hardcoded colors except in `_tokens.module.scss` fallbacks.
4. **Accessibility**: each view has the right ARIA roles (Loading → `role="status"`, Failed → `role="alert"`, Retry button → accessible name "Retry").
5. **Row layout**: PlaylistRow and LikedSongsRow render the cover-name-owner-count surface in a grid/flex container, not inline spans.
6. **Placeholder cover**: null-imageUrl rows render the placeholder, not a broken image.
7. **JSDoc** on each view reflects the styling responsibility (NFR-008).
8. **README** diff is present and concise (NFR-007).
9. **Coverage**: 100/100 (NFR-002).
10. **Out of scope**: no design tokens system, no dark/light mode toggle, no animations beyond the spinner (C-003).

---

## Out of Scope (do NOT do in this WP)

- Topbar offset / scroll surface (covered by WP-01).
- Store changes (covered by WP-05).
- Navigation port (covered by WP-03).
- Adapter changes (covered by WP-04).
- Design system / theme tokens beyond `--spice-*` aliasing (C-003).
- Dark/light mode toggle (C-003).
- Animations beyond the basic spinner (C-003).
- Row selection or context-menu affordances (C-003).
- Generating composite covers from track art (C-003).
