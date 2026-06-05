---
work_package_id: WP01
title: Click-log helper foundation + ADR
dependencies: []
requirement_refs:
- FR-003
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-dedup-button-per-playlist-row-01KTC3GY
base_commit: b4c68d6192244295b3661fa02ddedf95b190f100
created_at: '2026-06-05T20:04:40.136600+00:00'
subtasks:
- T001
- T002
- T003
- T004
shell_pid: '441905'
history:
- date: '2026-06-05'
  note: Drafted by /spec-kitty.tasks.
authoritative_surface: src/ui/dedup-click-log.ts
execution_mode: code_change
mission_id: 01KTC3GY1VM87DPV0SEDQS24NE
mission_slug: dedup-button-per-playlist-row-01KTC3GY
owned_files:
- src/ui/dedup-click-log.ts
- test/ui/dedup-click-log.test.ts
- .claude/adr/0006-console-only-dedup-click-confirmation.md
priority: P1
tags: []
---

# WP01 — Click-log helper foundation + ADR

## Objective

Land the pure side-effecting helper `logDedupClick(name, uri): void` in its own file under `src/ui/`, with full coverage and an ADR documenting the temporary diagnostic-console choice. This is the foundation for WP02 (the button calls this helper) and the only spec requirement satisfied entirely at this layer is FR-003 (log format). The ADR satisfies C-007 and `DIRECTIVE_003`.

## Context

- **Spec**: `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/spec.md`. Requirements addressed: FR-003 (log format), C-001 (single side effect per call), C-002 (no runtime deps), C-003 (file-level SRP), C-006 (black-box test posture), C-007 (ADR).
- **Plan**: `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/plan.md` §Summary, §Phase 1 Design.
- **Research**: `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/research.md` Decision 2 (helper file lives at `src/ui/dedup-click-log.ts`) and Decision 6 (ADR scope).
- **Data model**: `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/data-model.md` §2 (`logDedupClick` signature, JSDoc text, edge-case test fixture).
- **Architectural rule**: `test/architecture.test.ts` L69–74 forbids `src/ui/` from importing `src/adapters/` or `src/ports/`. This helper imports nothing — pure TS + `console.log`.

## Branch strategy

- Planning/base branch: `main`.
- Merge target: `main`.
- Execution worktree: per the lane computed by `spec-kitty agent mission finalize-tasks`. Read `lanes.json` (or rely on the implement command's resolver) to determine the workspace path and branch for this WP.
- Do NOT commit to `main` directly. Commit inside the lane worktree.

## Implementation command

```bash
spec-kitty agent action implement WP01 --agent <name>
```

(No dependencies — WP01 starts immediately.)

## Detailed guidance per subtask

### Subtask T001 — Write failing tests for `logDedupClick`

**Purpose**: TDD RED step. Three tests in `test/ui/dedup-click-log.test.ts` covering the verbatim-passthrough format (FR-003) for ASCII, empty name, and mixed-special inputs.

**Steps**:

1. Create `test/ui/dedup-click-log.test.ts`. Imports:
   ```ts
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { logDedupClick } from '../../src/ui/dedup-click-log';
   ```
2. Set up a spy on `console.log` in `beforeEach`, restore in `afterEach`:
   ```ts
   let logSpy: ReturnType<typeof vi.spyOn>;
   beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
   afterEach(() => { logSpy.mockRestore(); });
   ```
3. Three tests inside `describe('logDedupClick', () => { ... })`:
   - `it('emits [Dedup] clicked: <name> (<uri>) for an ASCII playlist', ...)` — `logDedupClick('My Playlist', 'spotify:playlist:abc')` → assert `logSpy` was called exactly once with the single string `'[Dedup] clicked: My Playlist (spotify:playlist:abc)'`. Use `expect(logSpy).toHaveBeenCalledTimes(1)` and `expect(logSpy).toHaveBeenCalledWith('[Dedup] clicked: My Playlist (spotify:playlist:abc)')`.
   - `it('emits the verbatim format when name is empty', ...)` — `logDedupClick('', 'spotify:playlist:xyz')` → expect the call string `'[Dedup] clicked:  (spotify:playlist:xyz)'` (note: TWO spaces between `clicked:` and `(`, because the format is `[Dedup] clicked: <name> (<uri>)` and `<name>` is empty).
   - `it('emits the verbatim format when name has quotes and emoji', ...)` — `logDedupClick('has "quotes" and 🎵', 'spotify:playlist:special')` → expect `'[Dedup] clicked: has "quotes" and 🎵 (spotify:playlist:special)'`.

**Files**:
- `test/ui/dedup-click-log.test.ts` (new, ~50 lines).

**Validation**:
- [ ] `npm run test:run -- test/ui/dedup-click-log.test.ts` fails with a module-not-found error (the helper file doesn't exist yet). This is the RED state.
- [ ] No other test files modified.

### Subtask T002 — Implement `src/ui/dedup-click-log.ts`

**Purpose**: TDD GREEN step. Implement the smallest possible code that makes T001 pass.

**Steps**:

1. Create `src/ui/dedup-click-log.ts`:
   ```ts
   /**
    * Emit a single confirmation line to the dev console identifying which
    * playlist row's Dedup button was activated.
    *
    * Format (FR-003): `[Dedup] clicked: <name> (<uri>)`. Name and URI are
    * passed verbatim — no escaping, no truncation, no trimming. Empty or
    * whitespace-only names are written through as-is per the spec's edge
    * cases.
    *
    * One side effect per call: a single `console.log`. Synchronous, no
    * return value, no error path (FR-007, C-001). The temporary diagnostic
    * surface that ADR-0006 covers; a future mission replaces this body
    * without changing the signature.
    */
   export function logDedupClick(name: string, uri: string): void {
     console.log(`[Dedup] clicked: ${name} (${uri})`);
   }
   ```
2. Confirm the file imports nothing — no React, no Spicetify, no adapters, no ports. This satisfies `test/architecture.test.ts` rules for `src/ui/`.

**Files**:
- `src/ui/dedup-click-log.ts` (new, ~20 lines including JSDoc).

**Validation**:
- [ ] `npm run test:run -- test/ui/dedup-click-log.test.ts` passes all 3 tests. GREEN state.
- [ ] `npm run typecheck` (or `tsc --noEmit` per the project default) succeeds.
- [ ] `npm run test:run -- test/architecture.test.ts` still passes (no new architecture violations).

### Subtask T003 — Verify coverage 100%/100% on the helper

**Purpose**: Lock in NFR-004 / SC-004 for this file.

**Steps**:

1. Run: `npm run test:coverage -- --include='src/ui/dedup-click-log.ts'`. If the project's coverage script does not accept include filters, run the full coverage and inspect the row for `src/ui/dedup-click-log.ts`.
2. Confirm the report shows 100% line and 100% branch on `src/ui/dedup-click-log.ts`. Capture the relevant line of the coverage table into the WP commit message body.
3. If coverage is below 100%, identify the uncovered line/branch and add a test for it. The helper has one statement and zero branches, so anything below 100% indicates a test setup bug, not missing coverage.

**Validation**:
- [ ] Coverage report row for `src/ui/dedup-click-log.ts`: `100 | 100 | 100 | 100` (statements | branches | functions | lines).
- [ ] CI coverage thresholds at `vitest.config.ts:19-25` still pass for the project.

### Subtask T004 — Write ADR `0006-console-only-dedup-click-confirmation.md`

**Purpose**: Satisfy spec C-007 and charter `DIRECTIVE_003`. Document *why* the click handler logs to the dev console instead of providing user-visible feedback.

**Steps**:

1. Read an existing ADR for the project's house style: `.claude/adr/0005-react-lifecycle-reset.md` (most recent).
2. Create `.claude/adr/0006-console-only-dedup-click-confirmation.md` with sections:
   - **Title** (`# ADR-0006 — Console-only Dedup click confirmation`).
   - **Status** (`Accepted — 2026-06-05`).
   - **Context**: one paragraph. This mission ships the Dedup button's UI affordance without any real deduplication behaviour. FR-003 requires the click handler to emit a diagnostic line to the dev console. The spec's risk boundary forbids any silent library mutation; pairing that with the no-real-behaviour scope means the only acceptable click effect today is an observable signal (developer-visible) that proves wiring is correct.
   - **Decision**: one paragraph. Wire `<DedupButton>`'s click to `logDedupClick(name, uri)` which writes `[Dedup] clicked: <name> (<uri>)` to `console.log`. No toast, no modal, no host API call. The signature `logDedupClick(name: string, uri: string): void` is intentionally chosen so the next mission can replace the body with a confirmation flow without changing call sites.
   - **Alternatives considered**: one paragraph each (or a tight list). (a) Toast / modal — rejected because user-visible feedback for a non-functional button is misleading. (b) No feedback at all — rejected because the wiring-proof goal needs an observable signal. (c) Project-wide logger abstraction — rejected per research §2 (one consumer, replaced next mission).
   - **Consequences**: one paragraph. Future mission (real dedup) replaces the body of `logDedupClick` with the confirmation flow; the helper's signature is the seam. Tests for the diagnostic line live in `test/ui/dedup-click-log.test.ts` and are replaced wholesale when the mission lands. The ADR remains as the historical record.
   - **References**: bullet list pointing at this mission's spec C-007, plan §Charter Check, research Decision 2 and Decision 6.

**Files**:
- `.claude/adr/0006-console-only-dedup-click-confirmation.md` (new, ~80 lines).

**Validation**:
- [ ] ADR file present at the canonical path.
- [ ] All five sections present.
- [ ] Cross-links to spec C-007, plan, and research Decisions 2 and 6 included.
- [ ] No claim that the next mission's behaviour is already implemented (the ADR is forward-looking).

## Definition of Done

- [ ] `src/ui/dedup-click-log.ts` exists, exports `logDedupClick(name: string, uri: string): void`, contains the JSDoc described in `data-model.md §2`.
- [ ] `test/ui/dedup-click-log.test.ts` exists with the 3 cases above, all green.
- [ ] `npm run test:run` overall passes (no regressions to other suites).
- [ ] `npm run test:coverage` reports 100% line / 100% branch on `src/ui/dedup-click-log.ts`.
- [ ] `.claude/adr/0006-console-only-dedup-click-confirmation.md` exists with all five sections and cross-links.
- [ ] Architecture test (`test/architecture.test.ts`) still passes.
- [ ] WP committed inside the lane worktree per spec-kitty's git workflow.

## Risks

- **Hidden newline / trailing space**: the spec's edge cases assert verbatim passthrough. Use `toBe` exact-equality. Avoid `toContain`.
- **Coverage thresholds drift**: do NOT lower `vitest.config.ts` thresholds to make a test pass. If a threshold would otherwise fail, the implementation is missing coverage; add the test.
- **ADR phrasing leaks behaviour**: keep the ADR scoped to the diagnostic-console choice. Do not promise specific behaviour for the future mission; say only that the signature is the replacement seam.

## Reviewer guidance

- Confirm `src/ui/dedup-click-log.ts` imports nothing.
- Confirm `test/ui/dedup-click-log.test.ts` uses exact-equality (`toBe` / `toHaveBeenCalledWith`) and restores the spy.
- Confirm ADR-0006 follows the project's existing ADR house style and cross-links the spec.
- Confirm coverage is 100/100 on the helper file from the captured coverage output.
- Confirm no changes to `src/ports/`, `src/adapters/`, `src/domain/`, `src/store/`, or `package.json`.

## WHEN DONE

After all DoD items are green and committed inside the lane worktree:

```bash
spec-kitty agent action implement-done WP01 --agent <name> --mission dedup-button-per-playlist-row-01KTC3GY
```

This signals review-ready. Do not stop short.
