# Feature Specification: Residual Review Findings Remediation

**Mission**: `residual-review-findings-remediation-01KV7ZEA`
**Created**: 2026-06-16
**Mission type**: software-dev
**Branch contract**: start `main` · planning base `main` · merge target `main`
**Source**: `.claude/CODEBASE_REVIEW.md` §14.2–§14.4 (post-remediation residual + independent re-review findings)

---

## 1. Overview

The `code-review-remediation-01KV5FS1` mission closed the original A–N code-review
findings. A post-merge mission review and a later independent re-review then
surfaced **eight residual/new findings** (§14.2–§14.4 of `CODEBASE_REVIEW.md`).
This mission resolves all eight, each to a confirmed target end-state, without
regressing any existing behaviour and while holding the charter gates (TDD,
100 % coverage, strict typecheck, hexagonal import-graph test).

The findings span four behavioural correctness/UX bugs, one resilience hardening,
two documentation-accuracy corrections, and one dead-code removal. One finding
(RISK-1) is resolved by **honest documentation + a faithful test** rather than a
behavioural change, by explicit decision.

### Confirmed remediation decisions (discovery)

| Finding | Severity | Decision |
|---|---|---|
| **RISK-1** — per-batch watchdog can't interrupt an in-flight host call; abort-aware `hang` fake masks it | Medium | **Document honestly.** Keep the await-based design; correct the overstated ADR-0019/JSDoc termination claims; make the `hang` fake **non**-abort-aware so the stall test reflects real production behaviour. No promise-race/timer-wins termination is reintroduced. |
| **NEW-1** — `skippedLocalCount` folds in skipped non-track items (episodes) and the UI mislabels them as "local files" | Medium | **Enumerator reports a true local-only tally.** The enumerator surfaces the genuine local-file skip count; non-track items are skipped silently with no separate count or label. |
| **NEW-2** — per-track fallback loop is unbounded, abort-blind, progress-silent | Low–Medium | **Harden the fallback loop.** Check abort between per-track retries; emit progress per track so the stall watchdog re-arms on genuine progress. |
| **DRIFT-1** — Liked-Songs sub-fetch skips auth-expiry classification | Low | **Fix.** Apply the shared auth-expiry predicate in the Liked-Songs count fetch, fully realising FR-007. |
| **NEW-3** — `applyTerminalOutcome` JSDoc asserts a false "removed is always empty" invariant | Low | **Fix the doc** to describe the real host-success / stalled-partial apply paths and the true no-throw rationale. |
| **NEW-4** — `compute-failed` partial is a retry dead-end | Low | **Fix.** A compute-failed outcome presents a terminal explanation and offers no retry that would deterministically fail again. |
| **NEW-5** — `'stalled'` `RemovalErrorCode` is orphaned dead code with stale JSDoc | Low | **Remove** the dead union member and its stale documentation. |
| **sibling** — `AbortError`-while-`stalled` would also never dispatch `removeComplete` (latent) | Low | **Add a defensive guard** so this path still reaches a terminal outcome. |

---

## 2. User Scenarios & Testing

### Primary actors

- **Library owner** — the Spotify desktop user running Dedup on their own
  playlists and Liked Songs.
- **Maintainer** — a developer reading the ADRs/JSDoc and tests to reason about
  removal resilience.

### Acceptance scenarios

1. **Episodes are not mislabelled as local files (NEW-1).**
   *Given* a playlist that contains podcast episodes but no local files,
   *when* the user scans it for duplicates,
   *then* the result reports **zero** skipped local files and shows no "local
   files" annotation, and the episodes are simply excluded from matching.

2. **Local files are still counted truthfully (NEW-1).**
   *Given* a playlist that contains genuine local files,
   *when* the user scans it,
   *then* the "Skipped N local files" annotation reflects the true local-file
   count (unaffected by any non-track items also present).

3. **Aborting during per-track fallback stops mutation promptly (NEW-2).**
   *Given* a removal whose bulk batch was rejected and is now retrying tracks
   individually,
   *when* the user navigates away (route reset) or the watchdog aborts,
   *then* the system stops issuing further per-track host deletions rather than
   running to the batch end.

4. **Genuine fallback progress keeps the watchdog from false-tripping (NEW-2).**
   *Given* a large rejected batch being retried track-by-track that is genuinely
   making progress,
   *when* each track is processed,
   *then* a progress event is emitted and the stall watchdog re-arms, so a
   progressing fallback is not aborted merely for taking long.

5. **Auth-expiry during the Liked-Songs count fetch is classified (DRIFT-1).**
   *Given* the host auth token expires between the rootlist fetch and the
   Liked-Songs count fetch,
   *when* the Liked-Songs count fetch is rejected for auth expiry,
   *then* the user sees the same auth-expired guidance as for a rootlist
   auth-expiry (not a generic failure message).

6. **A compute-failed removal is a terminal, non-looping outcome (NEW-4).**
   *Given* a removal whose remove-set cannot be computed,
   *when* the outcome is shown,
   *then* the user sees a terminal explanation and is **not** invited to retry an
   operation that would deterministically fail identically.

7. **An abort-after-stall still terminates (sibling).**
   *Given* the stall watchdog has tripped and the executor then rejects with an
   `AbortError`,
   *when* the store handles that rejection,
   *then* a terminal removal outcome is dispatched (the row does not remain in
   `removing`).

8. **Documentation and the stall test match production (RISK-1, NEW-3).**
   *Given* a maintainer reading ADR-0019, the watchdog/removal JSDoc, and
   `removal-termination.test.ts`,
   *when* they reason about a never-settling host call,
   *then* the docs accurately state the batch-boundary limitation (no termination
   guarantee), and the test exercises the real production behaviour via a
   non-abort-aware `hang` fake.

### Edge cases

- A collection containing **both** local files and episodes — local count
  correct, episodes invisible.
- Removal aborted exactly at a batch boundary vs. mid per-track fallback.
- A `compute-failed` outcome followed by a route reset (the normal escape).
- Auth-expiry occurring on the **first** (rootlist) call vs. only on the
  Liked-Songs call.
- A genuinely never-settling host call: documented as an accepted stuck state
  whose only escape is route-reset (RISK-1, not engineered around).

---

## 3. Requirements

### Functional Requirements

| ID | Requirement | Finding | Status |
|---|---|---|---|
| FR-001 | The skipped-local-file count MUST be derived from a true local-file tally produced during track enumeration, not inferred from `hostTotalLength − scannedTrackCount`. | NEW-1 | Accepted |
| FR-002 | Skipped non-track items (e.g. podcast episodes) MUST be excluded from the duplicate scan and MUST NOT be counted as local files nor surfaced under any "local files" label or separate count. | NEW-1 | Accepted |
| FR-003 | The duplicate-summary view's "skipped local files" annotation MUST reflect only genuine local files; for a collection with non-track items but zero local files, the annotation MUST be absent/zero. | NEW-1 | Accepted |
| FR-004 | When the Liked-Songs count fetch is rejected due to an expired host auth token, the system MUST surface the same auth-expired guidance it surfaces for an auth-expiry during the rootlist fetch (FR-007 fully realised). | DRIFT-1 | Accepted |
| FR-005 | During per-track fallback retries after a rejected bulk batch, the system MUST check the abort signal between retries and stop issuing further per-track host deletions once aborted. | NEW-2 | Accepted |
| FR-006 | During per-track fallback retries, the system MUST emit a removal-progress event per track processed, so the store's stall watchdog re-arms on genuine progress. | NEW-2 | Accepted |
| FR-007 | A `compute-failed` removal outcome MUST present a terminal explanation and MUST NOT offer a retry affordance that would deterministically fail identically. | NEW-4 | Accepted |
| FR-008 | If the executor rejects with an `AbortError` after the stall watchdog has marked the operation `stalled`, the system MUST still dispatch a terminal removal outcome rather than swallowing the error and leaving the row in `removing`. | sibling | Accepted |
| FR-009 | ADR-0019 and the watchdog/removal JSDoc MUST accurately describe that the abort takes effect only at batch boundaries and cannot interrupt an in-flight host call, and MUST NOT claim a never-settling host call is guaranteed to terminate. | RISK-1 | Accepted |
| FR-010 | The `hang` removal test double MUST NOT resolve on abort, and `removal-termination.test.ts` MUST assert the resulting real production behaviour (a never-settling host call leaves the row in `removing`; route-reset is the documented escape). | RISK-1 | Accepted |
| FR-011 | The `applyTerminalOutcome` documentation MUST accurately state that it is the apply path for host-success and stalled-partial outcomes (possibly non-empty `removed`) and give the true reason it cannot throw `outcome-mismatch` (every removed key is a real member by construction). | NEW-3 | Accepted |
| FR-012 | The `'stalled'` member MUST be removed from the `RemovalErrorCode` union and its stale JSDoc deleted, with no behavioural producer of `RemovalError('stalled')` remaining. | NEW-5 | Accepted |

### Non-Functional Requirements

| ID | Requirement | Threshold / measure | Status |
|---|---|---|---|
| NFR-001 | Test coverage MUST remain at the charter-mandated ceiling after all changes. | `npm run test:coverage` = **100 %** statements / branches / functions / lines | Accepted |
| NFR-002 | The codebase MUST typecheck cleanly under strict mode. | `npx tsc --noEmit` exits 0 with no diagnostics | Accepted |
| NFR-003 | The hexagonal import-graph contract MUST hold; the enumerator's local-tally surfaces through the existing port/progress contract, introducing no forbidden edge. | `test/architecture.test.ts` all assertions pass | Accepted |
| NFR-004 | No existing behaviour may regress; all prior FR/NFR guarantees remain green. | Full `npx vitest run` suite passes (≥ the current 1195 tests; net-new tests expected) | Accepted |
| NFR-005 | Every numeric bound touched by these changes (e.g. batch size, fallback progress cadence) MUST retain boundary coverage. | Boundary tests at min−1 / min / nominal / max / max+1 for each touched bound | Accepted |

### Constraints

| ID | Constraint | Status |
|---|---|---|
| C-001 | RISK-1 MUST be resolved by documentation + faithful test only; no promise-race / timer-wins termination mechanism may be reintroduced. | Accepted |
| C-002 | All existing charter risk-boundary guarantees MUST be preserved: no silent library mutation, per-action confirmation, second confirmation for bulk deletes (> 25), single-collection scope, no auto-run on launch. | Accepted |
| C-003 | TDD is mandatory: a failing test is written and observed to fail before each behavioural change (FR-001–FR-008). | Accepted |
| C-004 | Changes MUST stay within the scope of the eight findings; no opportunistic refactors of unrelated modules. | Accepted |

---

## 4. Success Criteria

- **SC-001** — A collection containing podcast episodes but no local files reports
  **zero** skipped local files (previously inflated and mislabelled).
- **SC-002** — When a user aborts a removal during per-track fallback, host
  deletions stop promptly rather than continuing to the batch boundary.
- **SC-003** — An auth-expiry during the Liked-Songs count fetch yields the same
  actionable guidance as a rootlist auth-expiry.
- **SC-004** — A compute-failed removal presents a terminal message with no retry
  path that would fail identically.
- **SC-005** — All project quality gates remain green after every fix: 100 %
  coverage, clean strict typecheck, architecture test passing, full suite passing.
- **SC-006** — ADR-0019 and the corrected JSDoc accurately describe implemented
  behaviour, and the stall-path test exercises real production behaviour.

---

## 5. Key Entities

- **Local-file skip tally** — a true count of local-file items skipped during
  enumeration, surfaced through the enumeration progress/return contract and
  consumed by the scanner to derive `skippedLocalCount`. Replaces the inferred
  `hostTotalLength − scannedTrackCount` derivation.
- **Per-track fallback progress event** — a `RemovalProgressEvent` emitted once
  per track during single-track retry, feeding the store's stall watchdog re-arm.
- **`RemovalOutcomeProvenance`** (existing) — the `compute-failed` value now
  drives a terminal, non-retryable UI branch (FR-007).
- **`RemovalErrorCode`** (existing union) — loses its orphaned `'stalled'` member
  (FR-012).

---

## 6. Assumptions

- ADRs live under the gitignored `.claude/adr/` tree; correcting ADR-0019 (and
  authoring any new ADR for the NEW-1 contract change) is an in-repo mission
  deliverable even though those files are not committed source.
- The inline-enricher pipeline is the only live detection path; the public Web
  API remains unreachable from the client (no enrichment network path to touch).
- The `compute-failed` case remains "impossible by construction"; FR-007 is a UX
  safety net, not a fix for a reachable defect.
- NEW-1's chosen approach intentionally makes skipped non-track items **invisible**
  (no "skipped N episodes" annotation) — accepted as the simpler, honest-count
  path.
- RISK-1's never-settling-host-call stuck state is accepted (low realistic
  probability per the 2026-06-13 live verification); route-reset remains the
  escape and is documented as such.

---

## 7. Scope

**In scope:** the eight findings above and their paired tests/docs — the tracks
enumerator + detection scanner + detection summary view (NEW-1), the playlists
loader Liked-Songs fetch (DRIFT-1), the removal executor fallback (NEW-2), the
detection-store removal path + outcome view (NEW-4, FR-008), the removal types /
error union (NEW-5), and ADR-0019 + JSDoc + the stall test fake (RISK-1, NEW-3).

**Out of scope:** reintroducing a termination guarantee for never-settling host
calls (C-001); any change to the dedup algorithm, eligibility, load FSM, or
theming; new user-facing features; and any refactor not required by the eight
findings (C-004).
