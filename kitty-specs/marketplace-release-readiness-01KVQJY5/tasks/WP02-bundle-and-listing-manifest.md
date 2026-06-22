---
work_package_id: WP02
title: Built bundle + listing manifest + packaging
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-006
- FR-008
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-22'
subtasks:
- T008
- T009
- T010
- T011
- T012
- T013
agent: "claude:opus:reviewer:reviewer"
shell_pid: "48609"
history:
- date: '2026-06-22'
  note: Drafted by /spec-kitty.tasks.
authoritative_surface: marketplace/
execution_mode: code_change
owned_files:
- marketplace/**
- manifest.json
- .gitignore
- package.json
- .claude/adr/0022-marketplace-bundle-placement.md
priority: P1
tags: []
---

# WP02 — Built bundle + listing manifest + packaging

## Objective

Produce the artifacts the Spicetify crawler actually reads and a release-grade
`package.json`:
- a committed, installable app folder in **`marketplace/dedup/`** (`index.js` +
  `style.css` + install `manifest.json`), reproducible from `npm run build-local`;
- the **root `manifest.json`** (marketplace listing/card manifest) whose `main`
  points at the committed bundle;
- `package.json` at **`1.0.0`** with `private` removed and a `stage:marketplace`
  helper script.

Satisfies **FR-001, FR-002, FR-003, FR-006, FR-008** and invariants INV-1/INV-2
(`data-model.md`). This is the **MVP / crawl-critical** package.

Read first: `…/research.md` (D2–D5), `…/data-model.md` (§1, §4),
`…/contracts/listing-manifest.schema.json`, `…/quickstart.md` (§1–§2).

## Context — the two manifests (do not conflate)

- **Listing manifest** = `manifest.json` at the **repo root**. Marketplace card.
  Fields per `contracts/listing-manifest.schema.json`.
- **Install manifest** = `marketplace/dedup/manifest.json` (copied from
  `dist/manifest.json`). spicetify-creator's install descriptor
  (`name`/`icon`/`active-icon`/`subfiles`). The crawler does NOT read this one.
- Custom apps install **manually**; Spicetify auto-loads `style.css` on register,
  so the bundle folder must carry index.js + style.css + the install manifest
  together (research D5/D6).

## Branch Strategy

Planning/base branch: **main**. Final merge target: **main**. No dependencies;
runs in parallel with WP01. Worktree allocated per `lanes.json`.

Start with: `spec-kitty agent action implement WP02 --agent <name>`

## Subtasks

### T008 — ADR-0022: marketplace built-bundle placement

**Purpose**: Record why the published bundle lives in a dedicated tracked
`marketplace/` dir while `dist/` stays gitignored.

**Steps**: Create `.claude/adr/0022-marketplace-bundle-placement.md`: context
(crawler needs a tracked `main`; `dist/` is gitignored; user chose in-repo
delivery), decision (`marketplace/dedup/` tracked; release step copies fresh
build), rationale (no dev-build churn; explicit reviewed artifact), alternatives
rejected (un-ignore `dist/`; separate `-dist` repo; release-asset URL).

**Validation**: ADR present, follows convention.

### T009 — `.gitignore`: keep `marketplace/` tracked

**Purpose**: Ensure the published bundle is committable while dev builds aren't.

**Steps**: Confirm `dist/` stays ignored. Ensure nothing ignores `marketplace/`
(no `marketplace/` rule; no broad glob that would catch it). If a broad pattern
risks catching it, add an explicit `!marketplace/` negation. Verify with
`git check-ignore -v marketplace/dedup/index.js` returning nothing.

**Files**: `.gitignore`.
**Validation**: `git status` shows `marketplace/` files as trackable after T010.

### T010 — Build + stage the bundle

**Purpose**: Create the committed installable folder.

**Steps**:
1. `npm run build-local` (emits `dist/index.js`, `dist/style.css`,
   `dist/manifest.json`).
2. Copy those three into `marketplace/dedup/` (create the dir).
3. Commit the three files. Do **not** modify them by hand — they must equal a
   fresh build (NFR-001 reproducibility).

**Files**: `marketplace/dedup/index.js`, `marketplace/dedup/style.css`,
`marketplace/dedup/manifest.json`.
**Validation**: the three files exist and match a fresh `build-local` output.

### T011 — Author the root listing manifest

**Purpose**: The marketplace card source (FR-001/002/006).

**Steps**: Create `manifest.json` at the repo root exactly per the schema and
research D3:
```json
{
  "name": "Dedup",
  "description": "Find and remove duplicate tracks from your Liked Songs and playlists, safely, from inside Spotify. An in-client port of José M. Pérez's spotify-dedup.",
  "preview": "preview.png",
  "main": "marketplace/dedup/index.js",
  "readme": "README.md",
  "tags": ["dedup", "duplicates", "library", "playlists", "liked-songs"],
  "authors": [
    { "name": "atb2903 (port)", "url": "https://github.com/atb2903" },
    { "name": "José M. Pérez — original spotify-dedup", "url": "https://github.com/JMPerez" }
  ]
}
```
Note: `preview.png` (WP04) and `README.md` (WP03) may not exist yet — that is
fine; this manifest is *structurally* valid now, and WP04's integration test
checks path existence after all WPs merge.

**Files**: `manifest.json` (root).
**Validation**: structurally valid (see T013).

### T012 — `package.json` release fields

**Purpose**: Release-grade package metadata (FR-008).

**Steps**: Set `"version": "1.0.0"`; remove `"private": true`. Add a script
`"stage:marketplace"` that rebuilds and copies the bundle, e.g.:
`"stage:marketplace": "spicetify-creator --out=dist --minify && node -e \"…copy…\""`
(or a small documented shell one-liner). Keep existing scripts intact.

**Files**: `package.json`.
**Validation**: `npm run typecheck` still works; JSON valid.

### T013 — WP02 gate: build sanity + structural manifest check

**Steps**:
1. Re-run `npm run build-local`; diff its output against `marketplace/dedup/` —
   must be equivalent (no stale bundle).
2. Structurally validate the root `manifest.json`. If WP01 has merged into this
   lane's base, you may import `validateListingManifest`; otherwise assert the
   JSON parses and required fields are present non-empty strings and
   `main` ends `.js`. (The authoritative existence/validation gate is WP04.)
3. Confirm `git check-ignore` does not ignore `marketplace/`.

**Validation**: bundle reproducible; root manifest parses + required fields
present; `marketplace/` tracked.

## Definition of Done

- [ ] `marketplace/dedup/` holds index.js + style.css + manifest.json, reproducible
      from `npm run build-local` (FR-002, FR-003, NFR-001).
- [ ] Root `manifest.json` present with required fields + tags + authors (FR-001,
      FR-006), `main` → `marketplace/dedup/index.js`.
- [ ] `package.json` is `1.0.0`, not `private` (FR-008); `stage:marketplace` added.
- [ ] `.gitignore` keeps `dist/` ignored, `marketplace/` tracked (INV-2).
- [ ] ADR-0022 written.
- [ ] Two manifests kept distinct (INV-1) — root listing vs `marketplace/dedup/manifest.json`.

## Reviewer guidance

- Open both manifests and confirm they are the correct, distinct schemas.
- Confirm `marketplace/dedup/index.js` is the built bundle, not a stale copy
  (spot-check against a fresh build).
- Confirm `git check-ignore -v marketplace/dedup/index.js` returns nothing.
- Confirm `private` is gone and version is exactly `1.0.0`.
- The root manifest's `preview`/`readme` targets need not exist yet (WP04/WP03).

## Activity Log

- 2026-06-22T15:22:02Z – claude:opus:implementer:implementer – shell_pid=46741 – Started implementation via action command
- 2026-06-22T15:25:56Z – claude:opus:implementer:implementer – shell_pid=46741 – Ready for review: marketplace bundle + root listing manifest + 1.0.0 packaging; build reproducible, validator passes, 100% coverage
- 2026-06-22T15:26:22Z – claude:opus:reviewer:reviewer – shell_pid=48609 – Started review via action command
