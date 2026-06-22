/**
 * Typed error for malformed Spicetify Marketplace **listing manifests**.
 *
 * Mirrors the `PlaylistsLoaderError` / `DetectionError` pattern in
 * `src/domain/` (closed `reason` union, `Error` subclass carrying the
 * discriminator + optional `cause`, paired `isXxxError` classifier) — see
 * ADR-0023. Release tooling only; pure — no React, no Zustand, no Spicetify,
 * no filesystem.
 */

/**
 * Closed enumeration of every failure mode the listing-manifest checks can
 * produce. Kept in lock-step with data-model.md §2 and the validator contract.
 *
 * Per-reason producers:
 * - `'not-an-object'` — value is `null`, an array, or a non-object primitive.
 * - `'missing-required-field'` — a required field is absent (`field` set).
 * - `'field-wrong-type'` — a present field has the wrong type (`field` set).
 * - `'field-empty'` — a required string field is empty/whitespace (`field` set).
 * - `'main-not-js'` — `main` is a relative path that does not end in `.js`.
 * - `'tags-invalid'` — `tags` is present but not an array of non-empty strings.
 * - `'authors-invalid'` — `authors` is present but an item is malformed.
 * - `'path-not-found'` — produced by the resolver-backed existence check (not
 *   by the pure structural validator).
 */
export type ListingManifestErrorReason =
  | 'not-an-object'
  | 'missing-required-field'
  | 'field-wrong-type'
  | 'field-empty'
  | 'main-not-js'
  | 'tags-invalid'
  | 'authors-invalid'
  | 'path-not-found';

/**
 * Typed error for listing-manifest failures. Carries:
 * - `reason` — the discriminator callers branch on (never parse `message`).
 * - `field` — which manifest field failed, when applicable.
 * - `cause` — the originating error or value, preserved for diagnostics.
 *
 * @example
 * ```ts
 * throw new ListingManifestError('field-empty', 'name must be non-empty', {
 *   field: 'name',
 * });
 * ```
 */
export class ListingManifestError extends Error {
  /** Discriminator for branching on failure mode without parsing messages. */
  readonly reason: ListingManifestErrorReason;

  /** The offending manifest field, when the failure is field-specific. */
  readonly field?: string;

  /** The originating error or value that caused this failure, if any. */
  readonly cause?: unknown;

  /**
   * @param reason  - One of the `ListingManifestErrorReason` literals.
   * @param message - Human-readable description (shown in diagnostics).
   * @param options - Optional `field` (offending field name) and `cause`
   *                  (originating error). Both default to `undefined`.
   */
  constructor(
    reason: ListingManifestErrorReason,
    message: string,
    options?: { field?: string; cause?: unknown },
  ) {
    super(message);
    this.name = 'ListingManifestError';
    this.reason = reason;
    if (options !== undefined && 'field' in options && options.field !== undefined) {
      this.field = options.field;
    }
    if (options !== undefined && 'cause' in options && options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * Classifier predicate: returns `true` iff `x` is a `ListingManifestError`
 * instance. Uses `instanceof` so shape-equal plain objects return `false`.
 *
 * @param x - Any value.
 * @returns `true` if `x` is a `ListingManifestError`, `false` otherwise.
 */
export function isListingManifestError(x: unknown): x is ListingManifestError {
  return x instanceof ListingManifestError;
}
