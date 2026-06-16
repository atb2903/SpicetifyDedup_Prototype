---
work_package_id: WP01
title: 'Core remediation: error taxonomy, removal provenance, per-batch stall, store decomposition'
dependencies: []
requirement_refs:
- FR-002
- FR-003
- FR-004
- FR-005
- FR-009
- NFR-003
- NFR-004
- NFR-007
- NFR-008
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-code-review-remediation-01KV5FS1
base_commit: d1857a175adcf5daa3407c116a941bb51fa1e2df
created_at: '2026-06-15T13:44:35.987492+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
- T007
- T008
- T009
- T010
- T022
phase: Phase 1 - Foundational
assignee: ''
agent: "claude:opus:reviewer:reviewer"
shell_pid: "253180"
history:
- timestamp: '2026-06-15T11:46:50Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/store/
execution_mode: code_change
owned_files:
- src/domain/detection-errors.ts
- src/domain/removal-types.ts
- src/domain/detection-state.ts
- src/ports/removal-executor.ts
- src/ports/catalog-enricher.ts
- src/adapters/spicetify-removal-executor.ts
- src/adapters/fake-removal-executor.ts
- src/adapters/fake-catalog-enricher.ts
- src/store/detection-store.ts
- test/domain/detection-errors.test.ts
- test/domain/detection-state.test.ts
- test/domain/apply-removal-outcome.test.ts
- test/adapters/fake-removal-executor.test.ts
- test/adapters/spicetify-removal-executor.test.ts
- test/adapters/fake-catalog-enricher.test.ts
- test/adapters/detection-scanner.test.ts
- test/store/detection-store.test.ts
- test/integration/removal-termination.test.ts
- test/integration/detection-end-to-end.test.ts
- test/ui/PlaylistRow.test.tsx
tags: []
---

# Work Package Prompt: WP01 — Core remediation (atomic)

## Objective

Land every change that is **compile-coupled** through `detection-store.ts`,
`detection-errors.ts`, and `removal-types.ts` in a single green step. These
cannot be split smaller without an intermediate non-green merge (see the
decomposition decision in `tasks.md`). Findings covered: **B, C, E (reason
producers + status suffix source), F, G, J, K, N**.

Charter gates are absolute on `main`: TDD (failing test first, watch it fail),
100% line + branch coverage at the runner, strict TypeScript, boundary tests for
every numeric bound touched, hexagonal layering, ADR per load-bearing decision.

## Context

- Read first: `spec.md`, `plan.md`, `research.md` (R-1, R-2, R-3, R-6, R-8, R-9),
  `data-model.md` (§1–§5, §10), `contracts/*.md`, `quickstart.md`.
- The production enricher is the inline, pure-local transform (ADR-0011). The
  Web-API enricher and its reasons are abandoned — pruning them is safe.
- `Spicetify.CosmosAsync` resolves HTTP errors as `{ code, error, message, stack }`
  (status under **`code`**, no headers) — ADR-0010. This matters for the message
  taxonomy (no `status` is read for messaging after this WP).

## Branch strategy

Planning/base branch: `main`. Final merge target: `main`. Implement in this WP's
execution worktree (allocated per lane from `lanes.json` by `finalize-tasks`);
do not work directly on `main`.

Start command (no dependencies):

```bash
spec-kitty agent action implement WP01 --agent <name>
```

## Build order within this WP

Types first so the file compiles, then the producers that must change atomically
with them, then structure/docs:
T001 → T003 (domain types) → T002, T004 (enricher + executor producers) →
T005, T006, T007 (store) → T008 (decompose) → T009, T010 (docs/ADRs).

### Cross-scope compile-keeping edits (T001/T003 fallout)

`tsconfig.json` type-checks the whole `test/` tree, so two test files that import
the *real* domain types break the moment T001 (union narrow) and T003 (required
`provenance`) land. Make the **minimal** edits to keep the suite green — do **not**
do WP03's substantive work here:

- `test/ui/PlaylistRow.test.tsx` — **adopted into this WP's `owned_files`** (it was
  orphaned — owned by no WP). The two `new DetectionError('network-failure', 'Test')`
  constructions must use a reason still in the narrowed union (use
  `'enumerator-failed'`). Nothing else.
- `test/ui/RemovalOutcomeView.test.tsx` — **remains WP03-owned** (its substantive
  provenance-branching rewrite is WP03/T018) but lives in this same shared lane
  (`lane-a`), so a minimal compile-keeping touch here is sanctioned and expected.
  Add the now-required `provenance` to each `RemovalOutcome` fixture so it
  type-checks — `'host'` for the generic-partial fixtures (`outcomeWith`),
  `'stalled'` for the `stalledOutcome`/timeout fixtures, and the matching value on
  the inline `mixed` literals. Leave the `reason: 'stalled: …'` strings and the
  view's branching logic to WP03 (T018). Reviewers: this cross-WP in-lane edit is
  intentional, not scope creep.

---

### T001 — Reshape `DetectionErrorReason` taxonomy

**Purpose**: Make the reachable reason set match the inline-enricher reality
(FR-004, FR-005; findings C/E). See `data-model.md` §1 and `contracts/detection-error-taxonomy.md`.

**Steps**:
1. In `src/domain/detection-errors.ts`, change the union to exactly:
   `'auth-token-expired' | 'enumerator-failed' | 'host-unavailable' | 'internal-error' | 'aborted'`.
   Remove `rate-limit-unparseable`, `network-failure`, `malformed-enrichment-payload`,
   `catalog-rejected`. Add `host-unavailable` (NFR-002 reason for the scan path)
   and `internal-error` (FR-004).
2. Update the JSDoc per-member docs to describe only the reachable producers
   (auth: enumerator `fetchPage`; enumerator-failed: precheck/page/item/host-reject;
   host-unavailable: enumerator `requirePlatform`; internal-error: store wrap of a
   non-`DetectionError` scan throw; aborted: type-only defensive UI fallback).
3. TDD: update `test/domain/detection-errors.test.ts` first — assert the new
   member set, that constructing each reachable reason works, and remove cases
   for the deleted reasons. Watch it fail, then edit the union.

**Validation**: `test/domain/detection-errors.test.ts` green; the union has
exactly five members; no `context.status` field is required by the type.

---

### T002 — Purge dead-reason producers in the enricher layer (+ C-006 JSDoc)

**Purpose**: After T001 the dead reasons have no producer — make that true in code
(FR-005, C-006). The only non-store producers are the fake enricher and JSDoc.

**Steps**:
1. `src/adapters/fake-catalog-enricher.ts`: remove the `'rate-limit-unparseable'`
   and `'shape-drift'`→`malformed-enrichment-payload` force-modes (and their
   `DetectionError(...)` constructions). Keep `'auth-expired'` and any abort/hang
   modes still used by live-path tests; repurpose or delete the rest so no
   construction of a removed reason remains. Update `FakeEnricherForceMode`.
2. `src/ports/catalog-enricher.ts`: fix the JSDoc (C-006) — remove the
   `@throws` lines for the removed reasons and the reference to a
   `SpicetifyCatalogEnricher` adapter that does not exist (ADR-0011). Keep the
   port type itself.
3. TDD: update the coupled tests so they compile and pass without the dead reasons:
   `test/adapters/fake-catalog-enricher.test.ts`,
   `test/adapters/detection-scanner.test.ts` (drop/repurpose the
   `re-throws rate-limit-unparseable` case), and
   `test/integration/detection-end-to-end.test.ts` (the `network-failure` /
   `catalog-rejected` E2E cases — re-point to a live reason, e.g. `internal-error`
   for the non-`DetectionError` wrap; see T005).

**Validation**: `grep -R "rate-limit-unparseable\|network-failure\|malformed-enrichment-payload" src`
returns no non-test matches; the three named test files green.

---

### T003 — Add typed `RemovalOutcome.provenance` + truthful outcome shapes

**Purpose**: Replace the `stalled:` / `executor-failed:` string-prefix protocol
with a typed discriminator (NFR-004), and pin the truthful shapes for partial /
compute-failed / executor-failed (FR-003, FR-009). See `data-model.md` §3 and
`contracts/removal-outcome-provenance.md`.

**Steps**:
1. In `src/domain/removal-types.ts` add:
   `type RemovalOutcomeProvenance = 'host' | 'stalled' | 'executor-failed' | 'compute-failed';`
   and a **required** `provenance: RemovalOutcomeProvenance` field on `RemovalOutcome`.
   Document the invariants per provenance (host: total accounting holds — full or
   boundary partial; stalled: `removed` = host-confirmed, never forced `[]`;
   compute-failed: `removed: []`, `failed: []`, **no fabricated TrackRef**;
   executor-failed: `failed` = real RemoveSet refs).
2. The required field breaks **every** `RemovalOutcome` construction/fixture.
   Update all fixtures owned by this WP in lockstep:
   `test/domain/detection-state.test.ts` (`OUTCOME_ALL_OK`, `OUTCOME_PARTIAL` →
   add `provenance: 'host'`), `test/domain/apply-removal-outcome.test.ts`.
3. Confirm `applyRemovalOutcome` (read-only consumer in `src/domain/`) tolerates a
   `compute-failed` zero-track outcome without throwing (research R-3 checklist).
   If it needs a guard, note it — but `apply-removal-outcome.ts` is **not** owned
   by this WP; if a source change there is required, stop and flag it for a scope
   adjustment rather than editing an unowned file.

**Validation**: domain tests green; `provenance` is required (omitting it is a
`tsc` error); no `RemovalOutcome` literal lacks it.

---

### T004 — `RemovalExecutor` boundary-abort returns accumulated partial

**Purpose**: When `signal` aborts at a batch boundary, **resolve** with the
accumulated `{ removed, failed, provenance: 'host' }` instead of throwing
`AbortError` (FR-003). See `data-model.md` §4 and `contracts/removal-executor-port.md`.

**Steps**:
1. `src/ports/removal-executor.ts`: amend the contract JSDoc — boundary-abort now
   resolves with the host-truthful partial; rejection is reserved for
   `RemovalError('host-unavailable')` (pre-mutation) and genuine whole-operation
   faults. Preserve the documented invariants: total accounting per resolved
   outcome, disjointness, single-collection scope, `onProgress` once per batch with
   cumulative `removedSoFar`, host-unavailable before any mutation.
2. `src/adapters/spicetify-removal-executor.ts`: on the batch-boundary abort check,
   return the accumulated outcome with `provenance: 'host'` rather than throwing.
   Real TrackRefs only.
3. `src/adapters/fake-removal-executor.ts`: adopt the same boundary-abort semantics;
   repurpose the scripted hang/abort modes to exercise the watchdog + partial-return
   (spec Assumptions). Set `provenance: 'host'` on synthesised outcomes.
4. TDD: `test/adapters/spicetify-removal-executor.test.ts` and
   `test/adapters/fake-removal-executor.test.ts` — assert abort-at-boundary resolves
   with the partial, total-accounting still holds after per-track fallback, and
   host-unavailable still rejects before mutation.

**Validation**: adapter + fake tests green; no `RemovalExecutor.remove` path throws
`AbortError` on a boundary abort.

---

### T005 — Store scan-catch → honest `internal-error`

**Purpose**: An unexpected non-`DetectionError` scan throw is an internal fault,
not a catalog rejection (FR-004; findings C/E). See `data-model.md` §2.

**Steps**:
1. `src/store/detection-store.ts` (~:332–:338): replace the
   `new DetectionError('catalog-rejected', 'scanner.scan threw a non-DetectionError', …)`
   wrap with `new DetectionError('internal-error', '<honest internal-error message>', { cause })`.
   Remove any `context: { status }` plumbing for messaging (FR-008 — no field is
   wired to a value its producer never sets).
2. Update the store module JSDoc that says "wrap … as `catalog-rejected`".
3. TDD: `test/store/detection-store.test.ts` — the `plain Error wrapped as …` case
   now expects `internal-error`; `test/integration/detection-end-to-end.test.ts`
   E2E-06 likewise.

**Validation**: `grep -R "catalog-rejected" src` returns no matches; the two tests
green.

---

### T006 — Store per-batch stall watchdog + `raceStallCeiling` JSDoc

**Purpose**: A genuinely-progressing large removal must not be aborted for elapsed
wall-clock; only a no-progress batch trips the window (FR-002, B). Correct the
`raceStallCeiling` JSDoc to the real behaviour (NFR-007, G). See `data-model.md` §5
and research R-1/R-6.

**Steps**:
1. Replace the single whole-call `raceStallCeiling(work, STALL_CEILING_MS, …)`
   around `removalExecutor.remove(...)` with a watchdog the store **re-arms on every
   `onProgress`** event (each completed batch = progress). Keep
   `STALL_CEILING_MS = 30_000`, **re-scoped** to "max time since last batch
   progress". On trip: `controller.abort()` and mark the termination as a stall
   (feeds T007's provenance stamping).
2. Correct the `raceStallCeiling` JSDoc: describe the real single-shot `settled`
   race order; **drop** the unbacked "deadline wins the tie at `= ms`" guarantee.
   The new watchdog's `= ms` semantics are pinned by the boundary tests below.
3. TDD — boundary tests (C-001): no-progress duration **29 999 ms** (continues),
   **30 000 ms** (trips), **30 001 ms** (trips); **plus** a multi-batch removal
   whose *total* > 30 000 ms but every inter-progress gap < 30 000 ms **completes
   successfully** (the FR-002 regression case). Use fake timers + the fake
   executor's scripted progress.

**Validation**: the four timing tests green; a long-but-progressing removal is
never aborted for elapsed time.

---

### T007 — Store truthful partial / compute-failed outcomes + provenance stamping

**Purpose**: Faithful outcomes (FR-003, FR-009) carried by typed provenance
(NFR-004; findings F/K). See `data-model.md` §3 and research R-3.

**Steps**:
1. On a stall (T006 trip): apply the executor's accumulated partial (now returned,
   T004) — **never** force `removed: []` — and stamp `provenance: 'stalled'`. The
   UI "timed out, removed nothing" copy is only valid when `removed.length === 0`;
   otherwise the partial count is truthful (UI side in WP03).
2. On a whole-operation executor fault: stamp `provenance: 'executor-failed'`;
   `failed` = the real RemoveSet refs (never synthesised from a collection URI).
3. On a `computeRemoveSet` failure (FR-009): stamp `provenance: 'compute-failed'`
   with `removed: []`, `failed: []` — remove the
   `failedRefs = removeSet?.tracks ?? [{ uri: result.collectionKey }]` fabrication.
   No phantom "1 track".
4. Remove the `stalled:` / `executor-failed:` `reason`-prefix writing; `reason`
   strings become human diagnostics only — no layer derives control flow from them.
5. TDD: `test/store/detection-store.test.ts` and
   `test/integration/removal-termination.test.ts` — assert each provenance stamping
   and the truthful counts; the compute-failed outcome names no track and counts 0.

**Validation**: `grep -R "stalled:\|executor-failed:" src` returns no
control-flow matches; store + integration tests green.

---

### T008 — Decompose `confirmRemoval` into named helpers

**Purpose**: Reduce the ~140-line method's cognitive load and make its invariants
structural (NFR-003, J). See research R-8.

**Steps**:
1. Extract named, individually-testable helpers (e.g. the two-step confirmation
   branch, the execute-and-apply path, the failure→outcome synthesis from T007).
2. **Enforce compute-once structurally**: compute the RemoveSet once and pass it as
   a parameter so the catch *cannot* re-invoke `computeRemoveSet` (turns the
   ADR-0017 prose invariant into a signature-level one).
3. Preserve every existing invariant: the closure-level concurrency lock, the
   own-entry `finally` guard, the no-executor fail-loud. Behaviour unchanged.
4. TDD: extend `test/store/detection-store.test.ts` to cover each helper directly;
   keep 100% line/branch coverage.

**Validation**: store tests green at 100% coverage; the catch path has no call to
`computeRemoveSet`.

---

### T009 — Document `reset()` placement

**Purpose**: Record that `reset()` sits outside the FSM transition tables on purpose
(NFR-008, N). **No structural change** to `reset()`.

**Steps**:
1. Add a store-level comment at `reset()` explaining it is a lifecycle override
   (aborts controllers, clears rows directly) with no per-row FSM edge — cross-ref
   ADR-0005 and the new ADR/update from T010.

**Validation**: comment present; `reset()` body byte-for-byte unchanged except the
comment.

---

### T010 — ADRs for B, C/D/I, K, N

**Purpose**: One ADR per load-bearing decision (C-005). ADRs live at
`.claude/adr/<NNNN>-<slug>.md` (gitignored — write them, they are not committed but
are required by the charter).

**Steps**: Author (next sequential ADR numbers):
1. **Per-batch stall model + faithful partial reporting** (B / R-1).
2. **Detection error-taxonomy reshape** — +`internal-error`, +`host-unavailable`,
   −dead reasons, and the corrected auth field under `code` (C/D/I / R-2, R-4, R-5).
3. **Typed removal-outcome provenance** (K / R-3) — record the flat-field-vs-wrapper
   alternative.
4. **`reset()` placement** note (N / R-9) — may be an update to ADR-0005.

Each ADR: Context / Decision / Consequences / Alternatives, cross-referencing the
finding and the research section.

**Validation**: four ADR files (or three + one ADR-0005 update) exist and are
referenced from the code comments they govern.

---

### T022 — Route `removeComplete` on `provenance` (FR-003/FR-009 end-to-end)

**Purpose**: The truthful provenance-carrying outcomes from T007 must reach the
`partial` view, or WP03's compute-failed/stalled copy is dead code. `removeComplete`
in `src/domain/detection-state.ts` (now owned by this WP) today routes purely on
`failed.length === 0 → none`, which misroutes compute-failed (`removed:[], failed:[]`)
and a successful stalled-partial (`removed:[N], failed:[]`) to `none` — violating
FR-009's user-facing copy and FR-003's "faithfully represent how many were removed".
**Added after cycle-1 review** (see Review Feedback). Implement only this on top of the
T001–T010 commit; do not redo earlier subtasks.

**Steps**:
1. In the `removeComplete` handler (~:271–:281), branch on `action.outcome.provenance`:
   - `compute-failed` → `{ phase: 'partial', outcome }`
   - `stalled` → `{ phase: 'partial', outcome }` (incl. `removed.length === 0`, so the
     "timed out, removed nothing" copy renders)
   - `executor-failed` → `{ phase: 'partial', outcome }` (unchanged; already `failed > 0`)
   - `host` → keep the existing rule: `failed.length === 0 → none` (full success), else `partial`
   Preserve every other transition byte-for-byte; keep the handler exhaustive over the
   provenance union (a missing arm should be a `tsc` error where practical).
2. Update the `removeComplete` JSDoc to document provenance-based routing.
3. TDD (this WP owns these tests): `test/domain/detection-state.test.ts` — one case per
   provenance branch (compute-failed→partial zero-track; stalled removed>0→partial truthful
   count; stalled removed===0→partial; host full-success→none; host failed>0→partial).
   `test/integration/removal-termination.test.ts` — assert end-to-end that a compute-failure
   and a stalled-partial both land on `partial` carrying the truthful outcome.

**Validation**: detection-state + integration tests green at 100% branch; no provenance
value falls through; host full-success still → `none`; the `partial` phase is reachable for
compute-failed and stalled outcomes.

---

## Definition of Done

- [ ] All 11 subtasks complete; each landed test-first (failing test observed first).
- [ ] `npm test` green — full suite, **100% line + branch coverage**, no skips.
- [ ] `npx tsc --noEmit` clean (strict).
- [ ] Boundary tests present: 29 999 / 30 000 / 30 001 ms per-batch window + the
      multi-batch progressing-but->30 s regression case.
- [ ] `grep -R "catalog-rejected\|rate-limit-unparseable\|network-failure\|malformed-enrichment-payload" src` → no non-test matches.
- [ ] `grep -R "startsWith('stalled:'\|startsWith('executor-failed:'" src` → empty.
- [ ] ADRs (B; C/D/I; K; N) written under `.claude/adr/`.
- [ ] `ports/catalog-enricher.ts` JSDoc no longer references a `SpicetifyCatalogEnricher` adapter (C-006).
- [ ] `removeComplete` routes compute-failed/stalled/executor-failed to `partial`; host full-success still → `none`; routing is provenance-based, not `failed.length`-only (T022).
- [ ] **Live-verify artefact (Finding B / FR-003)**: per the project live-verification
      protocol, drive the user through a real multi-batch removal on a large
      collection — confirm the reported removed-count equals what the host deleted
      (never "removed nothing" when deletions occurred) and a long-but-progressing
      removal is not aborted for elapsed time. Capture the console outcome + visual
      checklist before this WP reaches `done`.
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion
      commands (move-task / agent action) — do not hand off mid-WP.

## Reviewer guidance

- Verify the union has exactly five reachable members and every removed reason has
  zero producers (the greps above).
- Verify the watchdog re-arms on progress (not a whole-call race) and the multi-batch
  regression test genuinely exceeds 30 000 ms total.
- Verify compute-failed carries no fabricated TrackRef and no `(status N)` source
  remains; provenance is a typed field, not a string prefix.
- Confirm `computeRemoveSet` cannot be re-invoked in the catch (signature-level).
- Confirm the live-verify artefact is attached.

## Activity Log

- 2026-06-15T13:44:36Z – claude:opus:implementer:implementer – shell_pid=212789 – Assigned agent via action command
- 2026-06-15T18:56:43Z – claude:opus:implementer:implementer – shell_pid=212789 – Ready for review: core remediation complete — taxonomy reshape, typed provenance, per-batch stall watchdog, truthful partial/compute-failed outcomes, confirmRemoval decomposition. tsc clean, 1139 tests, 100% coverage. Live-verify (Finding B / FR-003) outstanding for orchestrator; one FSM-routing gap for compute-failed flagged (unowned detection-state.ts).
- 2026-06-15T23:23:28Z – claude:opus:implementer:implementer – shell_pid=212789 – Moved to planned
- 2026-06-15T23:24:46Z – claude:opus:implementer:implementer – shell_pid=249102 – Started implementation via action command
- 2026-06-15T23:32:00Z – claude:opus:implementer:implementer – shell_pid=249102 – Cycle-1 fix: T011 provenance routing complete
- 2026-06-15T23:32:44Z – claude:opus:reviewer:reviewer – shell_pid=253180 – Started review via action command
- 2026-06-15T23:36:39Z – claude:opus:reviewer:reviewer – shell_pid=253180 – Review passed: T001 union is exactly 5 members (auth-token-expired|enumerator-failed|host-unavailable|internal-error|aborted); T003 provenance required+typed, compute-failed carries removed:[]/failed:[] with no fabricated TrackRef, executor-failed maps real removeSet.tracks; T004 executor boundary-abort resolves host partial (no AbortError throw); T005 scan-catch wraps internal-error (no catalog-rejected in src); T006 watchdog re-arms per onProgress, boundary tests 29999 continues/30000 trips/30001 trips + multi-batch >30s-total-progressing completes to none; T008 computeRemoveSet called once (line 454) threaded into executeRemoveSet, catch cannot re-invoke; T011 removeComplete routes on provenance via removalAfterComplete (exhaustive switch, no default): compute-failed/stalled/executor-failed->partial, host failed.length===0->none preserved (tested twice), reachable end-to-end via integration tests. Gates: tsc --noEmit clean; 47 files/1146 tests pass, 100% stmts/branch/func/lines, no skips. greps: dead reasons only in sanctioned DetectionFailedView local union (zero live producers), startsWith stalled:/executor-failed: empty, no SpicetifyCatalogEnricher adapter ref (only a negation), no collectionKey-fabrication remnant. ADRs 0018/0019/0020 present under .claude/adr/ (reset() note folded into 0019). DetectionFailedView/RemovalOutcomeView/PlaylistRow touches are the pre-adjudicated sanctioned in-lane edits. No out-of-scope changes; apply-removal-outcome.ts source untouched.
