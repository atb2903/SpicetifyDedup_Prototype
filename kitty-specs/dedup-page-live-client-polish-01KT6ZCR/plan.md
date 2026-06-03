# Implementation Plan: Dedup Page Live-Client Polish

**Mission**: `dedup-page-live-client-polish-01KT6ZCR`
**Mission ID**: `01KT6ZCR2FHBG8FBB61HA41QC3`
**Branch**: `get_library` | **Date**: 2026-06-03 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification at `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/spec.md`

---

## Branch Contract (mandatory, stated explicitly)

- **Current branch at planning start**: `get_library`
- **Planning / base branch for this feature**: `get_library`
- **Final merge target for completed changes**: `get_library`
- **`branch_matches_target`**: ✅ true (per `spec-kitty agent mission setup-plan --json` payload at 2026-06-03T14:56:22Z)

`get_library` is itself a feature integration branch; the user releases it to `main` separately (C-004). No merges to `main` are planned from this mission.

---

## Summary

Close five defects observed in the 2026-06-03 live-client verification of the prior mission (`load-dedupable-playlists-01KT3XW3`) without expanding the page's user capability. The five defects, in priority order:

| Defect | Severity | Mechanism (decided by plan archeology) |
|---|---|---|
| **P1** Spotify's `.main-topBar-container` overlays the Load button — clickable only via DevTools | HIGH | `DedupPage` owns its scroll surface with a chrome-aware `padding-top`; topbar height read from a CSS custom property with a hardcoded fallback. **No selector against Spotify's hashed/rotating chrome classes**. |
| **P2** Every state view ships in browser-default styling; rows collapse adjacent spans | MEDIUM | CSS modules **split per-component** (`dedup-page.module.scss`, `idle-view.module.scss`, …, `playlist-row.module.scss`); themed with `--spice-*` variables. Existing string classNames in JSX replaced by `styles.*` imports. No ADR-0004 needed — this continues the CSS-modules pattern from the `create-spicetify-app` scaffold. |
| **P3** Store is effectively a module-scope singleton; navigating away leaves stale state | MEDIUM | Store gains a `reset()` action; `DedupPage` subscribes to `Spicetify.Platform.History.listen` (the pattern data-porter uses). When the route returns to the dedup app from elsewhere, reset to idle if the current state is `loading`. WP-03 opens with a small live probe to confirm whether mount/unmount alone suffices before falling back to the History-listener mechanism. |
| **P4** `data-model.md` §3 declares `playlist-v2` valid; adapter at `spicetify-playlists-loader.ts:141` matches only `playlist` | LOW | Adapter accepts `type === 'playlist' \|\| type === 'playlist-v2'`. Fixture extended with one `playlist-v2` node. |
| **P5** `triggerLoad` is not gated on the `idle` FSM state — defense-in-depth gap | LOW | `triggerLoad` checks `before.kind === 'idle'` and returns early (mirror of existing `retry` gate at `playlists-store.ts:116`). |

**Research strategy**: code-archeology in plan now, live probes per-defect WP. **WP packaging**: five WPs, one per defect (WP-01..WP-05). **FR-001 test substrate**: happy-dom + faux topbar overlay first; fall back to a computed-style overlap check if `elementFromPoint` fidelity fails. (User-confirmed engineering alignment, 2026-06-03.)

All five fixes ship under TDD; every defect closure has a failing test committed before the fix. No new ADRs are introduced (ADR-0001 hexagonal, ADR-0002 Spicetify Platform, ADR-0003 Zustand remain in force unchanged).

---

## Technical Context

| Field | Value |
|---|---|
| **Language/Version** | TypeScript 6.0.3 (strict mode). React 19.2.6 + ReactDOM 19.2.6. |
| **Primary Dependencies** | Zustand 5.0.14 (state). Vitest 4.1.7 + happy-dom 20 + `@testing-library/react` 16 + `@testing-library/jest-dom` 6 (tests). spicetify-creator 1.0.17 (bundler). |
| **Build** | `npm run build` (spicetify-creator → `~/.config/spicetify/CustomApps/spicetify-dedup/`). `npm run watch` for the dev loop. |
| **Test runner** | `npm run test:run` (CI shape) and `npm run test:coverage` (coverage gate). Configured with `@vitest/coverage-v8` enforcing 100 % line and 100 % branch at the runner. |
| **Storage** | None — read-only Spicetify Platform calls, no persistence beyond Zustand in-memory state. |
| **Target Platform** | Spicetify-modified Spotify desktop client (Chromium-based). Primary dev surface: Linux. Must also work on the macOS/Windows Spotify desktop builds supported by the current Spicetify release. |
| **Project Type** | Single-project Spicetify Custom App. |
| **Performance Goals** | No wall-clock latency budget (charter §Performance). Correctness over speed. Each state view must remain legible up to NFR-002's 1 000-collection ceiling carried over from the prior mission. |
| **Constraints** | No new ADRs unless plan-phase research surfaces a fresh load-bearing decision (C-001). TypeScript strict and file-level SRP remain absolute (C-002). Out of scope: per-track enumeration, dedup algorithm, library mutation, design system / theme tokens / dark-light mode toggle, animations beyond a basic spinner, restyling Spotify chrome (C-003). No regression in zero-pre-trigger fetches, idle-only `triggerLoad`, clean adapter boundary (C-005). |
| **Scale/Scope** | Carries forward NFR-002 ≤ 1 000 collections. This mission does not change the bound. |
| **Branch contract** | Stated above. `get_library` → `get_library`. |

No `[NEEDS CLARIFICATION]` markers remain — every plan-phase research question in spec §9 is resolved by the archeology summarized in [`research.md`](./research.md) (with per-defect live probes carried into each WP per the hybrid strategy).

---

## Charter Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Charter at `.kittify/charter/charter.md` (generated 2026-06-02). The action-scoped context (`spec-kitty charter context --action plan --json`) lists directives `DIRECTIVE_001`, `DIRECTIVE_003`, `DIRECTIVE_010`, `DIRECTIVE_030`, `DIRECTIVE_034`, `DIRECTIVE_036` as in force.

### DIRECTIVE_001 — Architectural integrity (separation of concerns, hexagonal boundaries)

| Check | Status | Note |
|---|---|---|
| Does any planned change introduce a cross-layer import the architecture test forbids? | ✅ Clean | P1 layout lives in `src/ui/` (DedupPage CSS module). P2 styling lives in `src/ui/*.module.scss`. P3 history-listener lives in `src/ui/DedupPage.tsx` and consumes `Spicetify.Platform.History`. But — `src/ui/` is forbidden from importing `Spicetify` directly (today's architecture test does not encode this, but the spirit of ADR-0001 is "only adapters touch Spicetify"). **Mitigation**: introduce a thin **navigation port** (`src/ports/navigation.ts`) + **adapter** (`src/adapters/spicetify-navigation.ts`) so the history subscription stays inside the hexagonal boundary. The store layer exposes `reset()` and the page calls it from a navigation subscription that goes through the port. See [`contracts/navigation-port.md`](./contracts/navigation-port.md). |
| Does the `reset` action belong in the store layer or the UI layer? | ✅ Store | Store layer per `src/store/playlists-store.ts` — UI never touches the FSM directly. |
| Does the adapter still own all host shape validation? | ✅ Yes | Expanding the URI-type filter to include `'playlist-v2'` (FR-010) is one more line in the existing `walkItems` branch; the validation surface is unchanged in structure. |

**Verdict**: PASS, with the navigation port introduced to keep `Spicetify.*` access out of `src/ui/`. This is consistent with ADR-0001's stated decision; the original ADR did not anticipate navigation as a port because the prior mission did not need one.

### DIRECTIVE_003 — Decision documentation (ADRs for material decisions)

| Check | Status | Note |
|---|---|---|
| Does P2's styling-home decision (CSS modules per-component) warrant ADR-0004? | ❌ No ADR | Continues the existing CSS-modules pattern from the scaffold. The split is a file-organization choice within the same pattern. |
| Does P1's layout decision (own scroll surface, chrome-aware padding-top) warrant ADR? | ❌ No ADR | The decision is local to one component and one CSS rule; not a project-wide architectural commitment. |
| Does P3's navigation port + history-listener mechanism warrant ADR? | ✅ ADR-0004 | A new port + adapter is a load-bearing architectural decision that future iterations will extend. Captured in `.claude/adr/0004-navigation-port.md` as part of WP-03 (the WP that introduces it). |

**Verdict**: PASS with one ADR scheduled (ADR-0004, owned by WP-03).

### DIRECTIVE_010 — Specification fidelity

| Check | Status | Note |
|---|---|---|
| Does the prior mission's `data-model.md` §3 (`playlist` or `playlist-v2`) remain true after this mission? | ✅ Yes | FR-010 implements the spec-declared behavior. NFR-010 enforces the "either fix or amend, not both half-done" gate. |
| Are any new claims being added to plan/data-model/spec that the code will not honor? | ✅ None | All new claims (reset action, narrowed triggerLoad, accepted URI types) map directly to one WP and one test set. |
| Does the spec's deferred-research question §9 wording match what the plan resolves? | ✅ Match | Spec §9.1 P1 layout home → resolved in research.md §1 (own scroll surface + padding-top, no chrome selectors). §9.2 P2 styling home → resolved in research.md §2 (CSS modules per-component). §9.3 P3 lifecycle hook → resolved in research.md §3 (navigation port + History listener), with WP-03 confirming via live probe. |

**Verdict**: PASS.

### DIRECTIVE_030 — Quality gates (typecheck + tests + coverage at the runner)

| Check | Status | Note |
|---|---|---|
| Does the plan keep `npm run typecheck` at zero errors? | ✅ Yes | All edits are TypeScript-strict; no new `any` introductions. |
| Does the plan keep `npm run test:run -- --coverage` at 100 % line + branch? | ✅ Yes | Every new branch (P5 idle-gate; P4 playlist-v2 acceptance; FR-007 reset action) ships with a test that exercises it. NFR-002 enforces this at WP-DoD time. |
| Does the existing architecture test still pass with the navigation port + adapter? | ✅ Yes | The new files (`src/ports/navigation.ts`, `src/adapters/spicetify-navigation.ts`, `src/store/playlists-store.ts` change, `src/ui/DedupPage.tsx` change) all comply with the rules in `test/architecture.test.ts`. The `ui/` rule "forbid imports from `adapters/` or `ports/`" needs care: the page calls `usePlaylistsStore` (which is in `store/`) and the store wires the navigation port — see [`contracts/navigation-port.md`](./contracts/navigation-port.md) for the exact wiring. |

**Verdict**: PASS.

### DIRECTIVE_034 — Test-first development

| Check | Status | Note |
|---|---|---|
| Is each defect closure driven by a failing test committed before the fix? | ✅ Mandated by NFR-001 | Captured in WP-DoD format at tasks-phase. Per FR for tracking: FR-001 → button-occlusion test; FR-002 → same test gated automated; FR-003 → per-state distinct-styling tests (one per view); FR-004 → row layout test; FR-005 → placeholder-cover test (extends existing); FR-006 → retry / spinner distinguishable tests; FR-007 → reset action test; FR-008 → navigation-aware reset test; FR-009 → reset-does-not-load test; FR-010 → adapter `playlist-v2` fixture test; FR-011 → same fixture test asserts the `playlist-v2` node appears in the result; FR-012 → triggerLoad-from-non-idle no-op test (one per non-idle source); FR-013 → covered by FR-012's per-state tests. |

**Verdict**: PASS.

### DIRECTIVE_036 — Black-box integration testing

| Check | Status | Note |
|---|---|---|
| Are tests written against external interfaces, not implementation details? | ✅ Yes | FR-001 test asserts a DOM property (`elementFromPoint`) — observable behavior. FR-003/FR-004 tests assert via @testing-library/react queries (role, accessible name, visible text), not classnames. FR-007/FR-008 tests dispatch actions via the bound hook and assert state shape — exactly the boundary the prior mission's tests use. |
| Does the navigation port's contract test treat the port as a black box? | ✅ Yes | Add `test/ports/navigation-port-contract.test.ts` mirroring the existing `playlists-loader-contract.test.ts` pattern — any adapter implementing the port must satisfy the same observable behavior. |

**Verdict**: PASS.

### Overall Charter Verdict: PASS (with one ADR-0004 scheduled for WP-03)

No complexity-tracking entries required; the navigation port is a small SOLID/SRP-compliant addition, not a justified complexity violation.

---

## Project Structure

### Documentation (this feature)

```
kitty-specs/dedup-page-live-client-polish-01KT6ZCR/
├── plan.md                                # This file
├── spec.md                                # Mission spec (already exists)
├── research.md                            # Phase 0 — code-archeology resolutions
├── data-model.md                          # Phase 1 — incremental type/action additions
├── quickstart.md                          # Phase 1 — paste-runnable live-client probe + verification
├── contracts/
│   ├── navigation-port.md                 # Port + adapter contract for History subscription
│   ├── store-reset-action.md              # Store action signature + lifecycle contract
│   └── adapter-uri-type-acceptance.md     # Adapter URI-type acceptance contract
├── mission-events.jsonl                   # spec-kitty runtime state
└── status.json / status.events.jsonl      # spec-kitty runtime state
```

### Source Code (repository root)

Single-project Spicetify Custom App layout. Hexagonal boundaries from ADR-0001 are unchanged; this mission **adds** files in each layer rather than restructuring.

```
src/
├── app.tsx                                # Spicetify entry; wires PlaylistsStoreProvider + NavigationProvider (WP-03)
├── settings.json                          # Sidebar registration (unchanged)
├── adapters/
│   ├── spicetify-playlists-loader.ts      # P4 edit: accept type === 'playlist-v2' (WP-04)
│   ├── spicetify-navigation.ts            # NEW (WP-03): Spicetify.Platform.History adapter
│   └── fake-playlists-loader.ts           # unchanged
├── ports/
│   ├── playlists-loader.ts                # unchanged
│   └── navigation.ts                      # NEW (WP-03): navigation subscribe port
├── domain/
│   └── (unchanged — load-state, view-models, eligibility, ordering, errors)
├── store/
│   ├── playlists-store.ts                 # Edits: P5 idle-gate (WP-05) + FR-007 reset action (WP-03)
│   └── PlaylistsStoreContext.tsx          # unchanged
├── ui/
│   ├── DedupPage.tsx                      # P1 layout (WP-01) + P3 navigation subscription (WP-03)
│   ├── DedupPage.module.scss              # NEW (WP-01): scroll surface + topbar offset
│   ├── IdleView.tsx                       # P2 styling (WP-02): replace string classNames with styles import
│   ├── IdleView.module.scss               # NEW (WP-02)
│   ├── LoadingView.tsx                    # P2 styling (WP-02)
│   ├── LoadingView.module.scss            # NEW (WP-02)
│   ├── LoadedView.tsx                     # P2 styling (WP-02)
│   ├── LoadedView.module.scss             # NEW (WP-02)
│   ├── EmptyView.tsx                      # P2 styling (WP-02)
│   ├── EmptyView.module.scss              # NEW (WP-02)
│   ├── FailedView.tsx                     # P2 styling (WP-02)
│   ├── FailedView.module.scss             # NEW (WP-02)
│   ├── PlaylistRow.tsx                    # P2 styling + FR-005 placeholder (WP-02)
│   ├── PlaylistRow.module.scss            # NEW (WP-02)
│   ├── LikedSongsRow.tsx                  # P2 styling (WP-02)
│   └── LikedSongsRow.module.scss          # NEW (WP-02)
├── css/
│   └── app.module.scss                    # Existing scaffold stylesheet — retained for hello-world archive compatibility; no new content added here
├── types/
│   └── (unchanged — Spicetify ambient types)
└── styles/                                # NEW (WP-02): shared CSS-module fragments (variables, mixins)
    └── _tokens.module.scss                # `--spice-*` aliasing and per-component variable defaults

test/
├── adapters/
│   ├── spicetify-playlists-loader.test.ts # P4 fixture extension (WP-04)
│   ├── spicetify-navigation.test.ts       # NEW (WP-03): navigation adapter test
│   └── fixtures/                          # P4 fixture additions (WP-04)
├── ports/
│   ├── playlists-loader-contract.test.ts  # unchanged
│   └── navigation-port-contract.test.ts   # NEW (WP-03): contract test for navigation port
├── store/
│   └── playlists-store.test.ts            # FR-007 reset + FR-012/FR-013 idle-gate tests (WP-03, WP-05)
├── ui/
│   ├── DedupPage.test.tsx                 # P1 occlusion test (WP-01) + P3 navigation-reset test (WP-03)
│   ├── IdleView.test.tsx                  # P2 visual-distinction assertion (WP-02)
│   ├── LoadingView.test.tsx               # P2 (WP-02)
│   ├── LoadedView.test.tsx                # P2 (WP-02)
│   ├── EmptyView.test.tsx                 # P2 (WP-02)
│   ├── FailedView.test.tsx                # P2 (WP-02)
│   ├── PlaylistRow.test.tsx               # P2 row layout test (WP-02)
│   └── LikedSongsRow.test.tsx             # P2 row layout test (WP-02)
├── architecture.test.ts                   # Updated rules table (WP-03): ports for navigation; ui→adapter still forbidden
├── app.test.tsx                           # P1 smoke regression (WP-01)
└── setup.ts                               # unchanged
```

**Structure Decision**: Single-project Spicetify Custom App, hexagonal architecture preserved per ADR-0001. The only new architectural surface is a navigation port + adapter (P3 / WP-03) introduced to keep `Spicetify.Platform.History` access out of the UI layer. CSS modules are split per-component (one `.module.scss` per `.tsx` view), themed against `--spice-*` variables — continuing the `create-spicetify-app` scaffold's pattern without deviation.

---

## Complexity Tracking

*Fill ONLY if Charter Check has violations that must be justified.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| *(none)* | | |

The navigation port (P3 / WP-03) is not a complexity violation; it is the SOLID/SRP-correct application of ADR-0001 to a new external dependency (`Spicetify.Platform.History`). The lighter alternative — letting `DedupPage` call `Spicetify.Platform.History.listen` directly — would put host access in the UI layer and violate ADR-0001's stated decision and the architecture test's intent (even if the current `RULES` table does not literally encode it).

---

## Phase 0 — Outline & Research

Produced in [`research.md`](./research.md). All §9 deferred questions resolved with one of {decision committed in plan, deferred to a per-WP live probe with a starting hypothesis}.

**Per-defect live probes (carried into each WP)**:

- **WP-01 (P1)**: paste-runnable console snippet that prints `getBoundingClientRect()` of the load button + `elementFromPoint(buttonCenterX, buttonCenterY)`. Confirms the topbar height value used in the CSS module.
- **WP-02 (P2)**: visual smoke check in the live client after each view's CSS module lands — open Dedup, force each state via DevTools (e.g. by mutating store from the console), capture screenshot evidence per NFR-006.
- **WP-03 (P3)**: paste-runnable console snippet that observes `Spicetify.Platform.History.listen(({ pathname }) => console.log(pathname))` across navigate-away and navigate-back. Confirms whether the listener fires and whether DedupPage unmounts vs stays mounted.
- **WP-04 (P4)**: live `Spicetify.Platform.RootlistAPI.getContents().then(r => console.log(r.items.map(i => i.type)))` snippet to confirm presence (or absence) of `playlist-v2` types in the user's actual library.
- **WP-05 (P5)**: live `await store.getState().triggerLoad(); store.getState().loadState.kind; await store.getState().triggerLoad();` to confirm the second trigger from `loaded` does not fire `loader.load()` (with the fix applied).

---

## Phase 1 — Design & Contracts

Produced in:

- [`data-model.md`](./data-model.md) — additions only: `reset()` action shape, narrowed `triggerLoad` precondition, expanded `RawCollection`-accepted URI types, navigation-port type contract.
- [`contracts/navigation-port.md`](./contracts/navigation-port.md) — `NavigationPort` interface, observable contract, fake-adapter shape for tests.
- [`contracts/store-reset-action.md`](./contracts/store-reset-action.md) — `reset()` signature, idempotence guarantee, "MUST NOT call loader" invariant.
- [`contracts/adapter-uri-type-acceptance.md`](./contracts/adapter-uri-type-acceptance.md) — extended `walkItems` URI-type table.
- [`quickstart.md`](./quickstart.md) — paste-runnable live-client checklist that, when run after merge, satisfies NFR-005 + NFR-006.

---

## STOP — End of `/spec-kitty.plan` artifacts

This command ends here. Phase 2 (work-package breakdown via `/spec-kitty.tasks`) is the user's next explicit action.

**Branch contract (second statement, mandatory)**: current=`get_library`, planning base=`get_library`, merge target=`get_library`, matches=✅ true. `get_library` releases to `main` separately, per C-004.

**Next suggested command**: `/spec-kitty.tasks` (user must invoke this explicitly).
