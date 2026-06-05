# Implementation Plan — Dedup Button Per Playlist Row

**Mission**: `dedup-button-per-playlist-row-01KTC3GY`
**Mission ID**: `01KTC3GY1VM87DPV0SEDQS24NE`
**Branch contract**: current `main` → planning/base `main` → merge target `main` (matches target ✅)
**Date**: 2026-06-05
**Spec**: [`kitty-specs/dedup-button-per-playlist-row-01KTC3GY/spec.md`](spec.md)
**Research (Phase 0)**: [`research.md`](research.md) — Status **Resolved**
**Data model (Phase 1)**: [`data-model.md`](data-model.md)
**Quickstart (Phase 1)**: [`quickstart.md`](quickstart.md)
**Contracts (Phase 1)**: N/A — UI-only mission, see Project Structure §Contracts below.

## Summary

Render one accessible "Dedup" button at the trailing edge of every loaded playlist row (including the pinned Liked Songs row). The button is wired but non-functional: activating it emits a single `console.log` line identifying the bound `(name, uri)` pair. This mission proves React event wiring binds each button to the correct row before a later mission attaches destructive library mutation to the same handler.

**Approach**: add two new files under `src/ui/` — `DedupButton.tsx` (presentational React component, two string props) and `dedup-click-log.ts` (pure log-emission helper) — extend two existing CSS modules from a 3-column to a 4-column grid, and update the row components to mount the button. Tests are written first (DIRECTIVE_034). No domain types, no host API calls, no new runtime dependencies.

## Engineering Alignment (locked)

| Question | Answer |
|---|---|
| Tech stack? | TypeScript + React + Vitest + happy-dom + @testing-library/react (existing). No additions. |
| Element type for the button? | Native `<button type="button">` — keyboard + a11y for free (research §1). |
| Where does the click-log helper live? | `src/ui/dedup-click-log.ts`, exported as `logDedupClick(name, uri)` (research §2). |
| Button prop shape? | `{ playlistName: string; playlistUri: string }` — no view-model coupling (research §3, data-model §1). |
| How is the URI threaded? | Playlist rows use `row.key` (already the URI). Liked Songs hardcodes the literal `"spotify:collection:tracks"` at the call site (research §7.1, data-model §5). |
| Row layout change? | `grid-template-columns` 3 → 4 (`auto auto` trailing) in both `PlaylistRow.module.scss` and `LikedSongsRow.module.scss` (research §4, §7.3). |
| Test harness? | `fireEvent.click` + `fireEvent.keyDown` from `@testing-library/react`. Probe happy-dom's button-key-to-click synthesis in WP1; if it fails, add `@testing-library/user-event` as a devDependency (research §5, §8). |
| ADR? | `0006-console-only-dedup-click-confirmation.md` records the temporary diagnostic-console choice (research §6). |
| Liked Songs row gets a button too? | Yes — Reading B, user-confirmed (research §7). |

## Technical Context

**Language/Version**: TypeScript 5.x (project default) targeting browser ES2022.
**Primary Dependencies**: React 18, Spicetify global runtime (host), Zustand (store, not touched here), Vitest 1.x + @testing-library/react + happy-dom 20.9 for tests. Sass for `.module.scss`.
**Storage**: N/A. No persistence introduced. The button does not call `localStorage`, the store, or any adapter.
**Testing**: Vitest in JSdom-alternative happy-dom. Coverage thresholds enforced at the runner (100% line / 100% branch on new files). Black-box DOM tests + `vi.spyOn(console, 'log')` (DIRECTIVE_036).
**Target Platform**: Spicetify custom app rendered inside the Spotify desktop client (Chromium-based). All new code is presentational React; the host runtime is not touched.
**Project Type**: Single project (no monorepo, no backend split). Frontend extension only.
**Performance Goals**: Per-row render cost stays within the existing list virtualisation envelope (the existing 1001-row scale test in `test/ui/LoadedView.test.tsx:152-169` continues to pass with 1001 buttons added). No new memoisation introduced (primitive props are shallow-equal-stable).
**Constraints**:
- C-001 (spec): one side effect per click — one `console.log` line — no toast, no modal, no host call.
- C-002 (spec): no new runtime dependencies. `@testing-library/user-event` (if added) is dev-only and contingent on the WP1 probe.
- C-003 (spec) / DIRECTIVE_001: strict file-level SRP — button and helper in their own files.
- C-004 (spec) / DIRECTIVE_034: TDD — failing test first, watch it fail, then implement.
- C-005 (spec): boundary coverage on list length (0, 1, ≥3 with first/middle/last assertions).
- C-006 (spec) / DIRECTIVE_036: black-box DOM + spy. No private-callback assertions.
- C-007 (spec) / DIRECTIVE_003: ADR-0006 lands with the implementation.
- Charter risk boundary: "no silent library mutations" — FR-007 forbids any mutating side effect from this click.
**Scale/Scope**: ≤4 source files touched (2 new `.tsx`/`.ts`, 2 modified `.scss`), ≤3 test files touched, 2 new test files, 1 new ADR. Estimated <300 LOC delta including tests.

## Charter Check

*Gate: MUST PASS before Phase 0 research. Re-evaluated after Phase 1 design.*

| Charter element | Applies? | Status | Evidence |
|---|---|---|---|
| `DIRECTIVE_001` Architectural integrity (named pattern + SRP) | Yes | ✅ PASS | Hexagonal pattern locked by ADR-0001; both new files sit under `src/ui/`. Architecture test (`test/architecture.test.ts:69-74`) forbids `src/ui/` from importing `src/adapters/` or `src/ports/` — both new files import only `react` and primitive types (research §1, §2). File-per-responsibility: `DedupButton.tsx` for React/DOM, `dedup-click-log.ts` for the `console.log` side effect (C-003). |
| `DIRECTIVE_003` Decision documentation | Yes | ✅ PASS | ADR-0006 at `.claude/adr/0006-console-only-dedup-click-confirmation.md` will land alongside the implementation (C-007, research §6). Routine extensions of ADR-0001 do not require new ADRs. |
| `DIRECTIVE_010` Specification fidelity | Yes | ✅ PASS | Every FR (FR-001..FR-007), NFR (NFR-001..NFR-004), and SC (SC-001..SC-004) maps to at least one test in §Phase 1 Design below. IDs are referenced in test names so reviewers can trace fidelity. |
| `DIRECTIVE_030` Test+typecheck quality gate | Yes | ✅ PASS | Vitest coverage thresholds at `vitest.config.ts:19-25` enforce 100% line/branch. New files inherit the threshold. `tsc --noEmit` (project default) catches type breaks. NFR-004 reiterates the threshold. |
| `DIRECTIVE_034` Test-first development | Yes | ✅ PASS | C-004 mandates failing test first, watch fail, then implement. Each WP starts RED. |
| `DIRECTIVE_036` Black-box integration testing | Yes | ✅ PASS | C-006 + research §5: tests use `getByRole`, `fireEvent`, and `vi.spyOn(console, 'log')` — no component-internal callback assertions. |
| Risk boundary: no silent library mutations | Yes | ✅ PASS | FR-007 + C-001: handler does exactly one `console.log`. No network, no host API, no store mutation. |
| Risk boundary: no auto-run on Spotify launch | Yes | ✅ PASS | The button is a click-gated affordance; nothing runs at mount. Aligns with the repo memory `explicit-fetch-trigger-required`. |
| Risk boundary: per-action confirmation for deletions | N/A | — | No deletion in this mission. Future mission re-evaluates when real dedup attaches. |
| Languages declared by charter (`javascript`, `typescript`) | Yes | ✅ PASS | TypeScript only. |
| Branch strategy | Yes | ✅ PASS | Workflow start branch `main`, planning/base `main`, merge target `main`. `branch_matches_target=true`. WPs branch from `main` per spec-kitty default. |

**Charter Check verdict (Phase 0 gate)**: PASS — no violations. Complexity Tracking below is intentionally empty.

**Re-evaluation after Phase 1 design**: PASS — no design choice introduced a new violation. The `LikedSongsRow` hardcoded literal `"spotify:collection:tracks"` is a UI-layer presentation string (only emitted to `console.log`) and does not trigger the "no silent library mutations" boundary because no host API receives it.

## Project Structure

### Documentation (this feature)

```
kitty-specs/dedup-button-per-playlist-row-01KTC3GY/
├── spec.md              # Approved specification
├── plan.md              # This file (/spec-kitty.plan command output)
├── research.md          # Phase 0 (Resolved — research/ folder holds source notes)
├── research/            # Source materials cited from research.md
├── data-model.md        # Phase 1 — types and interfaces
├── quickstart.md        # Phase 1 — manual + test-driven verification walkthrough
├── mission-events.jsonl # Mission runtime events (spec-kitty managed)
└── tasks.md             # Phase 2 (NOT created by /spec-kitty.plan; user runs /spec-kitty.tasks)
```

### Source Code (repository root)

```
src/
├── ui/
│   ├── DedupButton.tsx              # NEW — presentational button, two string props
│   ├── dedup-click-log.ts           # NEW — `logDedupClick(name, uri): void` helper
│   ├── DedupButton.module.scss      # NEW (conditional, research §8 / data-model §6)
│   ├── PlaylistRow.tsx              # MODIFIED — mount <DedupButton/> in trailing cell
│   ├── PlaylistRow.module.scss      # MODIFIED — grid-template-columns 3 → 4 (auto auto)
│   ├── LikedSongsRow.tsx            # MODIFIED — mount <DedupButton/> with hardcoded literals
│   └── LikedSongsRow.module.scss    # MODIFIED — grid-template-columns 3 → 4 (auto auto)
│
└── domain/, ports/, adapters/, store/  # UNTOUCHED — no new types, no changed signatures.

test/
└── ui/
    ├── DedupButton.test.tsx         # NEW — ~7 tests (Decisions 1, 3, 5; FR-001..FR-007 binding)
    ├── dedup-click-log.test.ts      # NEW — 3 tests (format + edge strings; FR-003)
    ├── PlaylistRow.test.tsx         # MODIFIED — adds presence/binding assertions
    ├── LikedSongsRow.test.tsx       # MODIFIED — adds presence/binding assertions
    └── LoadedView.test.tsx          # MODIFIED — adds button-count assertion for N+1 rows

.claude/adr/
└── 0006-console-only-dedup-click-confirmation.md   # NEW — C-007 / DIRECTIVE_003
```

**Structure Decision**: Single project, hexagonal layout per ADR-0001. All new files land in the `src/ui/` and `test/ui/` layers — the only layer whose architecture-test rules permit React and DOM imports. The ADR lands at `.claude/adr/0006-*.md` per charter file-naming convention (`.claude/` is gitignored; the ADR remains authoritative locally per the repo memory `claude-artifact-placement`).

### Contracts

**N/A — UI-only mission.** No HTTP endpoints, no GraphQL queries, no IPC, no host-API surface added. The two "contracts" relevant to this mission are TypeScript signatures, documented in `data-model.md`:

- `DedupButtonProps` (component-prop interface) — data-model §1.
- `logDedupClick(name: string, uri: string): void` (helper signature) — data-model §2.

No `contracts/` directory is created. Reviewers verify these signatures by reading `data-model.md` alongside the implementation.

## Phase 0: Outline & Research — COMPLETE

See [`research.md`](research.md) — Status **Resolved**.

**Decisions locked**:

1. Element type — native `<button type="button">` (research §1).
2. Click-log helper — `src/ui/dedup-click-log.ts`, pure named function (research §2).
3. Wiring shape — two-string props, sourced from `row.displayName` + `row.key` (research §3).
4. Row layout — extend `grid-template-columns` from 3 to 4 (research §4).
5. Test harness — `fireEvent` first; happy-dom probe in WP1 gates whether `@testing-library/user-event` ships as a devDependency (research §5).
6. ADR scope — one ADR (`0006`) for the temporary diagnostic surface (research §6).
7. Liked Songs row also gets a Dedup button (Reading B, user-confirmed 2026-06-05 — research §7).
8. Deferred-to-implementation items (research §8): happy-dom keyboard-synthesis probe, CSS-module shape, Liked Songs URI host-side verification (out of scope for this mission, flagged for next).

**No NEEDS CLARIFICATION markers remain.**

## Phase 1: Design & Contracts — COMPLETE

### Data model

See [`data-model.md`](data-model.md). Summary of new/modified types:

- **NEW** `DedupButtonProps` — `{ playlistName: string; playlistUri: string }` in `src/ui/DedupButton.tsx`.
- **NEW** `logDedupClick(name: string, uri: string): void` in `src/ui/dedup-click-log.ts`.
- **UNCHANGED** `CollectionViewModel`, `PlaylistRowProps`, `LikedSongsRowProps`, all domain types, all adapter shapes.
- **UNCHANGED** Architecture test rules (`test/architecture.test.ts`).

### Contracts

N/A — see Project Structure §Contracts.

### Quickstart

See [`quickstart.md`](quickstart.md) — manual verification path through the running extension plus the automated-test invocation.

### Test coverage map (DIRECTIVE_010 traceability)

| FR/NFR/SC/C | Test file | Test name pattern | Notes |
|---|---|---|---|
| FR-001 (button per row) | `test/ui/PlaylistRow.test.tsx`, `test/ui/LikedSongsRow.test.tsx`, `test/ui/LoadedView.test.tsx` | `renders Dedup button on every loaded playlist row` | Boundary on list-length (C-005). |
| FR-002 (one button per playlist) | `test/ui/LoadedView.test.tsx` | `each rendered button is bound to exactly one playlist` | 1001-row scale test asserts 1001 buttons. |
| FR-003 (log format) | `test/ui/dedup-click-log.test.ts` | `logDedupClick emits `[Dedup] clicked: <name> (<uri>)`` | 3 strings cover empty, ASCII, mixed-special. |
| FR-004 (correct binding under interaction) | `test/ui/DedupButton.test.tsx`, `test/ui/LoadedView.test.tsx` | `click on first/middle/last row logs that row's URI` | Includes duplicate-name fixture. |
| FR-005 (empty library, no buttons, no logs) | `test/ui/EmptyView.test.tsx`, `test/ui/LoadedView.test.tsx` | `empty loaded library renders no Dedup buttons` | 0-row boundary. |
| FR-006 (no ownership filtering) | `test/ui/LoadedView.test.tsx` | `every loaded playlist renders a Dedup button regardless of owner` | Self / other / system-library fixture. |
| FR-007 (no mutation, no network) | `test/ui/DedupButton.test.tsx` | `clicking the button does not invoke Spicetify or store APIs` | Asserts globals untouched; `console.log` is the sole side effect. |
| NFR-001 (keyboard reachability) | `test/ui/DedupButton.test.tsx` | `button is tab-focusable and activates on Enter and Space` | happy-dom probe in WP1 gates whether `userEvent` is added. |
| NFR-002 (accessible name) | `test/ui/DedupButton.test.tsx`, row tests | `button exposes accessible name "Dedup <playlistName>"` | Uses `getByRole('button', { name: /Dedup .../ })`. |
| NFR-003 (layout non-regression) | `test/ui/PlaylistRow.test.tsx` | `row name + count remain visible alongside the Dedup button` | 5-row fixture per spec. |
| NFR-004 (100% coverage) | Vitest config | Coverage threshold gate | Enforced by runner, not a single test. |
| SC-001 (5-row, duplicate-name) | `test/ui/LoadedView.test.tsx` | `5-row fixture with duplicate names logs 5 distinct URIs` | Combines FR-002, FR-004. |
| SC-002 (empty fixture, no logs) | `test/ui/EmptyView.test.tsx` | `empty fixture produces zero log lines on any interaction` | Covers FR-005. |
| SC-003 (keyboard-only) | `test/ui/DedupButton.test.tsx` | `Tab → focus → Enter logs; Tab → focus → Space logs` | Verified with `fireEvent.keyDown` or `userEvent.keyboard` depending on probe result. |
| SC-004 (coverage CI gate) | Vitest config | n/a | Verified by `npm test -- --coverage` exit code in CI. |
| C-001 (single side effect) | `test/ui/dedup-click-log.test.ts` | `helper invokes console.log exactly once and nothing else` | `vi.spyOn` count assertion. |
| C-002 (no runtime deps) | `package.json` review | n/a | No `dependencies` change; `userEvent` (if added) is `devDependencies`. |
| C-003 (file-level SRP) | `test/architecture.test.ts` | Existing rules pass | Both new files import only React + primitives. |
| C-004 (TDD) | WP commits | n/a | RED commit before GREEN commit per WP. |
| C-005 (list-length boundary) | `test/ui/LoadedView.test.tsx` | `0-row`, `1-row`, `≥3-row` cases | Explicit first/middle/last assertions on ≥3. |
| C-006 (black-box) | All new tests | n/a | DOM queries + `console.log` spy only. |
| C-007 (ADR) | Filesystem check | n/a | `.claude/adr/0006-*.md` present after implementation WP. |

**Charter Re-Check after Phase 1**: PASS — no new violations introduced. Complexity Tracking remains empty.

## Complexity Tracking

*No violations to justify. Table intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |

## Source pointers (re-stated from research §9)

- Spec: [`spec.md`](spec.md)
- Research: [`research.md`](research.md), supporting docs in [`research/`](research/)
- Data model: [`data-model.md`](data-model.md)
- Quickstart: [`quickstart.md`](quickstart.md)
- ADR-0001 (hexagonal): `.claude/adr/0001-hexagonal-load-dedupable-playlists.md`
- Existing playlist row: `src/ui/PlaylistRow.tsx`, `src/ui/PlaylistRow.module.scss`
- Existing Liked Songs row: `src/ui/LikedSongsRow.tsx`, `src/ui/LikedSongsRow.module.scss`
- View-model: `src/domain/view-models.ts` (`CollectionViewModel` L80-87, `toViewModels` L102-123)
- Architecture test: `test/architecture.test.ts` (`src/ui/` rules L69-74)
- Test setup + coverage: `test/setup.ts`, `vitest.config.ts` (thresholds L19-25)
- Style tokens: `src/styles/_tokens.module.scss`

## Status & Next Step

**Phase 0 (research)**: COMPLETE (Resolved).
**Phase 1 (design + data model + quickstart)**: COMPLETE.
**Phase 2 (tasks / work packages)**: NOT in this command's scope.

**Branch contract (restated)**: current `main` → planning/base `main` → merge target `main`. `branch_matches_target=true`.

**Next user action**: run `/spec-kitty.tasks` to break this plan into work packages. Do not start implementation before tasks finalize.
