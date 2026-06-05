---
work_package_id: WP02
title: DedupButton component + harness probe
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-004
- FR-007
- NFR-001
- NFR-002
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
history:
- date: '2026-06-05'
  note: Drafted by /spec-kitty.tasks.
authoritative_surface: src/ui/DedupButton.tsx
execution_mode: code_change
mission_id: 01KTC3GY1VM87DPV0SEDQS24NE
mission_slug: dedup-button-per-playlist-row-01KTC3GY
owned_files:
- src/ui/DedupButton.tsx
- src/ui/DedupButton.module.scss
- test/ui/DedupButton.test.tsx
- package.json
priority: P1
tags: []
---

# WP02 — DedupButton component + harness probe

## Objective

Ship `src/ui/DedupButton.tsx` — a presentational React component with two string props (`playlistName`, `playlistUri`) that renders a native `<button type="button">` and wires `onClick` to `logDedupClick` from WP01. Full coverage and side-effect isolation tests. Probe happy-dom's button-key-to-click synthesis up front so the keyboard tests use `fireEvent.keyDown` if possible (avoiding the `@testing-library/user-event` devDependency); fall back to `user-event` only if the probe rules out the simpler harness.

## Context

- **Spec**: FR-001 (button renders), FR-002 (1-to-1 binding), FR-004 (correct binding under interaction), FR-007 (no mutation), NFR-001 (keyboard), NFR-002 (accessible name), SC-003 (keyboard-only), C-002 (no runtime deps), C-003 (file-level SRP), C-006 (black-box).
- **Plan**: §Phase 1 Design, §Test coverage map.
- **Research**: Decision 1 (native button), Decision 3 (two string props), Decision 5 (test harness + probe), Decision 8 (visible text "Dedup" + aria-label includes name).
- **Data model**: §1 (`DedupButtonProps`, JSDoc, string-edge tests), §6 (optional CSS module).
- **Imports**: this WP imports `logDedupClick` from WP01's `src/ui/dedup-click-log.ts`. The architecture test still permits `src/ui/` ↔ `src/ui/` imports.

## Branch strategy

- Planning/base branch: `main`.
- Merge target: `main`.
- This WP depends on WP01; the lane resolver gives the correct base after WP01 lands.
- Execution worktree per `lanes.json`.

## Implementation command

```bash
spec-kitty agent action implement WP02 --agent <name>
```

## Detailed guidance per subtask

### Subtask T005 — happy-dom button-key-to-click synthesis probe

**Purpose**: Decide before writing production tests whether `fireEvent.keyDown(button, { key: 'Enter' })` synthesises a click event on a native `<button>` in happy-dom 20.9. If yes: skip T009, use `fireEvent` for everything (matches existing project patterns — `grep -rn "userEvent" test/` returns zero results today). If no: T009 adds `@testing-library/user-event` as a devDependency.

**Steps**:

1. Create a throw-away probe section inside a new `test/ui/DedupButton.test.tsx` file. Wrap it in `describe.skip('PROBE — happy-dom keyboard synthesis (delete after T006)', () => {})` to make its intent obvious:
   ```ts
   import { render, screen, fireEvent } from '@testing-library/react';
   import { vi } from 'vitest';
   import React from 'react';

   describe('PROBE — happy-dom button-key-to-click synthesis', () => {
     it('Enter on a focused native <button> triggers onClick', () => {
       const handler = vi.fn();
       render(<button type="button" onClick={handler}>Probe</button>);
       const btn = screen.getByRole('button', { name: /Probe/ });
       btn.focus();
       fireEvent.keyDown(btn, { key: 'Enter' });
       expect(handler).toHaveBeenCalledTimes(1);
     });
     it('Space on a focused native <button> triggers onClick', () => {
       const handler = vi.fn();
       render(<button type="button" onClick={handler}>Probe</button>);
       const btn = screen.getByRole('button', { name: /Probe/ });
       btn.focus();
       fireEvent.keyDown(btn, { key: ' ' });
       expect(handler).toHaveBeenCalledTimes(1);
     });
   });
   ```
2. Remove the `.skip` for one run: `npm run test:run -- test/ui/DedupButton.test.tsx`.
3. Record the outcome in a comment at the top of `DedupButton.test.tsx` once the probe is converted into production tests (e.g. `// happy-dom 20.9 probe (2026-06-05): fireEvent.keyDown synthesises click on focused native button — see WP02 commit <hash>`).
4. **If both probe tests PASS**: production tests will use `fireEvent.keyDown` for SC-003 coverage. Skip T009. Delete the probe block once T006 is written.
5. **If either probe test FAILS**: production tests will need `@testing-library/user-event`. Proceed to T009. Then write keyboard tests using `userEvent.keyboard('{Enter}')` and `userEvent.keyboard(' ')` after the user-event setup.

**Files**:
- `test/ui/DedupButton.test.tsx` (new — probe lives here temporarily before T006 overwrites it).

**Validation**:
- [ ] Probe ran. Outcome documented in T005's comment / commit message.
- [ ] If probe passed, T009 is N/A and `package.json` is untouched in this WP.
- [ ] If probe failed, T009 will add the devDependency.

### Subtask T006 — Write failing tests for `DedupButton`

**Purpose**: TDD RED step. Pin down every assertion the component must satisfy before writing it. ~7 tests covering FR-001, FR-002, FR-003, FR-004, FR-007, NFR-001, NFR-002, SC-003, and the string-edge cases per data-model §1.

**Steps**:

1. Overwrite the probe in `test/ui/DedupButton.test.tsx` with the real test suite. Imports:
   ```ts
   import React from 'react';
   import { render, screen, fireEvent } from '@testing-library/react';
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   // If T005 probe failed:
   // import userEvent from '@testing-library/user-event';
   import { DedupButton } from '../../src/ui/DedupButton';
   ```
2. Set up `console.log` spy (with `mockImplementation(() => {})`) in `beforeEach`, restore in `afterEach`.
3. Inside `describe('DedupButton', () => { ... })`, the seven tests:
   - **(a)** `it('renders an accessible button labelled "Dedup <name>"', ...)` — render with `playlistName="My Playlist"`. `expect(screen.getByRole('button', { name: /^Dedup My Playlist$/ })).toBeInTheDocument()`. Confirms FR-001 + NFR-002.
   - **(b)** `it('shows visible text "Dedup"', ...)` — same render. `expect(screen.getByText('Dedup')).toBeInTheDocument()`. Confirms Decision 8.
   - **(c)** `it('logs [Dedup] clicked: <name> (<uri>) on mouse click', ...)` — click via `fireEvent.click(button)`. Assert `console.log` spy was called exactly once with `[Dedup] clicked: My Playlist (spotify:playlist:abc)`. Confirms FR-003 + FR-004.
   - **(d)** `it('logs the same line when Enter is pressed on a focused button', ...)` — `btn.focus()`; `fireEvent.keyDown(btn, { key: 'Enter' })` (or `userEvent.keyboard('{Enter}')` per T005). Same assertion as (c). Confirms NFR-001 + SC-003.
   - **(e)** `it('logs the same line when Space is pressed on a focused button', ...)` — same shape with `key: ' '` or `userEvent.keyboard(' ')`.
   - **(f)** `it('is tab-focusable (document.activeElement after .focus())', ...)` — render; `btn.focus()`; `expect(document.activeElement).toBe(btn)`. Confirms NFR-001 focusability.
   - **(g)** `it('does not touch any Spicetify or store API', ...)` — set `vi.stubGlobal('Spicetify', { Platform: { RootlistAPI: { getContents: vi.fn() }, LibraryAPI: { getTracks: vi.fn() } } })` in `beforeEach`, `vi.unstubAllGlobals()` in `afterEach`. Render. Click. Assert each stubbed method was called zero times. `console.log` is the only side effect. Confirms FR-007 + C-001.
4. **String-edge boundary tests** per data-model §1 (separate `describe('DedupButton — string edges', () => { ... })`):
   - `playlistName = ''` → `aria-label="Dedup "` (with trailing space); click logs `'[Dedup] clicked:  (spotify:playlist:xyz)'`.
   - `playlistName = 'A'` (one char) → `aria-label="Dedup A"`; click logs `'[Dedup] clicked: A (spotify:playlist:single)'`.
   - `playlistName = 'A'.repeat(500)` (long) → button renders without truncating in the DOM; `aria-label` contains the full 500-char string; click logs the full string.
   - `playlistName = '🎵 漢字 "quoted" ‮'` (mixed special) → `aria-label` contains the literal mixed-special string; click logs the literal verbatim.

   For each, assert: button exists with the expected accessible name; one click → one log line with the exact verbatim string.
5. Watch RED: `npm run test:run -- test/ui/DedupButton.test.tsx` fails because `DedupButton` doesn't exist yet.

**Files**:
- `test/ui/DedupButton.test.tsx` (~250 lines).

**Validation**:
- [ ] All 7 base tests + 4 string-edge tests written.
- [ ] All fail with the expected reason (component not found) — RED state confirmed.
- [ ] No `userEvent` import unless T005 probe failed.

### Subtask T007 — Implement `src/ui/DedupButton.tsx`

**Purpose**: TDD GREEN step. Make every test in T006 pass with the smallest possible component.

**Steps**:

1. Create `src/ui/DedupButton.tsx`:
   ```tsx
   /**
    * Per-row Dedup affordance (FR-001, FR-002, NFR-001, NFR-002).
    *
    * Presentational — accepts the playlist's display name and canonical
    * URI as separate string props (data-model §1, research §3). On
    * activation (mouse, Enter, or Space), invokes `logDedupClick(name, uri)`
    * which writes one diagnostic line to the dev console (FR-003).
    *
    * The button does NOT call any host API, does NOT mutate any state, and
    * does NOT render any user-visible confirmation (FR-007, C-001). The
    * temporary diagnostic surface is documented at
    * `.claude/adr/0006-console-only-dedup-click-confirmation.md`.
    */
   import React from 'react';
   import { logDedupClick } from './dedup-click-log';
   // If T008 lands, also: import styles from './DedupButton.module.scss';

   export type DedupButtonProps = {
     playlistName: string;
     playlistUri: string;
   };

   export function DedupButton({ playlistName, playlistUri }: DedupButtonProps) {
     return (
       <button
         type="button"
         // className={styles.button} if T008 lands
         aria-label={`Dedup ${playlistName}`}
         onClick={() => logDedupClick(playlistName, playlistUri)}
       >
         Dedup
       </button>
     );
   }
   ```
2. JSDoc per the data-model §1 text (extended JSDoc on `DedupButtonProps` fields too).
3. Confirm no imports outside `react` and `./dedup-click-log`. The architecture test forbids `src/adapters/` and `src/ports/` from `src/ui/`; this file imports neither.
4. Run: `npm run test:run -- test/ui/DedupButton.test.tsx`. All tests should pass.

**Files**:
- `src/ui/DedupButton.tsx` (~40 lines including JSDoc).

**Validation**:
- [ ] All tests from T006 pass.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test:run -- test/architecture.test.ts` still passes.

### Subtask T008 — Add `src/ui/DedupButton.module.scss` (conditional)

**Purpose**: Ship a dedicated CSS module *only if* the styling is more than one or two rules. Data-model §6 sketches a likely rule set.

**Decision rule**: If the button needs (a) hover treatment, (b) focus-visible outline, AND (c) padding/border-radius for visual fit — that's 3+ rules; ship the module. If a single `padding: 4px 8px; border: 1px solid var(--dedup-card-hover);` covers the visual target, inline it via a `style` prop instead.

**Steps (if shipping the module)**:

1. Create `src/ui/DedupButton.module.scss`:
   ```scss
   @use '../styles/tokens.module' as tokens;
   @include tokens.declare;

   .button {
     background: transparent;
     border: 1px solid var(--dedup-card-hover);
     color: var(--dedup-text);
     padding: 4px 12px;
     border-radius: 12px;
     font-size: 12px;
     cursor: pointer;
     transition: background-color 120ms ease, border-color 120ms ease;

     &:hover {
       background: var(--dedup-card-hover);
       border-color: var(--dedup-button);
     }

     &:focus-visible {
       outline: 2px solid var(--dedup-button);
       outline-offset: 2px;
     }
   }
   ```
2. Import in `DedupButton.tsx`: `import styles from './DedupButton.module.scss';` and apply `className={styles.button}`.
3. Tests don't assert on classNames (black-box per C-006), so no test changes.

**Steps (if NOT shipping the module)**:

1. Inline a `style={{ … }}` literal on the `<button>` element with the same visual target.
2. Document the choice in the WP commit message.

**Files** (if shipping module):
- `src/ui/DedupButton.module.scss` (~30 lines).

**Validation**:
- [ ] Either the module file exists or the inline style is present.
- [ ] No `className={undefined}` slipping through.
- [ ] Visual check (informal): the button is distinguishable as a button in the live client. Live verification happens in WP06.

### Subtask T009 — Add `@testing-library/user-event` as devDependency (CONDITIONAL on T005)

**Purpose**: If the T005 probe failed, install `@testing-library/user-event` as a devDependency to drive keyboard tests.

**Steps**:

1. Confirm T005 documented the probe outcome and the decision to add user-event.
2. `npm install --save-dev @testing-library/user-event`.
3. Confirm `package.json` lists the package under `devDependencies`, NOT `dependencies` (C-002 violation if it's in the latter — spec is explicit).
4. Re-run T006 with `userEvent.keyboard('{Enter}')` / `userEvent.keyboard(' ')` for the keyboard tests.
5. Note in the WP commit: "Added @testing-library/user-event devDependency because happy-dom 20.9 probe (T005) showed `fireEvent.keyDown` does not synthesise click on native <button>."

**Files**:
- `package.json` (modified — `devDependencies` only).
- `package-lock.json` or equivalent lock file.

**Validation** (only if T005 probe failed):
- [ ] Package present in `devDependencies`, NOT in `dependencies`.
- [ ] `npm run test:run` still green.
- [ ] WP commit message documents the probe outcome.

**Skip this subtask entirely** if T005 probe passed.

### Subtask T010 — Verify coverage 100% line / 100% branch on new file(s)

**Purpose**: Lock in NFR-004 / SC-004 for the button.

**Steps**:

1. Run: `npm run test:coverage`. Inspect the coverage table for `src/ui/DedupButton.tsx` (and `src/ui/DedupButton.module.scss` if shipped — SCSS files aren't typically reported as coverable, so this is effectively a TS-file check).
2. Confirm 100% statements, branches, functions, lines on `src/ui/DedupButton.tsx`.
3. If the inline-style path was chosen (T008 skipped), coverage on the component is still measured the same way.
4. Capture the coverage row into the WP commit message.

**Validation**:
- [ ] `src/ui/DedupButton.tsx`: 100% line / 100% branch / 100% function / 100% statement.
- [ ] Project-wide thresholds still pass.

## Definition of Done

- [ ] `src/ui/DedupButton.tsx` exists with the JSDoc, props, and JSX described above.
- [ ] `src/ui/DedupButton.module.scss` exists if T008's decision rule triggered; otherwise inline styling is in place and documented.
- [ ] `test/ui/DedupButton.test.tsx` exists with 7 base tests + 4 string-edge tests, all green.
- [ ] T005 probe outcome documented in a top-of-file comment and in the WP commit.
- [ ] `package.json` `devDependencies` includes `@testing-library/user-event` ONLY if T005 probe failed (C-002 compliance otherwise).
- [ ] `npm run test:run` overall passes.
- [ ] `npm run test:coverage` reports 100/100 on `src/ui/DedupButton.tsx`.
- [ ] Architecture test (`test/architecture.test.ts`) passes.
- [ ] WP committed inside the lane worktree.

## Risks

- **happy-dom probe drift**: a future happy-dom upgrade may change the synthesis semantics. Document the probe in a comment so the next contributor knows to re-probe.
- **Side-effect isolation false negative**: the global Spicetify stub must be `beforeEach`-scoped and `afterEach`-cleared. Leaking it pollutes downstream tests.
- **C-002 violation via dependency misclassification**: triple-check `package.json` if T009 lands. `user-event` MUST be in `devDependencies`. Reviewer-visible.
- **Visible-text drift**: the test for "Dedup" visible text uses `getByText('Dedup')`. If `aria-label` is `Dedup My Playlist`, accessible-name resolution could surface the aria-label instead — but `getByText` queries the rendered text content, not the accessible name. The test as written is correct.
- **`getByRole` and accessible-name regex**: use `/^Dedup My Playlist$/` (anchored) to avoid matching partial overlaps.

## Reviewer guidance

- Confirm `src/ui/DedupButton.tsx` imports only `react` and `./dedup-click-log`.
- Confirm `aria-label={`Dedup ${playlistName}`}` matches the data-model and tests.
- Confirm the keyboard tests use `fireEvent.keyDown` OR `userEvent.keyboard` consistently and that T005's probe outcome justifies the choice.
- Confirm `package.json` is unchanged unless T009 triggered, and if it did, the package is in `devDependencies` only.
- Confirm string-edge tests use `toBe`/`toHaveBeenCalledWith` for exact equality.
- Confirm coverage row for the component is 100/100.

## WHEN DONE

```bash
spec-kitty agent action implement-done WP02 --agent <name> --mission dedup-button-per-playlist-row-01KTC3GY
```
