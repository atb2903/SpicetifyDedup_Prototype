# Phase 0 Research: Marketplace Release Readiness

All findings verified 2026-06-22 against the Spicetify Marketplace wiki, the
official Spicetify custom-apps docs, and a real published listing. The
implementer MUST re-confirm the upstream manifest schema at implementation time
in case the contract has changed.

## D1 — Marketplace discovery contract

**Decision**: The crawler discovers a custom app by (a) the GitHub topic
`spicetify-extensions` on the repository and (b) a `manifest.json` read from the
**repository root** on the default branch. No PR to `spicetify/marketplace` is
required — discovery is topic-based and automatic.

**Rationale**: The Marketplace "Submitting"/"Developing" wiki states it queries
the GitHub API for repos with the `spicetify-extensions` topic and fetches a
root `manifest.json` to render a card. Confirmed by multiple sources.

**Alternatives considered**: PR-curated list (obsolete for the tag-based flow);
a non-root manifest path (not supported by the crawler).

**Implication**: Setting the topic is a maintainer GitHub-settings action
(FR-011, C-003). The root manifest is the single discovery artifact (FR-001).

## D2 — Two manifests, distinct roles

**Decision**: Maintain two separate files:
- **Listing manifest** = root `manifest.json` (marketplace card). Fields below.
- **Install manifest** = `dist/manifest.json` produced by spicetify-creator
  (`name`, `icon`, `active-icon`, `subfiles`, `subfiles_extension`). Used at
  install time, not by the crawler.

**Rationale**: The two have different schemas and consumers. Conflating them is
the primary latent risk in this mission (FR-013, SC-005). The validator governs
only the listing manifest.

**Alternatives considered**: Reusing `dist/manifest.json` as the listing manifest
— rejected: wrong schema (no `description`/`preview`/`main`/`readme`), wrong
location (gitignored `dist/`).

## D3 — Listing manifest schema (custom app)

**Decision**: Required fields `name`, `description`, `preview`, `main`, `readme`;
optional `tags` (string[]), `authors` ({name,url}[]), `branch`. Path fields are
repo-root-relative (http(s) URLs also accepted by upstream, but this release uses
relative paths). Final values:

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

**Rationale**: Matches the documented custom-app schema and the real
`Pithaya/spicetify-apps-dist` listing (name/description/preview/readme/branch/
tags observed live). `branch` omitted → upstream defaults to the repo default
branch (`main`).

**Alternatives considered**: Including `branch: "main"` explicitly — harmless but
redundant; left out for minimalism. URL-based `main`/`preview` — rejected in
favor of in-repo tracked paths (chosen delivery, C-002).

## D4 — Built-bundle delivery (ADR candidate)

**Decision**: Commit the installable app folder to a **dedicated tracked
directory** `marketplace/dedup/` containing `index.js`, `style.css`, and the
install `manifest.json`. Keep `dist/` gitignored for dev builds. The listing
`main` → `marketplace/dedup/index.js`.

**Rationale** (user-selected in planning): clean separation between noisy dev
builds and the reviewed published artifact; the crawler/`main` needs a *tracked*
path and `dist/` is gitignored. A release/staging step copies the fresh build
output into `marketplace/dedup/`.

**Alternatives considered**:
- Un-ignore and track `dist/` — every local build dirties git; rejected.
- Separate `-dist` repo (Pithaya pattern) — overkill for a single app; rejected.
- GitHub Release asset URL for `main` — adds a release-pipeline dependency;
  rejected (chosen: in-repo).

**ADR**: Record as `.claude/adr/<NNNN>-marketplace-bundle-placement.md`.

## D5 — CSS / install mechanics for custom apps

**Decision**: The published folder must ship `index.js` **and** `style.css`
**and** the install `manifest.json` together. Spicetify auto-loads `style.css`
when the custom app registers; the JS does not (and need not) import it.

**Rationale**: Inspection of `dist/index.js` shows it neither inlines CSS nor
references `style.css`; the styles (hashed CSS-module classnames the JS uses)
live wholly in `style.css`. The custom-apps docs list `style.css` as optional
with no manual import, i.e. Spicetify injects it on registration. Therefore a
`main`-only delivery would render the app **unstyled** — the folder must be
delivered whole.

**Alternatives considered**: Inlining CSS into `index.js` via a build flag —
unnecessary and a behavior/bundling change; rejected to keep build output and app
behavior unchanged (NFR-003).

## D6 — Install is manual (affects README scope)

**Decision**: Treat the marketplace card as discovery + instructions. The README
(the manifest `readme`) must contain explicit **manual install** steps: download
the `marketplace/dedup/` folder into the Spicetify `CustomApps/` directory,
`spicetify config custom_apps spicetify-dedup`, `spicetify apply`.

**Rationale**: Upstream docs state custom apps "will need to do some manual
installation to get them working" (unlike auto-installed extensions). The README
is the user's actual install path, so it is load-bearing for SC-002/NFR-004.

**Alternatives considered**: Relying on a one-click marketplace install — not
available for custom apps; rejected.

## D7 — Validator architecture (ADR candidate)

**Decision**: A pure **listing-manifest validator** under `src/release/`:
`validateListingManifest(value: unknown): ListingManifest` throws a typed
`ListingManifestError` on malformed input; `isValidListingManifest(value): value
is ListingManifest` is the paired classifier. Filesystem path-existence is a
separate **port** `ManifestPathResolver` with a real-fs adapter and a fake, so
the pure validator stays I/O-free and the resolve-vs-missing boundary is testable
via the fake.

**Rationale**: Mirrors the established `errors.ts` / `detection-errors.ts`
fail-loud + classifier pattern and the ports/adapters layout (consistency over
novelty). Keeps the validator pure for 100% coverage; isolates fs in an adapter.

**Alternatives considered**:
- Validator that reads files directly (impure) — harder to cover boundaries;
  rejected.
- Placing tooling outside `src/` and extending coverage `include` — adds config
  surface and risks untested tooling; rejected in favor of `src/release/` already
  inside the `src/**` coverage scope. (Note: not imported by `app.tsx`, so it is
  not bundled into the app by spicetify-creator — no runtime bloat.)
- **architecture.test.ts** governs only `domain/ports/adapters/store/ui`, so
  `src/release/` is ungoverned and the test needs no change. Keeping the port +
  adapters co-located under `src/release/` (rather than `src/ports`/`src/adapters`)
  keeps all release tooling in one concern and out of the app hexagon.

**ADR**: Record as `.claude/adr/<NNNN>-listing-manifest-validator.md`.

## D8 — Release hygiene

**Decision**: Add a root `LICENSE` (MIT) with an attribution line for the
upstream `spotify-dedup` (also MIT); set `package.json` `version` to `1.0.0` and
remove `"private": true`; add `CHANGELOG.md` with a `1.0.0` entry that credits
the original project; tag the release commit `v1.0.0`. Keep the version string
consistent across `package.json`, changelog, and tag (FR-010).

**Rationale**: Standard release hygiene; MIT-on-MIT port keeps licensing
unambiguous and credits the author ethically. `private: true` would not block the
crawler but is wrong for a published package.

**Alternatives considered**: A different OSS license — rejected; matching the
upstream MIT is cleanest for a derivative. Skipping the tag — rejected; FR-010
requires version consistency anchored by a tag.

## D9 — Attribution (ethical credit)

**Decision**: Credit **José M. Pérez** and `JMPerez/spotify-dedup` as the origin
of the dedup detection algorithm in three places: the listing `authors` + the
"port of …" line in `description`; a README **Credits** section linking the
upstream repo; and a `CHANGELOG` 1.0.0 line. The `LICENSE` notes the MIT lineage.

**Rationale**: User requirement — the algorithm was ported (reverse-engineered),
and visible credit on the card + docs is the ethical and conventional move for an
MIT-derived port.

## D10 — Definition of done & crawler timing

**Decision**: DoD = (a) validator green against the real committed root manifest
with all referenced paths resolving, (b) live-client verification that a manual
install of `marketplace/dedup/` yields a working, correctly-styled Dedup app
matching pre-mission behavior, and (c) all release artifacts present/consistent
and pushed, with the GitHub topic set. The crawler's own indexing run is
explicitly out of scope/timing — no wall-clock NFR (NFR-005, C-006).

**Rationale**: The crawl is an external, asynchronous process; gating the mission
on observing the in-client card would bind us to a service schedule we don't
control (project guidance against hard time cutoffs on external services).

## D11 — Generative-AI development disclosure

**Decision**: The release discloses that it was built with **Claude Code
(Anthropic's Claude)** using the **Spec Kitty** spec-driven workflow, with
code/tests/docs generated by AI under human direction and review. The disclosure
lives in (a) a README **"Generative AI disclosure"** section and (b) a line in
the `CHANGELOG` 1.0.0 entry. Canonical wording:

> Built with Claude Code (Anthropic's Claude) using the Spec Kitty spec-driven
> workflow. Code, tests, and documentation were generated by AI under human
> direction and review.

**Rationale**: User requirement (transparency about AI authorship for a public
release). README + CHANGELOG are the user- and history-facing surfaces; the
marketplace card description is left focused on the app (disclosure not required
there) unless the user later opts to add it.

**Alternatives considered**: Disclosure only in a commit trailer / hidden file —
rejected as not user-facing. Adding it to the card `description` — optional, not
adopted by default to keep the card concise.
