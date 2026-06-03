# Tasks — Dedup Page Live-Client Polish

**Mission**: `dedup-page-live-client-polish-01KT6ZCR`
**Mission ID**: `01KT6ZCR2FHBG8FBB61HA41QC3`
**Branch contract**: planning base `get_library` → merge target `get_library` (matches ✅)
**Created**: 2026-06-03
**Spec**: [`spec.md`](./spec.md) · **Plan**: [`plan.md`](./plan.md) · **Research**: [`research.md`](./research.md) · **Data-model**: [`data-model.md`](./data-model.md)
**Contracts**: [`contracts/navigation-port.md`](./contracts/navigation-port.md) · [`contracts/store-reset-action.md`](./contracts/store-reset-action.md) · [`contracts/adapter-uri-type-acceptance.md`](./contracts/adapter-uri-type-acceptance.md)
**Live-verification runbook**: [`quickstart.md`](./quickstart.md)

This file is the canonical work-package manifest for the mission. Five WPs close the five defects (P1..P5) called out in spec §1; per the plan, each WP opens with a per-defect live probe before its failing test is committed. Total subtask count: **32** across **5 WPs**, with **4 of 5 WPs independent** (highly parallel).

---

## Branch Strategy

- **Planning base / merge target**: `get_library`. `get_library` is itself a feature integration branch the user releases to `main` separately (C-004). No merges to `main` from this mission.
- **Per-WP execution**: each WP runs in its own lane; lanes are computed by `spec-kitty agent mission finalize-tasks` and recorded in `lanes.json`. Each lane gets a worktree off `get_library`.
- **`branch_matches_target`**: ✅ true at planning time.

---

## Requirement Coverage Snapshot

| Source | Requirement | Owning WP |
|---|---|---|
| spec §3.1 | FR-001 — Load button not occluded by host chrome | WP-01 |
| spec §3.1 | FR-002 — CI-runnable regression test gates FR-001 | WP-01 |
| spec §3.1 | FR-003 — Five state views visually distinguishable at a glance | WP-02 |
| spec §3.1 | FR-004 — Row layout: separation, hover affordance, no span-collapse | WP-02 |
| spec §3.1 | FR-005 — Placeholder cover for null `imageUrl` rows | WP-02 |
| spec §3.1 | FR-006 — Retry button + spinner visually distinguishable | WP-02 |
| spec §3.1 | FR-007 — Store exposes a `reset` action | WP-05 |
| spec §3.1 | FR-008 — DedupPage navigation-aware reset hook | WP-03 |
| spec §3.1 | FR-009 — `reset` does not call loader | WP-05 |
| spec §3.1 | FR-010 — Adapter accepts `playlist` OR `playlist-v2` | WP-04 |
| spec §3.1 | FR-011 — Fixture covers one `playlist-v2` node | WP-04 |
| spec §3.1 | FR-012 — `triggerLoad` no-op from non-`idle` states | WP-05 |
| spec §3.1 | FR-013 — `triggerLoad` no-op covered per non-`idle` state | WP-05 |
| spec §3.2 | NFR-001..NFR-010 — TDD ordering, coverage, typecheck, etc. | cross-cutting (DoD on every WP); NFR-005 + NFR-006 satisfied at mission DoD via [`quickstart.md`](./quickstart.md) |
| spec §3.3 | C-001..C-006 — ADR scope, strict TS/SRP, risk boundaries | cross-cutting |

---

## Subtask Index

The index is a reference table; `mark-status` does NOT operate on it (see per-WP checkbox rows). The `Parallel` column marks subtasks safe to run in parallel within the same WP.

| Subtask | Description | WP | Parallel |
|---|---|---|---|
| T001 | Live probe — measure topbar bottom + button hit-target (WP-01) | WP-01 | — |
| T002 | TDD failing test — faux topbar occludes Load button center | WP-01 | — |
| T003 | Add app.test.tsx smoke regression for clickable Load button | WP-01 | [P] |
| T004 | Create `src/ui/DedupPage.module.scss` with scroll surface + padding-top | WP-01 | — |
| T005 | Wire `DedupPage.tsx` to use module class on root wrapper | WP-01 | — |
| T006 | Update README — clickable Load button reflected in user-visible copy | WP-01 | [P] |
| T007 | Create `src/styles/_tokens.module.scss` (--spice-* aliases) | WP-02 | — |
| T008 | TDD IdleView distinct-styling + module.scss + className swap | WP-02 | [P] |
| T009 | TDD LoadingView (spinner visible per FR-006) + module.scss + className swap | WP-02 | [P] |
| T010 | TDD LoadedView + PlaylistRow + LikedSongsRow (row separation FR-004 + placeholder FR-005) + 3 module.scss + className swaps | WP-02 | — |
| T011 | TDD EmptyView distinct-styling + module.scss + className swap | WP-02 | [P] |
| T012 | TDD FailedView (retry affordance visible per FR-006) + module.scss + className swap | WP-02 | [P] |
| T013 | README — note styled state views (NFR-007 portion) | WP-02 | [P] |
| T014 | Author ADR-0004 (`.claude/adr/0004-navigation-port.md`) | WP-03 | [P] |
| T015 | Create `src/ports/navigation.ts` (`NavigationPort` interface + JSDoc) | WP-03 | — |
| T016 | Create `test/adapters/fake-navigation.ts` (`FakeNavigation`) | WP-03 | [P] |
| T017 | Create `test/ports/navigation-port-contract.test.ts` (parameterized C-1..C-7) | WP-03 | — |
| T018 | TDD `SpicetifyNavigation` adapter — `test/adapters/spicetify-navigation.test.ts` then `src/adapters/spicetify-navigation.ts` | WP-03 | — |
| T019 | TDD `NavigationProvider` (`src/store/NavigationContext.tsx`) — navigation-aware reset hook | WP-03 | — |
| T020 | Wire `src/app.tsx` — wrap with `<NavigationProvider>` + construct `SpicetifyNavigation` | WP-03 | — |
| T021 | Live probe — confirm History.listen fires across navigate-away/back | WP-03 | — |
| T022 | Live probe — observed rootlist `type` distribution (informational) | WP-04 | — | [D] |
| T023 | TDD failing fixture test — `playlist-v2` node appears in adapter output (F-1, F-2) | WP-04 | — | [D] |
| T024 | Extend `rootlist-response.sample.json` with `playlist-v2` node | WP-04 | — | [D] |
| T025 | Adapter — widen `walkItems` branch to accept `playlist-v2` | WP-04 | — | [D] |
| T026 | TDD boundary tests F-3, F-4, F-5 (`playlist-v3` skipped, folder recursion, show/episode skipped) | WP-04 | [D] |
| T027 | TDD reset() R-1..R-5 (one failing test per source FSM state) | WP-05 | — | [D] |
| T028 | Implement `reset()` in store; declare in `PlaylistsState` type | WP-05 | — | [D] |
| T029 | TDD R-6 concurrency test — late `load-succeeded` after `reset` stays idle | WP-05 | [D] |
| T030 | TDD triggerLoad T-1..T-4 (one failing test per non-`idle` source state) | WP-05 | — | [D] |
| T031 | Implement `triggerLoad` idle-gate (narrowed precondition mirroring `retry`) | WP-05 | — | [D] |
| T032 | T-5 regression assertion — `triggerLoad` from idle still loads | WP-05 | [D] |

Live probes (T001, T021, T022) are captured into the WP's working notes during implementation; their output may inform the consolidated mission-DoD artefact (`live-verification.<YYYY-MM-DD>.md`) referenced by NFR-005.

---

## Work Packages

## WP01 — Topbar Occlusion Fix

**Prompt**: [`tasks/WP01-topbar-occlusion.md`](./tasks/WP01-topbar-occlusion.md)
**Priority**: P1 (HIGH) — the headline blocker; the page is unusable without it.
**Defect closed**: spec §1 P1.
**Requirements**: FR-001, FR-002, NFR-009 (assertion automated). Also touches NFR-007 (README).
**Independent test**: live mouse click on Load button hits the button (not host chrome) on first attempt.
**Dependencies**: none.
**Estimated prompt size**: ~320 lines.

**Subtasks (tracking — checkbox rows below feed `mark-status`)**:

- [ ] T001 Live probe — measure topbar bottom + button hit-target (WP-01)
- [ ] T002 TDD failing test — faux topbar occludes Load button center (WP-01)
- [ ] T003 Add app.test.tsx smoke regression for clickable Load button (WP-01)
- [ ] T004 Create `src/ui/DedupPage.module.scss` with scroll surface + padding-top (WP-01)
- [ ] T005 Wire `DedupPage.tsx` to use module class on root wrapper (WP-01)
- [ ] T006 Update README — clickable Load button reflected in user-visible copy (WP-01)

**Implementation sketch**:
1. Probe live: paste research.md §1 snippet in DevTools, record topbar bottom value.
2. Write `test/ui/DedupPage.test.tsx` faux-overlay test (FR-001/FR-002) — must fail on current `DedupPage` (no scroll surface).
3. Write `test/app.test.tsx` regression that asserts the rendered root has the expected wrapper class (or that `elementFromPoint` resolves to the button with the wrapper in place).
4. Create `DedupPage.module.scss` with `.page { height: 100%; overflow-y: auto; padding-top: var(--dedup-topbar-offset, <probe>px); padding-inline: 24px; }`.
5. Edit `DedupPage.tsx` to wrap the `switch` in `<div className={styles.page}>{…}</div>` and import the styles.
6. Update README — single-line note that the page now ships a scroll surface that keeps the Load button below the host topbar.
7. Verify: `npm run test:run`, `npm run typecheck`, `npm run test:coverage` all green.

**Parallel opportunities**: T003 and T006 can be authored in parallel with T002 once T001's value is recorded.
**Risks**: happy-dom `elementFromPoint` fidelity (research §4) — fallback to computed-style overlap check if needed; WP includes the fallback shape ready to swap in.

---

## WP02 — State View Styling (CSS Modules)

**Prompt**: [`tasks/WP02-styling-state-views.md`](./tasks/WP02-styling-state-views.md)
**Priority**: P2 (MEDIUM) — large surface area but no defect cascades from delay.
**Defects closed**: spec §1 P2.
**Requirements**: FR-003, FR-004, FR-005, FR-006, NFR-006 (visual evidence at DoD), NFR-007 (README).
**Independent test**: from a single glance, all five state views are visually distinguishable; rows have separation; spinner + retry are recognizable.
**Dependencies**: none in code (files disjoint from WP-01).
**Estimated prompt size**: ~420 lines.

**Subtasks (tracking)**:

- [ ] T007 Create `src/styles/_tokens.module.scss` (--spice-* aliases) (WP-02)
- [ ] T008 TDD IdleView distinct-styling + module.scss + className swap (WP-02)
- [ ] T009 TDD LoadingView (spinner visible per FR-006) + module.scss + className swap (WP-02)
- [ ] T010 TDD LoadedView + PlaylistRow + LikedSongsRow (row separation FR-004 + placeholder FR-005) + 3 module.scss + className swaps (WP-02)
- [ ] T011 TDD EmptyView distinct-styling + module.scss + className swap (WP-02)
- [ ] T012 TDD FailedView (retry affordance visible per FR-006) + module.scss + className swap (WP-02)
- [ ] T013 README — note styled state views (NFR-007 portion) (WP-02)

**Implementation sketch**:
1. T007 — write `_tokens.module.scss` aliasing `--spice-text`, `--spice-button`, `--spice-main`, `--spice-card`, `--spice-sidebar` for use by the 7 view modules.
2. T008..T012 — for each view, follow the TDD loop: write a failing test that queries a known accessible name + asserts a styling property the new module provides (e.g. spinner presence by `role="status"`, retry by `role="button"` with accessible name + non-default background, row separation via `getComputedStyle` border-bottom).
3. T010 — bundle LoadedView + PlaylistRow + LikedSongsRow because the loaded surface composes them; row separation tests live in PlaylistRow.test.tsx + LikedSongsRow.test.tsx, the loaded view test asserts the row grid renders.
4. T013 — README single-line note that state views are styled and visually distinct.
5. Verify: full suite green, coverage 100/100.

**Parallel opportunities**: T008, T009, T011, T012, T013 are independent file pairs once T007 lands; one agent or multiple can interleave.
**Risks**: assertion shape — tests must NOT depend on hashed Spotify classnames (research §1). Use accessible-role queries + computed-style numerical bounds.

---

## WP03 — Navigation Reset Port

**Prompt**: [`tasks/WP03-navigation-port.md`](./tasks/WP03-navigation-port.md)
**Priority**: P3 (MEDIUM) — required to honor SC-3 (navigate-away returns to idle).
**Defect closed**: spec §1 P3, FR-008 wiring.
**Requirements**: FR-008. Also introduces ADR-0004 (DIRECTIVE_003).
**Independent test**: navigate-away + return → page lands on idle state. Verified via the navigation port contract test + an integration test against the `FakeNavigation` adapter.
**Dependencies**: WP05 (`NavigationProvider` calls `s.reset` from the store; that action must exist). Depends on WP05.
**Estimated prompt size**: ~470 lines.

**Subtasks (tracking)**:

- [ ] T014 Author ADR-0004 (`.claude/adr/0004-navigation-port.md`) (WP-03)
- [ ] T015 Create `src/ports/navigation.ts` (`NavigationPort` interface + JSDoc) (WP-03)
- [ ] T016 Create `test/adapters/fake-navigation.ts` (`FakeNavigation`) (WP-03)
- [ ] T017 Create `test/ports/navigation-port-contract.test.ts` (parameterized C-1..C-7) (WP-03)
- [ ] T018 TDD `SpicetifyNavigation` adapter — `test/adapters/spicetify-navigation.test.ts` then `src/adapters/spicetify-navigation.ts` (WP-03)
- [ ] T019 TDD `NavigationProvider` (`src/store/NavigationContext.tsx`) — navigation-aware reset hook (WP-03)
- [ ] T020 Wire `src/app.tsx` — wrap with `<NavigationProvider>` + construct `SpicetifyNavigation` (WP-03)
- [ ] T021 Live probe — confirm History.listen fires across navigate-away/back (WP-03)

**Implementation sketch**:
1. T014 — author ADR-0004 (decision: navigation port + adapter + provider).
2. T015 — declare `NavigationPort` interface in `src/ports/`.
3. T016 — write `FakeNavigation`; T017 wires it into the contract test.
4. T018 — TDD `SpicetifyNavigation`: failing test (stubbed `globalThis.Spicetify`), implement, run contract test.
5. T019 — TDD `NavigationProvider` against `FakeNavigation`: failing test (navigate-away → navigate-back triggers `reset()` if state ≠ idle), implement provider, integrate.
6. T020 — modify `app.tsx` to wrap `<DedupPage>` in `<NavigationProvider navigation={new SpicetifyNavigation()}>`.
7. T021 — live probe in Spotify DevTools, confirm hypothesis. Capture into the WP working notes.
8. Verify: full suite green, coverage 100/100, architecture test green.

**Parallel opportunities**: T014 + T016 + T015 can interleave; T017 follows T015+T016; T018 + T019 can run in parallel after T017 if two agents are working.
**Risks**: spec §2 edge case "Spicetify may unmount custom apps on navigation" — if T021 confirms unmount, the simpler `useEffect cleanup` design works but the port is still load-bearing for the architecture test; ADR-0004 stays as-is.

---

## WP04 — Adapter `playlist-v2` Acceptance

**Prompt**: [`tasks/WP04-playlist-v2-acceptance.md`](./tasks/WP04-playlist-v2-acceptance.md)
**Priority**: P4 (LOW) — zero observed user impact in the 2026-06-03 library, but closes a silent-failure path for future Spotify rollouts.
**Defect closed**: spec §1 P4.
**Requirements**: FR-010, FR-011, NFR-010 (no half-done direction).
**Independent test**: a fixture containing a `playlist-v2` node yields a `RawCollection` from the adapter; existing `playlist` rows still pass; `show`/`episode` rows still silently skipped.
**Dependencies**: none.
**Estimated prompt size**: ~260 lines.

**Subtasks (tracking)**:

- [x] T022 Live probe — observed rootlist `type` distribution (informational) (WP-04)
- [x] T023 TDD failing fixture test — `playlist-v2` node appears in adapter output (F-1, F-2) (WP-04)
- [x] T024 Extend `rootlist-response.sample.json` with `playlist-v2` node (WP-04)
- [x] T025 Adapter — widen `walkItems` branch to accept `playlist-v2` (WP-04)
- [x] T026 TDD boundary tests F-3, F-4, F-5 (`playlist-v3` skipped, folder recursion, show/episode skipped) (WP-04)

**Implementation sketch**:
1. T022 — paste research.md §5 snippet in DevTools, record output. Inform fixture choice (synthetic node sufficient if zero observed; capture real node if any).
2. T023 — add failing test asserting `playlist-v2` fixture node appears in adapter output with identical `RawCollection` shape (F-2).
3. T024 — extend `test/adapters/fixtures/rootlist-response.sample.json` with the synthetic node from data-model §3.
4. T025 — change `walkItems` line 141: `type === 'playlist' || type === 'playlist-v2'`.
5. T026 — assert boundary cases (`playlist-v3` not picked up, folder recursion still works, `show`/`episode` still skipped).
6. Verify: full suite green, coverage 100/100.

**Parallel opportunities**: T026 boundary tests can be authored alongside T023.
**Risks**: existing "exact contents" assertion in `spicetify-playlists-loader.test.ts` may need its expected length bumped by +1; if churn is large, fall back to sibling fixture (contract Path B).

---

## WP05 — Store FSM Invariants (`reset()` + `triggerLoad` gate)

**Prompt**: [`tasks/WP05-store-fsm-invariants.md`](./tasks/WP05-store-fsm-invariants.md)
**Priority**: P3 + P5 (MEDIUM + LOW) — small surgical edits in `playlists-store.ts` covering FR-007, FR-009 (reset semantics) and FR-012, FR-013 (triggerLoad gate). Bundled because both edit the same file.
**Defects closed**: spec §1 P3 (store side) and P5.
**Requirements**: FR-007, FR-009, FR-012, FR-013.
**Independent test**: `reset()` from every source state lands idle without calling loader; `triggerLoad` from every non-idle source state is a no-op.
**Dependencies**: none. **WP-03 depends on this** for `reset`.
**Estimated prompt size**: ~340 lines.

**Subtasks (tracking)**:

- [x] T027 TDD reset() R-1..R-5 (one failing test per source FSM state) (WP-05)
- [x] T028 Implement `reset()` in store; declare in `PlaylistsState` type (WP-05)
- [x] T029 TDD R-6 concurrency test — late `load-succeeded` after `reset` stays idle (WP-05)
- [x] T030 TDD triggerLoad T-1..T-4 (one failing test per non-`idle` source state) (WP-05)
- [x] T031 Implement `triggerLoad` idle-gate (narrowed precondition mirroring `retry`) (WP-05)
- [x] T032 T-5 regression assertion — `triggerLoad` from idle still loads (WP-05)

**Implementation sketch**:
1. T027 — five failing tests in `test/store/playlists-store.test.ts`, one per `loadState.kind` (idle/loading/loaded/empty/failed); each calls `reset()` and asserts state === `{ kind: 'idle' }` + `loader.callCount` unchanged.
2. T028 — extend `PlaylistsState` type with `reset: () => void`; add `reset() { set({ loadState: { kind: 'idle' } }); }` to the factory.
3. T029 — write R-6: controllable loader resolves after `reset()` is called; assert post-resolve state is still idle (FSM `transition` ignores `load-succeeded` from non-`loading`).
4. T030 — four failing tests, one per non-idle source state; each calls `triggerLoad()` and asserts state unchanged + `loader.callCount` unchanged.
5. T031 — narrow `triggerLoad` to gate on `before.kind === 'idle'` and return early otherwise (mirror existing `retry` gate at lines 114-119).
6. T032 — T-5: trigger from idle still calls loader (regression check that the gate did not over-fire).
7. Verify: full suite green, coverage 100/100.

**Parallel opportunities**: T029, T032 are quick additions parallel to other test work.
**Risks**: R-6's concurrency assertion needs a controllable promise (the existing `FakePlaylistsLoader` may not expose it); pattern lifted from prior mission's retry tests.

---

## MVP Scope Recommendation

**MVP = WP-01** (Topbar Occlusion Fix).

Rationale: P1 is the only HIGH-priority defect; without it the page is unusable from a real mouse. Every other WP is a polish or invariant tightening. If the user wants to ship a minimal-risk first slice, WP-01 ships clickability with one prompt's worth of work, no dependencies on the rest of the mission.

The full mission DoD requires all five WPs + the `quickstart.md` live-verification artefact for NFR-005 / NFR-006.

---

## Execution Order & Parallelization

**Dependency edges**:

```
WP-05 ──► WP-03   (NavigationProvider calls reset from store; reset must exist first)
WP-01    (independent)
WP-02    (independent)
WP-04    (independent)
WP-05    (independent)
```

**Maximum parallelism**: WP-01 + WP-02 + WP-04 + WP-05 can run in four lanes simultaneously. WP-03 starts when WP-05's lane reports done.

**Conservative sequential order** (single-agent): WP-04 → WP-05 → WP-01 → WP-02 → WP-03. (Smallest surgical changes first; navigation port last because it depends on `reset`.)

**Recommended order for value delivery** (single-agent): WP-01 → WP-05 → WP-03 → WP-02 → WP-04. (Headline blocker first; store invariants next so WP-03 can land; navigation polish; visual polish; minor adapter widening last.)

---

## Definition of Done (mission level)

Each WP carries its own DoD inside its prompt file. The mission-level DoD wraps them:

1. All five WP files marked done; per-WP DoDs satisfied.
2. Full suite green: `npm run test:run` and `npm run typecheck` exit 0.
3. Coverage gate green: `npm run test:coverage` reports `lines: 100%` and `branches: 100%`.
4. Architecture test green (NFR-004).
5. README reflects the user-visible changes (NFR-007).
6. JSDoc on every export added or changed (NFR-008).
7. Live-verification artefact committed at `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.<YYYY-MM-DD>.md` per `quickstart.md` §5 (NFR-005, NFR-006).
8. ADR-0004 committed at `.claude/adr/0004-navigation-port.md` (or its `.kittify`-aware path) — DIRECTIVE_003 satisfied.

---

## Next Suggested Commands

After finalize-tasks completes:
1. `/spec-kitty.analyze` — cross-artifact consistency check (optional but recommended for a mission of this scope).
2. `/spec-kitty.implement` (or the `spec-kitty-implement-review` orchestration skill) — execute WPs.

Per the resolver: every implement/review step pulls the lane assignment from `lanes.json` (computed by `finalize-tasks`).
