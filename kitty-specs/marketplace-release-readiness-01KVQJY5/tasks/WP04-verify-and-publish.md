---
work_package_id: WP04
title: Integration test, preview capture, live verification & publish handoff
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-004
- FR-010
- FR-011
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-22'
subtasks:
- T018
- T019
- T020
- T021
- T022
agent: "claude:opus:implementer:implementer"
shell_pid: "56857"
history:
- date: '2026-06-22'
  note: Drafted by /spec-kitty.tasks.
authoritative_surface: test/release/
execution_mode: code_change
owned_files:
- test/release/listing-manifest-integration.test.ts
- preview.png
- kitty-specs/marketplace-release-readiness-01KVQJY5/live-verification/**
priority: P3
tags: []
---

# WP04 — Integration test, preview capture, live verification & publish handoff

## Objective

Prove the listing is correct end-to-end and that a **manual install works in the
live Spotify client**, produce the **`preview.png`**, and document the
maintainer-only publish steps. This is the mission's definition-of-done gate.

Satisfies **FR-004** (preview), **FR-010** (tag + version consistency), **FR-011**
(GitHub topic documented), and **SC-001/SC-002**.

**This WP depends on WP01, WP02, and WP03** — its integration test imports the
WP01 validator and asserts the WP02 manifest/bundle and WP03 README exist. Run it
last, after those lanes have merged into its base.

Read first: `…/contracts/validator-contract.md` (integration check),
`…/quickstart.md` (§3 preview, §6 verify, §7 publish), and the live-verification
driver protocol in project memory.

## Branch Strategy

Planning/base branch: **main**. Final merge target: **main**. Depends on
WP01+WP02+WP03 — branch from the dependency-resolved base per `lanes.json`.

Start with: `spec-kitty agent action implement WP04 --agent <name>`

## Subtasks

### T018 — Integration test against the real artifacts

**Purpose**: Executable form of SC-001 (FR-001/002/003/004/005/012 end-to-end).

**Steps**: Create `test/release/listing-manifest-integration.test.ts`:
1. Read the **real** root `manifest.json` (repo root).
2. `validateListingManifest(parsed)` — must not throw.
3. Using `FsManifestPathResolver` bound to the repo root, assert `exists` is
   `true` for `preview`, `main`, and `readme` (relative-path fields).
4. Assert `marketplace/dedup/` contains `index.js`, `style.css`, `manifest.json`.

Keep it in `test/release/` (this single file is WP04-owned; the unit tests there
are WP01-owned). Must run within the 100% coverage suite without lowering
coverage (it exercises real files; no new production code).

**Validation**: test green against committed artifacts.

### T019 — Capture fresh `preview.png` (maintainer-driven)

**Purpose**: FR-004 — a real preview image from the live client.

**Steps** (live-verification driver protocol — agent drives, maintainer captures):
1. Ask the maintainer for any needed setup (client running? app installed?).
2. Push/restart the Spicetify client as needed via CLI on the maintainer's behalf.
3. Hand a paste-ready checklist: open Dedup → click Load → (optionally scan a
   collection) → capture a clean screenshot of the loaded list or a scan result.
4. Commit the image as **`preview.png`** at the repo root (the path the root
   manifest references).

**Validation**: `preview.png` present at repo root; resolved by T018.

### T020 — Live-client verification (manual install)

**Purpose**: SC-002 — the listing installs and works, styled, matching prior
behavior; no dedup behavior regression (NFR-003).

**Steps**:
1. Manually install `marketplace/dedup/` into `CustomApps/` per the README steps;
   `spicetify config custom_apps spicetify-dedup` + `spicetify apply`.
2. Verify the Dedup sidebar entry appears, the page renders **styled** (style.css
   auto-loaded), and Load → scan → remove behave as in the pre-mission build
   (including confirmation gating and the >25 second confirmation).
3. Capture the verification artifact (console transcript + screenshots) under
   `kitty-specs/marketplace-release-readiness-01KVQJY5/live-verification/`.

**Validation**: verification artifact committed; behavior matches prior build.

### T021 — Publish handoff doc (maintainer/outward-facing)

**Purpose**: FR-010 + FR-011 — document the steps the agent must NOT auto-perform.

**Steps**: Write a short publish doc (in the live-verification dir or a
`PUBLISHING.md` note within owned files) covering:
1. **Version consistency** check: `package.json` == `CHANGELOG` top entry == the
   `v1.0.0` tag to be created (FR-010).
2. **Tag**: `git tag v1.0.0` on the release commit, `git push origin main --tags`.
3. **GitHub topic** (FR-011): in repo Settings → Topics, add `spicetify-extensions`
   so the crawler discovers the repo. Note the crawl runs on the Marketplace's own
   schedule — appearance timing is out of scope (NFR-005, C-006).
4. State clearly: the agent prepares and documents these; the **maintainer**
   authorizes the push, tag, and topic change (C-003).

**Validation**: doc present and unambiguous; no autonomous push/tag/topic action
taken by the agent.

### T022 — WP04 gate

**Steps**: Run `npm run test:coverage` + `npm run typecheck` with the integration
test included; confirm 100% coverage holds and the full suite (incl. existing app
suites — NFR-003 regression guard) is green.

**Validation**: full suite green; integration test included.

## Definition of Done

- [ ] Integration test green: real manifest validates; preview/main/readme resolve;
      `marketplace/dedup/` complete (SC-001).
- [ ] `preview.png` captured from the live client and committed (FR-004).
- [ ] Live install verified: styled, behavior matches prior build (SC-002, NFR-003);
      artifact captured.
- [ ] Publish handoff documented: version consistency, tag, topic (FR-010, FR-011)
      — left for the maintainer to execute (C-003).
- [ ] Full coverage suite + typecheck green.

## Reviewer guidance

- Confirm the integration test reads the **real** root manifest (not a fixture)
  and asserts path existence via the fs resolver.
- Confirm `preview.png` is a genuine current screenshot, not a reused kitty-specs
  artifact.
- Confirm the live-verification artifact shows styled rendering and unchanged
  load/scan/remove behavior incl. confirmation gating.
- Confirm the agent did **not** push, tag, or change the GitHub topic — those are
  documented maintainer steps only.
- Confirm no wall-clock claim about when the crawler will list the app.

## Activity Log

- 2026-06-22T17:51:19Z – claude:opus:implementer:implementer – shell_pid=56857 – Started implementation via action command
- 2026-06-22T18:01:38Z – claude:opus:implementer:implementer – shell_pid=56857 – Live-verified (styled install + load/scan/remove + confirmation); preview.png captured; integration test green at 100%; verification + publish handoff on main
