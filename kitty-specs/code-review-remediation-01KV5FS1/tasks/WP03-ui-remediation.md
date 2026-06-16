---
work_package_id: WP03
title: 'UI: domain-type consumption, message map, provenance outcome, routing helper'
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-005
- FR-008
- NFR-001
- NFR-004
- NFR-006
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T016
- T017
- T018
- T019
phase: Phase 2 - Host adapters & UI
assignee: ''
agent: "claude:opus:reviewer:reviewer"
shell_pid: "10661"
history:
- timestamp: '2026-06-15T11:46:50Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/ui/
execution_mode: code_change
owned_files:
- src/ui/DetectionFailedView.tsx
- src/ui/ScanningView.tsx
- src/ui/DetectionLoadedSummary.tsx
- src/ui/RemovalOutcomeView.tsx
- src/ui/DedupPage.tsx
- test/ui/DetectionFailedView.test.tsx
- test/ui/ScanningView.test.tsx
- test/ui/DetectionLoadedSummary.test.tsx
- test/ui/RemovalOutcomeView.test.tsx
- test/ui/DedupPage.test.tsx
tags: []
---

# Work Package Prompt: WP03 — UI remediation

## Objective

Consume domain types by import (NFR-001), reconcile the failure message map with
the pruned union + honest internal-error/host-unavailable copy and no phantom
`(status N)` suffix (FR-004/FR-005/FR-008), branch the outcome view on typed
provenance (NFR-004/FR-003/FR-009), and extract the JSX routing IIFE (NFR-006).
Findings: **H, M, C (copy), E (suffix), F (copy), K (view)**.

Charter gates absolute on `main`: TDD, 100% line/branch coverage, strict TS.

## Context

- Read: `data-model.md` §1, §3, §7, §8; `spec.md` scenarios 3/4/5 + edge cases;
  `quickstart.md` SC-004/005/006/007.
- Depends on **WP01**: the pruned `DetectionErrorReason` union and the
  `RemovalOutcome.provenance` field must already exist on `main`+WP01.
- The three UI files currently carry **local re-declarations** of domain types
  under `// Types (WP01 domain types are defined locally until WP01 is merged …)`.
  ADR-0001 permits UI to import **types** from `src/domain/`.

## Branch strategy

Planning/base `main`; merge target `main`. WP03's base includes WP01. Implement in
this WP's execution worktree (per `lanes.json`).

Start command (depends on WP01):

```bash
spec-kitty agent action implement WP03 --agent <name>
```

---

### T016 — Remove local domain-type re-declarations in UI

**Purpose**: A single canonical definition per domain type (NFR-001, H). See
`data-model.md` §7.

**Steps**:
1. In `DetectionFailedView.tsx`, `ScanningView.tsx`, `DetectionLoadedSummary.tsx`:
   delete the local `// Types (… defined locally …)` blocks and import the real
   types from `src/domain/` — `DetectionError`/`DetectionErrorReason` from
   `../domain/detection-errors`, progress/detection types from
   `../domain/detection-types`, `DetectionResult`/`DuplicateGroup`/`GroupMember`
   from their domain modules.
2. Reconcile any field drift the local copies hid (e.g. the `DetectionError`
   plain-object shape vs the domain class) — adapt the component to the canonical
   shape.

**Validation**: `grep -R "defined locally" src/ui` → empty; the three components
import the listed types; gates green.

---

### T017 — `DetectionFailedView` message map + drop phantom suffix

**Purpose**: Honest copy over the pruned union and no phantom status suffix
(FR-004, FR-005, FR-008; findings C/E).

**Steps**:
1. With the now-imported `DetectionErrorReason` (T016), remove the message cases
   for the deleted reasons (`rate-limit-unparseable`, `network-failure`,
   `malformed-enrichment-payload`, `catalog-rejected`).
2. Add cases: `internal-error` → honest internal-error copy with **no**
   catalog/Spotify-rejection wording (SC-004); `host-unavailable` → the dedicated
   host-unavailable copy matching the removal/playlists paths (SC-007).
3. Remove the `(status N)` suffix sourced from `context.status` (no producer sets
   it — FR-008). If any rejection message keeps a status suffix, render it **only**
   when a status value is actually present.
4. Keep the exhaustive `never` switch so adding/removing a reason stays a `tsc`
   error.
5. TDD: `test/ui/DetectionFailedView.test.tsx` — internal-error copy asserts no
   "catalog"/"Spotify rejected" text; host-unavailable copy present; no `(status …)`
   renders; removed-reason cases gone.

**Validation**: view test green; exhaustiveness preserved; no phantom suffix.

---

### T018 — `RemovalOutcomeView` provenance-driven (no `startsWith`)

**Purpose**: Branch on the typed discriminator; truthful partial / compute-failed
copy (NFR-004, FR-003, FR-009; findings K/F). See `data-model.md` §3.

**Steps**:
1. Remove `STALLED_REASON_PREFIX` and the `failed.every(f => f.reason.startsWith…)`
   logic. Branch on `outcome.provenance`:
   - `stalled` with `removed.length === 0` → "timed out, removed nothing";
     `stalled` with `removed.length > 0` → truthful partial count (FR-003).
   - `compute-failed` → "couldn't compute the removal" copy that names **no** track
     and **no** count (FR-009).
   - `executor-failed` / `host` → existing truthful copy.
2. TDD: `test/ui/RemovalOutcomeView.test.tsx` — a `stalled` partial shows the real
   removed count (not "nothing"); `compute-failed` names no track/count; no
   `startsWith` remains.

**Validation**: `grep -R "startsWith" src/ui/RemovalOutcomeView.tsx` → empty; view
test green.

---

### T019 — `DedupPage` named routing helper

**Purpose**: No inline IIFE routing inside JSX (NFR-006, M). See `data-model.md` §8.

**Steps**:
1. Extract the `{(() => { switch (kind) { … } })()}` into a named module-level
   helper (e.g. `routeView(kind)` / `renderForKind(kind)` returning the element);
   reference it from the render tree. Keep the `switch` with **no** `default` so an
   unhandled `LoadState.kind` stays a compile error (exhaustiveness preserved).
2. TDD: `test/ui/DedupPage.test.tsx` — each kind routes to its view; exhaustiveness
   guard intact.

**Validation**: no IIFE in `DedupPage.tsx` JSX; page test green.

---

## Definition of Done

- [ ] All 4 subtasks complete, each test-first.
- [ ] `npm test` green — 100% line + branch coverage, no skips.
- [ ] `npx tsc --noEmit` clean.
- [ ] `grep -R "defined locally" src/ui` → empty; `grep -R "startsWith" src/ui/RemovalOutcomeView.tsx` → empty.
- [ ] No `(status N)` phantom suffix; internal-error copy free of catalog/Spotify
      wording; compute-failed copy names no track/count.
- [ ] Exhaustive `never` switches preserved in `DetectionFailedView` and `DedupPage`.
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion
      commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm zero local domain-type copies remain and exhaustiveness is type-enforced.
- Confirm the outcome view branches on `provenance`, not on reason-string prefixes,
  and that a `stalled` partial shows a truthful count.
- Confirm no message references a catalog/Spotify rejection or a status the
  producer never sets.

## Activity Log

- 2026-06-16T00:12:37Z – claude:opus:implementer:implementer – shell_pid=262673 – Started implementation via action command
- 2026-06-16T09:21:18Z – claude:opus:implementer:implementer – shell_pid=262673 – WP03 complete: domain-type imports (T016), honest message map + no phantom suffix (T017), provenance-driven outcome (T018), named routing helper (T019); coverage + tsc green
- 2026-06-16T09:21:51Z – claude:opus:reviewer:reviewer – shell_pid=10661 – Started review via action command
