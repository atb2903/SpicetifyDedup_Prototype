# Phase 1 Data Model: Marketplace Release Readiness

This mission is packaging/release work; the only executable logic is the
listing-manifest validator and its path-resolver port. The "entities" below are
the artifacts and the typed shapes the validator governs.

## 1. ListingManifest (root `manifest.json`)

The marketplace card's source of truth. Typed in `src/release/listing-manifest.ts`.

| Field | Type | Required | Validation rule |
|---|---|---|---|
| `name` | string | yes | non-empty after trim |
| `description` | string | yes | non-empty after trim |
| `preview` | string | yes | non-empty; relative path or http(s) URL |
| `main` | string | yes | non-empty; relative path or http(s) URL; must end `.js` for relative paths |
| `readme` | string | yes | non-empty; relative path or http(s) URL |
| `tags` | string[] | no | if present: array of non-empty strings |
| `authors` | Author[] | no | if present: array of `{ name: non-empty string, url: http(s) URL }` |
| `branch` | string | no | if present: non-empty string |

`Author = { name: string; url: string }`.

**Structural validation** (pure, in `validateListingManifest`): value is a
non-null object; every required field present and a non-empty string; optional
fields, when present, match their type rule. Malformed → throw
`ListingManifestError` with a `reason` discriminator.

**Path-resolution validation** (via `ManifestPathResolver`, not pure): for each
relative-path field (`preview`, `main`, `readme`), the target must resolve to an
existing tracked file under the repo root. URL-valued fields skip resolution.

## 2. ListingManifestError

Typed error in `src/release/listing-manifest-error.ts`, mirroring
`PlaylistsLoaderError` / `DetectionError`.

```
type ListingManifestErrorReason =
  | 'not-an-object'
  | 'missing-required-field'
  | 'field-wrong-type'
  | 'field-empty'
  | 'main-not-js'
  | 'tags-invalid'
  | 'authors-invalid'
  | 'path-not-found';     // produced by the resolver-backed check

class ListingManifestError extends Error {
  readonly reason: ListingManifestErrorReason;
  readonly field?: string;   // which field failed, when applicable
  readonly cause?: unknown;
}
function isListingManifestError(x: unknown): x is ListingManifestError;
```

Classifier predicate for the manifest value itself:
`isValidListingManifest(value: unknown): value is ListingManifest` — returns
`true` iff `validateListingManifest` would not throw (structural only; does not
touch the filesystem).

## 3. ManifestPathResolver (port)

`src/release/manifest-path-resolver.ts`:

```
interface ManifestPathResolver {
  /** true iff the repo-root-relative path resolves to an existing file. */
  exists(relativePath: string): boolean;
}
```

- Real adapter `src/release/fs-manifest-path-resolver.ts` — node `fs` against a
  given repo root.
- Fake adapter `src/release/fake-manifest-path-resolver.ts` — constructed with a
  known set of existing paths; lets unit tests drive the present/absent boundary
  deterministically.

A composed check (test/integration layer) loads the real root `manifest.json`,
runs `validateListingManifest`, then asserts each relative path resolver-`exists`.

## 4. Built bundle (`marketplace/dedup/`)

Tracked directory holding the installable folder. Members:

| File | Source | Role |
|---|---|---|
| `index.js` | copy of build `dist/index.js` | app entry; listing `main` target |
| `style.css` | copy of build `dist/style.css` | styles; Spicetify auto-loads on register |
| `manifest.json` | copy of build `dist/manifest.json` | install manifest (name/icon/active-icon/subfiles) |

Reproducibility rule (NFR-001): contents equal a fresh `npm run build-local`
output staged into the folder; a stale bundle is a release defect.

## 5. Preview image (`preview.png`)

Committed screenshot captured from the live client (loaded list or scan-result
view). Referenced by listing `preview`. Must resolve and be a real image.

## 6. Release artifacts

| Artifact | Rule |
|---|---|
| `LICENSE` | MIT text; includes an attribution line to `JMPerez/spotify-dedup` (MIT). |
| `package.json` | `version: "1.0.0"`; no `"private": true`. |
| `CHANGELOG.md` | `1.0.0` entry summarizing released capabilities + crediting upstream. |
| `v1.0.0` git tag | marks the release commit; version string equals package + changelog (FR-010). |
| `README.md` | end-user oriented: what it does, manual install steps (D6), usage, Credits (D9), and a **Generative AI disclosure** section (D11). No prototype-status language. |
| AI disclosure | Generative-AI development disclosure (D11) present in README and CHANGELOG 1.0.0 entry. |

## 7. Invariants

- **INV-1 (two manifests):** root `manifest.json` (listing) and
  `dist/manifest.json` / `marketplace/dedup/manifest.json` (install) are distinct;
  the validator governs only the listing manifest.
- **INV-2 (tracked target):** every relative listing path resolves to a *tracked*
  file (not under gitignored `dist/`).
- **INV-3 (no behavior change):** detection/removal domain outputs and risk
  gating are byte-for-byte unchanged; existing suites stay green at 100% coverage.
- **INV-4 (version consistency):** `package.json` version == `CHANGELOG` top
  entry == git tag (`v` prefix on the tag only).
