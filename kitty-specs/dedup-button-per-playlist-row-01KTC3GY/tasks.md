# Tasks — Dedup Button Per Playlist Row

**Mission**: `dedup-button-per-playlist-row-01KTC3GY`
**Mission ID**: `01KTC3GY1VM87DPV0SEDQS24NE`
**Branch contract**: current `main` → planning/base `main` → merge target `main`
**Generated**: 2026-06-05T15:00:25Z
**Plan**: [`plan.md`](plan.md) | **Spec**: [`spec.md`](spec.md) | **Research**: [`research.md`](research.md) | **Data model**: [`data-model.md`](data-model.md) | **Quickstart**: [`quickstart.md`](quickstart.md)

## Overview

Six work packages decompose along strict file-ownership boundaries. Foundation → component → two parallel row integrations → integration coverage → live-client sign-off. Each WP is independently implementable, lands with failing tests first (DIRECTIVE_034), and contributes to the spec's 100% line/branch coverage gate (NFR-004).

**Dependency chain (sequential except WP03/WP04 split)**:

```
WP01 ─┬─ WP02 ─┬─ WP03 ─┐
      │        │        ├─ WP05 ── WP06
      │        └─ WP04 ─┘
      │
      └─ (ADR lands inside WP01)
```

WP03 and WP04 touch disjoint file sets and can run in parallel after WP02 merges.

## Subtask Index

| ID | Description | WP | Parallel |
|---|---|---|---|
| T001 | Write failing tests for `logDedupClick` (3 cases: ASCII, empty name, mixed-special) | WP01 | | [D] |
| T002 | Implement `src/ui/dedup-click-log.ts` to make T001 green | WP01 | | [D] |
| T003 | Verify `npm run test:coverage` reports 100% line / 100% branch on the helper file | WP01 | | [D] |
| T004 | Write ADR `0006-console-only-dedup-click-confirmation.md` | WP01 | [D] |
| T005 | Run happy-dom button-key-to-click synthesis probe (research §5) | WP02 | | [D] |
| T006 | Write failing tests for `DedupButton` (~7 cases: render, click, keyboard, accessible name, side-effect isolation, string edges) | WP02 | | [D] |
| T007 | Implement `src/ui/DedupButton.tsx` to make T006 green | WP02 | | [D] |
| T008 | Add `src/ui/DedupButton.module.scss` if styling exceeds 1–2 inline rules | WP02 | [D] |
| T009 | If T005 probe failed, add `@testing-library/user-event` as devDependency in `package.json` | WP02 | [D] |
| T010 | Verify coverage 100% line / 100% branch on new button file(s) | WP02 | | [D] |
| T011 | Write failing assertions in `test/ui/PlaylistRow.test.tsx` (button presence, NFR-002 accessible name, NFR-003 layout non-regression) | WP03 | | [D] |
| T012 | Update `src/ui/PlaylistRow.tsx` to mount `<DedupButton>` in trailing cell with `row.displayName` and `row.key` | WP03 | | [D] |
| T013 | Update `src/ui/PlaylistRow.module.scss` — extend `grid-template-columns` from 3 to 4 columns (`48px 1fr auto auto`) | WP03 | | [D] |
| T014 | Verify all PlaylistRow tests green; coverage 100% on touched ranges | WP03 | | [D] |
| T015 | Write failing assertions in `test/ui/LikedSongsRow.test.tsx` (button presence with hardcoded URI literal, accessible name `Dedup Liked Songs`) | WP04 | | [D] |
| T016 | Update `src/ui/LikedSongsRow.tsx` to mount `<DedupButton playlistName="Liked Songs" playlistUri="spotify:collection:tracks" />` | WP04 | | [D] |
| T017 | Update `src/ui/LikedSongsRow.module.scss` — extend `grid-template-columns` from 3 to 4 columns (`48px 1fr auto auto`) | WP04 | | [D] |
| T018 | Verify all LikedSongsRow tests green; coverage 100% on touched ranges | WP04 | | [D] |
| T019 | Update `test/ui/LoadedView.test.tsx` boundary cases: 0 rows, 1 row, 3+ rows with first/middle/last button-click assertions (C-005) | WP05 | | [D] |
| T020 | Add duplicate-name fixture test in `LoadedView.test.tsx` — 5-row fixture, two playlists sharing display name, each logs distinct URI (SC-001) | WP05 | | [D] |
| T021 | Add no-ownership-filter fixture test in `LoadedView.test.tsx` — self / other / system-library, all render buttons (FR-006) | WP05 | | [D] |
| T022 | Extend 1001-row scale test in `LoadedView.test.tsx` to assert exactly 1001 buttons render (FR-002 at scale) | WP05 | | [D] |
| T023 | Add/verify `test/ui/EmptyView.test.tsx` no-Dedup-button assertion (FR-005) | WP05 | [D] |
| T024 | Run full `npm run test:run` + `npm run test:coverage`; confirm green and 100% line/branch on all touched files | WP05 | | [D] |
| T025 | Run `npm run build` and confirm deployment to `~/.config/spicetify/CustomApps/spicetify-dedup/` | WP06 | |
| T026 | Execute quickstart §2.A (per-row click logs Liked Songs + first/middle/last) and capture transcript | WP06 | |
| T027 | Execute quickstart §2.B (keyboard activation: Enter + Space) and capture transcript | WP06 | |
| T028 | Execute quickstart §2.D (host-API spies stay empty across all Dedup clicks) and capture transcript | WP06 | |
| T029 | Capture 4 screenshots per quickstart §3 into `screenshots/` | WP06 | [P] |
| T030 | Write sign-off artefact `live-verification.2026-06-05.md` (or current date) per quickstart §4 format | WP06 | |

`[P]` indicates parallel-safe within the WP (different files / no ordering constraint).

---

## Work Package Index

| WP | Title | Subtasks | Est. lines | Deps | Parallel cohort |
|---|---|---|---|---|---|
| WP01 | Click-log helper foundation + ADR | T001–T004 | ~250 | — | — |
| WP02 | DedupButton component + harness probe | T005–T010 | ~450 | WP01 | — |
| WP03 | PlaylistRow mounts DedupButton | T011–T014 | ~280 | WP02 | with WP04 |
| WP04 | LikedSongsRow mounts DedupButton | T015–T018 | ~260 | WP02 | with WP03 |
| WP05 | LoadedView + EmptyView integration coverage | T019–T024 | ~380 | WP03, WP04 | — |
| WP06 | Live-client verification + sign-off artefact | T025–T030 | ~280 | WP05 | — |

**MVP scope**: WP01 + WP02 + WP03 + WP04 + WP05 delivers the spec's full code surface. WP06 is the live-client sign-off mandated by `spec-kitty-live-verification-required` repo memory and quickstart §2 — required for `spec-kitty accept`.

---

## WP01 — Click-log helper foundation + ADR

**Goal**: Land the pure side-effect helper `logDedupClick(name, uri)` with full coverage, plus the ADR documenting the temporary diagnostic-console choice. Foundation for WP02.

**Priority**: P1 (gating — every later WP imports the helper or relies on the ADR being on disk).

**Prompt**: [`tasks/WP01-click-log-helper.md`](tasks/WP01-click-log-helper.md)

**Independent test**: `npm run test:run -- test/ui/dedup-click-log.test.ts` is green; `npm run test:coverage -- --include='src/ui/dedup-click-log.ts'` reports 100% line / 100% branch; ADR file exists at `.claude/adr/0006-console-only-dedup-click-confirmation.md`.

### Included subtasks

- [x] T001 Write failing tests for `logDedupClick` (3 cases) (WP01)
- [x] T002 Implement `src/ui/dedup-click-log.ts` to make T001 green (WP01)
- [x] T003 Verify coverage 100% line / branch on helper (WP01)
- [x] T004 Write ADR `0006-console-only-dedup-click-confirmation.md` (WP01)

### Implementation sketch

1. RED: `test/ui/dedup-click-log.test.ts` imports `logDedupClick`, spies on `console.log` via `vi.spyOn`, restores in `afterEach`, asserts (a) plain `('My Playlist', 'spotify:playlist:abc')` produces exactly `[Dedup] clicked: My Playlist (spotify:playlist:abc)`, (b) `('', 'spotify:playlist:xyz')` produces `[Dedup] clicked:  (spotify:playlist:xyz)` (verbatim — double space), (c) `('has "quotes" and 🎵', 'spotify:playlist:special')` produces the verbatim mixed-special string. Each test asserts the spy was called exactly once.
2. Watch RED. `npm run test:run -- test/ui/dedup-click-log.test.ts` must fail with "module not found" or equivalent.
3. GREEN: write `src/ui/dedup-click-log.ts` exporting a one-line function `export function logDedupClick(name: string, uri: string): void { console.log(`[Dedup] clicked: ${name} (${uri})`); }` with the JSDoc described in `data-model.md §2`.
4. Verify coverage: `npm run test:coverage -- --include='src/ui/dedup-click-log.ts'` reports 100/100.
5. Write ADR. Follow the structure of existing ADRs (e.g. `.claude/adr/0005-react-lifecycle-reset.md`). Slug `0006-console-only-dedup-click-confirmation.md`. Sections: Decision, Rationale (one paragraph), Alternatives considered (one paragraph), Consequences (note that the next mission replaces the `console.log` body without changing the signature). Cross-link the spec C-007 and `DIRECTIVE_003`.

### Parallel opportunities

T004 (ADR) is independent of T001–T003 once the decision text is settled and can be drafted in parallel by a second pair of eyes if needed; serialised in single-agent execution.

### Dependencies

None. This WP unblocks WP02.

### Risks

- **Hidden newline / trailing space in format string**: the spec's edge cases assert verbatim passthrough. Tests must use exact-equality assertions (`toBe`), not `toContain`, to catch any incidental transformation.
- **Coverage regression on existing files**: T002 only adds a new file; existing thresholds should stay unaffected. If coverage on `src/main.tsx` or any other file dips because of vitest's includeUntested behaviour, raise it as a finding for the reviewer rather than absorbing it.

---

## WP02 — DedupButton component + harness probe

**Goal**: Ship `src/ui/DedupButton.tsx` (presentational, two string props, wires `onClick` to `logDedupClick`) with full coverage. Validate happy-dom's native button-key-to-click synthesis up front so the keyboard tests use the simplest possible harness. Add `@testing-library/user-event` devDependency only if the probe rules out `fireEvent.keyDown`.

**Priority**: P1 (gating — both row WPs import this component).

**Prompt**: [`tasks/WP02-dedup-button-component.md`](tasks/WP02-dedup-button-component.md)

**Independent test**: `npm run test:run -- test/ui/DedupButton.test.tsx` is green; `npm run test:coverage -- --include='src/ui/DedupButton.*'` reports 100% line / 100% branch; `getByRole('button', { name: /Dedup .../ })` resolves the rendered button.

### Included subtasks

- [x] T005 Run happy-dom button-key-to-click synthesis probe (WP02)
- [x] T006 Write failing tests for `DedupButton` (~7 cases) (WP02)
- [x] T007 Implement `src/ui/DedupButton.tsx` to make T006 green (WP02)
- [x] T008 Add `src/ui/DedupButton.module.scss` if styling exceeds 1–2 rules (WP02)
- [x] T009 If T005 probe failed, add `@testing-library/user-event` as devDependency (WP02)
- [x] T010 Verify coverage 100% on new button file(s) (WP02)

### Implementation sketch

1. **Probe (T005)**: write a throw-away test in `test/ui/DedupButton.test.tsx` that mounts a plain `<button onClick={spy}>X</button>` and asserts `fireEvent.keyDown(btn, { key: 'Enter' })` synthesises a click that calls `spy`. Run it. If green, the production tests use `fireEvent.keyDown` for keyboard activation; skip T009. If red, T009 adds `@testing-library/user-event` to `devDependencies` (NOT `dependencies` — C-002), and keyboard tests use `userEvent.keyboard('{Enter}')` / `userEvent.keyboard(' ')`. Document the probe result in the WP commit message and in T005's comment.
2. **RED tests (T006)** — replace the probe with the real test surface. Use one fixture: `render(<DedupButton playlistName="My Playlist" playlistUri="spotify:playlist:abc" />)`. Cover:
   - Renders a `button` with `aria-label="Dedup My Playlist"` (`getByRole('button', { name: /Dedup My Playlist/ })`) — FR-001, NFR-002.
   - Has visible text `Dedup` — Decision 8 (research §8).
   - `fireEvent.click(button)` invokes `console.log` exactly once with `[Dedup] clicked: My Playlist (spotify:playlist:abc)` (use `vi.spyOn(console, 'log')`) — FR-003, FR-004.
   - Keyboard activation (Enter and Space) produces the same log — NFR-001, SC-003. Harness depends on T005.
   - `button.focus()` makes it `document.activeElement` — NFR-001 (focusability).
   - Clicking does NOT touch `globalThis.Spicetify` or any store API — FR-007. Stub `globalThis.Spicetify = { Platform: ... }` with spy methods on each property the helper might be tempted to call; assert all stayed at zero calls.
   - String-edge cases per data-model §1: render with `playlistName = ''`, `playlistName = 'A'`, `playlistName = 'A'.repeat(500)`, `playlistName = '🎵 漢字 "quoted" ‮'`. Each click logs the verbatim string.
3. Watch RED.
4. **GREEN (T007)** — write the component:
   ```tsx
   import React from 'react';
   import { logDedupClick } from './dedup-click-log';
   import styles from './DedupButton.module.scss'; // only if T008 lands; otherwise inline
   export type DedupButtonProps = { playlistName: string; playlistUri: string };
   export function DedupButton({ playlistName, playlistUri }: DedupButtonProps) {
     return (
       <button
         type="button"
         className={styles?.button /* or undefined */}
         aria-label={`Dedup ${playlistName}`}
         onClick={() => logDedupClick(playlistName, playlistUri)}
       >
         Dedup
       </button>
     );
   }
   ```
   JSDoc per `data-model.md §1`. No `React.memo` — primitive props, no perf concern.
5. **T008 decision**: if the visual treatment fits in two inline style props (e.g. `style={{ background: 'transparent', border: '1px solid var(--dedup-card-hover)' }}`), skip the module. Otherwise create `DedupButton.module.scss` per `data-model.md §6` and import it. Either path keeps coverage at 100%.
6. **T010**: `npm run test:coverage -- --include='src/ui/DedupButton.*'` reports 100/100.

### Parallel opportunities

T008 and T009 are independent of the test-writing thread (T006/T007) once their decision triggers (T005 probe outcome and styling-rule count) are known. Serialised in single-agent execution.

### Dependencies

- WP01 (the button imports `logDedupClick`).

### Risks

- **happy-dom button-key behaviour drift**: if a future happy-dom upgrade changes the synthesis semantics, this probe must be re-run. Document the probe outcome in a one-line comment at the top of the keyboard test for future contributors.
- **Side-effect isolation false negatives**: stub the Spicetify global only inside this test's lifecycle (`beforeEach` / `afterEach` with `vi.stubGlobal`). Leaking the stub into other tests would mask real regressions elsewhere.
- **C-002 violation by accident**: T009 MUST add `@testing-library/user-event` to `devDependencies`, NEVER `dependencies`. Reviewer-visible.

---

## WP03 — PlaylistRow mounts DedupButton

**Goal**: Mount `<DedupButton>` at the trailing edge of every `PlaylistRow`, extend the row's grid from 3 to 4 columns, and add per-row assertions covering FR-001, NFR-002, NFR-003 for playlist rows.

**Priority**: P2 (per-row integration; co-equal with WP04, both required for the spec to be satisfied).

**Prompt**: [`tasks/WP03-playlist-row-integration.md`](tasks/WP03-playlist-row-integration.md)

**Independent test**: `npm run test:run -- test/ui/PlaylistRow.test.tsx` is green; for a 5-row fixture, each row exposes a `getByRole('button', { name: /Dedup <name>/ })` whose click logs that row's URI.

### Included subtasks

- [x] T011 Write failing assertions in `PlaylistRow.test.tsx` (button presence, accessible name, layout non-regression) (WP03)
- [x] T012 Update `src/ui/PlaylistRow.tsx` to mount `<DedupButton>` with `row.displayName` / `row.key` (WP03)
- [x] T013 Update `src/ui/PlaylistRow.module.scss` — `grid-template-columns: 48px 1fr auto auto` (WP03)
- [x] T014 Verify PlaylistRow tests green; coverage 100% on touched ranges (WP03)

### Implementation sketch

1. **RED (T011)** — extend `test/ui/PlaylistRow.test.tsx`:
   - For a single-playlist fixture, assert `getByRole('button', { name: /Dedup .../ })` returns one element.
   - Assert that `fireEvent.click(button)` logs `[Dedup] clicked: <row.displayName> (<row.key>)`. Use `vi.spyOn(console, 'log')` with `afterEach` restore.
   - Layout non-regression (NFR-003): assert both `row.displayName` and the formatted track count remain present in the rendered DOM after the button is added.
   - Boundary on display name: include the existing long-name and special-char fixtures (already in this test file) — confirm they still pass with the button visible.
2. Watch RED. Tests fail because `PlaylistRow.tsx` doesn't render a button yet.
3. **GREEN (T012)** — modify `PlaylistRow.tsx`:
   ```tsx
   import { DedupButton } from './DedupButton';
   // ... existing render ...
       <span className={styles.count}>{formatTrackCount(row.trackCount)}</span>
       <DedupButton playlistName={row.displayName} playlistUri={row.key} />
     </li>
   ```
   No new prop on `PlaylistRowProps`. Existing JSDoc on `PlaylistRow` should grow one line acknowledging the trailing Dedup button.
4. **GREEN (T013)** — modify `PlaylistRow.module.scss`: only the `.row` block's `grid-template-columns` changes from `48px 1fr auto` to `48px 1fr auto auto`. All other rules are unchanged. The comment block at the top of the file should append one line noting the fourth column hosts the Dedup button.
5. **T014**: `npm run test:run -- test/ui/PlaylistRow.test.tsx` green; coverage on `src/ui/PlaylistRow.tsx` stays 100%/100% (the new line is exercised by the click test).

### Parallel opportunities

None within WP03 (the test ordering is RED → GREEN → coverage). Externally, WP03 runs in parallel with WP04 after WP02 merges.

### Dependencies

- WP02 (imports `DedupButton`).

### Risks

- **Grid column regression at narrow viewports**: the existing test does not assert at multiple viewport widths. NFR-003 only requires no truncation at the existing test viewport; if a hand-test reveals truncation in the live client, flag it for the next iteration rather than expanding scope here.
- **`row.key` may equal `'liked-songs'` in misuse**: `PlaylistRow` is only rendered for `kind === 'playlist'` rows per existing dispatch; if a future regression routes a Liked Songs row through `PlaylistRow`, the button would log `[Dedup] clicked: <name> (liked-songs)` — wrong, but caught by the existing `data-row-kind` routing tests in `LoadedView.test.tsx`. Out of scope here; document in WP05.

---

## WP04 — LikedSongsRow mounts DedupButton

**Goal**: Mount `<DedupButton playlistName="Liked Songs" playlistUri="spotify:collection:tracks" />` inside `LikedSongsRow`, extend its grid mirror-symmetric to WP03, and assert per-row coverage.

**Priority**: P2 (co-equal with WP03; runs in parallel after WP02).

**Prompt**: [`tasks/WP04-liked-songs-row-integration.md`](tasks/WP04-liked-songs-row-integration.md)

**Independent test**: `npm run test:run -- test/ui/LikedSongsRow.test.tsx` green; the rendered row exposes `getByRole('button', { name: /Dedup Liked Songs/ })`; clicking it logs `[Dedup] clicked: Liked Songs (spotify:collection:tracks)`.

### Included subtasks

- [x] T015 Write failing assertions in `LikedSongsRow.test.tsx` (button presence with hardcoded URI literal, accessible name `Dedup Liked Songs`) (WP04)
- [x] T016 Update `src/ui/LikedSongsRow.tsx` to mount `<DedupButton>` with literals (WP04)
- [x] T017 Update `src/ui/LikedSongsRow.module.scss` — `grid-template-columns: 48px 1fr auto auto` (WP04)
- [x] T018 Verify LikedSongsRow tests green; coverage 100% on touched ranges (WP04)

### Implementation sketch

1. **RED (T015)** — extend `test/ui/LikedSongsRow.test.tsx`:
   - Assert `getByRole('button', { name: /Dedup Liked Songs/ })` returns one element.
   - Assert click logs the exact string `[Dedup] clicked: Liked Songs (spotify:collection:tracks)`.
   - Confirm the existing `data-row-kind="liked-songs"` attribute and `Liked Songs` / `Your Library` text content remain present alongside the button (NFR-003 mirror).
2. Watch RED. Tests fail (no button yet).
3. **GREEN (T016)** — modify `LikedSongsRow.tsx`:
   ```tsx
   import { DedupButton } from './DedupButton';
   // ... existing render ...
       <span className={styles.count}>...</span>
       <DedupButton playlistName="Liked Songs" playlistUri="spotify:collection:tracks" />
     </li>
   ```
   Append one line of JSDoc on `LikedSongsRow` noting the literals at the call site and the rationale link to `research.md §7.1`.
4. **GREEN (T017)** — modify `LikedSongsRow.module.scss`: `grid-template-columns: 48px 1fr auto` → `48px 1fr auto auto`. Mirror WP03's change verbatim. Comment block grows one line.
5. **T018**: tests green; coverage stays 100/100 on `src/ui/LikedSongsRow.tsx`.

### Parallel opportunities

None within WP04. Runs in parallel with WP03 externally.

### Dependencies

- WP02.

### Risks

- **URI literal drift**: `spotify:collection:tracks` is a hardcoded string; future missions wiring real dedup must verify against `Spicetify.Platform.LibraryAPI`. This iteration only logs it; no behavioural risk. Documented in `research.md §7.1` and the deferred-implementation list at `research.md §8`.
- **Accessible-name rendering**: `Dedup Liked Songs` reads natively; the spec's example `Dedup playlist <name>` is illustrative (research §3 / §7.2). Reviewer should consult research §7.2 if they flag the wording.

---

## WP05 — LoadedView + EmptyView integration coverage

**Goal**: Cement the cross-row integration assertions — boundary coverage on list length (C-005), the SC-001 duplicate-name fixture, the FR-006 no-ownership-filter fixture, the FR-005 empty-library no-button assertion, and the FR-002-at-scale 1001-button assertion. This is where the spec's success criteria SC-001 and SC-002 are pinned down at the view level.

**Priority**: P1 (acceptance — without this WP the spec's SCs are not demonstrably met).

**Prompt**: [`tasks/WP05-integration-coverage.md`](tasks/WP05-integration-coverage.md)

**Independent test**: `npm run test:run` green across the full suite; `npm run test:coverage` reports 100% line / 100% branch on all new/modified files; SC-001 fixture passes; SC-002 fixture passes; the 1001-row scale test asserts 1001 Dedup buttons render.

### Included subtasks

- [x] T019 Update `LoadedView.test.tsx` boundary cases: 0, 1, 3+ rows with first/middle/last click assertions (WP05)
- [x] T020 Add duplicate-name fixture test in `LoadedView.test.tsx` (SC-001) (WP05)
- [x] T021 Add no-ownership-filter fixture test in `LoadedView.test.tsx` (FR-006) (WP05)
- [x] T022 Extend 1001-row scale test in `LoadedView.test.tsx` to assert 1001 buttons (WP05)
- [x] T023 Add/verify `EmptyView.test.tsx` no-Dedup-button assertion (FR-005) (WP05)
- [x] T024 Run full suite + coverage; confirm 100% line/branch (WP05)

### Implementation sketch

1. **T019 — boundary coverage**: in `LoadedView.test.tsx`, add three explicit tests:
   - **0 rows**: render with a fixture that yields zero collections; assert `queryAllByRole('button', { name: /^Dedup / })` returns `[]`. (This case may overlap with EmptyView coverage; LoadedView never renders for an empty load per its FSM gate, but the explicit assertion documents the bound.)
   - **1 row** (Liked Songs only, no playlists): assert exactly 1 Dedup button renders (for the Liked Songs row), with accessible name `Dedup Liked Songs`.
   - **≥3 rows**: 1 Liked Songs + 3 playlists. Assert 4 buttons render; click the first (Liked Songs), middle (playlist 2), and last (playlist 3); assert each log line matches the clicked row's `(name, uri)`. Use `vi.spyOn(console, 'log')`.
2. **T020 — SC-001 fixture**: 1 Liked Songs + 4 playlists where 2 playlists share `displayName = "Workout"` but have distinct `key`s. Click each row's button. Assert 5 log lines, each with the URI matching the *clicked* row regardless of name collision.
3. **T021 — FR-006 fixture**: include playlists with `owner.kind === 'self'`, `'other'`, and (defensively) `'system-library'`. Assert every row renders a Dedup button — no filtering.
4. **T022 — scale**: the existing 1001-row test at `test/ui/LoadedView.test.tsx:152-169` renders 1 Liked Songs + 1000 playlists. Add one assertion: `screen.getAllByRole('button', { name: /^Dedup / }).length === 1001`. Keep the existing assertions intact.
5. **T023 — EmptyView**: in `test/ui/EmptyView.test.tsx`, assert `queryAllByRole('button', { name: /^Dedup / })` returns `[]`. This is a belt-and-suspenders FR-005 guard at the empty-state cell. If the test file already covers an equivalent assertion, leave it untouched and document the existing line in the WP commit.
6. **T024**: `npm run test:run` green; `npm run test:coverage` reports 100/100 on `src/ui/dedup-click-log.ts`, `src/ui/DedupButton.tsx`, `src/ui/PlaylistRow.tsx` (changed lines), `src/ui/LikedSongsRow.tsx` (changed lines). Capture the full coverage report URL or stdout for the reviewer.

### Parallel opportunities

T023 (EmptyView) is parallel-safe — different file from T019–T022. Serialised in single-agent execution.

### Dependencies

- WP03
- WP04

Both row WPs must already mount the button for the LoadedView assertions to pass.

### Risks

- **Brittle row-ordering assumptions**: the duplicate-name test must click rows by stable index (e.g. `getAllByRole('button', { name: /^Dedup / })[N]`) and assert against the same row's fixture data — not by name lookup (which would be ambiguous for duplicates). Use `data-row-name` or `data-row-kind` attributes already present on the row elements as the stable handle.
- **1001-row performance**: if the new 1001-button render slows the scale test past the existing timeout, the symptom is real and points at a non-trivial render-cost regression. Do NOT extend the timeout to hide it; raise as a finding for the reviewer (plan §Performance Goals expects this NOT to happen — primitive props, shallow-equal-stable).
- **Coverage `includeUntested` artefacts**: vitest may report new files in unrelated coverage cells. If overall thresholds are met but per-file is flagged, document the artefact in the WP commit; do not lower thresholds.

---

## WP06 — Live-client verification + sign-off artefact

**Goal**: Build the extension, drive the quickstart §2 live-client walkthrough, capture screenshots, and commit the sign-off artefact that `spec-kitty accept` reads. This is the artefact mandated by repo memory `spec-kitty-live-verification-required` — skipped twice in this repo, once shipping a critical defect. Do not skip.

**Priority**: P1 (acceptance — the mission cannot reach `accepted` without this artefact).

**Prompt**: [`tasks/WP06-live-verification-signoff.md`](tasks/WP06-live-verification-signoff.md)

**Independent test**: A committed file `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/live-verification.<YYYY-MM-DD>.md` exists with PASS annotations for §2.A, §2.B, and §2.D (§2.C optional per quickstart); four screenshots exist under `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/screenshots/`; the file lists Spotify desktop build, Spicetify CLI version, library size at verification time.

### Included subtasks

- [ ] T025 Run `npm run build` and confirm deployment to `~/.config/spicetify/CustomApps/spicetify-dedup/` (WP06)
- [ ] T026 Execute quickstart §2.A (per-row click logs) and capture transcript (WP06)
- [ ] T027 Execute quickstart §2.B (keyboard activation Enter + Space) and capture transcript (WP06)
- [ ] T028 Execute quickstart §2.D (host-API spies stay empty) and capture transcript (WP06)
- [ ] T029 Capture 4 screenshots per quickstart §3 into `screenshots/` (WP06)
- [ ] T030 Write sign-off artefact `live-verification.<YYYY-MM-DD>.md` per quickstart §4 (WP06)

### Implementation sketch

1. **T025 — build & deploy**: `npm run build`. Confirm the build script copied artefacts into `~/.config/spicetify/CustomApps/spicetify-dedup/`. If the build script does not auto-deploy in this repo, run the documented deploy step (see `package.json` scripts). Reload Spicetify (`spicetify apply` or in-client reload as appropriate).
2. **T026 — §2.A walkthrough**: open Spotify desktop, navigate to the Dedup app, click Load. Open DevTools. Paste the capture snippet from quickstart §2.A. Click in sequence: Liked Songs button → first playlist → a middle playlist → last playlist. Verify the four `[Dedup] clicked: …` lines match the rows clicked. Copy the console transcript into the sign-off file.
3. **T027 — §2.B walkthrough**: reset `dedupLines`, Tab to a Dedup button, press Enter, capture. Tab again, press Space, capture. Verify both keyboard activations produce the same log lines a mouse click would have.
4. **T028 — §2.D walkthrough**: install the `Spicetify.Platform.RootlistAPI.getContents` and `Spicetify.Platform.LibraryAPI.getTracks` spies per the quickstart snippet. Click each Dedup button once more. Assert the `sideEffects` array stays `[]`. Restore originals on exit.
5. **T029 — screenshots**: capture 4 PNGs per quickstart §3 (full page with buttons visible; single-row close-up; keyboard focus ring; DevTools console). Save under `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/screenshots/` with filenames keyed to the table (e.g. `01-loaded-list.png`, `02-row-closeup.png`, `03-focus-ring.png`, `04-console-transcript.png`).
6. **T030 — sign-off file**: write `live-verification.<YYYY-MM-DD>.md` (use today's date — 2026-06-05 if completed same day). Content per quickstart §4: Spotify desktop build (from `Spicetify.Player.data.client.app_version` or About menu), Spicetify CLI version (`spicetify -v`), full §2.A–§2.D transcripts with PASS/FAIL annotations, relative paths to the four screenshots, one-line library-size note. Mark each scenario PASS or FAIL with the captured evidence inline.

### Parallel opportunities

T029 (screenshots) can be captured opportunistically while running T026–T028; the actual capture commands are independent of console-transcript capture. In single-agent execution, treat as sequential.

### Dependencies

- WP05 (all tests must be green and the full surface merged before live-client verification is meaningful).

### Risks

- **Spicetify deploy not auto-running on `npm run build`**: confirm the deploy step from the existing `package.json` scripts. If it requires manual `spicetify apply`, do that explicitly and note it in the artefact.
- **DevTools console contamination from other extensions**: filter on the `[Dedup]` prefix per the quickstart snippet to keep the transcript clean.
- **Screenshot privacy**: the user's library names may be personal. The reviewer should accept that the screenshots reveal real playlist names; if anonymisation is requested in a future mission, that is a separate spec.
- **Sign-off file overwrite**: if a prior date already exists (re-runs), append a new file rather than overwriting. The mission allows multiple sign-off files; the latest dated file is the canonical one.

---

## Cross-WP traceability

Every spec requirement maps to at least one WP. See `plan.md §Test coverage map` for the per-test mapping.

| Spec ID | Primary WP | Supporting WPs |
|---|---|---|
| FR-001 (button per row) | WP03, WP04 | WP05 (boundary), WP06 (live) |
| FR-002 (1-to-1 binding) | WP05 | WP02, WP03, WP04 |
| FR-003 (log format) | WP01 | WP02 (integration), WP06 (live) |
| FR-004 (correct binding under interaction) | WP05 | WP02, WP06 |
| FR-005 (empty library, no buttons, no logs) | WP05 | — |
| FR-006 (no ownership filtering) | WP05 | — |
| FR-007 (no mutation) | WP02 | WP06 (live §2.D) |
| NFR-001 (keyboard reachability) | WP02 | WP06 (live §2.B) |
| NFR-002 (accessible name) | WP02 | WP03, WP04 |
| NFR-003 (layout non-regression) | WP03, WP04 | WP06 (screenshots) |
| NFR-004 (100% coverage) | WP01, WP02, WP05 | — |
| SC-001 (5-row duplicate-name) | WP05 | — |
| SC-002 (empty fixture) | WP05 | — |
| SC-003 (keyboard-only) | WP02 | WP06 (live §2.B) |
| SC-004 (coverage CI gate) | WP05 | — |
| C-001 (single side effect) | WP01 | WP02 |
| C-002 (no runtime deps) | WP02 (`@testing-library/user-event` devDep only) | — |
| C-003 (file-level SRP) | WP01, WP02 | — |
| C-004 (TDD) | every WP (RED-first protocol enforced in each prompt) | — |
| C-005 (list-length boundary) | WP05 | — |
| C-006 (black-box test posture) | every WP (no private-callback assertions) | — |
| C-007 (ADR for diagnostic) | WP01 | — |

## Mission status

**Phase 2 (tasks)**: ready for `spec-kitty agent mission finalize-tasks` to parse dependencies, normalise ownership metadata, and commit. After finalize, run `/spec-kitty.implement` (or use the `spec-kitty-implement-review` skill for orchestrated execution).
