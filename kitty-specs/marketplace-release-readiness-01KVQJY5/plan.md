# Implementation Plan: Marketplace Release Readiness

**Branch**: `main` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `kitty-specs/marketplace-release-readiness-01KVQJY5/spec.md`

**Branch contract**: Current branch at plan start: `main`. Planning/base branch: `main`. Final merge target: `main`. `branch_matches_target`: `true`.

## Summary

Ship the already-functional Dedup custom app as a discoverable, installable
Spicetify Marketplace listing and a genuine `1.0.0` release. Two facts from
Phase 0 research drive the whole plan:

1. **The marketplace needs a *second*, root-level `manifest.json`** in the
   listing schema (`name`, `description`, `preview`, `main`, `readme`, optional
   `tags`/`authors`/`branch`) — distinct from the spicetify-creator install
   manifest at `dist/manifest.json`.
2. **Custom apps install *manually*.** Unlike extensions, the marketplace card
   for a custom app is discovery + instructions; the user copies the built app
   folder into `CustomApps/` themselves. Spicetify auto-loads `style.css` when
   the app registers, so the published folder must carry `index.js` +
   `style.css` + install `manifest.json` together.

Concretely the mission delivers: a committed built bundle in a dedicated tracked
directory; a root listing manifest pointing at it; a pure **listing-manifest
validator** (typed error + classifier predicate, 100% covered) plus a path
resolver port; a freshly captured preview image; an end-user README rewrite with
manual-install steps and a Credits section; release hygiene (`LICENSE`, version
`1.0.0`, drop `private`, `CHANGELOG`, `v1.0.0` tag); and documented maintainer
steps for the `spicetify-extensions` GitHub topic and the push. Attribution to
the original **spotify-dedup by José M. Pérez** is carried on the card, in the
README, and in the changelog.

No dedup detection or removal behavior changes. The detection algorithm credit
and MIT lineage of the upstream project are preserved.

## Technical Context

**Language/Version**: TypeScript (strict) targeting the Spicetify/Spotify
desktop client; React 19; build via `spicetify-creator`.
**Primary Dependencies**: `spicetify-creator` (build), `vitest` + `happy-dom` +
`@testing-library/react` (test), `zustand` (app runtime — unchanged).
**Storage**: N/A (mutates the live Spotify library via Spicetify Platform APIs —
unchanged by this mission). New on-disk artifacts: committed built bundle,
root `manifest.json`, preview image, `LICENSE`, `CHANGELOG`.
**Testing**: Vitest, 100% line/branch/function/statement coverage enforced at
the runner over `src/**`. TDD: failing test first. Boundary testing for every
validation bound. Live-client verification for the install scenario.
**Target Platform**: Spotify desktop client with Spicetify; GitHub-hosted repo
(`github.com/atb2903/SpicetifyDedup`, default branch `main`) for crawler
discovery.
**Project Type**: Single project (existing hexagonal app under `src/`).
**Performance Goals**: N/A — no runtime perf change. (Per project guidance, no
wall-clock NFR is placed on the external crawler.)
**Constraints**: Marketplace crawler contract is external and must be matched
exactly (topic `spicetify-extensions` + root `manifest.json` on default branch).
Built bundle must be at a *tracked* path (not the gitignored `dist/`). Risk
boundaries (no silent mutation, confirmation gating) must remain intact.
**Scale/Scope**: One custom app, one listing, one release. New code is the
validator module + path-resolver port/adapters and their tests; everything else
is artifacts/config/docs.

## Charter Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Charter policy | How this plan complies |
|---|---|
| **TDD (DIRECTIVE_034)** — failing test first | The validator and path-resolver are built test-first; a test that loads the real committed `manifest.json` is written before the manifest is finalized and must go red→green. |
| **100% line/branch coverage (DIRECTIVE_030)** | Validator + classifier + resolver adapters live under `src/**` (the coverage scope) and are fully covered, including boundary cases per field. |
| **Boundary testing** | Each required field gets present / absent / malformed (wrong type / empty string) cases; the "path resolves vs missing" boundary is tested via the resolver port's fake. |
| **TypeScript strict** | All new modules strict; manifest shape expressed as a typed interface. |
| **Strict file-level SRP (DIRECTIVE_001)** | Separate files: manifest types, validator+classifier, error type, resolver port, real-fs adapter, fake adapter. |
| **Input validation / fail loud** | Validator throws a typed `ListingManifestError` on malformed input and ships `isValidListingManifest` classifier (FR-012). Mirrors `errors.ts` / `detection-errors.ts`. |
| **No silent library mutations / risk boundaries** | Mission touches packaging only; detection/removal and confirmation gating untouched (NFR-003, C-005). Regression guarded by the unchanged existing suites staying green. |
| **Docs: README + JSDoc + ADR (DIRECTIVE_003)** | README rewritten for end users; JSDoc on every new exported symbol; ADRs for the two load-bearing decisions (built-bundle placement; validator architecture). |
| **Architecture pattern declared** | Reuses the existing **hexagonal** layout (domain validator is pure; fs access via a port + adapter). No new pattern introduced (consistency over novelty). |
| **Exceptions: gates absolute on `main`** | No exception requested; all gates honored on `main`. |

**Result: PASS** (no violations → Complexity Tracking left empty).

## Project Structure

### Documentation (this feature)

```
kitty-specs/marketplace-release-readiness-01KVQJY5/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── listing-manifest.schema.json   # external crawler contract (JSON Schema)
│   └── validator-contract.md          # validator + resolver port signatures
└── tasks.md             # Phase 2 (created later by /spec-kitty.tasks)
```

### Source Code (repository root)

```
# New committed published artifact (dedicated tracked dir — chosen in planning)
marketplace/                 # NOT gitignored; holds the installable app folder
└── dedup/
    ├── index.js             # copied from build output
    ├── style.css            # copied from build output (Spicetify auto-loads)
    └── manifest.json        # install manifest (name/icon/active-icon/subfiles)

# New root-level release artifacts
manifest.json                # marketplace LISTING manifest (root) — main -> marketplace/dedup/index.js
LICENSE                      # MIT, with upstream attribution line
CHANGELOG.md                 # 1.0.0 entry, credits spotify-dedup
preview.png                  # fresh live-client screenshot (referenced by listing preview)
README.md                    # rewritten for end users (install + usage + Credits + AI disclosure)

# New release-tooling code — its own concern, deliberately OUTSIDE the app's
# hexagonal layers (domain/ports/adapters/store/ui), so architecture.test.ts
# (which only governs those 5 layers) does not need editing. Still under the
# src/** coverage scope, and NOT imported by app.tsx so spicetify-creator does
# not bundle it into the app.
src/release/
├── listing-manifest.ts            # typed interface for the listing manifest
├── listing-manifest-error.ts      # ListingManifestError + isListingManifestError
├── listing-manifest-validator.ts  # validate...() throws; isValidListingManifest() classifier
├── manifest-path-resolver.ts      # port: exists(relativePath) -> boolean
├── fs-manifest-path-resolver.ts   # real adapter (node fs)
└── fake-manifest-path-resolver.ts # fake adapter for unit tests

# New tests (test/** — 100% coverage)
test/release/
├── listing-manifest-validator.test.ts    # structure/required/boundary cases
├── listing-manifest-error.test.ts         # typed error + classifier
├── fs-manifest-path-resolver.test.ts
├── fake-manifest-path-resolver.test.ts
└── listing-manifest-integration.test.ts   # loads REAL root manifest.json + resolves paths via fs adapter

# Edited config / packaging
.gitignore                   # ensure marketplace/ is NOT ignored (dist/ stays ignored)
package.json                 # version 1.0.0; remove "private": true; (optional) add a "stage:marketplace" script
```

**Structure Decision**: Keep the existing single-project **hexagonal** layout for
the app, and add a separate **`src/release/`** module for release tooling. The
validator is a pure, fail-loud transform + classifier (mirroring `errors.ts` /
`detection-errors.ts`); filesystem path-existence is a **port**
(`ManifestPathResolver`) with a real-fs adapter and a fake (mirroring the
established ports/adapters pattern, kept co-located under `src/release/`).
Release tooling lives outside the app's five hexagonal layers on purpose: it is
not part of the runtime app (not imported by `app.tsx`, so not bundled), and
`architecture.test.ts` governs only `domain/ports/adapters/store/ui` — so the new
module needs no architecture-rule change. The published artifact lives in a
dedicated tracked `marketplace/` directory so the gitignored `dist/` keeps
absorbing dev-build churn while the crawler-facing bundle is an explicit,
reviewed commit. See ADR candidates in `research.md`.

## Open re-verification for implementation

- **Exact upstream manifest field names** were confirmed against the Marketplace
  wiki, the official custom-apps docs, and a live listing (`Pithaya/spicetify-apps-dist`).
  The implementer MUST re-fetch the current schema at implementation time and
  reconcile if upstream changed (recorded as a research decision, not a blocker).
- **`architecture.test.ts`** governs only `domain/ports/adapters/store/ui`
  (`layerOfPath` returns `undefined` for anything else, and only those folders are
  walked). `src/release/` is therefore ungoverned and the test needs no change.
  The implementer MUST still run the full suite and confirm it stays green; if
  any unexpected coverage gap appears for the existing "outside any known layer"
  branch, do not weaken rules — investigate.

## Complexity Tracking

*No Charter Check violations — section intentionally empty.*
