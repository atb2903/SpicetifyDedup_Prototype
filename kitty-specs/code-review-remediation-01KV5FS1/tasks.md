# Tasks: Code Review Remediation Pass

**Mission**: code-review-remediation-01KV5FS1
**Planning base**: `main` · **Merge target**: `main` · **branch_matches_target**: true
**Generated**: 2026-06-15

> **Decomposition decision (recorded with the user).** The detection-error
> taxonomy reshape (FR-005: remove `catalog-rejected` + 3 dead reasons; add
> `internal-error`, `host-unavailable`) and the typed `RemovalOutcome.provenance`
> field (NFR-004) are **compile-coupled across a hub file (`detection-store.ts`)
> and two hub types (`detection-errors.ts`, `removal-types.ts`)**. Under
> spec-kitty's one-file-per-WP ownership and the charter's *green-on-every-merge*
> gate, no ordering splits these into small WPs and stays green at each step
> (add-member → swap-producers → remove-member all land in one file; producers and
> the type live in different files but must change atomically). The user chose to
> keep them in **one necessarily-large atomic WP (WP01)** rather than relax the
> gate or amend the data-model. WP01 therefore exceeds the 3–7 subtask sizing
> guideline (~10 subtasks); this is inherent to an atomic refactor, not a
> planning miss. The satellite work splits cleanly (WP02–WP04).

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | Reshape `DetectionErrorReason` taxonomy | WP01 | | [D] |
| T002 | Purge dead-reason producers in the enricher layer (+ C-006 JSDoc) | WP01 | | [D] |
| T003 | Add typed `RemovalOutcome.provenance` + truthful outcome shapes | WP01 | | [D] |
| T004 | `RemovalExecutor` boundary-abort returns accumulated partial | WP01 | | [D] |
| T005 | Store scan-catch → honest `internal-error` (drop `catalog-rejected`) | WP01 | | [D] |
| T006 | Store per-batch stall watchdog + `raceStallCeiling` JSDoc | WP01 | | [D] |
| T007 | Store truthful partial / compute-failed outcomes + provenance stamping | WP01 | | [D] |
| T008 | Decompose `confirmRemoval` into named helpers | WP01 | | [D] |
| T009 | Document `reset()` placement (comment + ADR) | WP01 | | [D] |
| T010 | ADRs for B, C/D/I, K, N | WP01 | | [D] |
| T011 | New `src/domain/host-auth.ts` shared auth-expired predicate | WP02 | [D] |
| T012 | Enumerator classifier gate (skip non-track items) | WP02 | |
| T013 | Enumerator `requirePlatform` (remove unsafe cast) | WP02 | |
| T014 | Enumerator auth via shared predicate (`code`, not `status`) | WP02 | |
| T015 | Playlists-loader auth via shared predicate | WP02 | |
| T016 | Remove local domain-type re-declarations in UI (import from domain) | WP03 | [P] |
| T017 | `DetectionFailedView` message map (internal-error, host-unavailable, no phantom suffix) | WP03 | |
| T018 | `RemovalOutcomeView` provenance-driven (no `startsWith`) | WP03 | |
| T019 | `DedupPage` named routing helper (no inline IIFE) | WP03 | |
| T020 | Rebuild architecture test on the TypeScript Compiler API | WP04 | |
| T021 | Architecture fixtures: re-export / dynamic import() / type-only edges | WP04 | |
| T022 | Route `removeComplete` on `provenance` (FR-003/FR-009 end-to-end) | WP01 | | [D] |

---

## Phase 1 — Foundational (atomic core)

### WP01 — Core remediation: error taxonomy, removal provenance, per-batch stall, store decomposition

- **Goal**: Land every change that is compile-coupled through `detection-store.ts`,
  `detection-errors.ts`, and `removal-types.ts` in one green step — the
  taxonomy reshape (C/E reasons, FR-004/FR-005), the typed provenance contract
  (K/NFR-004), the executor boundary-abort partial (FR-003), the per-batch stall
  watchdog (B/FR-002), the truthful compute-failed/partial outcomes (F/FR-009),
  the `confirmRemoval` decomposition (J/NFR-003), and the doc fixes (G/NFR-007,
  N/NFR-008, C-006).
- **Priority**: P0 — every satellite WP depends on the pruned union and the
  `provenance` field.
- **Requirements**: FR-002, FR-003, FR-004, FR-005, FR-009, NFR-003, NFR-004,
  NFR-007, NFR-008; C-005, C-006.
- **Independent test**: full `npm test` (100% line/branch) + `npx tsc --noEmit`
  green on WP01's worktree; the FR-002 multi-batch-progressing regression test and
  the 29 999/30 000/30 001 ms boundary tests pass; `grep -R
  "catalog-rejected\|rate-limit-unparseable\|network-failure\|malformed-enrichment-payload"
  src` returns no non-test matches; `grep -R "startsWith('stalled:'" src` empty.
- **Dependencies**: none.

Included subtasks:

- [x] T001 Reshape `DetectionErrorReason` taxonomy (WP01)
- [x] T002 Purge dead-reason producers in the enricher layer + C-006 JSDoc (WP01)
- [x] T003 Add typed `RemovalOutcome.provenance` + truthful outcome shapes (WP01)
- [x] T004 `RemovalExecutor` boundary-abort returns accumulated partial (WP01)
- [x] T005 Store scan-catch → honest `internal-error` (WP01)
- [x] T006 Store per-batch stall watchdog + `raceStallCeiling` JSDoc (WP01)
- [x] T007 Store truthful partial / compute-failed outcomes + provenance stamping (WP01)
- [x] T008 Decompose `confirmRemoval` into named helpers (WP01)
- [x] T009 Document `reset()` placement (comment + ADR) (WP01)
- [x] T010 ADRs for B, C/D/I, K, N (WP01)
- [x] T022 Route `removeComplete` on `provenance` (FR-003/FR-009 end-to-end) (WP01)

Implementation sketch: domain types first (T001, T003) so the file compiles, then
the producers that must change atomically with them (T002 enricher, T004 executor,
T005–T007 store), then structure/docs (T008–T010). Prompt: `tasks/WP01-core-remediation.md`.

Risks: largest WP in the mission (~10 subtasks); the `provenance` required-field
addition fans out to every `RemovalOutcome` fixture — update them in lockstep or
the suite won't compile. Live-verify artefact required (Finding B).

---

## Phase 2 — Host adapters & UI (depend on WP01)

### WP02 — Host adapters: classifier gate, shared auth predicate, availability uniformity

- **Goal**: Make the scan path mixed-content-safe (FR-001), give both adapters a
  single corrected auth-expired predicate (FR-006/FR-007), and unify
  host-availability (NFR-002 — remove the enumerator's unsafe cast).
- **Priority**: P1.
- **Requirements**: FR-001, FR-006, FR-007, NFR-002.
- **Independent test**: episode-with-`artists` skipped, all-episode collection →
  empty (no failure); `{ code: 401 }` → `auth-token-expired` for **both** entry
  points, `{ status: 401 }` → not auth-expired; host-absent → `host-unavailable`
  before any host call; gates green.
- **Dependencies**: WP01 (`host-unavailable` reason must exist in the union).

Included subtasks:

- [ ] T011 New `src/domain/host-auth.ts` shared auth-expired predicate (WP02)
- [ ] T012 Enumerator classifier gate — skip non-track items (WP02)
- [ ] T013 Enumerator `requirePlatform` — remove unsafe cast (WP02)
- [ ] T014 Enumerator auth via shared predicate (`code`) (WP02)
- [ ] T015 Playlists-loader auth via shared predicate (WP02)

Prompt: `tasks/WP02-host-adapters.md`.

### WP03 — UI: domain-type consumption, message map, provenance outcome, routing helper

- **Goal**: Consume domain types by import (NFR-001/H), reconcile the message map
  with the pruned union + honest internal-error/host-unavailable copy and no
  phantom `(status N)` suffix (FR-004/FR-005/FR-008/C/E), branch the outcome view
  on typed provenance (NFR-004/FR-003/FR-009/K/F), and extract the JSX routing
  IIFE (NFR-006/M).
- **Priority**: P1.
- **Requirements**: FR-004, FR-005, FR-008, NFR-001, NFR-004, NFR-006.
- **Independent test**: `grep -R "defined locally" src/ui` empty;
  `grep -R "startsWith" src/ui/RemovalOutcomeView.tsx` empty; internal-error copy
  carries no catalog/Spotify wording; compute-failed copy names no track/count;
  exhaustive `never` switches preserved; gates green.
- **Dependencies**: WP01 (pruned union + `provenance` field).

Included subtasks:

- [ ] T016 Remove local domain-type re-declarations in UI (WP03)
- [ ] T017 `DetectionFailedView` message map + drop phantom suffix (WP03)
- [ ] T018 `RemovalOutcomeView` provenance-driven (no `startsWith`) (WP03)
- [ ] T019 `DedupPage` named routing helper (WP03)

Prompt: `tasks/WP03-ui-remediation.md`.

---

## Phase 3 — Structural enforcement (depends on WP01–WP03)

### WP04 — Structural architecture/layering test (TypeScript Compiler API)

- **Goal**: Replace the regex import scan with an AST/import-graph analyser that
  catches re-exports, dynamic `import()`, and type-only imports (NFR-005/L), with
  fixtures proving the previously-missed forbidden edges are now caught.
- **Priority**: P2.
- **Requirements**: NFR-005.
- **Independent test**: `npm test -- architecture` green on real `src/`; fixtures
  for a forbidden re-export, a forbidden dynamic `import()`, and a forbidden
  type-only import each fail the rule (and pass once removed); 100% branch coverage
  of each import-kind handler; gates green.
- **Dependencies**: WP01, WP02, WP03 (analyser runs against the final import graph).

Included subtasks:

- [ ] T020 Rebuild architecture test on the TypeScript Compiler API (WP04)
- [ ] T021 Architecture fixtures: re-export / dynamic import() / type-only edges (WP04)

Prompt: `tasks/WP04-architecture-test.md`.

---

## Dependency graph

```
WP01 (atomic core)
 ├── WP02 (host adapters)
 ├── WP03 (UI)
 └── WP04 (architecture test) ← also depends on WP02, WP03
```

WP02 and WP03 are parallel-eligible (both depend only on WP01); per project
convention they are executed sequentially. WP04 runs last.

## MVP / sequencing note

WP01 is not optional MVP — it is the load-bearing foundation; nothing else
compiles green without it. Recommended order: **WP01 → WP02 → WP03 → WP04**.
