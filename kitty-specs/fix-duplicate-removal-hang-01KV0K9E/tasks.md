# Tasks — Fix Indefinite Hang on Duplicate Removal

**Mission:** `fix-duplicate-removal-hang-01KV0K9E`
**Planning/base branch:** `main` → **merge target:** `main`
**Generated:** 2026-06-13 from [spec.md](./spec.md) + [plan.md](./plan.md) + [research.md](./research.md) +
[data-model.md](./data-model.md) + [contracts/removal-termination.md](./contracts/removal-termination.md)

This is a **bug fix + one resilience seam**, deliberately reusing existing types/states (no new
FSM phase, no new port). The work is small and the WPs are sequenced linearly so the live
root-cause diagnosis lands (and is documented) before the fix code does — honoring C-003 (TDD)
and C-004 (live evidence before the fix is accepted).

## Execution order & dependency graph

```
WP01 (diagnosis + ADR)  →  WP02 (foundation)  →  WP03 (store stall ceiling)  →  WP04 (UI + integration + re-verify)
   live, gating            code_change            code_change (the fix)         code_change + live re-verify
```

Linear chain — each WP depends on the previous. One worktree/lane per WP.

## MVP / critical path

The fix is **WP03** (the stall ceiling in `confirmRemoval`). WP01 gates it with the confirmed
root cause; WP02 provides the type/seam scaffolding WP03 imports; WP04 surfaces the failure to
the user and proves termination end-to-end + live.

---

## Subtask Index (reference table — not a tracking surface)

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | Live-capture the failing removal call on the 2-song repro (instrumented console) | WP01 | |
| T002 | Classify captured behavior vs research R-1 table; fix the functional root cause if it is not a pure hang | WP01 | |
| T003 | Author ADR-0017 (root cause + stall-ceiling guard) + committed diagnosis-evidence.md | WP01 | |
| T004 | Add `'stalled'` to `RemovalErrorCode` (+ test) | WP02 | [P] |
| T005 | Create `src/ports/scheduler.ts` — `Scheduler` seam + `defaultScheduler` (+ test) | WP02 | [P] |
| T006 | Add `{ kind: 'hang' }` to `FakeRemovalScript` (+ test) | WP02 | [P] |
| T007 | Failing regression test: never-settling removal must leave `removing` | WP03 | |
| T008 | `STALL_CEILING_MS` + pure `raceStallCeiling` helper (deadline-wins tie-break) | WP03 | |
| T009 | Inject `scheduler`; wrap `executor.remove` in the ceiling; stall → `RemovalError('stalled')` → `partial` | WP03 | |
| T010 | Boundary tests (under / at / over the ceiling) | WP03 | |
| T011 | Stall-vs-cancel pair + concurrency/late-settle tests | WP03 | |
| T012 | `RemovalOutcomeView`: plain-language timed-out copy for the stalled outcome | WP04 | |
| T013 | Integration test: real store + `hang` fake + fake scheduler → terminates to `partial` | WP04 | |
| T014 | Live re-verification on the 2-song repro (SC-001..SC-004) + transcript | WP04 | |

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

- [ ] T001 Live-capture the failing removal call on the 2-song repro (WP01)
- [ ] T002 Classify captured behavior vs research R-1 table; fix the functional root cause if not a pure hang (WP01)
- [ ] T003 Author ADR-0017 + committed diagnosis-evidence.md (WP01)

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

- [ ] T004 Add `'stalled'` to `RemovalErrorCode` (+ test) (WP02)
- [ ] T005 Create `src/ports/scheduler.ts` — `Scheduler` seam + `defaultScheduler` (+ test) (WP02)
- [ ] T006 Add `{ kind: 'hang' }` to `FakeRemovalScript` (+ test) (WP02)

**Parallel opportunities.** T004/T005/T006 touch three different files and may be done in any
order within the WP.

**Est. prompt size:** ~240 lines.

---

## WP03 — Stall ceiling in `confirmRemoval` (the fix)

**Prompt:** [tasks/WP03-store-stall-ceiling.md](./tasks/WP03-store-stall-ceiling.md)
**Priority:** P0 (critical path) · **Mode:** code_change
**Requirements:** FR-002, FR-003, FR-004, FR-005, FR-007, FR-009, FR-010
Dependencies: WP02.

**Goal.** Bound the `await removalExecutor.remove(...)` in `confirmRemoval` with an injected-
scheduler deadline. On stall: `controller.abort()` + raise `RemovalError('stalled')`, which flows
through the **existing** non-`AbortError` catch into an all-failed `partial`. No new FSM
state/action; confirmations untouched.

**Independent test.** The T007 regression test (never-settling executor + advance scheduler past
`STALL_CEILING_MS`) drives the row out of `removing` into `partial`; boundary suite (under/at/over)
green; stall-vs-cancel pair green; coverage 100%.

**Included subtasks:**

- [ ] T007 Failing regression test: never-settling removal must leave `removing` (WP03)
- [ ] T008 `STALL_CEILING_MS` + pure `raceStallCeiling` helper (deadline-wins) (WP03)
- [ ] T009 Inject `scheduler`; wrap `executor.remove`; stall → `RemovalError('stalled')` → `partial` (WP03)
- [ ] T010 Boundary tests (under / at / over the ceiling) (WP03)
- [ ] T011 Stall-vs-cancel pair + concurrency/late-settle tests (WP03)

**Dependencies / risks.** Crux risk: a stall must NOT take the `AbortError`-swallow branch (that
would re-create the bug). The distinct `RemovalError('stalled')` and its dedicated test are the
guard. Late executor settlement after the deadline must not surface as an unhandled rejection.

**Est. prompt size:** ~340 lines.

---

## WP04 — Stalled UI message · integration · live re-verification

**Prompt:** [tasks/WP04-ui-integration-reverify.md](./tasks/WP04-ui-integration-reverify.md)
**Priority:** P1 · **Mode:** code_change
**Requirements:** FR-003, FR-006, FR-008
Dependencies: WP03.

**Goal.** Surface the stall as plain-language "timed-out" copy in `RemovalOutcomeView` (NFR-004),
prove the termination guarantee end-to-end through the real store (DIRECTIVE_036), and re-verify
the whole flow live on the 2-song repro (SC-001..SC-004).

**Independent test.** UI test renders both the generic-partial and the timed-out copy; the
integration test terminates a hung removal to `partial` with unchanged counts and never `none`;
live re-verify transcript captured.

**Included subtasks:**

- [ ] T012 `RemovalOutcomeView`: plain-language timed-out copy for the stalled outcome (WP04)
- [ ] T013 Integration test: real store + `hang` fake + fake scheduler → terminates to `partial` (WP04)
- [ ] T014 Live re-verification on the 2-song repro (SC-001..SC-004) + transcript (WP04)

**Dependencies / risks.** Depends on the `stalled`-reason convention WP03 writes into the
all-failed outcome. Live re-verify needs the live client (driver protocol).

**Est. prompt size:** ~260 lines.

---

## Coverage map (FR/NFR/C → WP)

| Requirement | WP | Notes |
|---|---|---|
| FR-001 | WP01 | live root-cause identification |
| FR-002, FR-003, FR-005 | WP03 (+ WP04 live) | deletion actually takes effect / exactly one of two |
| FR-004 | WP02, WP03 | always reaches a terminal state |
| FR-006 | WP02, WP03, WP04 | explicit failure state + plain-language surface |
| FR-007 | WP03 | no false success (stall → `partial`, never `none`) |
| FR-008 | WP04 | retry/dismiss via existing `partial → confirming` edge |
| FR-009 | WP03 | in-flight lock re-asserted across the stall path |
| FR-010 | WP03 | confirmations not bypassed/weakened |
| NFR-001 | WP03 | stall ceiling (hang guard, not SLA) |
| NFR-002 | WP03 | boundary tests under/at/over + 100% coverage |
| NFR-003 | WP01 | ADR-0017 |
| NFR-004 | WP04 | plain-language UI, no raw stack |
| C-001 | WP01/WP03 | Platform APIs only, never `api.spotify.com` |
| C-002 | WP03 | no silent mutation; confirmations intact |
| C-003 | WP03 | failing test observed before fix |
| C-004 | WP01/WP04 | live evidence before fix accepted + live re-verify |
| C-005 | all | TS strict + file-level SRP |
