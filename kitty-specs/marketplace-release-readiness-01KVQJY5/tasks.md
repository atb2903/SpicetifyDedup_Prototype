# Tasks: Marketplace Release Readiness

**Mission**: marketplace-release-readiness-01KVQJY5
**Branch contract**: planning/base `main` · merge target `main` · `branch_matches_target: true`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Tests are **required** (charter TDD + 100% coverage). Each work package is
independently implementable; execution worktrees/lanes are allocated by
`finalize-tasks` (`lanes.json`).

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | ADR-0023: release-tooling module + listing-manifest validator architecture | WP01 | |
| T002 | `ListingManifest` types | WP01 | [P] |
| T003 | `ListingManifestError` + `isListingManifestError` (test-first) | WP01 | [P] |
| T004 | `validateListingManifest` + `isValidListingManifest` (test-first, full boundary table) | WP01 | |
| T005 | `ManifestPathResolver` port + fake adapter (test-first) | WP01 | [P] |
| T006 | `fs` real path-resolver adapter (test-first) | WP01 | |
| T007 | WP01 gate: full suite green (100% coverage + typecheck) | WP01 | |
| T008 | ADR-0022: marketplace built-bundle placement (dedicated tracked dir) | WP02 | |
| T009 | `.gitignore`: keep `marketplace/` tracked (dist/ stays ignored) | WP02 | [P] |
| T010 | Build + stage `marketplace/dedup/{index.js,style.css,manifest.json}` | WP02 | |
| T011 | Author root listing `manifest.json` (card content per contract) | WP02 | |
| T012 | `package.json`: version `1.0.0`, drop `private`, add `stage:marketplace` script | WP02 | [P] |
| T013 | WP02 gate: build sanity + structural manifest check | WP02 | |
| T014 | `LICENSE` (MIT) with spotify-dedup attribution line | WP03 | [P] |
| T015 | Rewrite `README.md` (end-user: what/why, manual install, usage, Credits, AI disclosure) | WP03 | |
| T016 | `CHANGELOG.md` 1.0.0 entry (capabilities + upstream credit + AI disclosure) | WP03 | [P] |
| T017 | Version consistency + two-manifests maintainer note in README | WP03 | |
| T018 | Integration test: real manifest validates + all paths resolve + bundle complete | WP04 | |
| T019 | Capture fresh `preview.png` from live client (maintainer-driven) | WP04 | |
| T020 | Live-client verification: manual install renders styled, behaves as before | WP04 | |
| T021 | Publish handoff doc: GitHub topic + push + `v1.0.0` tag + version consistency | WP04 | |
| T022 | WP04 gate: full suite green with integration test included | WP04 | |

---

## Phase 1 — Foundational (parallel)

### WP01 — Listing-manifest validator (release tooling)

**Goal**: Add a pure, fail-loud listing-manifest validator + classifier and a
filesystem path-resolver port (real + fake adapters), all under `src/release/`,
at 100% coverage. This is the executable quality gate for the marketplace listing
manifest (FR-012).

**Priority**: P1 (quality gate) · **Independent test**: `npm run test:coverage`
green for `src/release/**` with the boundary table; no app behavior touched.
**Prompt**: [tasks/WP01-listing-manifest-validator.md](./tasks/WP01-listing-manifest-validator.md)
**Dependencies**: none · **Est. size**: ~420 lines

- [ ] T001 ADR-0023: release-tooling module + validator architecture (WP01)
- [ ] T002 `ListingManifest` types (WP01)
- [ ] T003 `ListingManifestError` + `isListingManifestError`, test-first (WP01)
- [ ] T004 `validateListingManifest` + `isValidListingManifest`, test-first with full boundary table (WP01)
- [ ] T005 `ManifestPathResolver` port + fake adapter, test-first (WP01)
- [ ] T006 `fs` real path-resolver adapter, test-first (WP01)
- [ ] T007 WP01 gate: full suite green (100% coverage + typecheck) (WP01)

**Risks**: forgetting a boundary case breaks the 100% gate; keep the validator
pure (no fs) so coverage is deterministic. `src/release/` is outside the
architecture-test layers — confirm the suite stays green, do not edit rules.

### WP02 — Built bundle + listing manifest + packaging

**Goal**: Produce the crawler-facing artifacts: a committed installable bundle in
`marketplace/dedup/`, the root listing `manifest.json`, and release-grade
`package.json`. This is the package the Spicetify crawler actually reads.

**Priority**: P1 (crawl-critical / MVP) · **Independent test**: root
`manifest.json` is structurally valid (WP01 validator), `marketplace/dedup/` holds
index.js+style.css+manifest.json reproducible from `npm run build-local`,
`package.json` is `1.0.0` and not private.
**Prompt**: [tasks/WP02-bundle-and-listing-manifest.md](./tasks/WP02-bundle-and-listing-manifest.md)
**Dependencies**: none · **Est. size**: ~400 lines

- [ ] T008 ADR-0022: marketplace built-bundle placement (WP02)
- [ ] T009 `.gitignore` keeps `marketplace/` tracked, `dist/` ignored (WP02)
- [ ] T010 Build + stage `marketplace/dedup/{index.js,style.css,manifest.json}` (WP02)
- [ ] T011 Author root listing `manifest.json` per contract + card content (WP02)
- [ ] T012 `package.json`: version `1.0.0`, drop `private`, add `stage:marketplace` (WP02)
- [ ] T013 WP02 gate: build sanity + structural manifest check (WP02)

**Risks**: confusing the two manifests (root listing vs `marketplace/dedup/manifest.json`
install manifest); committing a stale bundle; accidentally re-adding `dist/` to git.

---

## Phase 2 — Release documentation

### WP03 — Release docs: LICENSE, README, CHANGELOG

**Goal**: Make the repo read as a 1.0.0 release: MIT `LICENSE` with upstream
attribution, an end-user `README` (manual install + usage + Credits + generative
AI disclosure), and a `CHANGELOG` 1.0.0 entry. Documents the two-manifests roles.

**Priority**: P2 · **Independent test**: a reader can install from the README
alone; version strings match `package.json`; disclosure + credits present.
**Prompt**: [tasks/WP03-release-docs.md](./tasks/WP03-release-docs.md)
**Dependencies**: WP02 (version cross-check needs `package.json` 1.0.0; install
steps reference the `marketplace/dedup/` bundle) · **Est. size**: ~320 lines

- [ ] T014 `LICENSE` (MIT) + spotify-dedup attribution line (WP03)
- [ ] T015 Rewrite `README.md` for end users (install/usage/Credits/AI disclosure) (WP03)
- [ ] T016 `CHANGELOG.md` 1.0.0 entry (capabilities + upstream credit + AI disclosure) (WP03)
- [ ] T017 Version-consistency check + two-manifests maintainer note in README (WP03)

**Risks**: leaving prototype-status language in the README; burying the AI
disclosure; version drift between changelog and package.json.

---

## Phase 3 — Verification & publish

### WP04 — Integration test, preview capture, live verification & publish handoff

**Goal**: Prove the listing is correct end-to-end and that a manual install works
in the live client; produce the preview image; document the maintainer publish
steps (GitHub topic, push, tag). This is the mission's definition-of-done gate.

**Priority**: P3 (final gate) · **Independent test**: integration test green
against the real artifacts; live-verification artifact captured; publish steps
documented.
**Prompt**: [tasks/WP04-verify-and-publish.md](./tasks/WP04-verify-and-publish.md)
**Dependencies**: WP01, WP02, WP03 · **Est. size**: ~360 lines

- [ ] T018 Integration test: real manifest validates + paths resolve + bundle complete (WP04)
- [ ] T019 Capture fresh `preview.png` from live client (maintainer-driven) (WP04)
- [ ] T020 Live-client verification: manual install renders styled + behaves as before (WP04)
- [ ] T021 Publish handoff doc: GitHub topic + push + `v1.0.0` tag + version consistency (WP04)
- [ ] T022 WP04 gate: full suite green with integration test (WP04)

**Risks**: integration test references files owned by other WPs — must run after
they merge; preview/topic/push are maintainer/outward-facing steps (do not
auto-perform); crawler appearance timing is out of scope (no wall-clock gate).

---

## Dependencies & parallelization

```
WP01 ─┐
WP02 ─┼─> WP03 (needs WP02) ─┐
      └───────────────────────┴─> WP04 (needs WP01, WP02, WP03)
```

- **Parallel**: WP01 ∥ WP02 (disjoint files, no shared compile surface).
- **MVP / crawl-critical**: WP02 (root manifest + committed bundle + topic) is the
  minimal artifact set the crawler reads; WP01 is its quality gate.
- **Final gate**: WP04 (must run last; depends on all).

## Ownership map (no overlaps)

| WP | execution_mode | owned_files |
|----|----------------|-------------|
| WP01 | code_change | `src/release/**`, `test/release/listing-manifest-validator.test.ts`, `test/release/listing-manifest-error.test.ts`, `test/release/fs-manifest-path-resolver.test.ts`, `test/release/fake-manifest-path-resolver.test.ts` |
| WP02 | code_change | `marketplace/**`, `manifest.json`, `.gitignore`, `package.json` |
| WP03 | code_change | `LICENSE`, `README.md`, `CHANGELOG.md` |
| WP04 | code_change | `test/release/listing-manifest-integration.test.ts`, `preview.png`, `kitty-specs/marketplace-release-readiness-01KVQJY5/live-verification/**` |

ADRs are written to gitignored `.claude/adr/` (ADR-0022, ADR-0023) and are not
tracked, so they are not part of `owned_files`.
