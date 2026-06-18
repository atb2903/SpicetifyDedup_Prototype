# Tasks: Residual Review Findings Remediation

**Mission**: residual-review-findings-remediation-01KV7ZEA
**Planning base**: `main` · **Merge target**: `main` · **branch_matches_target**: true
**Generated**: 2026-06-18

> **Decomposition decision.** The eight findings (RISK-1, NEW-1..5, DRIFT-1, and
> the latent AbortError-while-stalled sibling) split cleanly by file ownership
> into seven small WPs. Each FR maps to exactly one WP. The only hard sequencing
> is the removal store/error chain: **WP05 → WP06 → WP07** all edit
> `src/store/detection-store.ts` (WP07 because `createStallWatchdog` lives there),
> so they cannot be parallelised or reordered. WP01–WP05 are mutually independent.
> Per the user's standing preference, all WPs are executed **sequentially**.

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | EnumerationResult return type + genuine local tally | WP01 | [D] |
| T002 | Scanner consumes reported tally; delete inference | WP01 | | [D] |
| T003 | UI summary truthfulness + ADR-0021 | WP01 | | [D] |
| T004 | Liked-Songs count fetch auth-expiry classification | WP02 | [D] |
| T005 | Abort check between per-track fallback retries | WP03 | [D] |
| T006 | Per-track fallback progress emission | WP03 | | [D] |
| T007 | compute-failed terminal, no-retry view branch | WP04 | [D] |
| T008 | AbortError-while-stalled defensive terminal dispatch | WP05 | [D] |
| T009 | Rewrite applyTerminalOutcome JSDoc (NEW-3) | WP06 | [D] |
| T010 | Remove orphaned RemovalErrorCode 'stalled' (NEW-5) | WP06 | | [D] |
| T011 | Honest termination docs (ADR-0019 + watchdog/removal JSDoc) | WP07 | [D] |
| T012 | Non-abort-aware hang fake + faithful termination test | WP07 | | [D] |

---

## Phase 1 — Detection

### WP01 — NEW-1: true local-only skip tally via EnumerationResult return type

- **Goal**: Stop `skippedLocalCount` folding skipped non-track items (episodes)
  into the local-file count. Enumerator returns `{ tracks, skippedLocalCount }`;
  scanner reads it directly instead of inferring `hostTotalLength − scannedTrackCount`.
- **Priority**: P1.
- **Requirements**: FR-001, FR-002, FR-003.
- **Independent test**: enumerator counts only `spotify:local:` skips (episodes
  excluded + uncounted); scanner surfaces the reported tally regardless of host
  total; AS-1/AS-2 UI scenarios; boundary tests on skip counts; full `npm run
  test:coverage` 100% + `npx tsc --noEmit` + architecture test green.
- **Dependencies**: none.

Included subtasks:

- [ ] T001 EnumerationResult return type + genuine local tally (WP01)
- [ ] T002 Scanner consumes reported tally; delete inference (WP01)
- [ ] T003 UI summary truthfulness + ADR-0021 (WP01)

Prompt: `tasks/WP01-enumerator-local-tally.md`.

### WP02 — DRIFT-1: Liked-Songs count fetch auth-expiry classification

- **Goal**: Apply the shared `looksLikeHostAuthExpired` predicate to the
  Liked-Songs count sub-fetch so auth-expiry there yields the same guidance as a
  rootlist auth-expiry (fully realises prior FR-007).
- **Priority**: P2.
- **Requirements**: FR-004.
- **Independent test**: count-fetch auth-expiry → auth-expired error (not generic);
  rootlist symmetry retained; non-auth failure unaffected; gates green.
- **Dependencies**: none.

Included subtasks:

- [ ] T004 Liked-Songs count fetch auth-expiry classification (WP02)

Prompt: `tasks/WP02-likedsongs-auth-expiry.md`.

---

## Phase 2 — Removal resilience

### WP03 — NEW-2: per-track fallback abort check + per-track progress

- **Goal**: Make the per-track fallback loop abort-aware (stop issuing per-track
  deletions once aborted) and progress-emitting (per-track `{ removedSoFar, total }`),
  so the store's stall watchdog re-arms on genuine progress.
- **Priority**: P1.
- **Requirements**: FR-005, FR-006.
- **Independent test**: abort mid-fallback stops further per-track calls; progress
  fires per track; the RISK-1 in-flight-await limit asserted honestly (no
  termination mechanism added — C-001); BATCH_SIZE boundary tests; gates green.
- **Dependencies**: none.

Included subtasks:

- [ ] T005 Abort check between per-track fallback retries (WP03)
- [ ] T006 Per-track fallback progress emission (WP03)

Prompt: `tasks/WP03-fallback-abort-progress.md`.

### WP04 — NEW-4: compute-failed is a terminal, non-retryable outcome

- **Goal**: `RemovalOutcomeView` renders a terminal explanation for `compute-failed`
  and suppresses the retry affordance (which would deterministically fail again).
- **Priority**: P2.
- **Requirements**: FR-007.
- **Independent test**: compute-failed → terminal message, no retry control; other
  provenances retain retry; provenance exhaustiveness preserved; gates green.
- **Dependencies**: none.

Included subtasks:

- [ ] T007 compute-failed terminal, no-retry view branch (WP04)

Prompt: `tasks/WP04-compute-failed-terminal.md`.

### WP05 — sibling/FR-008: AbortError-while-stalled still dispatches a terminal outcome

- **Goal**: When the executor rejects with `AbortError` after the watchdog tripped
  (`stalled`), still dispatch a terminal `'stalled'` outcome instead of swallowing
  and leaving the row in `removing`.
- **Priority**: P1.
- **Requirements**: FR-008.
- **Independent test**: stalled-then-reject dispatches `removeComplete` (row →
  partial); user-cancel abort still swallowed; resolve-path stall handling
  unchanged; gates green.
- **Dependencies**: none.

Included subtasks:

- [ ] T008 AbortError-while-stalled defensive terminal dispatch (WP05)

Prompt: `tasks/WP05-abort-while-stalled-guard.md`.

---

## Phase 3 — Docs & dead code

### WP06 — NEW-3 + NEW-5: applyTerminalOutcome JSDoc accuracy + remove orphaned RemovalErrorCode 'stalled'

- **Goal**: Correct the false `applyTerminalOutcome` "removed is always empty"
  JSDoc invariant (NEW-3); remove the orphaned `RemovalErrorCode.'stalled'` member
  and its stale JSDoc (NEW-5), leaving `RemovalOutcomeProvenance.'stalled'` untouched.
- **Priority**: P3.
- **Requirements**: FR-011, FR-012.
- **Independent test**: JSDoc describes the host-success / stalled-partial apply
  paths and the by-construction no-throw rationale; `RemovalErrorCode` has exactly
  four members; `grep -R "RemovalError('stalled'" src` empty; gates green.
- **Dependencies**: WP05 (shared `src/store/detection-store.ts`).

Included subtasks:

- [ ] T009 Rewrite applyTerminalOutcome JSDoc — NEW-3 (WP06)
- [ ] T010 Remove orphaned RemovalErrorCode 'stalled' — NEW-5 (WP06)

Prompt: `tasks/WP06-doc-accuracy-deadcode.md`.

### WP07 — RISK-1: honest termination docs (ADR-0019 + JSDoc) and faithful stall test

- **Goal**: Document the batch-boundary abort limitation honestly (ADR-0019 +
  watchdog/removal JSDoc) and make the `hang` fake non-abort-aware so the stall
  test reflects real production behaviour. No termination mechanism reintroduced.
- **Priority**: P3.
- **Requirements**: FR-009, FR-010.
- **Independent test**: docs state the batch-boundary limit with no never-settling
  termination guarantee; `hang` fake no longer resolves on abort; termination test
  asserts row stays `removing` (route-reset escape) and would fail against the old
  fake; no promise-race/timer mechanism added (C-001); watchdog/abort coverage 100%.
- **Dependencies**: WP06 (shared `src/store/detection-store.ts`).

Included subtasks:

- [ ] T011 Honest termination docs — ADR-0019 + watchdog/removal JSDoc (WP07)
- [ ] T012 Non-abort-aware hang fake + faithful termination test (WP07)

Prompt: `tasks/WP07-honest-termination-docs-test.md`.

---

## Dependency graph

```
WP01  WP02  WP03  WP04   (all independent)
WP05 ── WP06 ── WP07     (chain: shared detection-store.ts)
```

WP01–WP05 are mutually independent; WP06 depends on WP05; WP07 depends on WP06.
All WPs execute sequentially per the user's standing preference. Recommended
order: **WP01 → WP02 → WP03 → WP04 → WP05 → WP06 → WP07**.
