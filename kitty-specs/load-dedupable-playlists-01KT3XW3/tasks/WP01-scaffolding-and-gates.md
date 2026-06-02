---
work_package_id: WP01
title: Scaffolding & Gates
dependencies: []
requirement_refs:
- C-001
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-load-dedupable-playlists-01KT3XW3
base_commit: 7003f495eb640cb0b19a52512b4a6f036a7b2008
created_at: '2026-06-02T16:03:55.441564+00:00'
subtasks:
- T001
- T002
- T003
- T004
shell_pid: "43064"
agent: "claude"
history:
- timestamp: '2026-06-02T11:11:28Z'
  action: created
  by: spec-kitty.tasks
  note: Initial WP scaffold generated from /spec-kitty.tasks for mission load-dedupable-playlists-01KT3XW3.
authoritative_surface: src/types/spicetify-platform.d.ts
execution_mode: code_change
mission_id: 01KT3XW3AWY8W0YJKCE9TYNQKX
mission_slug: load-dedupable-playlists-01KT3XW3
owned_files:
- package.json
- package-lock.json
- vitest.config.ts
- test/architecture.test.ts
- src/types/spicetify-platform.d.ts
tags: []
---

# WP01 — Scaffolding & Gates

## Objective

Stand up the project gates that every subsequent WP relies on. Specifically: install the Zustand runtime dependency that the store will need (WP06); add the Vitest V8 coverage tool and lock the 100 % line + branch threshold the charter mandates (DIRECTIVE_030); write the architecture import-graph test that enforces the hexagonal boundary chosen in ADR-0001; and create narrow ambient typings for the `Spicetify.Platform.RootlistAPI` and `LibraryAPI` surfaces the production adapter will call (WP05).

After this WP lands, every later WP either turns a green test red and then back to green (TDD), or fails the architecture/coverage gate immediately on commit — both desirable outcomes that catch problems early.

## Branch Strategy

Planning base = merge target = `get_library`. The execution agent invokes `spec-kitty agent action implement WP01 --agent <name>`; the runtime resolves the lane and workspace path from `lanes.json` (created by `finalize-tasks`). No git operations are performed by the agent during implementation — the user owns commits per project policy (see `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/CLAUDE.md`).

## Context

Existing state of the repo (verified at planning time):

- `package.json` declares React 19.2, `spicetify-creator` 1.0.17, `@testing-library/{dom,jest-dom,react}`, `happy-dom` 20.9, `vitest` 4.1. **No `zustand` yet. No coverage provider yet.**
- `vitest.config.ts` configures the `happy-dom` environment, the `test/setup.ts` setup file, `globals: true`, and `include: ['test/**/*.test.{ts,tsx}']`. **No coverage block.**
- `tsconfig.json` has `strict: true`, target ES2017, JSX `react`. Good as-is.
- `src/app.tsx` renders `<div>Hello World</div>`. Untouched in this WP.
- `src/types/spicetify.d.ts` is the mirrored `globals.d.ts` from `spicetify/cli`. **`Spicetify.Platform` is typed `any`** at line 842 — that's the gap WP01 narrows.
- `.claude/adr/0001-hexagonal-load-dedupable-playlists.md` documents the hexagonal layout. The architecture test in this WP encodes the boundary rules from that ADR.

This WP touches infrastructure only; it does not introduce any domain logic, UI, or behavior.

## Detailed guidance per subtask

### T001 — Install `zustand` as a runtime dependency

**Purpose**: The store (WP06) needs Zustand. Adding it as a `dependencies` (not `devDependencies`) entry reflects that it ships in the production bundle.

**Steps**:

1. From the repo root, run `npm install zustand`. Confirm the latest stable 5.x is selected (`package.json` should show `"zustand": "^5.x.x"`).
2. Verify `package-lock.json` is updated atomically.
3. Confirm the install hasn't touched the existing React or testing entries.
4. Smoke-test the import: temporarily create `src/store/_zustand_smoke.ts` containing `import { create } from 'zustand'; export const _ = create<{ n: number }>(() => ({ n: 0 }));`. Run `npx tsc --noEmit`. Expect clean. Delete the file before moving on.

**Files**: `package.json` (modify), `package-lock.json` (modify).

**Validation**:

- [ ] `package.json` lists `zustand` under `dependencies` (not `devDependencies`).
- [ ] `package-lock.json` updated; `npm ls zustand` reports the resolved version.
- [ ] `npx tsc --noEmit` clean.
- [ ] No other `package.json` keys modified.

### T002 — Add `@vitest/coverage-v8` and configure 100 % thresholds

**Purpose**: The charter requires 100 % line and branch coverage at the runner. Vitest doesn't ship a coverage provider by default — we add the V8 provider (fast, accurate enough for our needs; the alternative `@vitest/coverage-istanbul` is slower).

**Steps**:

1. Run `npm install --save-dev @vitest/coverage-v8`. Match the major version to the installed `vitest` (currently 4.x).
2. Update `vitest.config.ts` to add a `coverage` block:

   ```ts
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       environment: 'happy-dom',
       include: ['test/**/*.test.{ts,tsx}'],
       setupFiles: './test/setup.ts',
       globals: true,
       coverage: {
         provider: 'v8',
         reporter: ['text', 'html'],
         include: ['src/**/*.{ts,tsx}'],
         exclude: ['src/types/**', 'src/**/*.d.ts'],
         thresholds: {
           lines: 100,
           branches: 100,
           functions: 100,
           statements: 100,
         },
       },
     },
   });
   ```

3. Add a new npm script to `package.json` for coverage runs: `"test:coverage": "vitest run --coverage"`.
4. Run `npm run test:coverage`. Confirm: with only the existing Hello World test and no `src/` files outside `src/app.tsx` + `src/types/`, coverage will be 100 % of `src/app.tsx` (the Hello World test covers it). If coverage is below 100 %, the threshold gate will fail — which is the intended behavior; treat any failure as a real bug in the configuration, not "noise to suppress".

**Files**: `vitest.config.ts` (modify), `package.json` (modify — adds the script and the new devDependency).

**Validation**:

- [ ] `npm run test:coverage` exits 0.
- [ ] The HTML report at `coverage/index.html` shows 100 % for all categories.
- [ ] Forcing a regression — e.g. temporarily adding an unused exported function to `src/app.tsx` — causes the coverage threshold gate to fail. Revert before proceeding.

### T003 — Architecture import-graph test

**Purpose**: ADR-0001 declares hexagonal. The boundaries are only useful if they're mechanically enforced; the architecture test reads each source file and asserts that the dependency direction is correct.

**Steps**:

1. Create `test/architecture.test.ts`. It is a single Vitest test file using `node:fs` + `node:path` to walk the source tree and inspect raw file contents for `import` statements (a regex-level scan is sufficient — we do not need a full AST parser).

2. The forbidden-import rules:

   | Folder | MUST NOT import from |
   | --- | --- |
   | `src/domain/**` | `react`, `react-dom`, `zustand`, `src/adapters/**`, `src/store/**`, `src/ui/**`. May import from other `src/domain/**` files and `src/types/**`. |
   | `src/ports/**` | `src/adapters/**`, `src/store/**`, `src/ui/**`. May import from `src/domain/**` and `src/types/**`. |
   | `src/adapters/**` | `src/store/**`, `src/ui/**`. May import from `src/domain/**`, `src/ports/**`, `src/types/**`. The production adapter may import from `Spicetify` (ambient). |
   | `src/store/**` | `src/ui/**`, `src/adapters/**` (NOTE: the adapter is injected via the factory; the store imports only the *port*). May import from `src/domain/**`, `src/ports/**`, `zustand`, `src/types/**`. |
   | `src/ui/**` | `src/adapters/**`, `src/ports/**` (consume the store, not the port directly). May import from `src/domain/**` (for view-model types), `src/store/**`, React. |

3. Skeleton:

   ```ts
   import { readdirSync, readFileSync, statSync } from 'node:fs';
   import { join } from 'node:path';
   import { describe, it, expect } from 'vitest';

   const SRC = join(__dirname, '..', 'src');

   const RULES: { folder: string; forbidden: RegExp[] }[] = [
     {
       folder: 'src/domain',
       forbidden: [
         /from\s+['"]react['"]/,
         /from\s+['"]react-dom['"]/,
         /from\s+['"]zustand['"]/,
         /from\s+['"]\.\.\/adapters\//,
         /from\s+['"]\.\.\/store\//,
         /from\s+['"]\.\.\/ui\//,
       ],
     },
     // …other rules
   ];

   function walk(dir: string): string[] { /* recursive .ts/.tsx collector */ }

   describe('hexagonal import boundaries', () => {
     for (const { folder, forbidden } of RULES) {
       const files = walk(join(__dirname, '..', folder));
       for (const file of files) {
         const body = readFileSync(file, 'utf8');
         for (const rx of forbidden) {
           it(`${file} must not match ${rx}`, () => {
             expect(body).not.toMatch(rx);
           });
         }
       }
     }
   });
   ```

4. Run `npm run test:run`. With no files in those folders yet, the test trivially passes (no files to check). Treat this as the green baseline; it will start enforcing the rules as soon as WP02 introduces `src/domain/` files.

**Files**: `test/architecture.test.ts` (new).

**Validation**:

- [ ] `npm run test:run` includes the architecture test in the report.
- [ ] If a regex rule typo accidentally fires on a non-existent file, the test loop short-circuits cleanly (no thrown errors leaking out of test bodies).
- [ ] The file is well-commented; future WP authors can extend it without re-reading the ADR.

### T004 — Ambient typings for `Spicetify.Platform.RootlistAPI` + `LibraryAPI`

**Purpose**: `src/types/spicetify.d.ts` (the mirrored `globals.d.ts`) types `Spicetify.Platform` as `any`. The production adapter (WP05) must call methods on `RootlistAPI` and `LibraryAPI` — without narrow typings, `tsc --noEmit` won't catch field-access mistakes there.

**Steps**:

1. Create `src/types/spicetify-platform.d.ts`. Augment the existing namespace with best-effort narrow typings for only the methods this iteration uses. The exact shape will be refined in WP05 against the captured fixture; this WP commits a plausible structural typing that won't change the public surface.

2. Content:

   ```ts
   /**
    * Narrow ambient typings for the Spicetify Platform sub-namespaces this
    * project depends on. Refined in WP05 against the captured fixture; the
    * adapter's runtime validator is authoritative if the shape ever drifts.
    *
    * The official `spicetify/cli/globals.d.ts` types `Spicetify.Platform` as
    * `any`; this file augments that namespace with the methods used here.
    */

   declare namespace Spicetify {
     namespace Platform {
       interface RootlistAPI {
         /** Returns the user's rootlist (folder tree of playlists). Exact
          *  method name and response shape captured live in WP05. */
         getContents(...args: unknown[]): Promise<unknown>;
       }
       interface LibraryAPI {
         /** Returns paged saved tracks; we only need the totalLength field
          *  for the Liked Songs row's track count in this iteration. */
         getTracks(params: { limit: number; offset: number }): Promise<{
           items: unknown[];
           totalLength: number;
           offset: number;
           limit: number;
         }>;
       }
       const RootlistAPI: RootlistAPI;
       const LibraryAPI: LibraryAPI;
     }
   }
   ```

3. Adjust `tsconfig.json` if needed so this file is picked up via `include`. The existing `include: ['./src/**/*.*', './test/**/*.*']` already covers `.d.ts` under `src/types/`.

4. Smoke-test: `npx tsc --noEmit` must remain clean.

**Files**: `src/types/spicetify-platform.d.ts` (new).

**Validation**:

- [ ] `npx tsc --noEmit` clean.
- [ ] Accessing `Spicetify.Platform.RootlistAPI.getContents` in a temporary test file gives an inferred type (no `any` leakage past the call site). Drop the test file.
- [ ] The file's leading JSDoc points the reader to WP05 for shape refinement.

## Test strategy

This WP is mostly configuration; the only test introduced is the architecture test (T003). It runs as part of `npm run test:run` and gates every future commit. The Hello World test in `test/app.test.tsx` continues to pass and provides the 100 % coverage of `src/app.tsx` until WP09 replaces it.

## Definition of Done

- [ ] `zustand` installed as a `dependencies` entry; `package-lock.json` updated atomically.
- [ ] `@vitest/coverage-v8` installed; `vitest.config.ts` enforces 100 % thresholds for lines, branches, functions, statements; `npm run test:coverage` passes.
- [ ] `test/architecture.test.ts` exists, is well-commented, and runs green; deliberately violating any rule (e.g. add `import 'react'` to a temporary `src/domain/_smoke.ts`) makes the test red as expected. Revert.
- [ ] `src/types/spicetify-platform.d.ts` exists with narrow typings for `RootlistAPI` + `LibraryAPI`; `tsc --noEmit` clean.
- [ ] `npm run test:run` green; `npm run test:coverage` green at 100 %.

## Risks

- **`@vitest/coverage-v8` major-version mismatch.** Vitest 4.x requires a matching coverage provider major. Pin to the same major as Vitest. If `npm install` resolves to a lower version, force-pin in `package.json`.
- **Architecture test passing for the wrong reason.** Trivially passes with zero `src/` files in the relevant folders. WP02 onwards exercises the rules. To rule out a "missing folder" false positive, the test should warn (not fail) if a folder is missing — or alternatively, fail until each folder has at least one file. Pick the warning route: a `console.warn` in the missing-folder branch is fine; it documents intent without blocking WP01.
- **Coverage threshold cascading failures.** Once 100 % is set, every later WP must land all its source files with full test coverage. This is the intent — but it means each WP needs its tests landed in the same merge as its source. WP-level definitions of done already enforce this.

## Reviewer guidance

- Pull the branch, run `npm run test:coverage`. Confirm 100 %.
- Open `test/architecture.test.ts`. Verify the rules table matches ADR-0001. Trace each regex back to a forbidden import the ADR forbids.
- Open `src/types/spicetify-platform.d.ts`. Verify it augments the namespace (does not re-declare; no `export {}` if not needed) and that the methods declared are only the ones the adapter will actually use. Anything more is over-typed for this WP.
- Confirm no `src/` files were created in the `domain/`, `ports/`, `adapters/`, `store/`, or `ui/` directories — those belong to later WPs.

## Activity Log

- 2026-06-02T16:03:56Z – claude – shell_pid=43064 – Assigned agent via action command
