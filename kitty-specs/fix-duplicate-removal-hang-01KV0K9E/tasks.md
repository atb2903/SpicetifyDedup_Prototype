# Tasks — Fix Indefinite Hang on Duplicate Removal

**Mission:** `fix-duplicate-removal-hang-01KV0K9E`
**Planning/base branch:** `main` → **merge target:** `main`
**Generated:** 2026-06-13 from [spec.md](./spec.md) + [plan.md](./plan.md) + [research.md](./research.md) +
[data-model.md](./data-model.md) + [contracts/removal-termination.md](./contracts/removal-termination.md)

This is a **two-defect bug fix + one resilience seam**, reusing existing types/states (no new FSM
phase, no new port). WP01 (live diagnosis) **relocated the root cause** away from the original
never-settling-promise hypothesis: the functional fault is the enricher dropping `uid` (WP05) and
the hang is the store's catch re-throwing a `computeRemoveSet` failure (WP03). The WPs honor C-003
(TDD) and C-004 (live evidence before — and after — the fix).

## Execution order & dependency graph

```
                          ┌────────────────────────────────────────┐
WP01 (diagnosis + ADR) ───┤                                        │
   live, gating  [DONE]    ├─► WP02 (foundation) ─► WP03 (catch fix ├─► WP04 (UI + integration
                          └─► WP05 (enricher uid fix) ──────────────┘    + live re-verify)
                              code_change (Defect B)   + stall ceiling)   code_change + live
```

- **WP05** (enricher `uid` fix) depends only on WP01 — independent of WP02/WP03, can run in
  parallel with WP02.
- **WP03** (catch hardening + ceiling) depends on WP02.
- **WP04** depends on **both WP03 and WP05** (the integration test proves a real `uid`-carrying
  removal succeeds *and* a stall terminates).

One worktree/lane per WP; file-level SRP keeps owned_files disjoint (C-005).

## MVP / critical path

Two fixes share the critical path: **WP05** makes removal actually delete (Defect B → FR-002/
FR-003), and **WP03** makes a failing removal terminate instead of hanging (Defect A → FR-004/
FR-006) and adds the NFR-001 ceiling. WP01 gated both with live evidence; WP02 supplies the ceiling
scaffolding WP03 imports; WP04 surfaces the failure copy and proves the whole thing end-to-end +
live.

---

## Subtask Index (reference table — not a tracking surface)

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | Live-capture the failing removal call on the 2-song repro (instrumented console) | WP01 | | [D] |
| T002 | Classify captured behavior vs research R-1 table; fix the functional root cause if it is not a pure hang | WP01 | | [D] |
| T003 | Author ADR-0017 (root cause + stall-ceiling guard) + committed diagnosis-evidence.md | WP01 | | [D] |
| T004 | Add `'stalled'` to `RemovalErrorCode` (+ test) | WP02 | [D] |
| T005 | Create `src/ports/scheduler.ts` — `Scheduler` seam + `defaultScheduler` (+ test) | WP02 | [D] |
| T006 | Add `{ kind: 'hang' }` to `FakeRemovalScript` (+ test) | WP02 | [D] |
| T007 | Failing tests: (a) a `computeRemoveSet` failure leaves the row `removing` (the real hang); (b) a never-settling executor leaves it `removing` (the ceiling) | WP03 | | [D] |
| T008 | `STALL_CEILING_MS` + pure `raceStallCeiling` helper (deadline-wins tie-break) | WP03 | | [D] |
| T009 | Catch hardening (compute once; compute-failure → terminal `partial`, never re-thrown) + inject `scheduler` & wrap `executor.remove`; stall → `RemovalError('stalled')` → `partial` | WP03 | | [D] |
| T010 | Boundary tests (under / at / over the ceiling) | WP03 | | [D] |
| T011 | Stall-vs-cancel pair + compute-failure-vs-cancel + concurrency/late-settle tests | WP03 | | [D] |
| T015 | Propagate `uid` onto `EnrichedTrack` in `inline-catalog-enricher.ts` (Defect B fix) | WP05 | [D] |
| T016 | Failing-first guard test: `uid` survives enrichment for a playlist track; stays `undefined` for Liked-Songs | WP05 | [D] |
| T012 | `RemovalOutcomeView`: plain-language timed-out copy for the stalled outcome | WP04 | | [D] |
| T013 | Integration test: real store + real enricher → a `uid`-carrying duplicate is actually removed; `hang` fake + fake scheduler → terminates to `partial` | WP04 | | [D] |
| T014 | Live re-verification on the 2-song repro (SC-001..SC-004) + transcript | WP04 | | [D] |

---

## WP01 — Live diagnosis & root-cause ADR-0017

**Prompt:** [tasks/WP01-diagnose-root-cause.md](./tasks/WP01-diagnose-root-cause.md)
**Priority:** P0 (gating) · **Mode:** planning_artifact
**Requirements:** FR-001, NFR-003, C-004
Dependencies: none.

**Goal.** Confirm — with live evidence on the minimal 2-song duplicate playlist — exactly which
host removal call hangs (or rejects), and document the root cause **and** the chosen stall-ceiling
guard in ADR-0017 before any fix code lands.

**Independent test.** ADR-0017 exists with a console transcript distinguishing "never settles"
from "rejects"; `diagnosis-evidence.md` (committed) carries the captured `CALLED`/`RESOLVED`/
`REJECTED` log and the R-1 classification.

**Included subtasks:**

- [x] T001 Live-capture the failing removal call on the 2-song repro (WP01)
- [x] T002 Classify captured behavior vs research R-1 table; fix the functional root cause if not a pure hang (WP01)
- [x] T003 Author ADR-0017 + committed diagnosis-evidence.md (WP01)

**Dependencies / risks.** Requires a live Spotify desktop client with Spicetify (driver
protocol). If diagnosis reveals a *non-hang* root cause (reject / wrong call shape / bad `uid`),
the functional fix is folded into WP03 — the ceiling is still required by NFR-001 regardless.

**Est. prompt size:** ~210 lines.

---

## WP02 — Termination foundation (stalled code · scheduler seam · hang fake)

**Prompt:** [tasks/WP02-termination-foundation.md](./tasks/WP02-termination-foundation.md)
**Priority:** P0 · **Mode:** code_change
**Requirements:** FR-004, FR-006
Dependencies: WP01.

**Goal.** Land the three small, independent scaffolding pieces the fix imports: the `'stalled'`
error code, the injectable `Scheduler` timer seam, and the `'hang'` fake-executor script — each
with its own tests at 100% line/branch.

**Independent test.** `npm run test:run` green for `removal-errors`, `scheduler`, and
`fake-removal-executor`; `npm run typecheck` clean; architecture test still passes.

**Included subtasks:**

- [x] T004 Add `'stalled'` to `RemovalErrorCode` (+ test) (WP02)
- [x] T005 Create `src/ports/scheduler.ts` — `Scheduler` seam + `defaultScheduler` (+ test) (WP02)
- [x] T006 Add `{ kind: 'hang' }` to `FakeRemovalScript` (+ test) (WP02)

**Parallel opportunities.** T004/T005/T006 touch three different files and may be done in any
order within the WP.

**Est. prompt size:** ~240 lines.

---

## WP03 — Catch hardening (the hang fix) + stall ceiling in `confirmRemoval`

**Prompt:** [tasks/WP03-store-stall-ceiling.md](./tasks/WP03-store-stall-ceiling.md)
**Priority:** P0 (critical path) · **Mode:** code_change
**Requirements:** FR-004, FR-006, FR-007, FR-009, FR-010, NFR-001, NFR-002
Dependencies: WP02.

**Goal (Defect A + NFR-001).** Two coupled changes in `confirmRemoval`:
1. **Catch hardening (the actual hang fix).** Compute the remove-set **once** (before/outside the
   fragile catch) and ensure a `computeRemoveSet` failure surfaces as a **terminal** all-failed
   `partial` — never re-thrown. The live root cause is the catch re-invoking `computeRemoveSet`
   (line 378) and re-throwing, leaving the row `removing` forever.
2. **Stall ceiling (defense-in-depth).** Bound the `await removalExecutor.remove(...)` with an
   injected-scheduler deadline; on stall `controller.abort()` + raise `RemovalError('stalled')`,
   which flows through the **same** non-`AbortError` catch into an all-failed `partial`.

No new FSM state/action; confirmations untouched. (FR-002/FR-003/FR-005 — *removal actually
deletes* — are delivered by **WP05**, not here; WP03 makes a *failing* removal terminate.)

**Independent test.** T007a (a `computeRemoveSet` failure leaves `removing` today) and T007b
(never-settling executor past `STALL_CEILING_MS`) both drive the row out of `removing` into
`partial`; boundary suite (under/at/over) green; stall-vs-cancel and compute-failure-vs-cancel
pairs green; coverage 100%.

**Included subtasks:**

- [x] T007 Failing tests: compute-failure hang + never-settling hang both leave `removing` (WP03)
- [x] T008 `STALL_CEILING_MS` + pure `raceStallCeiling` helper (deadline-wins) (WP03)
- [x] T009 Catch hardening (compute once) + inject `scheduler` & wrap `executor.remove`; stall → `RemovalError('stalled')` → `partial` (WP03)
- [x] T010 Boundary tests (under / at / over the ceiling) (WP03)
- [x] T011 Stall-vs-cancel + compute-failure-vs-cancel + concurrency/late-settle tests (WP03)

**Dependencies / risks.** Crux risk: neither a stall nor a compute failure may take the
`AbortError`-swallow branch (that would re-create the bug). Distinct `RemovalError`s and their
dedicated tests are the guard. Late executor settlement after the deadline must not surface as an
unhandled rejection.

**Est. prompt size:** ~360 lines.

---

## WP05 — Enricher `uid` propagation (the functional fix)

**Prompt:** [tasks/WP05-enricher-uid-propagation.md](./tasks/WP05-enricher-uid-propagation.md)
**Priority:** P0 (critical path) · **Mode:** code_change
**Requirements:** FR-002, FR-003, FR-005
Dependencies: WP01. *(Independent of WP02/WP03 — may run in parallel with WP02.)*

**Goal (Defect B).** Restore the ADR-0012 contract that the inline enricher silently regressed:
copy `t.uid` onto the `EnrichedTrack` built in `inline-catalog-enricher.ts:97-104`. Playlist items
carry a non-empty `uid`; Liked-Songs items have none (`undefined`). This is the fix that makes
removal actually delete the duplicate (without it `computeRemoveSet` fails loud on every playlist).

**Independent test.** A failing-first guard test asserts `uid` survives enrichment for a playlist
track (and is absent for Liked-Songs); `npm run typecheck` clean; `npm run test:coverage` 100% on
the enricher.

**Included subtasks:**

- [x] T015 Propagate `uid` onto `EnrichedTrack` in `inline-catalog-enricher.ts` (WP05)
- [x] T016 Failing-first guard test: `uid` survives enrichment (playlist) / absent (Liked-Songs) (WP05)

**Dependencies / risks.** The doc comment claiming "preserved verbatim through enrichment" was not
enforced — the test upgrade is the guard against silent re-regression. Keep it a pure adapter
change: no port/store/domain edits.

**Est. prompt size:** ~150 lines.

---

## WP04 — Stalled UI message · integration · live re-verification

**Prompt:** [tasks/WP04-ui-integration-reverify.md](./tasks/WP04-ui-integration-reverify.md)
**Priority:** P1 · **Mode:** code_change
**Requirements:** FR-002, FR-003, FR-006, FR-008
Dependencies: WP03, WP05.

**Goal.** Surface the stall as plain-language "timed-out" copy in `RemovalOutcomeView` (NFR-004),
prove **both** guarantees end-to-end through the real store + real enricher (DIRECTIVE_036) — (a) a
`uid`-carrying duplicate is *actually removed* (Defect B fixed), and (b) a hung removal *terminates*
to `partial` (Defect A + ceiling) — and re-verify the whole flow live on the 2-song repro
(SC-001..SC-004), including a forced stall.

**Independent test.** UI test renders both the generic-partial and the timed-out copy; the
integration test (real store + real enricher) removes a duplicate by its `uid` on the happy path
and terminates a hung removal to `partial` with unchanged counts and never `none`; live re-verify
transcript captured.

**Included subtasks:**

- [x] T012 `RemovalOutcomeView`: plain-language timed-out copy for the stalled outcome (WP04)
- [x] T013 Integration test: real store + `hang` fake + fake scheduler → terminates to `partial` (WP04)
- [x] T014 Live re-verification on the 2-song repro (SC-001..SC-004) + transcript (WP04)

**Dependencies / risks.** Depends on the `stalled`-reason convention WP03 writes into the
all-failed outcome. Live re-verify needs the live client (driver protocol).

**Est. prompt size:** ~260 lines.

---

## Coverage map (FR/NFR/C → WP)

| Requirement | WP | Notes |
|---|---|---|
| FR-001 | WP01 | live root-cause identification (Defect A + B) |
| FR-002, FR-003, FR-005 | **WP05** (+ WP04 integration + live) | enricher `uid` fix makes deletion actually take effect / exactly one of two |
| FR-004 | WP03 | catch hardening + ceiling → always reaches a terminal state |
| FR-006 | WP03, WP04 | explicit failure state + plain-language surface |
| FR-007 | WP03 | no false success (stall/compute-failure → `partial`, never `none`) |
| FR-008 | WP04 | retry/dismiss via existing `partial → confirming` edge |
| FR-009 | WP03 | in-flight lock re-asserted across the stall path |
| FR-010 | WP03 | confirmations not bypassed/weakened |
| NFR-001 | WP02, WP03 | stall ceiling (hang guard, not SLA) — defense-in-depth |
| NFR-002 | WP03, WP05 | boundary tests under/at/over + `uid` guard + 100% coverage |
| NFR-003 | WP01 | ADR-0017 |
| NFR-004 | WP04 | plain-language UI, no raw stack |
| C-001 | WP01/WP03/WP05 | Platform APIs only, never `api.spotify.com` |
| C-002 | WP03 | no silent mutation; confirmations intact |
| C-003 | WP03, WP05 | failing test observed before each fix |
| C-004 | WP01/WP04 | live evidence before fix accepted + live re-verify |
| C-005 | all | TS strict + file-level SRP (WP05 ≠ WP03 keeps layers disjoint) |
