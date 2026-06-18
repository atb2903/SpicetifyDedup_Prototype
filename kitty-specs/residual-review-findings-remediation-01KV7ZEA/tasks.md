# Tasks: Residual Review Findings Remediation

**Mission**: residual-review-findings-remediation-01KV7ZEA
**Planning base**: `main` · **Merge target**: `main` · **branch_matches_target**: true
**Generated**: 2026-06-18

> **Decomposition decision (recorded with the user, 2026-06-18).** Three of the
> findings — the AbortError-while-stalled sibling (FR-008), RISK-1's honest
> termination docs/test (FR-009/010), and NEW-3's `applyTerminalOutcome` JSDoc
> (FR-011) — are all edit-coupled through the hub file
> `src/store/detection-store.ts` (incl. `createStallWatchdog`/`executeRemoveSet`).
> Under spec-kitty's one-file-per-WP ownership rule, no dependency ordering lets
> them be separate WPs. The user chose to keep them in **one atomic WP (WP05)**
> rather than fragment FR-009 across WPs — consistent with the prior mission's
> atomic-store-WP precedent. WP05 therefore has 4 subtasks. The remaining findings
> split cleanly: NEW-1 (WP01), DRIFT-1 (WP02), NEW-2 (WP03), NEW-4 (WP04), NEW-5
> (WP06). All six WPs have disjoint file ownership and are mutually independent;
> per the user's standing preference they are executed **sequentially**.

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | EnumerationResult return type + genuine local tally | WP01 | [D] | [D] |
| T002 | Scanner consumes reported tally; delete inference | WP01 | | [D] |
| T003 | UI summary truthfulness + ADR-0021 | WP01 | | [D] |
| T004 | Liked-Songs count fetch auth-expiry classification | WP02 | [D] |
| T005 | Abort check between per-track fallback retries | WP03 | [D] |
| T006 | Per-track fallback progress emission | WP03 | | [D] |
| T007 | compute-failed terminal, no-retry view branch | WP04 | [D] |
| T008 | AbortError-while-stalled defensive terminal dispatch | WP05 | [D] |
| T009 | Rewrite applyTerminalOutcome JSDoc (NEW-3) | WP05 | | [D] |
| T010 | Honest termination docs (ADR-0019 + watchdog/removal JSDoc) | WP05 | | [D] |
| T011 | Non-abort-aware hang fake + faithful termination test | WP05 | | [D] |
| T012 | Remove orphaned RemovalErrorCode 'stalled' (NEW-5) | WP06 | [D] |

---

## Phase 1 — Detection

### WP01 — NEW-1: true local-only skip tally via EnumerationResult return type

- **Goal**: Stop `skippedLocalCount` folding skipped non-track items (episodes) into
  the local-file count. Enumerator returns `{ tracks, skippedLocalCount }`; scanner
  reads it directly instead of inferring `hostTotalLength − scannedTrackCount`.
- **Priority**: P1.
- **Requirements**: FR-001, FR-002, FR-003.
- **Independent test**: enumerator counts only `spotify:local:` skips (episodes
  excluded + uncounted); scanner surfaces the reported tally regardless of host total;
  AS-1/AS-2 UI scenarios; boundary tests on skip counts; full gates green.
- **Dependencies**: none.

Included subtasks:

- [x] T001 EnumerationResult return type + genuine local tally (WP01)
- [x] T002 Scanner consumes reported tally; delete inference (WP01)
- [x] T003 UI summary truthfulness + ADR-0021 (WP01)

Prompt: `tasks/WP01-enumerator-local-tally.md`.

### WP02 — DRIFT-1: Liked-Songs count fetch auth-expiry classification

- **Goal**: Apply the shared `looksLikeHostAuthExpired` predicate to the Liked-Songs
  count sub-fetch so auth-expiry there yields the same guidance as a rootlist
  auth-expiry (fully realises prior FR-007).
- **Priority**: P2.
- **Requirements**: FR-004.
- **Independent test**: count-fetch auth-expiry → auth-expired error (not generic);
  rootlist symmetry retained; non-auth failure unaffected; gates green.
- **Dependencies**: none.

Included subtasks:

- [x] T004 Liked-Songs count fetch auth-expiry classification (WP02)

Prompt: `tasks/WP02-likedsongs-auth-expiry.md`.

---

## Phase 2 — Removal resilience

### WP03 — NEW-2: per-track fallback abort check + per-track progress

- **Goal**: Make the per-track fallback loop abort-aware (stop issuing per-track
  deletions once aborted) and progress-emitting (per-track `{ removedSoFar, total }`),
  so the store's stall watchdog re-arms on genuine progress.
- **Priority**: P1.
- **Requirements**: FR-005, FR-006.
- **Independent test**: abort mid-fallback stops further per-track calls; progress fires
  per track; the RISK-1 in-flight-await limit asserted honestly (no termination mechanism
  added — C-001); BATCH_SIZE boundary tests; gates green.
- **Dependencies**: none.

Included subtasks:

- [x] T005 Abort check between per-track fallback retries (WP03)
- [x] T006 Per-track fallback progress emission (WP03)

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

- [x] T007 compute-failed terminal, no-retry view branch (WP04)

Prompt: `tasks/WP04-compute-failed-terminal.md`.

### WP05 — Removal termination resilience + honest docs/test (atomic)

- **Goal**: Land every change on the removal termination / outcome-apply path that is
  coupled through `src/store/detection-store.ts`: the AbortError-while-stalled guard
  (FR-008), the corrected `applyTerminalOutcome` JSDoc (FR-011 / NEW-3), the honest
  batch-boundary termination docs (FR-009 / RISK-1 — ADR-0019 + watchdog/`executeRemoveSet`
  JSDoc), and the faithful stall test with a non-abort-aware `hang` fake (FR-010 / RISK-1).
- **Priority**: P1.
- **Requirements**: FR-008, FR-009, FR-010, FR-011.
- **Independent test**: stalled-then-reject dispatches a terminal outcome (row → partial);
  user-cancel abort still swallowed; `applyTerminalOutcome` JSDoc accurate; ADR-0019/JSDoc
  state the batch-boundary limit with no never-settling termination guarantee; `hang` fake
  non-abort-aware and termination test asserts the row stays `removing` (route-reset escape)
  and would fail against the old fake; **no promise-race/timer mechanism added (C-001)**;
  watchdog/abort coverage 100%; full gates green.
- **Dependencies**: none.

Included subtasks:

- [x] T008 AbortError-while-stalled defensive terminal dispatch (WP05)
- [x] T009 Rewrite applyTerminalOutcome JSDoc — NEW-3 (WP05)
- [x] T010 Honest termination docs — ADR-0019 + watchdog/removal JSDoc (WP05)
- [x] T011 Non-abort-aware hang fake + faithful termination test (WP05)

Prompt: `tasks/WP05-removal-termination-resilience.md`.

---

## Phase 3 — Dead code

### WP06 — NEW-5: remove orphaned RemovalErrorCode 'stalled'

- **Goal**: Remove the orphaned `'stalled'` member from the `RemovalErrorCode` union and
  its stale JSDoc; leave the live `RemovalOutcomeProvenance.'stalled'` untouched (D-3).
- **Priority**: P3.
- **Requirements**: FR-012.
- **Independent test**: `RemovalErrorCode` has exactly four members; `grep -R
  "RemovalError('stalled'" src` empty; provenance/FSM/watchdog untouched; gates green.
- **Dependencies**: none.

Included subtasks:

- [ ] T012 Remove orphaned RemovalErrorCode 'stalled' — NEW-5 (WP06)

Prompt: `tasks/WP06-remove-orphaned-stalled-code.md`.

---

## Dependency graph

```
WP01  WP02  WP03  WP04  WP05  WP06    (all independent; disjoint file ownership)
```

All six WPs are mutually independent (disjoint owned files) and execute sequentially
per the user's standing preference. Recommended order:
**WP01 → WP02 → WP03 → WP04 → WP05 → WP06**.
