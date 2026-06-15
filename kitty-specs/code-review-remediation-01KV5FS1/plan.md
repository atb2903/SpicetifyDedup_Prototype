# Implementation Plan: Code Review Remediation Pass

**Branch**: `main` (planning base `main`, merge target `main`) | **Date**: 2026-06-15
**Spec**: `kitty-specs/code-review-remediation-01KV5FS1/spec.md`
**Mission**: `code-review-remediation-01KV5FS1`

> **Branch contract.** Workflow started on `main`; planning/base branch is `main`;
> completed changes merge into `main`. `branch_matches_target: true`. Each work
> package is implemented in its own spec-kitty worktree and merged back to `main`,
> where all charter gates are absolute.

## Summary

A code review of the duplicate-track detection + removal feature surfaced 14
findings (A–N). This is a **remediation pass over existing behaviour and
structure** — no new user-facing features, no change to the duplicate-matching
algorithm, no change to the confirm-before-delete safety model. Every change
lands behind the existing gates (TDD, 100% line/branch coverage, strict
TypeScript, hexagonal layering, boundary tests for every numeric bound touched).

The work splits into three correctness clusters and a maintainability cluster:

- **Scale-correctness defects (A, B).** A mixed-content collection (a podcast
  episode in a playlist) is today unscannable or mis-scanned; a large but
  genuinely-progressing removal blows a 30 s *whole-removal* ceiling and is
  reported as "removed nothing" even after earlier batches deleted tracks.
- **Error-guidance correctness (C, D, E, F).** An internal fault is mislabelled
  as a Spotify catalog rejection; dead Web-API enricher reasons (ADR-0011) still
  drive UI copy; a token expiry is misclassified (wrong field inspected); a
  phantom `(status N)` suffix can render; a compute failure fabricates a
  non-existent "1 track" from a collection URI.
- **Maintainability / type-drift (H, I, J, K, L, M, N) plus a JSDoc/behaviour
  mismatch (G).** Domain types are re-declared in UI; host-availability handling
  is non-uniform (one adapter hides `undefined` from the compiler); the removal
  orchestration is one large method; failure provenance crosses a layer boundary
  as a brittle string prefix; the architecture test is a text regex that misses
  re-exports / dynamic `import()` / unusual type-only imports; view routing is an
  inline IIFE; `raceStallCeiling`'s JSDoc asserts a tie-break the code does not
  wire; `reset()` sits outside the FSM transition tables undocumented.

### Confirmed technical approach (from planning interrogation)

| Decision | Resolution | Rationale |
|---|---|---|
| Per-batch stall window (FR-002) | **Re-scope `STALL_CEILING_MS = 30_000` from whole-removal to per-batch** (each completed batch resets the window) | Reuses the existing constant and its boundary-test shape; a genuinely-progressing N-batch removal now gets up to N×30 s, while a true 30 s no-progress hang on a single batch still trips. |
| Architecture test analyser (NFR-005) | **TypeScript Compiler API** import-graph traversal | `typescript` is already a devDependency — no new dependency; resolves re-exports / dynamic `import()` / type-only imports; matches the existing test's own "swap in a real parser" TODO. |
| `raceStallCeiling` JSDoc (NFR-007) | **Correct the JSDoc** to the real race-order behaviour | No behaviour change, lowest risk; the per-batch rework (B) rewrites this region anyway, so the corrected doc lands in step. |

See `research.md` for the load-bearing design decisions (per-batch stall model +
partial-outcome reporting, error-taxonomy reshape, typed failure provenance) and
their alternatives.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict), React 19, ES modules
**Primary Dependencies**: `zustand` (runtime); `react`/`react-dom`; dev: `vitest` 4 + `@vitest/coverage-v8`, `happy-dom`, `@testing-library/{react,dom,jest-dom,user-event}`, `typescript`, `spicetify-creator`
**Storage**: N/A (in-client extension; mutates the live Spotify library via Spicetify Platform APIs)
**Testing**: Vitest + happy-dom + @testing-library/react; 100% line/branch coverage enforced at the runner; TDD (failing test first); boundary tests for every numeric bound
**Target Platform**: Spicetify Custom App inside the Spotify desktop client
**Project Type**: Single project, hexagonal layering (`domain` → `ports` → `adapters` / `store` → `ui`); ADR-0001
**Performance Goals**: No wall-clock SLA (external host). Constrain algorithmic + UX behaviour: stall detection is per-batch-progress, not whole-operation elapsed time (FR-002); partial outcomes are faithful (FR-003)
**Constraints**: Algorithm unchanged (C-002); confirm-before-delete safety model unchanged (C-003); domain layer stays pure — no React/Zustand/Spicetify (C-004); fail-loud + paired classifier on parse boundaries; ADR per load-bearing decision (C-005); JSDoc/README current (C-006)
**Scale/Scope**: The libraries this project exists to serve — 20k+ saved tracks, large playlists; removals spanning many 100-track batches

## Charter Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 — still PASS.*

| Charter gate | Bearing on this mission | Status |
|---|---|---|
| TDD — failing test first | Every finding lands test-first; existing suite is the regression net | ✅ Mandatory, no exception |
| 100% line/branch coverage | Pruning dead reasons (FR-005) must not leave uncovered branches; new reasons/helpers fully covered; dead user-facing paths removed, not left untested | ✅ Preserved (C-001/SC-008) |
| Strict TypeScript | NFR-002 removes an unsafe `as` cast hiding `undefined`; NFR-001 removes drift-capable local type copies | ✅ Strengthened |
| Boundary testing for every numeric bound | Per-batch stall window (29 999 / 30 000 / 30 001 ms); existing `> 25` bulk-confirm and `BATCH_SIZE` bounds untouched but re-asserted | ✅ Mandatory (C-001) |
| SOLID / strict file SRP | NFR-003 decomposes the large `confirmRemoval` into named single-purpose helpers; NFR-006 extracts JSX routing | ✅ Improved |
| Named architectural pattern | Hexagonal (ADR-0001) — unchanged; NFR-005 makes the layering test enforce it structurally | ✅ Preserved + better enforced |
| Input validation: fail loud + paired classifier | FR-001 uses the existing exported classifier as the production gate; fail-loud on malformed *genuine* tracks preserved | ✅ Preserved |
| Risk boundaries (no silent mutation; per-action + bulk confirm; single-collection scope; no auto-run) | C-002/C-003 are explicit non-goals to change; the per-batch rework only changes *when a stall is declared* and *how truthfully the outcome is reported* | ✅ Preserved |
| Docs: README/JSDoc current; ADR per load-bearing decision | C-005 (ADRs for B, C/D, K; N documented); C-006 (fix `ports/catalog-enricher.ts` JSDoc) | ✅ In scope |
| Exceptions only on `spike/*` | This lands on `main` | ✅ Full gates apply |

**No charter violations.** Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```
kitty-specs/code-review-remediation-01KV5FS1/
├── plan.md              # This file
├── research.md          # Phase 0 — load-bearing decisions + alternatives
├── data-model.md        # Phase 1 — type/contract deltas per finding
├── contracts/           # Phase 1 — amended port & domain-type contracts
│   ├── removal-executor-port.md
│   ├── removal-outcome-provenance.md
│   ├── detection-error-taxonomy.md
│   └── architecture-import-graph.md
├── quickstart.md        # Phase 1 — verification walkthrough per success criterion
└── tasks.md             # Phase 2 (/spec-kitty.tasks — NOT created here)
```

### Source Code (repository root) — existing hexagonal layout; files this pass touches

```
src/
├── domain/                       # pure; no React/Zustand/Spicetify (C-004)
│   ├── detection-errors.ts       # FR-004 (+internal-error), FR-005 (−dead reasons), NFR-002 (+host-unavailable)
│   ├── removal-types.ts          # NFR-004 typed provenance on RemovalOutcome; FR-003/FR-009 truthful shapes
│   └── host-auth.ts (NEW)        # FR-006/FR-007 shared pure auth-expired predicate (single definition)
├── ports/
│   ├── removal-executor.ts       # FR-003 contract: boundary-abort returns accumulated partial
│   └── catalog-enricher.ts       # C-006 JSDoc fix (no SpicetifyCatalogEnricher adapter exists)
├── adapters/
│   ├── spicetify-tracks-enumerator.ts   # FR-001 classifier gate; FR-006 auth via `code`; NFR-002 requirePlatform
│   ├── spicetify-playlists-loader.ts    # FR-007 auth via shared predicate
│   └── spicetify-removal-executor.ts    # FR-003 return accumulated partial on boundary-abort
├── store/
│   └── detection-store.ts        # FR-002 per-batch watchdog; FR-003/FR-009 truthful outcomes; NFR-003 decompose; NFR-004 typed provenance; NFR-007 JSDoc; NFR-008 reset() doc
└── ui/
    ├── DetectionFailedView.tsx        # NFR-001 import domain types; FR-004/FR-005 message map; FR-008 drop phantom suffix
    ├── ScanningView.tsx               # NFR-001 import domain types
    ├── DetectionLoadedSummary.tsx     # NFR-001 import domain types
    ├── RemovalOutcomeView.tsx         # NFR-004 read typed provenance (no startsWith); FR-003/FR-009 truthful copy
    └── DedupPage.tsx                  # NFR-006 extract named routing helper

test/
└── architecture.test.ts          # NFR-005 TS-compiler-API import graph + new fixtures

.claude/adr/                      # C-005 ADRs (per-batch stall+partial; taxonomy reshape; typed provenance) + N documented
```

**Structure Decision**: No new top-level structure. The hexagonal layout
(ADR-0001) and strict file-level SRP are preserved. The only new source file is
`src/domain/host-auth.ts` — a pure predicate that gives FR-006/FR-007 a single
definition (the consistency-preserving alternative to duplicating the corrected
heuristic in two adapters). One ADR-worthy decision per C-005 cluster.

## Build sequence (informative — work packages are finalized by `/spec-kitty.tasks`)

Dependency-ordered so each unit compiles green against `main`:

1. **Domain foundation** — `detection-errors.ts` taxonomy reshape (FR-004/005, NFR-002 reason), `removal-types.ts` typed provenance (NFR-004) + truthful compute-failed shape (FR-009), `host-auth.ts` shared predicate (FR-006/007). ADR: error-taxonomy reshape (C/D/I).
2. **Enumerator** — FR-001 classifier gate, FR-006 auth via shared predicate, NFR-002 `requirePlatform` → `host-unavailable` (removes the unsafe `as` cast).
3. **Playlists loader** — FR-007 auth via shared predicate (confirm NFR-002 host-unavailable already present).
4. **Removal executor + store** — FR-003 executor returns accumulated partial on boundary-abort (port + adapter + fake); store per-batch progress watchdog (FR-002), truthful partial + compute-failed outcomes (FR-003/FR-009), typed provenance (NFR-004), `confirmRemoval` decomposition (NFR-003), `raceStallCeiling` JSDoc (NFR-007), `reset()` documentation (NFR-008). ADRs: per-batch stall + partial reporting (B); typed provenance (K); reset() note (N).
5. **UI** — NFR-001 import domain types (3 files), FR-004/005/008 message-map fixes, NFR-004 provenance-driven outcome view, FR-003/FR-009 truthful copy, NFR-006 routing helper.
6. **Architecture test** — NFR-005 TS-compiler-API import-graph analyser + fixtures proving re-exports / dynamic `import()` / type-only imports are now caught.
7. **Docs** — C-006 `ports/catalog-enricher.ts` JSDoc; README error-guidance copy if a user-facing list exists.

## Complexity Tracking

*No charter violations — table intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
