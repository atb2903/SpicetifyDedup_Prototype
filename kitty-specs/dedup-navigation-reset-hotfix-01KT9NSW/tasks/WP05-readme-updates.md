---
work_package_id: WP05
title: README updates (DRIFT-2, RISK-5)
dependencies: []
requirement_refs:
- FR-009
- FR-010
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T017
- T018
history:
- timestamp: '2026-06-04T20:07:25Z'
  actor: tasks
  note: Authored by /spec-kitty.tasks
authoritative_surface: README.md
execution_mode: code_change
mission_slug: dedup-navigation-reset-hotfix-01KT9NSW
owned_files:
- README.md
priority: P1
tags: []
---

# WP05 — README updates (DRIFT-2, RISK-5)

## Objective

Close FR-009 (DRIFT-2: README doesn't currently note the intentional styled-state-views) and FR-010 (RISK-5: the `--dedup-topbar-offset` CSS custom property override hook isn't documented). Two surgical README sentences, placed in the natural locations called out by the spec.

## Branch Strategy

- **Planning base**: `get_library`
- **Merge target**: `get_library`
- **Execution worktree**: allocated by `finalize-tasks`.
- **Dependencies**: none. Runs in parallel with WP01/WP02/WP03/WP04.
- **Implementation entry command**: `spec-kitty agent action implement WP05 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`

## Context

### Authoritative references (READ THESE BEFORE STARTING)

1. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/spec.md`** §3 FR-009, FR-010 — the exact placement guidance and intent.
2. **Current `README.md`** — read end-to-end before editing. Note:
   - The Dedup-page description paragraph (where FR-009's styled-state-views sentence lands — "same paragraph cluster as the existing WP01 clickable-Load-button note").
   - The customization / styling section (where FR-010's `--dedup-topbar-offset` documentation lands).
   - If the README doesn't have an obvious "customization" or "styling" section, FR-010's sentence may land in a "Configuration" section or be added as a standalone paragraph near the bottom — choose the location that's least surprising to a reader.
3. **`src/ui/DedupPage.module.scss`** — the file that defines the `--dedup-topbar-offset` custom property and its default. Confirm the default value (`110px`) and exact property name match what you document in the README (don't drift).

### Why this is its own WP

- **Surface**: README.md only. Disjoint from every other WP's owned files.
- **Independence**: doesn't depend on the code or ADR work landing. Can merge first, last, or in parallel.
- **Reviewability**: README review is a documentation read; separating it from CSS / source / ADR review keeps each review focused.

## Subtasks

### T017 — README FR-009: styled-state-views note

**Purpose**: Document that the five rendered states (idle / loading / list / empty / failed) ship with intentional visual differentiation, so users / contributors understand the design intent rather than mistaking the visual variety for inconsistency.

**Steps**:

1. Open `README.md`.
2. Locate the Dedup-page description paragraph cluster that already mentions the WP01 clickable Load button (from the prior mission). The spec calls out this cluster as the placement target.
3. Add a sentence in the same cluster, with prose that reads naturally alongside the existing copy. Suggested shape (adapt to match the surrounding tone — don't paste verbatim if the README's voice differs):
   > "The page renders five state views — idle, loading, list, empty, and failed — each with intentional visual styling so a reader can distinguish them at a glance."
4. The sentence must convey: (a) there are five states, (b) the styling differentiation is deliberate, (c) the goal is single-glance distinguishability. Exact wording is flexible.

**Files**: `README.md`.

**Validation**:
- [ ] One new sentence added in the paragraph cluster that describes the Dedup page.
- [ ] Sentence mentions the five states and the intentional-styling-for-glance-distinguishability point.
- [ ] Sentence reads naturally in context (no orphan paragraph; no broken markdown).

### T018 — README FR-010: `--dedup-topbar-offset` override documentation

**Purpose**: Document that the Load button's vertical offset is parametric via a CSS custom property, and users with a non-default-height topbar can override it in their Spicetify `user.css`.

**Steps**:

1. In `README.md`, find a styling / customization / configuration section. If none exists, add a small new section near the end of the file titled `## Customization` (or similar — match the existing heading style).
2. Add a sentence (or short paragraph) along these lines (adapt to README voice):
   > "Users whose Spotify build has a non-default topbar height (the default is 110px) can override the Load-button vertical offset by setting `--dedup-topbar-offset` in their Spicetify `user.css`."
3. The sentence must convey: (a) the property name `--dedup-topbar-offset`, (b) the default value `110px`, (c) the override location (Spicetify `user.css`), (d) why a user might want to override (non-default topbar height in their build).

**Files**: `README.md`.

**Validation**:
- [ ] One new sentence (or short paragraph) added documenting the override hook.
- [ ] The property name and default value match what's in `src/ui/DedupPage.module.scss` (cross-check before commit).
- [ ] If a new section heading was added, it matches the README's existing heading conventions (level, style, capitalization).

## Definition of Done

- [ ] Both subtasks complete.
- [ ] README diff shows two new sentences (or a sentence + short paragraph) — one for FR-009, one for FR-010.
- [ ] Property name (`--dedup-topbar-offset`) and default (`110px`) in the README match `src/ui/DedupPage.module.scss`.
- [ ] `npm run build` still succeeds (the README isn't part of the build, but a final sweep confirms nothing else broke).
- [ ] Commit message references FR-009 and FR-010.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Wrong placement for FR-009 (sentence lands far from the Dedup-page description) | Spec is explicit: "same paragraph cluster as the existing WP01 clickable-Load-button note". Find that note first, then place near it. |
| Property name or default value drift (e.g. typing `--topbar-offset` instead of `--dedup-topbar-offset`) | Cross-check `src/ui/DedupPage.module.scss` before commit. The property name is load-bearing — users will copy-paste it. |
| Adding a new section that disrupts the README's structure | If a new section is needed for FR-010, keep it short and place it where it fits the README's existing flow. If unsure, add the sentence to a footnote or existing "Notes" / "Tips" / "Configuration" section instead. |
| Markdown rendering breakage (broken links, mismatched headings) | Preview the rendered markdown after edit (most editors offer this; or check via `npx markdown-it README.md` if no preview is available). |

## Reviewer Guidance

A reviewer of WP05 should:

1. Verify FR-009's sentence is in the correct paragraph cluster (near the Dedup-page description).
2. Verify FR-010's documentation includes the correct property name and default value (cross-check against the SCSS file).
3. Confirm the README still renders cleanly (no broken markdown).
4. Confirm the additions read naturally — no orphan paragraphs, no jarring tone shifts.

## When done

1. From inside the WP05 worktree: `spec-kitty agent action mark-done WP05 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`.
2. Trigger review per the project's mission flow.
