# Implementation Plan: Fix Indefinite Hang on Duplicate Removal

**Branch**: `main` (planning/base) → merge target `main` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `kitty-specs/fix-duplicate-removal-hang-01KV0K9E/spec.md`
**Mission**: `fix-duplicate-removal-hang-01KV0K9E`

## Summary

After duplicates are identified, clicking **Remove** enters the `removing…` state and never
leaves it; the duplicate is never deleted. The fault reproduces on a minimal 2-song playlist,
ruling out volume/batching/pagination.

> **Root cause CONFIRMED by live verification (WP01 / C-004, 2026-06-13) — the original
> never-settling-promise hypothesis below was FALSIFIED.** See
> [diagnosis-evidence.md](./diagnosis-evidence.md) and ADR-0017. `PlaylistAPI.remove` is **never
> called**. Two real defects, neither a hung promise:
>
> - **Defect B (functional — why nothing is ever removed):** the inline catalog enricher
>   (`src/adapters/inline-catalog-enricher.ts:97-104`) rebuilds each `EnrichedTrack` and **drops
>   `uid`**, regressing the ADR-0012 capture contract. Every playlist member therefore reaches
>   `computeRemoveSet` with `uid === undefined`, which fails loud (`playlist-member-missing-uid`).
> - **Defect A (resilience — why the UI hangs):** `confirmRemoval` calls `computeRemoveSet` in the
>   `try` (`detection-store.ts:350`) **and again** in the `catch` (line 378). The first throw is
>   caught; the catch's recompute re-throws the same error, now uncaught, so no terminal dispatch
>   runs and the row stays `removing` forever. **Any** `computeRemoveSet` failure is unrecoverable.

Remediation (revised post-diagnosis):

1. **Diagnose with live evidence** (FR-001 / C-004), documented in ADR-0017 (NFR-003). **Done —
   WP01.**
2. **Restore the `uid` contract in enrichment** (Defect B → FR-002/FR-003): one-line propagation
   in `inline-catalog-enricher.ts` + a guard test so it cannot silently regress again. **WP05.**
3. **Harden the store catch path** (Defect A → FR-004/FR-006): compute the remove-set once, route
   any `computeRemoveSet`/executor failure to a **terminal** all-failed `partial` instead of
   re-throwing. **WP03.**
4. **Add a stall ceiling** as defense-in-depth (NFR-001) so a *future* hung call can never spin
   forever — secondary to the root-cause fix, not the cause of this repro. **WP02 (scaffolding) +
   WP03 (wiring).**

### Technical Approach (revised after WP01 diagnosis)

- **Defect B — `uid` propagation (WP05).** `inline-catalog-enricher.ts` must copy `t.uid` onto the
  `EnrichedTrack` it constructs (honoring ADR-0012 and the `EnrichedTrack.uid` doc contract).
  `undefined` for Liked-Songs items (no `uid`), a non-empty string for playlist items. A regression
  test asserts `uid` survives enrichment so the doc-comment-only contract becomes test-enforced.
  Stays a pure adapter change; no port/store/domain change.
- **Defect A — store catch hardening (WP03).** Compute `computeRemoveSet` **once**, before/outside
  the fragile catch (or guard the catch so it never re-invokes a throwing transform), and surface a
  compute failure as a **terminal** all-failed `partial` via the existing non-`AbortError` catch —
  never re-throwing, never leaving the row in `removing`. The crux: the catch must not call
  `computeRemoveSet` a second time.
- **Stall ceiling — where the bound lives (WP03, defense-in-depth):** in the store's
  `confirmRemoval` — the orchestration layer that already owns the `AbortController` lifecycle and
  decides terminal state. Consistent with **ADR-0007** (AbortSignal is the single cancellation
  primitive); the executor stays a pure mutation seam — **no timeout logic in the adapter.**
- **How the ceiling fires:** race `removalExecutor.remove(...)` against an injected scheduler's
  deadline (default ceiling a named, tunable constant). On elapse: (a) `controller.abort()` to stop
  any further batches, and (b) raise a `RemovalError('stalled', …)`.
- **Why no new FSM state:** the existing `removeComplete` action already routes
  `removing → partial` whenever `outcome.failed.length > 0` (`detection-state.ts:271-283`), and
  the existing catch builds an **all-failed `partial`** outcome (`detection-store.ts:378-395`).
  Both a `RemovalError('stalled')` and a `RemovalError('malformed-result')` are `RemovalError`s (not
  `AbortError`), so they flow through that *exact existing catch path* → all-failed `partial`, with
  stall-specific plain-language messaging (NFR-004). **No new FSM state, no new action.**
- **Stall ≠ cancel:** the `AbortError`-swallow branch (`detection-store.ts:363`) is reserved for
  user-initiated cancel/reset (the row already moved on). Neither the stall path nor the
  compute-failure path may enter it — hence distinct `RemovalError`s, not bare aborts. This
  distinction is covered by dedicated tests.
- **Stall UI surface:** the existing all-failed `partial` view — copies stay visible, Remove
  re-enabled for retry (FR-008) — with timed-out-specific copy. No new view component.

## Technical Context

**Language/Version**: TypeScript (strict), targeting the Spicetify Custom App runtime (Spotify
desktop ≈ Chromium). React 18 function components + Zustand vanilla store.
**Primary Dependencies**: `zustand/vanilla`, React, Spicetify `Platform.PlaylistAPI` /
`LibraryAPI`. No new runtime dependency introduced by this fix.
**Storage**: N/A (mutates the live Spotify library via in-client Platform APIs).
**Testing**: Vitest + happy-dom + @testing-library/react; 100% line/branch coverage enforced at
the runner; TDD mandatory; boundary tests for every numeric bound.
**Target Platform**: Spotify desktop client with Spicetify loaded (live verification:
Spotify 1.2.90.451 / Spicetify 2.43.2 per prior live-verify sessions).
**Project Type**: Single project (hexagonal: `domain` / `ports` / `adapters` / `store` / `ui`).
**Performance Goals**: None added. The stall ceiling is a **hang guard, not a backend SLA** — it
bounds a *dead* call, not a slow one (squares with the "avoid hard time cutoffs in NFRs"
principle and NFR-001's own framing).
**Constraints**: Platform APIs only — never `api.spotify.com` (C-001); confirmations preserved
(C-002 / FR-010); TS strict + file-level SRP (C-005).
**Scale/Scope**: Bug fix + a single resilience seam. Primary repro = 2-song playlist. Liked
Songs out of primary scope unless diagnosis proves a shared root cause.

## Charter Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Gate / Directive | Status | How this plan satisfies it |
|---|---|---|
| **DIRECTIVE_001** architectural integrity | PASS | Fix stays inside the existing hexagonal layers; no new layer/pattern. The bound lives in the store per ADR-0007's placement of the cancellation primitive. |
| **DIRECTIVE_003** decision documentation | PASS (planned) | New **ADR-0017** records the root-cause diagnosis *and* the stall-ceiling guard (one decision thread). |
| **DIRECTIVE_010** specification fidelity | PASS | Every WP traces to FR/NFR/C IDs; WP05 added post-diagnosis to cover Defect B (FR-002/FR-003) once live evidence relocated the functional fix outside the original WP scope. No scope beyond the spec. |
| **DIRECTIVE_030** test + typecheck quality gate | PASS (planned) | 100% line/branch coverage incl. the enricher `uid` guard (WP05), the catch-hardening + ceiling boundary (under/at/over) and the stall-vs-cancel branch; TS strict. |
| **DIRECTIVE_034** test-first development | PASS (planned) | Failing tests observed before fixes: WP05 — a playlist track loses `uid` through enrichment; WP03 — a `computeRemoveSet` failure leaves the row `removing` (the real hang) and a never-settling executor leaves it `removing` (the ceiling) (C-003). |
| **DIRECTIVE_036** black-box integration testing | PASS (planned) | Integration test drives the **real** store + **real** enricher: a duplicate with a host `uid` is actually removed (proves Defect B fixed), and a scripted never-settling executor terminates to `partial` (proves the ceiling). |
| **Risk: no silent mutation** | PASS | No deletion path changes; per-action + bulk(>25) confirmations untouched (FR-010 / C-002). |
| **Risk: no false success** (FR-007) | PASS | A stall yields all-failed `partial` (failure), never a success state. |

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```
kitty-specs/fix-duplicate-removal-hang-01KV0K9E/
├── plan.md              # This file
├── research.md          # Phase 0 — diagnosis playbook + design decisions
├── data-model.md        # Phase 1 — type/state deltas
├── quickstart.md        # Phase 1 — how to verify (tests + live)
├── contracts/
│   └── removal-termination.md   # The termination guarantee under test
└── tasks.md             # Phase 2 — created by /spec-kitty.tasks (NOT here)
```

### Source Code (repository root)

Touched / added files (final layout confirmed at `tasks` time):

```
src/
├── domain/
│   ├── removal-errors.ts        # MODIFY (WP02) — add 'stalled' to RemovalErrorCode
│   └── detection-state.ts       # UNCHANGED — reuses removeComplete → partial
├── ports/
│   ├── removal-executor.ts      # UNCHANGED — executor stays a pure seam
│   └── scheduler.ts             # NEW (WP02) — Scheduler seam + defaultScheduler
├── adapters/
│   ├── inline-catalog-enricher.ts     # MODIFY (WP05) — propagate `uid` onto
│   │                                  # EnrichedTrack (Defect B — ADR-0012 regression)
│   ├── spicetify-removal-executor.ts  # UNCHANGED — was never reached in the repro
│   └── fake-removal-executor.ts # MODIFY (WP02) — add a 'hang' (never-settles) script
├── store/
│   └── detection-store.ts       # MODIFY (WP03) — compute remove-set once / harden
│                                #          catch (Defect A) + stall ceiling; inject scheduler
└── ui/
    └── RemovalOutcomeView.tsx   # MODIFY (WP04) — timed-out copy (NFR-004)

test/
├── store/detection-store.test.ts        # catch-hardening + stall boundary + stall-vs-cancel
├── domain/removal-errors.test.ts        # 'stalled' code + classifier
├── ports/scheduler.test.ts              # defaultScheduler default
├── adapters/inline-catalog-enricher.test.ts  # uid survives enrichment (Defect B guard)
├── adapters/fake-removal-executor.test.ts
├── ui/RemovalOutcomeView.test.tsx
└── integration/removal-termination.test.ts   # real removal succeeds + stall terminates

.claude/adr/
└── 0017-removal-hang-root-cause-and-stall-ceiling.md   # NEW (NFR-003) — local, gitignored
```

**Structure Decision**: No structural change. The fixes are localized modifications within the
existing hexagonal layout — Defect B in the `adapters` layer (enricher), Defect A + the ceiling in
the `store` layer, kept in **separate WPs** to preserve file-level SRP (C-005). The scheduler seam
follows the existing injected-`clock` convention in `createDetectionScanner`.

## Phase 0 — Outline & Research

See [research.md](./research.md). Resolves:
- **Diagnosis methodology** — how the live session captures the failing/never-settling call
  (console + network during the hang), and the decision tree for "hangs" vs "rejects" vs
  "wrong call shape" (FR-001 / C-004).
- **Stall-ceiling mechanism** — injected scheduler + `Promise.race`; stall → `RemovalError('stalled')`.
- **Stall-vs-cancel distinction** — why a distinct error code, not a bare `AbortError`.
- **Ceiling value** — default constant + rationale; tunable.
- **Test strategy for time** — deterministic scheduler vs fake timers (boundary: under/at/over).

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md): the `'stalled'` `RemovalErrorCode` addition; confirmation
  that no new FSM state/action is required; the scheduler seam type.
- [contracts/removal-termination.md](./contracts/removal-termination.md): the invariant under
  test — *every* `confirmRemoval` that reaches execution settles into a terminal state
  (`none`/`partial`), bounded by the stall ceiling; never remains `removing`.
- [quickstart.md](./quickstart.md): run the regression test, then the live-verification recipe.

## Complexity Tracking

*No charter violations — section intentionally empty.*

---

## Branch contract (final)

- Current branch at plan start: **`main`**
- Planning / base branch: **`main`**
- Merge target for completed changes: **`main`**
- `branch_matches_target`: **true** — no worktree created by this command.

## STOP

Planning complete (Phase 0 + Phase 1 artifacts generated). Work-package generation happens only
when the user runs `/spec-kitty.tasks`.
