---
work_package_id: WP04
title: Structural architecture/layering test (TypeScript Compiler API)
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- NFR-005
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T020
- T021
phase: Phase 3 - Structural enforcement
assignee: ''
agent: "claude:opus:implementer:implementer"
shell_pid: "12167"
history:
- timestamp: '2026-06-15T11:46:50Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: test/architecture
execution_mode: code_change
owned_files:
- test/architecture.test.ts
- test/architecture-fixtures/**
tags: []
---

# Work Package Prompt: WP04 — Structural architecture test

## Objective

Replace the regex content-scan in `test/architecture.test.ts` with an
AST/import-graph analyser built on the TypeScript Compiler API that catches the
documented gaps — re-exports, dynamic `import()`, and unusually-written type-only
imports — and add fixtures proving the previously-missed forbidden edges are now
caught (NFR-005, finding L). See research R-7.

Charter gates absolute on `main`: TDD, 100% line/branch coverage (the analyser is
application code under the runner), strict TS.

## Context

- Read: research R-7; `contracts/architecture-import-graph.md`; ADR-0001
  (hexagonal forbidden-edge table); the existing `test/architecture.test.ts` header
  (it documents its own "swap in a real parser" gap).
- `typescript` is already a devDependency — **no new dependency** (consistency over
  novelty; matches the existing TODO).
- UI may import **types** from `src/domain/`; the analyser must permit type-only
  imports from `src/domain/` while still forbidding `src/adapters/` and
  `src/ports/` edges per ADR-0001.
- Depends on **WP01–WP03**: run against the final import graph (the satellite WPs
  add `host-auth` imports and change UI imports).

## Branch strategy

Planning/base `main`; merge target `main`. WP04's base includes WP01–WP03.
Implement in this WP's execution worktree (per `lanes.json`).

Start command (depends on WP01, WP02, WP03):

```bash
spec-kitty agent action implement WP04 --agent <name>
```

---

### T020 — Rebuild architecture test on the TypeScript Compiler API

**Purpose**: Structural import-graph analysis replacing the text regex (NFR-005).

**Steps**:
1. Parse each `src/**/*.{ts,tsx}` to a `SourceFile` (TS compiler API). Walk:
   - `ImportDeclaration` (incl. `import type` / type-only specifiers),
   - `ExportDeclaration` with a module specifier (**re-exports**),
   - `ImportEqualsDeclaration`,
   - `CallExpression` whose `expression.kind === SyntaxKind.ImportKeyword`
     (**dynamic `import()`**).
2. Resolve each module specifier to its owning layer (`domain`/`ports`/`adapters`/
   `store`/`ui`) and assert the ADR-0001 forbidden-edge table. Permit type-only
   `src/domain/` imports from `src/ui/`.
3. Keep per-`(file, rule)` `it()` granularity so a failure still names the exact
   file + rule.

**Validation**: `npm test -- architecture` green on real `src/`; failures (when
seeded) name file + rule.

---

### T021 — Architecture fixtures: re-export / dynamic import() / type-only edges

**Purpose**: Regression proof that the previously-missed forms are now caught
(NFR-005), and branch coverage for each import-kind handler (C-001).

**Steps**:
1. Add `test/architecture-fixtures/` with small `.ts` files (or inline parsed
   strings) demonstrating a **forbidden re-export**, a **forbidden dynamic
   `import()`**, and a **forbidden type-only import** that violate ADR-0001.
2. Assert the analyser flags each (and passes once the forbidden edge is removed),
   exercising every import-kind branch — these fixtures double as the branch
   coverage for the handlers.

**Validation**: each fixture is caught by the analyser; 100% branch coverage of the
import-kind handlers; gates green.

---

## Definition of Done

- [ ] Both subtasks complete, test-first.
- [ ] `npm test` green — 100% line + branch coverage, no skips; `npx tsc --noEmit` clean.
- [ ] Analyser uses the TS compiler API (no new devDependency); per-(file, rule)
      granularity retained.
- [ ] Fixtures prove re-export / dynamic `import()` / type-only forbidden edges are
      caught; type-only `src/domain/` imports from UI are permitted.
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion
      commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm the analyser walks all four node kinds (import, re-export,
  import-equals, dynamic import) — the regex gaps are the whole point.
- Confirm a fixture exists for each previously-missed form and that removing the
  forbidden edge makes the rule pass (no false-positive-only test).
- Confirm no `dependency-cruiser`/`ts-morph` dependency was added.

## Activity Log

- 2026-06-16T09:25:35Z – claude:opus:implementer:implementer – shell_pid=12167 – Started implementation via action command
