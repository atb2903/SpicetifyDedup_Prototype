/**
 * Typed error class for the duplicate-track detection pipeline.
 *
 * Mirrors the `PlaylistsLoaderError` pattern in `src/domain/errors.ts`.
 * Every layer that can fail throws a `DetectionError`; the UI narrows
 * the `reason` field against this closed enum to produce a user-facing
 * message without parsing error strings.
 *
 * Pure — no React, no Zustand, no Spicetify. Safe to import from any layer.
 */

// ── §6.1 — DetectionErrorReason ──────────────────────────────────────────────

/**
 * Closed enumeration of every failure mode the detection pipeline can
 * produce. Kept in lock-step with data-model.md §6.1 — adding or removing
 * a value here breaks the UI's reason-to-message lookup table in a
 * type-checked way.
 *
 * Per-reason notes:
 * - `'auth-token-expired'` — CosmosAsync returned 401 or a "token expired"
 *   body from the catalog enricher. User needs to sign back in.
 * - `'rate-limit-unparseable'` — Spotify returned HTTP 429 but the
 *   `Retry-After` header was missing or non-numeric. Can't retry safely.
 * - `'network-failure'` — host unreachable, HTTP 5xx, or the fetch itself
 *   threw (catalog enricher or tracks enumerator).
 * - `'malformed-enrichment-payload'` — HTTP 200 but the catalog response
 *   body did not conform to the expected track shape. Likely a Spotify API
 *   change; should be reported as a bug.
 * - `'enumerator-failed'` — `LibraryAPI` or `PlaylistAPI` threw, or
 *   returned a non-page shape. Transient; user can retry.
 * - `'catalog-rejected'` — HTTP 4xx other than 401 or 429. Includes the
 *   status code in `context.statusCode`. Transient; user can retry.
 * - `'aborted'` — `AbortSignal` fired mid-scan. The store catches this and
 *   transitions the row to `idle` rather than `failed`; it is never shown
 *   to the user directly.
 */
export type DetectionErrorReason =
  | 'auth-token-expired'
  | 'rate-limit-unparseable'
  | 'network-failure'
  | 'malformed-enrichment-payload'
  | 'enumerator-failed'
  | 'catalog-rejected'
  | 'aborted';

// ── §6.2 — DetectionError class ──────────────────────────────────────────────

/**
 * Typed error for detection-pipeline failures. Carries:
 * - `reason` — the discriminator callers branch on (never parse `message`).
 * - `message` — human-readable description for logging / collapsed UI detail.
 * - `cause` — the originating error or value, preserved for diagnostics.
 * - `context` — optional structured payload (e.g. rejected HTTP status code,
 *   offending response body excerpt). Useful in error-reporting flows.
 *
 * @example
 * ```ts
 * throw new DetectionError('catalog-rejected', `Spotify rejected lookup (status 403)`, {
 *   context: { statusCode: 403 },
 * });
 * ```
 */
export class DetectionError extends Error {
  /** Discriminator for branching on failure mode without parsing message strings. */
  readonly reason: DetectionErrorReason;

  /**
   * The originating error or value that caused this failure, if any.
   * Preserved for diagnostics; not shown to users.
   */
  readonly cause?: unknown;

  /**
   * Optional structured payload for diagnostics, e.g. the rejected HTTP
   * status code or a sanitized excerpt of the offending response body.
   * Kept read-only to prevent mutation after construction.
   */
  readonly context?: Readonly<Record<string, unknown>>;

  /**
   * @param reason  - One of the `DetectionErrorReason` literals.
   * @param message - Human-readable description (shown in collapsed diagnostics).
   * @param options - Optional `cause` (originating error) and `context`
   *                  (structured payload). Both default to `undefined`.
   */
  constructor(
    reason: DetectionErrorReason,
    message: string,
    options?: { cause?: unknown; context?: Readonly<Record<string, unknown>> },
  ) {
    super(message);
    this.name = 'DetectionError';
    this.reason = reason;
    if (options !== undefined && 'cause' in options && options.cause !== undefined) {
      this.cause = options.cause;
    }
    if (options !== undefined && 'context' in options && options.context !== undefined) {
      this.context = options.context;
    }
  }
}

// ── §6.3 — isDetectionError ──────────────────────────────────────────────────

/**
 * Classifier predicate: returns `true` iff `x` is a `DetectionError`
 * instance. Uses `instanceof` so shape-equal plain objects (that happen to
 * have a `reason` field) return `false`.
 *
 * Paired with `DetectionError` per NFR-008 / charter Input Validation so
 * callers can pre-check before narrowing without boilerplate at every site.
 *
 * @param x - Any value.
 * @returns `true` if `x` is a `DetectionError`, `false` otherwise.
 *
 * @example
 * ```ts
 * if (isDetectionError(err)) {
 *   // err.reason is now DetectionErrorReason
 * }
 * ```
 */
export function isDetectionError(x: unknown): x is DetectionError {
  return x instanceof DetectionError;
}
