---
affected_files: []
cycle_number: 1
mission_slug: code-review-remediation-01KV5FS1
reproduction_command:
reviewed_at: '2026-06-15T23:23:28Z'
reviewer_agent: unknown
verdict: rejected
wp_id: WP01
---

**Verdict**: Changes requested (cycle 1/3) — scope expansion, not a defect in delivered work.

**What is correct**: All 10 subtasks (T001–T010) are implemented test-first, `tsc --noEmit` is clean, the full suite is green at 100% line/branch/function/statement coverage, the dead-reason and `startsWith` greps are clean in `src` (modulo the by-design WP03-owned local union in `DetectionFailedView.tsx`), and the ADRs (0018/0019/0020) are written. This work is kept — do **not** redo it.

**Why this is being sent back**: WP01's truthful, provenance-carrying `RemovalOutcome`s are produced but never reach the view that renders them, so the feature is incomplete end-to-end (and would make WP03's compute-failed/partial copy dead code). The reducer `src/domain/detection-state.ts` routes `removeComplete` purely on `failed.length === 0 → none`. Under the new provenance model this misroutes:
- **compute-failed** (`removed:[], failed:[]`) → `none` — the user never sees "couldn't compute the removal" (FR-009 intent).
- **successful stalled-partial** (`removed:[N], failed:[]`) → `none` — violates FR-003's "faithfully represent how many tracks were actually removed" (spec lines 141–143).

The fix is a domain-FSM concern coupled to the provenance model you introduced, and WP01 already owns `detection-state.test.ts`. Per orchestrator/user decision, `src/domain/detection-state.ts` is now added to WP01's `owned_files` and a new subtask **T011** is added. Implement only T011 on top of your existing commit; leave T001–T010 untouched.

**T011 — Route `removeComplete` on `provenance`**:
- In the `removeComplete` handler (~lines 271–281), branch on `action.outcome.provenance`:
  - `compute-failed` → `{ phase: 'partial', outcome }`
  - `stalled` → `{ phase: 'partial', outcome }` (incl. `removed.length === 0`, so the "timed out, removed nothing" copy renders)
  - `executor-failed` → `{ phase: 'partial', outcome }` (behaviour unchanged; already `failed.length > 0`)
  - `host` → keep the existing rule: `failed.length === 0 → none` (full success), else `partial`
  Preserve every other transition byte-for-byte; keep the handler exhaustive over the provenance union.
- Update the `removeComplete` JSDoc to document provenance-based routing.
- TDD (WP01 owns these tests): in `test/domain/detection-state.test.ts` add cases for each provenance branch (compute-failed→partial with zero-track outcome; stalled removed>0→partial truthful count; stalled removed===0→partial; host full-success→none; host failed>0→partial). In `test/integration/removal-termination.test.ts`, assert end-to-end that a compute-failure and a stalled-partial both land on `partial` carrying the truthful outcome. Maintain 100% line/branch coverage.

**Validation**: detection-state + integration tests green; no provenance value falls through; host full-success still → `none`; the partial view is reachable for compute-failed and stalled outcomes.
