---
work_package_id: WP01
title: Listing-manifest validator (release tooling)
dependencies: []
requirement_refs:
- FR-012
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-marketplace-release-readiness-01KVQJY5
base_commit: 153ca095d52f1cafab306b5f346380c20482c201
created_at: '2026-06-22T15:12:52.479442+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
- T007
shell_pid: "42740"
agent: "claude:opus:implementer:implementer"
history:
- date: '2026-06-22'
  note: Drafted by /spec-kitty.tasks.
authoritative_surface: src/release/
execution_mode: code_change
owned_files:
- src/release/**
- test/release/listing-manifest-validator.test.ts
- test/release/listing-manifest-error.test.ts
- test/release/fs-manifest-path-resolver.test.ts
- test/release/fake-manifest-path-resolver.test.ts
- .claude/adr/0023-release-tooling-listing-manifest-validator.md
priority: P1
tags: []
---

# WP01 — Listing-manifest validator (release tooling)

## Objective

Add the executable quality gate for the marketplace listing manifest: a **pure,
fail-loud validator** (`validateListingManifest`) with a paired **classifier
predicate** (`isValidListingManifest`), a typed **`ListingManifestError`**, and a
**`ManifestPathResolver`** port with real-`fs` and fake adapters — all under a new
`src/release/` module, at **100% line/branch/function/statement coverage**.

This satisfies **FR-012** and **NFR-002**. It does **not** change any app
behavior (**NFR-003**) — `src/release/` is release tooling, not imported by
`app.tsx`, so spicetify-creator never bundles it into the app.

Read first: `kitty-specs/marketplace-release-readiness-01KVQJY5/contracts/validator-contract.md`
and `…/data-model.md` (§1–§3). They are the authoritative shape for this WP.

## Context

- The Spicetify Marketplace reads a **root `manifest.json`** (the listing/card
  manifest) — a *different* file from the spicetify-creator install manifest. This
  validator governs only the listing manifest.
- Pattern to mirror (consistency over novelty): `src/domain/errors.ts` and
  `src/domain/detection-errors.ts` — a closed `Reason` union, an `Error` subclass
  carrying `reason`, and an `isXxxError` classifier. Match their JSDoc density and
  style.
- The validator must stay **pure** (no filesystem). Path existence is a separate
  concern behind a **port** so unit tests drive the present/absent boundary with a
  fake.
- `architecture.test.ts` only governs `domain/ports/adapters/store/ui`;
  `src/release/` is outside those, so no architecture-rule change is needed. Run
  the full suite and confirm it stays green regardless.

## Branch Strategy

Planning/base branch: **main**. Final merge target: **main**. Execution worktrees
are allocated per computed lane from `lanes.json` during `/spec-kitty.implement`;
this WP has no dependencies and can run in parallel with WP02.

Start with: `spec-kitty agent action implement WP01 --agent <name>`

## TDD discipline (required)

For every code subtask: write the failing test first, watch it fail, then
implement to green. Boundary testing is mandatory (DIRECTIVE_030/034). Do not
write implementation before its test exists.

## Subtasks

### T001 — ADR-0023: release-tooling module + validator architecture

**Purpose**: Document the load-bearing decision that release tooling lives in its
own `src/release/` module (outside the app hexagon, unbundled) and that the
listing-manifest validator follows the fail-loud-transform + classifier pattern
with a path-resolver port.

**Steps**:
1. Create `.claude/adr/0023-release-tooling-listing-manifest-validator.md`.
2. Capture: context (two-manifests problem, FR-012), decision (`src/release/`
   module; pure validator + classifier; `ManifestPathResolver` port with fs/fake
   adapters), rationale (purity → deterministic 100% coverage; isolates fs;
   mirrors `errors.ts`), consequences (ungoverned by `architecture.test.ts` by
   design; not bundled into app), alternatives rejected (impure validator;
   placing in domain/adapters).
3. Reference ADR-0001 (hexagonal) and note this module is intentionally adjacent
   to, not inside, the hexagon.

**Validation**: ADR present, follows the `.claude/adr/<NNNN>-<slug>.md`
convention, and is internally consistent with this WP.

### T002 — `ListingManifest` types

**Purpose**: The typed shape the validator returns.

**Steps**: Create `src/release/listing-manifest.ts` exporting `Author` and
`ListingManifest` exactly per `contracts/validator-contract.md` (readonly fields;
`tags?`, `authors?`, `branch?` optional). Full JSDoc on each exported type.

**Files**: `src/release/listing-manifest.ts`.
**Validation**: `npm run typecheck` clean; types match the contract.

### T003 — `ListingManifestError` + classifier (test-first)

**Purpose**: Typed error for malformed listing manifests.

**Steps**:
1. Write `test/release/listing-manifest-error.test.ts` first: construct with each
   `reason`, assert `name`, `reason`, optional `field`/`cause` preserved; assert
   `isListingManifestError` returns true for an instance and false for `null`, a
   plain `Error`, and arbitrary values.
2. Implement `src/release/listing-manifest-error.ts`: `ListingManifestErrorReason`
   union (`not-an-object` | `missing-required-field` | `field-wrong-type` |
   `field-empty` | `main-not-js` | `tags-invalid` | `authors-invalid` |
   `path-not-found`), the `ListingManifestError extends Error` class with
   `reason`, optional `field`, optional `cause`, and `isListingManifestError`.
   Mirror `errors.ts` exactly (including the `'cause' in options` guard).

**Validation**: test green; 100% coverage of this file.

### T004 — `validateListingManifest` + `isValidListingManifest` (test-first, full boundary table)

**Purpose**: The pure structural validator + classifier (FR-012).

**Steps**:
1. Write `test/release/listing-manifest-validator.test.ts` first, covering the
   **entire behavioral table** in `contracts/validator-contract.md`:
   - non-object inputs: `null`, array, string, number → `not-an-object`.
   - each required field (`name`,`description`,`preview`,`main`,`readme`):
     absent → `missing-required-field` (assert `field`); wrong type (number) →
     `field-wrong-type`; empty/whitespace string → `field-empty`. (This is the
     min−1 / nominal / malformed boundary set per field.)
   - `main` relative path not ending `.js` → `main-not-js`; `main` as
     `https://…` → accepted (no `.js` rule for URLs). Same URL acceptance for
     `preview`/`readme`.
   - `tags` present but not `string[]`, or containing an empty string →
     `tags-invalid`; absent and valid `string[]` accepted.
   - `authors` present with an item missing `name`/`url`, or `url` not http(s) →
     `authors-invalid`; absent and valid accepted.
   - fully valid object **with** and **without** each optional field → returns the
     typed `ListingManifest`.
   - `isValidListingManifest`: returns `true`/`false` and **never throws** for
     valid/invalid/garbage inputs.
2. Implement `src/release/listing-manifest-validator.ts`:
   `validateListingManifest(value: unknown): ListingManifest` (throws
   `ListingManifestError`) and `isValidListingManifest(value): value is
   ListingManifest` (try/catch around the validator, returns boolean). Keep it
   **pure** — no fs, no path resolution here.

**Validation**: test green; 100% line+branch over the validator + classifier.

### T005 — `ManifestPathResolver` port + fake adapter (test-first)

**Purpose**: Isolate filesystem path-existence behind a port; provide a fake for
deterministic boundary tests.

**Steps**:
1. Write `test/release/fake-manifest-path-resolver.test.ts` first: a fake
   constructed with a known set of existing paths returns `true` for those and
   `false` otherwise.
2. Create `src/release/manifest-path-resolver.ts` (the `ManifestPathResolver`
   interface: `exists(relativePath: string): boolean`) and
   `src/release/fake-manifest-path-resolver.ts` (constructed from a string set).

**Validation**: test green; 100% coverage of the fake.

### T006 — `fs` real path-resolver adapter (test-first)

**Purpose**: Real adapter for the integration test (WP04) and any verify script.

**Steps**:
1. Write `test/release/fs-manifest-path-resolver.test.ts` first: bind the adapter
   to a temp repo root (use `node:fs`/`os.tmpdir`), create a file, assert
   `exists` true for it and false for a missing path. Cover both branches.
2. Implement `src/release/fs-manifest-path-resolver.ts`: constructed with a repo
   root; `exists(rel)` resolves `join(root, rel)` and returns
   `fs.existsSync(...) && fs.statSync(...).isFile()` (or equivalent). JSDoc.

**Validation**: test green; 100% coverage of the adapter.

### T007 — WP01 gate

**Steps**: Run `npm run test:coverage` and `npm run typecheck`. Confirm:
- 100% across all four metrics (the runner enforces it).
- `architecture.test.ts` still green (no rule change).
- No app file changed (diff is confined to `src/release/**`, the four
  `test/release/*` unit tests, and the ADR).

## Definition of Done

- [ ] FR-012 satisfied: validator throws typed `ListingManifestError` on malformed
      input; `isValidListingManifest` classifier present and never throws.
- [ ] Full boundary table implemented and green; 100% coverage maintained.
- [ ] Port + real-fs + fake adapters present under `src/release/`.
- [ ] ADR-0023 written.
- [ ] `npm run test:coverage` and `npm run typecheck` green; architecture suite green.
- [ ] No change to app runtime behavior (no edits outside owned files).

## Reviewer guidance

- Verify the validator is pure (no `node:fs`/path import in the validator file).
- Verify every required field has present/absent/wrong-type/empty cases and that
  URL vs relative `.js` handling for `main` is tested both ways.
- Verify the classifier cannot throw (garbage input returns `false`).
- Confirm `isListingManifestError` distinguishes from plain `Error`/non-errors.
- Confirm no architecture-rule weakening and no app-layer edits.

## Activity Log

- 2026-06-22T15:12:53Z – claude:opus:implementer:implementer – shell_pid=42740 – Assigned agent via action command
- 2026-06-22T15:19:07Z – claude:opus:implementer:implementer – shell_pid=42740 – Ready for review
