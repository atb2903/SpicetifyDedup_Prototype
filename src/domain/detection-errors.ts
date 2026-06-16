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
 * produce. Kept in lock-step with data-model.md §1 — adding or removing
 * a value here breaks the UI's reason-to-message lookup table in a
 * type-checked way.
 *
 * The set is exactly the reasons the live, inline-enricher pipeline can
 * reach (ADR-0011 / ADR-0018). The abandoned Web-API enricher reasons and the
 * mislabelled catalog-rejection wrap were removed in the code-review-remediation
 * pass; each had zero live producer (see ADR-0018 for the full taxonomy delta).
 *
 * Per-reason producers (the sole reachable source of each):
 * - `'auth-token-expired'` — the tracks enumerator's `fetchPage` catch,
 *   classified via `looksLikeHostAuthExpired` (a 401 under `code`, or a
 *   "token expired" message). User needs to sign back in.
 * - `'enumerator-failed'` — the tracks enumerator's precheck / page-shape /
 *   item-shape validation, or a non-auth host rejection. Transient; retry.
 * - `'host-unavailable'` — the tracks enumerator's `requirePlatform`, thrown
 *   before any host call when the Platform / API / method is absent. Matches
 *   the removal and playlists paths' host-unavailable signal (SC-007).
 * - `'internal-error'` — the store wrapping an unexpected non-`DetectionError`
 *   throw from the scan pipeline. An honest internal fault — NOT a Spotify /
 *   catalog rejection (the live pipeline performs no catalog lookup).
 * - `'aborted'` — `AbortSignal` fired mid-scan. The store catches this and
 *   transitions the row to `idle` rather than `failed`, so it is never
 *   dispatched as a `fail` reason; it remains in the union only as a
 *   defensive UI fallback.
 */
export type DetectionErrorReason =
  | 'auth-token-expired'
  | 'enumerator-failed'
  | 'host-unavailable'
  | 'internal-error'
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
 * throw new DetectionError('internal-error', 'scan pipeline faulted', {
 *   cause: err,
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
