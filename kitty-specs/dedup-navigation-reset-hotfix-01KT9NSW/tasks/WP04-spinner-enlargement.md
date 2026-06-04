---
work_package_id: WP04
title: Spinner enlargement for SC-2 disambiguation
dependencies: []
requirement_refs:
- FR-011
- FR-012
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-dedup-navigation-reset-hotfix-01KT9NSW
base_commit: 4b5058001d8a299ad2e28c31452a4acd97f7bf57
created_at: '2026-06-04T20:26:56.306375+00:00'
subtasks:
- T015
- T016
shell_pid: "362042"
agent: "claude:opus-4-7:implementer:implementer"
history:
- timestamp: '2026-06-04T20:07:25Z'
  actor: tasks
  note: Authored by /spec-kitty.tasks
authoritative_surface: src/ui/LoadingView.module.scss
execution_mode: code_change
mission_slug: dedup-navigation-reset-hotfix-01KT9NSW
owned_files:
- src/ui/LoadingView.module.scss
priority: P1
tags: []
---

# WP04 — Spinner enlargement for SC-2 disambiguation

## Objective

Close FR-011 and FR-012 by enlarging the loading-state spinner from 32×32 to 64×64 (with a proportional border-thickness bump from 3px to 5px). This is the static-design fix that disambiguates loading from empty at a single glance, per SC-2 and the live-verification screenshot evidence from the prior mission's `NFR-006` review.

No new motion design (per C-003 — a larger basic spinner is still a basic spinner).

## Branch Strategy

- **Planning base**: `get_library`
- **Merge target**: `get_library`
- **Execution worktree**: allocated by `finalize-tasks`.
- **Dependencies**: none. Runs in parallel with WP01/WP02/WP03/WP05.
- **Implementation entry command**: `spec-kitty agent action implement WP04 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`

## Context

### Authoritative references (READ THESE BEFORE STARTING)

1. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/spec.md`** §3 FR-011, FR-012 (the requirement and the no-regression-of-other-pairs constraint).
2. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/research.md`** §2 — the design rationale (why "enlarge spinner" was chosen over icons / layout shifts / belt-and-suspenders).
3. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/data-model.md`** §4 — the exact before/after CSS shape.
4. **Current `src/ui/LoadingView.module.scss`** — read end-to-end before editing. The `.spinner` rule currently has `width: 32px; height: 32px; border: 3px solid var(--dedup-card-hover); border-top-color: var(--dedup-button)` plus a `border-radius: 50%` and an `animation` declaration.
5. **`test/ui/LoadingView.test.tsx`** — read the existing assertion (it tests the `animation` style contains `infinite`). The size change does not affect this test; the test stays green without modification.

### Why this is its own WP

- **Surface**: a single CSS module file. Disjoint from every other WP.
- **Independence**: doesn't depend on WP01/WP02/WP03 in any way. Pure visual polish.
- **Reviewability**: visual review is its own concern, separable from code logic / docs / ADR review.

## Subtasks

### T015 — Edit `src/ui/LoadingView.module.scss`

**Purpose**: Apply the spinner-enlargement change.

**Steps**:

1. Open `src/ui/LoadingView.module.scss`.
2. Locate the `.spinner` rule.
3. Change `width: 32px` to `width: 64px`.
4. Change `height: 32px` to `height: 64px`.
5. Change `border: 3px solid var(--dedup-card-hover)` to `border: 5px solid var(--dedup-card-hover)`.
6. **Do not change** the `border-top-color`, `border-radius`, `animation`, or any other property. The motion design is unchanged (C-003).
7. **Do not** introduce new SCSS variables, mixins, or `@use`/`@import` directives. The change is two numeric edits in one block.

**Files**: `src/ui/LoadingView.module.scss`.

**Validation**:
- [ ] `.spinner` width/height = `64px`.
- [ ] `.spinner` border thickness = `5px`.
- [ ] No other properties changed.
- [ ] No new variables / mixins introduced.

### T016 — Verify global gates and the LoadingView unit test

**Purpose**: Confirm the CSS change doesn't break the runner gate or the existing test.

**Steps**:

1. `npm run test:run -- test/ui/LoadingView.test.tsx` — confirm green. (The existing assertion targets the `animation` property, which is unchanged.)
2. `npm run test:run` — full suite, confirm green.
3. `npm run test:coverage` — confirm 100/100/100/100.
4. `npm run typecheck` — confirm zero errors. (CSS-only change shouldn't affect typecheck, but run it as a sanity sweep.)
5. `npm run build` — confirm build succeeds (the SCSS is compiled into the bundle by spicetify-creator).

**Files**: none (verification only).

**Validation**:
- [ ] All five commands exit 0.
- [ ] No new visual-snapshot-style test failures (there are none in the current suite, but if any are added later this is where they'd surface).

### Live-verification screenshots (NOT part of this WP's DoD)

The post-merge live-verification artefact under `quickstart.md` §2 captures `loading-fix.png` and `empty-fix.png`. That screenshot capture happens **after** this WP merges and is the mission-level NFR-006 artefact, not a per-WP gate. Do not block WP04 on those screenshots.

If the post-merge live tuning finds 5px borders too thin or too heavy at 64×64, that's a small follow-up change (one number); it can be made as part of the live-verification sign-off step or a tiny patch PR after sign-off — it is not in scope for WP04.

## Definition of Done

- [ ] Both subtasks complete.
- [ ] `.spinner` rule updated per the contract (width/height 64px; border 5px).
- [ ] `npm run test:run`, `npm run test:coverage`, `npm run typecheck`, `npm run build` all exit 0.
- [ ] `test/ui/LoadingView.test.tsx` passes without modification.
- [ ] Commit message references FR-011 / FR-012 / SC-2.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Border thickness at 5px looks too thin at 64×64 in the live client | Acceptable initial choice per research §2; live tuning to 6px is a follow-up if needed. Do not pre-emptively choose 6px. |
| Snapshot or visual regression test exists somewhere unexpected and fails | T016's full-suite run catches it. If a snapshot fails, investigate; if the snapshot was incidentally testing the spinner size, update it as part of this WP (extend `owned_files` only if it's a snapshot file that's a sibling of LoadingView — STOP and report ownership concern otherwise). |
| Accidental edit to LoadingView.tsx or another file | Stay within `owned_files`; the only file this WP touches is `src/ui/LoadingView.module.scss`. |

## Reviewer Guidance

A reviewer of WP04 should:

1. Confirm the diff is exactly two-line `width`/`height` change + one-line `border` change, nothing else.
2. Confirm `test/ui/LoadingView.test.tsx` passes without modification.
3. Confirm no new test was added (this WP is justified by the post-merge visual evidence, not a unit test).

## When done

1. From inside the WP04 worktree: `spec-kitty agent action mark-done WP04 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`.
2. Trigger review per the project's mission flow.

## Activity Log

- 2026-06-04T20:26:57Z – claude:opus-4-7:implementer:implementer – shell_pid=362042 – Assigned agent via action command
