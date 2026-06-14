/**
 * Typed error class for the duplicate-track removal pipeline.
 *
 * Mirrors the `DetectionError` pattern in `src/domain/detection-errors.ts`
 * so store error handling is uniform across detection and removal. Every
 * removal layer that can fail throws a `RemovalError`; callers narrow the
 * `code` field against this closed union to produce a user-facing message
 * without parsing error strings (NFR-004 fail-loud companion).
 *
 * Pure — no React, no Zustand, no Spicetify. Safe to import from any layer.
 *
 * Type placement reference: data-model.md §4.
 */

// ── §4.1 — RemovalErrorCode ──────────────────────────────────────────────────

/**
 * Closed enumeration of every failure mode the removal pipeline can produce.
 * Kept in lock-step with data-model.md §4 — adding or removing a value here
 * breaks the store's code-to-message handling in a type-checked way.
 *
 * Per-code notes:
 * - `'malformed-result'` — `computeRemoveSet` input failed `isRemovableResult`
 *   or its invariants (e.g. a group with `< 2` members, `defaultKeepIndex`
 *   not `0`, or a playlist member missing a `uid`).
 * - `'outcome-mismatch'` — `applyRemovalOutcome` received an outcome that
 *   references a track not present in the source `DetectionResult` (a stale
 *   outcome). Indicates a logic error or race; fail loud rather than silently
 *   dropping.
 * - `'executor-failed'` — the `RemovalExecutor` host call rejected. Wraps the
 *   originating rejection in `cause`.
 * - `'host-unavailable'` — `Spicetify.Platform.{LibraryAPI,PlaylistAPI}` is
 *   absent at removal time (extension loaded before the host APIs).
 * - `'stalled'` — the store's stall-ceiling fired: the executor promise neither
 *   resolved nor rejected before `STALL_CEILING_MS`. Routed through the existing
 *   non-`AbortError` catch → all-failed `partial`; distinct from `AbortError` so
 *   the user-cancel swallow branch is never taken.
 */
export type RemovalErrorCode =
  | 'malformed-result'
  | 'outcome-mismatch'
  | 'executor-failed'
  | 'host-unavailable'
  | 'stalled';

// ── §4.2 — RemovalError class ────────────────────────────────────────────────

/**
 * Typed error for removal-pipeline failures. Carries:
 * - `code` — the discriminator callers branch on (never parse `message`).
 * - `message` — human-readable description for logging / collapsed UI detail.
 * - `cause` — the originating error or value, preserved for diagnostics.
 * - `context` — optional structured payload (e.g. the offending `uri` or the
 *   requested/returned counts). Useful in error-reporting flows.
 *
 * @example
 * ```ts
 * throw new RemovalError('host-unavailable', 'PlaylistAPI not on Spicetify.Platform');
 * ```
 */
export class RemovalError extends Error {
  /** Discriminator for branching on failure mode without parsing message strings. */
  readonly code: RemovalErrorCode;

  /**
   * The originating error or value that caused this failure, if any.
   * Preserved for diagnostics; not shown to users.
   */
  readonly cause?: unknown;

  /**
   * Optional structured payload for diagnostics, e.g. the offending track URI
   * or the requested-vs-returned counts. Kept read-only to prevent mutation
   * after construction.
   */
  readonly context?: Readonly<Record<string, unknown>>;

  /**
   * @param code    - One of the `RemovalErrorCode` literals.
   * @param message - Human-readable description (shown in collapsed diagnostics).
   * @param options - Optional `cause` (originating error) and `context`
   *                  (structured payload). Both default to `undefined`.
   */
  constructor(
    code: RemovalErrorCode,
    message: string,
    options?: { cause?: unknown; context?: Readonly<Record<string, unknown>> },
  ) {
    super(message);
    this.name = 'RemovalError';
    this.code = code;
    if (options !== undefined && 'cause' in options && options.cause !== undefined) {
      this.cause = options.cause;
    }
    if (options !== undefined && 'context' in options && options.context !== undefined) {
      this.context = options.context;
    }
  }
}

// ── §4.3 — isRemovalError ────────────────────────────────────────────────────

/**
 * Classifier predicate: returns `true` iff `x` is a `RemovalError` instance.
 * Uses `instanceof` so shape-equal plain objects (that happen to have a
 * `code` field) return `false`.
 *
 * Paired with `RemovalError` per the charter Input Validation pattern so
 * callers can pre-check before narrowing without boilerplate at every site.
 *
 * @param x - Any value.
 * @returns `true` if `x` is a `RemovalError`, `false` otherwise.
 */
export function isRemovalError(x: unknown): x is RemovalError {
  return x instanceof RemovalError;
}
