/**
 * Pure structural validator for the Spicetify Marketplace **listing manifest**
 * (root `manifest.json`), plus a paired classifier predicate. Fail-loud:
 * malformed input throws a typed `ListingManifestError` (ADR-0023, FR-012).
 *
 * Pure — no filesystem, no path resolution. Whether a relative path target
 * exists is a separate concern behind `ManifestPathResolver`. Release tooling
 * only; not imported by the app (NFR-003).
 */

import type { Author, ListingManifest } from './listing-manifest';
import { ListingManifestError } from './listing-manifest-error';

/** Required string fields, in validation order. */
const REQUIRED_FIELDS = [
  'name',
  'description',
  'preview',
  'main',
  'readme',
] as const;

/** True iff `value` is a non-null, non-array object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True iff `value` is an `http(s)` URL string. */
function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Validate one required string field: present, a string, non-empty after trim.
 * @throws ListingManifestError on absence / wrong type / emptiness.
 */
function requireString(
  obj: Record<string, unknown>,
  field: string,
): string {
  if (!(field in obj) || obj[field] === undefined) {
    throw new ListingManifestError(
      'missing-required-field',
      `listing manifest is missing required field "${field}"`,
      { field },
    );
  }
  const raw = obj[field];
  if (typeof raw !== 'string') {
    throw new ListingManifestError(
      'field-wrong-type',
      `listing manifest field "${field}" must be a string`,
      { field },
    );
  }
  if (raw.trim() === '') {
    throw new ListingManifestError(
      'field-empty',
      `listing manifest field "${field}" must be non-empty`,
      { field },
    );
  }
  return raw;
}

/** True iff `value` is a valid {@link Author} object. */
function isValidAuthor(value: unknown): value is Author {
  if (!isPlainObject(value)) return false;
  const { name, url } = value;
  if (typeof name !== 'string' || name.trim() === '') return false;
  if (typeof url !== 'string' || !isHttpUrl(url)) return false;
  return true;
}

/**
 * Structural validation only (pure, no filesystem). Returns the value typed as
 * a {@link ListingManifest} when well-formed.
 *
 * @param value - The parsed listing-manifest value (e.g. `JSON.parse` output).
 * @returns the validated, typed manifest.
 * @throws ListingManifestError when `value` is not a well-formed listing manifest.
 */
export function validateListingManifest(value: unknown): ListingManifest {
  if (!isPlainObject(value)) {
    throw new ListingManifestError(
      'not-an-object',
      'listing manifest must be a non-null object',
    );
  }

  for (const field of REQUIRED_FIELDS) {
    requireString(value, field);
  }

  // `main` must end `.js` for relative paths; URLs are exempt.
  const main = value.main as string;
  if (!isHttpUrl(main) && !main.endsWith('.js')) {
    throw new ListingManifestError(
      'main-not-js',
      'listing manifest "main" must be an http(s) URL or a relative .js path',
      { field: 'main' },
    );
  }

  if ('tags' in value && value.tags !== undefined) {
    const tags = value.tags;
    if (
      !Array.isArray(tags) ||
      !tags.every((t) => typeof t === 'string' && t.trim() !== '')
    ) {
      throw new ListingManifestError(
        'tags-invalid',
        'listing manifest "tags" must be an array of non-empty strings',
        { field: 'tags' },
      );
    }
  }

  if ('authors' in value && value.authors !== undefined) {
    const authors = value.authors;
    if (!Array.isArray(authors) || !authors.every(isValidAuthor)) {
      throw new ListingManifestError(
        'authors-invalid',
        'listing manifest "authors" must be an array of { name, http(s) url }',
        { field: 'authors' },
      );
    }
  }

  if ('branch' in value && value.branch !== undefined) {
    requireString(value, 'branch');
  }

  return value as unknown as ListingManifest;
}

/**
 * Classifier predicate — `true` iff `validateListingManifest` would not throw.
 * Never throws, even on garbage input.
 *
 * @param value - Any value.
 * @returns `true` if `value` is a well-formed listing manifest.
 */
export function isValidListingManifest(
  value: unknown,
): value is ListingManifest {
  try {
    validateListingManifest(value);
    return true;
  } catch {
    return false;
  }
}
