# Implementation Plan: Dedup Navigation Reset Hotfix

**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**Mission ID**: `01KT9NSWY6YKMB66KGXG04ZZ92`
**Branch**: `get_library` | **Date**: 2026-06-04 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification at `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/spec.md`

---

## Branch Contract (mandatory, stated explicitly)

- **Current branch at planning start**: `get_library`
- **Planning / base branch for this feature**: `get_library`
- **Final merge target for completed changes**: `get_library`
- **`branch_matches_target`**: ✅ true (per `spec-kitty agent mission setup-plan --json` payload at 2026-06-04T16:07:20Z)

`get_library` is itself a feature integration branch; the user releases it to `main` separately (C-004). No merges to `main` are planned from this mission.

---

## Summary

Close DEFECT-1 from the prior mission (`dedup-page-live-client-polish-01KT6ZCR`): in production, `NavigationProvider`'s `useEffect` runs *after* the navigate-into-dedup event has already fired, so `wasOnDedup` is initialized to `true` and the listener's reset condition (`!wasOnDedup && isOnDedup`) is permanently unreachable. The page never resets to idle on navigate-away/back. Live verification on 2026-06-04 captured the diagnostic trail (wrap-and-count probe showed the React tree re-mounts on each Dedup navigation; the prior ADR-0004 §Alternatives.2 "stays-mounted" claim was incorrect).

**Mechanism**: replace the listener-based design with React lifecycle hooks. `useEffect(() => { reset(); return () => reset(); }, [reset])` in a renamed `RouteResetProvider`. The mount-time reset handles the production lifecycle; the unmount cleanup handles the hypothetical future regime where the tree stays mounted. Both branches are safe because `reset()` is idempotent from idle (R-1).

**Retirement**: the navigation port + adapter + contract test + ADR-0004 are removed. ADR-0004's status flips to Superseded; ADR-0005 captures the lifecycle-based decision.

**Bundled polish**: README NFR-007 styled-state-views note (DRIFT-2 from prior review), `--dedup-topbar-offset` override documentation (RISK-5), spinner enlargement from 32×32 to 64×64 (SC-2 loading↔empty disambiguation, FR-011).

**Research strategy**: spec §9's three plan-phase research questions are resolved in [`research.md`](./research.md):

| Question | Resolution |
|---|---|
| Provider rename? | Yes — `NavigationProvider` → `RouteResetProvider`; file → `src/store/RouteResetContext.tsx`. |
| FR-011 approach? | Enlarge spinner 32→64. Static visual mass; no new motion design. Stays inside C-003. |
| FR-004 test placement? | New `it()` block in the renamed `test/store/RouteResetContext.test.tsx`. Parametrised over the four non-idle source states. |

**Live-client probes carried into the impl WP**: none required at plan-phase — the mechanism is fully observable from unit tests + the post-merge live-verification per `quickstart.md`.

---

## Technical Context

| Field | Value |
|---|---|
| **Language/Version** | TypeScript 6.0.3 (strict mode). React 19.2.6 + ReactDOM 19.2.6. Unchanged from prior mission. |
| **Primary Dependencies** | Zustand 5.0.14, Vitest 4.1.7 + happy-dom 20 + `@testing-library/react` 16 + `@testing-library/jest-dom` 6, spicetify-creator 1.0.17. Unchanged. |
| **Build** | `npm run build` → `~/.config/spicetify/CustomApps/spicetify-dedup/`. Unchanged. |
| **Test runner** | `npm run test:run`, `npm run test:coverage`. Coverage gate 100/100/100/100 enforced at the runner. |
| **Storage** | None. Read-only Spicetify Platform calls, no persistence beyond Zustand in-memory state. |
| **Target Platform** | Spicetify-modified Spotify desktop client (Chromium-based). Linux primary dev surface. |
| **Project Type** | Single-project Spicetify Custom App. |
| **Performance Goals** | No wall-clock latency budget (charter §Performance). Reset is synchronous; `useEffect` runs after React commit; no observable user latency added. |
| **Constraints** | C-001..C-007 from spec; particularly C-003 (no new motion design; spinner enlargement stays within "a basic spinner"), C-005 (no regression of prior PASS assertions), C-007 (ADR-0004 reversed, not amended in place). |
| **Scale/Scope** | Carries forward NFR-002 ≤ 1 000 collections from the prior mission. Unchanged. |
| **Branch contract** | Stated above. `get_library` → `get_library`. |

No `[NEEDS CLARIFICATION]` markers remain — every plan-phase research question in spec §9 is resolved by `research.md`.

---

## Charter Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Charter at `.kittify/charter/charter.md`. The action-scoped context (`spec-kitty charter context --action plan --json`) lists directives `DIRECTIVE_001`, `DIRECTIVE_003`, `DIRECTIVE_010`, `DIRECTIVE_030`, `DIRECTIVE_034`, `DIRECTIVE_036` as in force.

### DIRECTIVE_001 — Architectural integrity

| Check | Status | Note |
|---|---|---|
| Does any planned change introduce a cross-layer import the architecture test forbids? | ✅ Clean | `RouteResetProvider` lives in `src/store/`; imports only React + `./PlaylistsStoreContext`. No imports from `src/adapters/` or `src/ui/`. |
| Does removing the port + adapter break the hexagonal model? | ✅ No | The hexagonal model permits a port + adapter pair to be retired when no production consumer remains. Hexagonal architecture is *about* enabling clean removals like this. |
| Does the `reset()` call site move violate the store-vs-UI separation? | ✅ No | The new call site is in `src/store/` (the same layer as `playlists-store.ts`). The store layer is the natural home for invocations of store actions. |

**Verdict**: PASS.

### DIRECTIVE_003 — Decision documentation

| Check | Status | Note |
|---|---|---|
| Is the ADR-0004 supersession formally documented? | ✅ Yes | FR-007 + `contracts/adr-supersession.md` §1 specify the exact supersession format. |
| Is the new ADR-0005 authored as a separate file (per C-007 — reversed not amended)? | ✅ Yes | FR-008 + `contracts/adr-supersession.md` §2 specify the new-file requirement; the original ADR-0004 body is preserved untouched. |
| Does ADR-0005 cite the evidence that drove the decision? | ✅ Yes | The contract requires references to mission-review.md DEFECT-1 + live-verification.2026-06-04.md §C.1 in ADR-0005's Context section. |

**Verdict**: PASS.

### DIRECTIVE_010 — Specification fidelity

| Check | Status | Note |
|---|---|---|
| Does ADR-0004's superseded body remain accurate as a *historical record* (with the supersession addendum explaining why it's now wrong)? | ✅ Yes | The original body documents the listener-based design that *was* implemented. The supersession addendum explains why that design failed in the live client. Both are accurate as records of their time. |
| Are any new claims being added to plan/data-model/spec that the code will not honor? | ✅ None | All new claims (mount-time reset, unmount cleanup, port retirement, README updates, spinner enlargement) map directly to FRs with verification paths. |
| Does the prior mission's data-model carry forward without contradiction? | ✅ Yes | The only domain-type change is the deletion of `NavigationPort`. All other types are unchanged. `PlaylistsState.reset` is unchanged in signature and contract. |

**Verdict**: PASS.

### DIRECTIVE_030 — Quality gates

| Check | Status | Note |
|---|---|---|
| Does the plan keep `npm run typecheck` at zero errors? | ✅ Yes | All edits are TypeScript-strict; the deletions are typecheck-safe (verified by inspection of importers in `research.md` §4). |
| Does the plan keep `npm run test:run -- --coverage` at 100/100/100/100? | ✅ Yes | Every new code path (the new effect body, the parametrised production-lifecycle tests) ships with coverage. Every deleted file is also fully removed (no orphaned uncovered lines). |
| Does the architecture test still pass? | ✅ Yes | No rule-table edit required; the new file fits the existing `src/store/` rule and the deletions can't violate rules. |

**Verdict**: PASS.

### DIRECTIVE_034 — Test-first development

| Check | Status | Note |
|---|---|---|
| Is each FR closure driven by a failing test committed before the fix? | ✅ Mandated by NFR-001 | FR-001/FR-002/FR-003/FR-004 are gated by T-new-1, T-new-2, T-new-3 in `contracts/route-reset-provider.md` §3. T-new-1 fails against the prior code (no synchronous mount-time reset) and passes after the fix. |
| Are the deletion-only FRs (FR-005/FR-006/FR-007/FR-009/FR-010) covered by appropriate non-TDD verification? | ✅ Yes | FR-005/FR-006: typecheck + grep. FR-007/FR-008 (ADRs): file-existence + content check per `contracts/adr-supersession.md` §3. FR-009/FR-010 (README): merge-commit diff review per NFR-007. |

**Verdict**: PASS.

### DIRECTIVE_036 — Black-box integration testing

| Check | Status | Note |
|---|---|---|
| Are the new tests written against external observable behavior, not implementation details? | ✅ Yes | T-new-1 asserts post-mount `store.getState().loadState.kind === 'idle'` — observable via the store's public API. No assertion on which internal effect ran or in what order. |
| Are removed tests appropriate to remove? | ✅ Yes | The deleted tests covered a port that's also deleted. There's no "behavior we still need but lost the test for" — every retained user-facing FR has a covering test in the new suite. |

**Verdict**: PASS.

### Overall Charter Verdict: PASS

No complexity-tracking entries required.

---

## Project Structure

### Documentation (this feature)

```
kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/
├── plan.md                                # This file
├── spec.md                                # Mission spec (already exists)
├── research.md                            # Phase 0 — resolves §9 deferred questions
├── data-model.md                          # Phase 1 — type changes (no domain entities)
├── quickstart.md                          # Phase 1 — paste-runnable live-verification runbook
├── contracts/
│   ├── route-reset-provider.md            # Component + test contract for RouteResetProvider
│   └── adr-supersession.md                # ADR-0004 supersession + ADR-0005 creation contracts
├── checklists/
│   └── requirements.md                    # Spec quality checklist (already exists; all items pass)
├── mission-events.jsonl                   # spec-kitty runtime state
└── status.json / status.events.jsonl      # spec-kitty runtime state
```

### Source Code Changes (repository root)

Single-project Spicetify Custom App layout. Hexagonal boundaries from ADR-0001 are unchanged. This mission **renames one file**, **deletes five files**, **adds one ADR**, **edits four files**.

```
src/
├── app.tsx                                # EDIT: drop SpicetifyNavigation import + construction;
│                                          # rename NavigationProvider → RouteResetProvider;
│                                          # drop `navigation` prop on the provider.
├── settings.json                          # unchanged
├── adapters/
│   ├── spicetify-playlists-loader.ts      # unchanged
│   ├── spicetify-navigation.ts            # DELETE (port retirement)
│   └── fake-playlists-loader.ts           # unchanged
├── ports/
│   ├── playlists-loader.ts                # unchanged
│   └── navigation.ts                      # DELETE (port retirement)
├── domain/
│   └── (unchanged)
├── store/
│   ├── playlists-store.ts                 # unchanged (reset() action is consumed from a new site
│   │                                      # but the action itself is unchanged)
│   ├── PlaylistsStoreContext.tsx          # unchanged
│   ├── NavigationContext.tsx              # RENAME → RouteResetContext.tsx
│   └── RouteResetContext.tsx              # NEW (rename target): see contracts/route-reset-provider.md
├── ui/
│   ├── DedupPage.tsx                      # unchanged
│   ├── DedupPage.module.scss              # unchanged
│   ├── LoadingView.tsx                    # unchanged (FR-011 is a CSS-only change)
│   ├── LoadingView.module.scss            # EDIT: spinner size 32→64; border thickness 3→5 or 6
│   └── (rest unchanged — IdleView, LoadedView, EmptyView, FailedView, PlaylistRow, LikedSongsRow)
├── css/
│   └── (unchanged)
├── styles/
│   └── _tokens.module.scss                # unchanged
└── types/
    └── (unchanged)

.claude/adr/
├── 0001-hexagonal-load-dedupable-playlists.md           # unchanged
├── 0002-spicetify-platform-apis-over-graphql.md         # unchanged
├── 0003-zustand-for-load-state.md                       # unchanged
├── 0004-navigation-port.md                              # EDIT: status flip + supersession addendum
└── 0005-react-lifecycle-reset.md                        # NEW

test/
├── adapters/
│   ├── spicetify-playlists-loader.test.ts # unchanged
│   ├── spicetify-navigation.test.ts       # DELETE (test for deleted file)
│   ├── fake-navigation.ts                 # DELETE (no longer consumed)
│   ├── fake-playlists-loader.test.ts      # unchanged
│   └── fixtures/                          # unchanged
├── ports/
│   ├── playlists-loader-contract.test.ts  # unchanged
│   └── navigation-port-contract.test.ts   # DELETE (test for deleted port)
├── store/
│   ├── playlists-store.test.ts            # unchanged
│   ├── NavigationContext.test.tsx         # RENAME + REWRITE → RouteResetContext.test.tsx
│   └── RouteResetContext.test.tsx         # NEW: see contracts/route-reset-provider.md §3
├── ui/
│   └── (unchanged — LoadingView.test.tsx asserts animation property; size change doesn't affect it)
├── architecture.test.ts                   # unchanged (rules table needs no edit)
├── app.test.tsx                           # EDIT: drop NavigationProvider/SpicetifyNavigation stubbing;
│                                          # update to test RouteResetProvider instead
└── setup.ts                               # unchanged

README.md                                  # EDIT: add styled-state-views note (FR-009);
                                           # add --dedup-topbar-offset override doc (FR-010)
```

**Structure Decision**: Single-project Spicetify Custom App, hexagonal architecture preserved per ADR-0001. The only architectural change is the **retirement of the navigation port and adapter** (ADR-0004 → ADR-0005). All other layers are unchanged.

---

## Complexity Tracking

*Fill ONLY if Charter Check has violations that must be justified.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| *(none)* | | |

No complexity violations. The mission is a simplification: removes ~200 LOC of port/adapter/contract-test scaffolding, replaces it with a 5-line `useEffect`. The bundled polish items are all single-line or single-file changes.

---

## Phase 0 — Outline & Research

Produced in [`research.md`](./research.md). All §9 deferred questions resolved with concrete decisions; no `[NEEDS CLARIFICATION]` markers remain. Architectural fitness verified against `test/architecture.test.ts` (no rule edit required).

---

## Phase 1 — Design & Contracts

Produced in:

- [`data-model.md`](./data-model.md) — type changes: `RouteResetProviderProps` narrowed, `NavigationPort` deleted. No domain-entity changes.
- [`contracts/route-reset-provider.md`](./contracts/route-reset-provider.md) — `RouteResetProvider` component signature, behavioral contract, the full test plan (T-survive-1..4 retained + rewritten, T-new-1..3 added, deleted-test list explicit). JSDoc requirements per NFR-008.
- [`contracts/adr-supersession.md`](./contracts/adr-supersession.md) — exact ADR-0004 status-header edit + supersession addendum format; exact ADR-0005 file structure + required references; verification commands for mission-DoD.
- [`quickstart.md`](./quickstart.md) — paste-runnable live-client checklist for NFR-005 (B.1..B.4 across four source states) and NFR-006 (spinner-enlargement screenshots). Sign-off format specified.

---

## STOP — End of `/spec-kitty.plan` artifacts

This command ends here. Phase 2 (work-package breakdown via `/spec-kitty.tasks`) is the user's next explicit action.

**Branch contract (second statement, mandatory)**: current=`get_library`, planning base=`get_library`, merge target=`get_library`, matches=✅ true. `get_library` releases to `main` separately, per C-004.

**Next suggested command**: `/spec-kitty.tasks` (user must invoke this explicitly).
