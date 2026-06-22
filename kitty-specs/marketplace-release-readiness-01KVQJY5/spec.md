# Feature Specification: Marketplace Release Readiness

**Mission**: marketplace-release-readiness-01KVQJY5
**Created**: 2026-06-22
**Status**: Draft
**Mission type**: software-dev
**Target branch**: main

## Summary

The Dedup custom app is functionally complete inside the Spotify desktop client:
users can load their dedup-eligible collections, scan each for duplicates, and
remove duplicates per collection with confirmation gating. What is missing is
everything required to ship it as a **discoverable, installable Spicetify
Marketplace listing** and to present the repository as a genuine `1.0.0`
release rather than an in-progress prototype.

The Spicetify Marketplace crawler discovers community content by querying GitHub
for repositories carrying the `spicetify-extensions` topic and, for each one,
reading a **`manifest.json` in the repository root**. That listing manifest is a
**different file** from the spicetify-creator install manifest currently emitted
to `dist/manifest.json`: it describes the marketplace *card* (name, description,
preview image, built-bundle entry point, readme, tags) rather than the in-client
install layout. Today the repository has neither the root listing manifest, a
committed built bundle for the listing to point at, a preview image, the GitHub
topic, nor the release hygiene (`LICENSE` file, non-`private` package, `1.0.0`
version, changelog, tag) that a public release warrants.

This mission delivers all of those so that (a) the crawler can pick the
repository up unattended and render a correct card, and (b) a user who installs
the listing gets a working Dedup app whose presentation matches a real release.

## Background & Why

- **Two manifests, one repo.** spicetify-creator generates `dist/manifest.json`
  (install manifest: `name`, `icon`, `active-icon`, `subfiles`). The Marketplace
  listing requires a separate **root `manifest.json`** with marketplace fields.
  These must not be conflated.
- **The built bundle is not in the repo.** `dist/` is gitignored and untracked,
  so the marketplace `main` field (which must resolve to a reachable built `.js`)
  has nothing to point at until a built bundle is committed in this repository.
- **Discovery is topic-gated and asynchronous.** The crawler finds the repo only
  if the `spicetify-extensions` topic is present, and it runs on the
  Marketplace's own schedule — actual appearance in the in-client Marketplace is
  outside this repository's control and must not be bound to a wall-clock
  deadline.
- **Release hygiene is currently prototype-grade.** `package.json` declares
  `"license": "MIT"` but no `LICENSE` file exists; `version` is `0.1.0`;
  `private: true` is set; there are no git tags and no changelog.

## Actors

- **End user (library owner)** — installs the listing from the Marketplace and
  runs Dedup against their own Spotify library. Primary beneficiary of the
  release; reads the README and marketplace card to decide whether to install.
- **Marketplace crawler** — automated GitHub-querying agent that discovers the
  repository by topic and renders a card from the root manifest. Non-human
  consumer whose required input contract this mission must satisfy exactly.
- **Maintainer (repository owner)** — performs the GitHub-side topic change,
  cuts the versioned release/tag, and re-runs the build when shipping new
  versions. Owns steps that occur outside the codebase.

## User Scenarios & Testing

### Primary scenario — crawler discovers and renders the card

1. The repository carries the `spicetify-extensions` GitHub topic.
2. The crawler reads the root `manifest.json` and resolves every required field
   (`name`, `description`, `preview`, `main`, `readme`) to existing, reachable
   targets within the repository on the default branch.
3. The crawler renders a card showing the app name, description, preview image,
   and tags, with an install action wired to the built bundle named by `main`.

**Acceptance**: A validation of the root manifest confirms every required field
is present, well-formed, and resolves to a tracked path (or valid URL) that
exists in the repository; the preview path resolves to a committed image; the
`main` path resolves to a committed built JS bundle; the `readme` path resolves
to the committed README.

### Secondary scenario — user installs the listing and Dedup works

1. A user installs the app via the listing manifest pointed at locally.
2. The `Dedup` entry appears in the Spotify sidebar and the page renders its idle
   "Load" surface.
3. Loading, scanning, and removal behave exactly as in the current build (this
   mission changes packaging/presentation, not dedup behavior).

**Acceptance** (live-client verification, maintainer-driven): installing from the
root listing manifest yields a working Dedup app indistinguishable in behavior
from the current `dist/` build, captured as a verification artifact.

### Tertiary scenario — repository presents as a 1.0.0 release

1. A visitor lands on the repository.
2. They see a `LICENSE` file matching the declared MIT license, an end-user
   README (install + usage, not prototype status notes), a `CHANGELOG` entry for
   `1.0.0`, and `package.json` at `version: 1.0.0` without `private: true`.
3. A `v1.0.0` tag marks the release commit.

**Acceptance**: each artifact exists and is internally consistent (version
string matches across `package.json`, changelog, and tag).

### Edge cases

- **Manifest field points to a missing/untracked path** → must fail validation
  loudly (typed error + classifier predicate) rather than ship a broken card.
- **`dist/` remains gitignored** → the committed built bundle must live at a
  *tracked* path that the gitignore does not exclude; the listing must not depend
  on an ignored file.
- **Built bundle drifts from source** → the committed bundle must be reproducible
  from `npm run build-local`; a stale bundle is a release defect.
- **Preview image missing or wrong aspect/format** → manifest validation flags an
  unresolved or non-image preview before release.
- **Two manifests confused** → the root listing manifest and `dist/manifest.json`
  must remain distinct; editing one must not be assumed to affect the other.
- **Crawler never runs within the work session** → the mission's DoD is
  local-install verification plus a correct, pushed listing, NOT observed
  appearance in the in-client Marketplace.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The repository MUST contain a root-level marketplace listing `manifest.json` distinct from `dist/manifest.json`, carrying at minimum the marketplace-required fields `name`, `description`, `preview`, `main`, and `readme`. | Draft |
| FR-002 | The listing manifest's `main` field MUST resolve to a committed, tracked built JavaScript bundle in this repository (not an ignored `dist/` path). | Draft |
| FR-003 | A built bundle (JS, and any CSS the app needs) MUST be committed at a tracked path and be reproducible from the project's documented build command. | Draft |
| FR-004 | The listing manifest's `preview` field MUST resolve to a committed image captured from the current live client showing the app's UI. | Draft |
| FR-005 | The listing manifest's `readme` field MUST resolve to the repository README, which MUST be rewritten for end users (what the app does, install steps, usage) rather than describing prototype/iteration status. | Draft |
| FR-006 | The listing manifest MUST include descriptive `tags` and author attribution suitable for the marketplace card. | Draft |
| FR-007 | A `LICENSE` file matching the declared MIT license MUST exist at the repository root. | Draft |
| FR-008 | `package.json` MUST be set to version `1.0.0` and MUST NOT carry `private: true`. | Draft |
| FR-009 | A `CHANGELOG` MUST exist with a `1.0.0` entry summarizing the released capabilities. | Draft |
| FR-010 | The release commit MUST be marked with a `v1.0.0` git tag, and the version string MUST be consistent across `package.json`, the changelog, and the tag. | Draft |
| FR-011 | The repository's GitHub `spicetify-extensions` topic MUST be set (maintainer-performed step), and the spec/release docs MUST record this as a required publication step with explicit instructions. | Draft |
| FR-012 | A manifest validator MUST exist that, given the root listing manifest, fails loudly (typed error) when any required field is absent, malformed, or resolves to a non-existent tracked path, and MUST be paired with a classifier predicate so callers can pre-check validity without throwing. | Draft |
| FR-013 | The marketplace listing manifest and the spicetify-creator install manifest MUST remain separate artifacts; release documentation MUST state the role of each so they are not conflated in future maintenance. | Draft |
| FR-014 | The release MUST carry a clear generative-AI development disclosure stating the project was built with Claude Code (Anthropic's Claude) using the Spec Kitty spec-driven workflow, with code/tests/docs generated by AI under human direction and review. The disclosure MUST appear in the user-facing README and in the CHANGELOG `1.0.0` entry. | Draft |

### Non-Functional Requirements

| ID | Requirement | Threshold / Measure | Status |
|----|-------------|---------------------|--------|
| NFR-001 | The committed built bundle MUST be reproducible from source. | Re-running the documented build command produces a functionally equivalent bundle; byte-for-byte determinism is not required but the committed bundle MUST originate from the current `src/`. | Draft |
| NFR-002 | Manifest validation MUST cover every required field and every resolvable-path check with boundary cases. | 100% line and branch coverage of the validator and its classifier predicate, including the present/absent/malformed boundary for each required field (min−1 = field missing, nominal = valid, malformed = wrong type/empty). | Draft |
| NFR-003 | The release MUST NOT change dedup behavior. | Detection and removal domain logic produce identical outputs before and after the mission (no regression in existing tests; existing suites remain green at 100% line/branch coverage). | Draft |
| NFR-004 | The end-user README MUST be self-sufficient for installation. | A reader can install the app and reach the idle "Load" surface using only the README, without reading source or spec artifacts. | Draft |
| NFR-005 | Marketplace appearance MUST NOT be gated on a wall-clock deadline. | Definition of done depends on correct, pushed artifacts + local-install verification; no requirement specifies a time by which the crawler must list the app. | Draft |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | Discovery is governed by the Spicetify Marketplace crawler contract: GitHub topic `spicetify-extensions` + a root `manifest.json` read from the default branch. This contract is external and MUST be matched exactly, not reinterpreted. | Draft |
| C-002 | The `main`, `preview`, and `readme` manifest targets must be reachable on the repository's default branch (tracked paths or valid http(s) URLs); ignored or untracked files do not satisfy the crawler. | Draft |
| C-003 | Setting the GitHub topic and pushing to the public remote (`github.com/atb2903/SpicetifyDedup`) are outward-facing publication actions performed/authorized by the maintainer; the mission prepares and documents them but must not assume autonomous authority to publish. | Draft |
| C-004 | All charter gates apply on `main`: TDD with failing-test-first, 100% line/branch coverage at the runner, TypeScript strict, strict file-level SRP, JSDoc on exported functions/types, and an ADR for any load-bearing design decision (e.g., built-bundle placement strategy). | Draft |
| C-005 | The dedup app's risk boundaries (no silent library mutation, per-action delete confirmation, bulk-delete second confirmation) MUST remain intact; this mission must not weaken them while repackaging. | Draft |
| C-006 | No wall-clock NFR may bound external service behavior (crawler timing, GitHub indexing); constrain artifact correctness and UX instead. | Draft |

## Success Criteria

- **SC-001**: A fresh checkout of the default branch contains a root listing
  manifest whose every required field resolves to an existing tracked target —
  verifiable by running the manifest validator with zero failures.
- **SC-002**: A user can install the app by pointing at the root listing
  manifest and reach a working Dedup page whose load/scan/remove behavior matches
  the pre-mission build — captured as a live-verification artifact.
- **SC-003**: The repository reads as a `1.0.0` release: a license file is
  present, the README guides an end user from zero to the idle "Load" surface,
  the changelog and tag both name `1.0.0`, and no prototype-status language
  remains in user-facing docs.
- **SC-004**: The single maintainer step that cannot be done in-repo — setting
  the `spicetify-extensions` GitHub topic — is documented with exact
  instructions so the crawler can discover the repository unattended afterward.
- **SC-005**: Editing one manifest cannot silently break the other: release docs
  state the distinct roles of the listing manifest and the install manifest, and
  the validator only governs the listing manifest.
- **SC-006**: A reader of the README and the CHANGELOG can plainly see that the
  project was developed with generative AI (Claude Code) using the Spec Kitty
  workflow — the disclosure is present, unambiguous, and not buried.

## Key Entities

- **Listing manifest (`manifest.json`, repo root)** — marketplace card source of
  truth. Fields: `name`, `description`, `preview` (image path/URL), `main` (built
  JS path/URL), `readme` (path/URL), optional `tags`, `authors`, `branch`.
- **Install manifest (`dist/manifest.json`)** — spicetify-creator install
  descriptor (`name`, `icon`, `active-icon`, `subfiles`). Out of scope to change
  except where it must coexist with the listing manifest.
- **Built bundle** — committed JS (+ CSS) the listing's `main` references;
  reproducible from `src/` via the documented build.
- **Preview image** — committed screenshot of the live app referenced by
  `preview`.
- **Release artifacts** — `LICENSE`, `CHANGELOG`, `package.json` version field,
  `v1.0.0` tag.

## Assumptions

- The marketplace crawler contract is as documented on the Spicetify Marketplace
  wiki / official docs (June 2026): topic `spicetify-extensions`, root
  `manifest.json`, custom-app fields `name`/`description`/`preview`/`main`/
  `readme` required with optional `branch`/`authors`/`tags`. The plan stage will
  re-verify exact field names against current upstream before implementation.
- The built bundle will be committed inside **this** repository (chosen
  delivery), not a separate `-dist` repo nor a release-asset URL.
- The preview image will be **freshly captured** from the live client by the
  maintainer during verification, not reused from `kitty-specs/` screenshots.
- "Release ready" means the **full release pass** (license, version, changelog,
  tag, README polish), not the crawl-minimum subset.
- Definition of done = local-install verification + correct pushed artifacts; the
  crawler's own indexing run is acknowledged as out of scope/timing.
- The public remote and default branch are `github.com/atb2903/SpicetifyDedup`
  and `main` respectively; the maintainer authorizes the push and the topic
  change.

## Out of Scope

- Any change to dedup detection or removal behavior, algorithms, or risk-gating.
- Publishing via a separate `-dist` repository or a GitHub Release asset URL
  (explicitly not chosen).
- Submitting a pull request to the `spicetify/marketplace` repository (the
  current contract is topic-based auto-discovery, not a PR-curated list).
- Guaranteeing or scheduling the crawler's indexing run, or any in-client
  Marketplace appearance timing.
- Localisation/translation of the listing or README.

## Dependencies

- Spicetify Marketplace crawler contract (external; must match exactly).
- spicetify-creator build toolchain (already in `devDependencies`) to produce the
  committed bundle.
- Maintainer access to GitHub repository settings (topic) and push rights to the
  public remote.
- A running Spotify desktop client with Spicetify for live-install verification
  and the fresh preview capture.
