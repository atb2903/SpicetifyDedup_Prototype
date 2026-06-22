# Contract: Listing-manifest validator + path resolver

Internal contract for the code this mission adds. Pairs with
[`listing-manifest.schema.json`](./listing-manifest.schema.json) (the external
crawler shape) and `data-model.md`.

## Types — `src/release/listing-manifest.ts`

```ts
export interface Author {
  readonly name: string;
  readonly url: string;
}

export interface ListingManifest {
  readonly name: string;
  readonly description: string;
  readonly preview: string;
  readonly main: string;
  readonly readme: string;
  readonly tags?: readonly string[];
  readonly authors?: readonly Author[];
  readonly branch?: string;
}
```

## Error — `src/release/listing-manifest-error.ts`

```ts
export type ListingManifestErrorReason =
  | 'not-an-object'
  | 'missing-required-field'
  | 'field-wrong-type'
  | 'field-empty'
  | 'main-not-js'
  | 'tags-invalid'
  | 'authors-invalid'
  | 'path-not-found';

export class ListingManifestError extends Error {
  readonly reason: ListingManifestErrorReason;
  readonly field?: string;
  readonly cause?: unknown;
  constructor(
    reason: ListingManifestErrorReason,
    message: string,
    options?: { field?: string; cause?: unknown },
  );
}

export function isListingManifestError(x: unknown): x is ListingManifestError;
```

## Validator — `src/release/listing-manifest-validator.ts`

```ts
/**
 * Structural validation only (pure, no filesystem).
 * @throws ListingManifestError when `value` is not a well-formed listing manifest.
 */
export function validateListingManifest(value: unknown): ListingManifest;

/** Classifier predicate — true iff validateListingManifest would not throw. */
export function isValidListingManifest(value: unknown): value is ListingManifest;
```

**Behavioral contract (each is a required test case):**

| Input | Expected |
|---|---|
| non-object (null, array, string, number) | throws `not-an-object` |
| missing any of name/description/preview/main/readme | throws `missing-required-field` (`field` set) |
| required field present but wrong type | throws `field-wrong-type` (`field` set) |
| required string field empty / whitespace | throws `field-empty` (`field` set) |
| `main` is a relative path not ending `.js` | throws `main-not-js` |
| `main`/`preview`/`readme` is an http(s) URL | accepted (no `.js` rule for URLs) |
| `tags` present but not `string[]` / contains empty | throws `tags-invalid` |
| `authors` present but item missing name/url or url not http(s) | throws `authors-invalid` |
| fully valid (with and without each optional field) | returns the typed `ListingManifest` |
| `isValidListingManifest` on valid / invalid | returns `true` / `false`, never throws |

**Boundary coverage (DIRECTIVE_030 / boundary rule):** for each required field,
test the present(nominal) / absent(min−1) / malformed(wrong-type & empty) cases.
For `tags`/`authors`: absent / valid / one-bad-element. This yields 100%
line+branch over the validator and classifier.

## Path resolver — `src/release/manifest-path-resolver.ts`

```ts
export interface ManifestPathResolver {
  /** true iff the repo-root-relative path resolves to an existing file. */
  exists(relativePath: string): boolean;
}
```

- `src/release/fs-manifest-path-resolver.ts` — real node-`fs` adapter bound to a
  repo root.
- `src/release/fake-manifest-path-resolver.ts` — constructed with a known set of
  existing paths; drives the present/absent boundary in unit tests.

## Composed integration check — `test/release/listing-manifest-integration.test.ts`

1. Read the **real** root `manifest.json`.
2. `validateListingManifest` it (must not throw).
3. For each relative-path field (`preview`, `main`, `readme`): assert the fs
   adapter's `exists` returns `true`.
4. Assert `marketplace/dedup/` contains `index.js`, `style.css`, `manifest.json`.

This test is the executable form of FR-001/002/003/004/005/012 and SC-001.
