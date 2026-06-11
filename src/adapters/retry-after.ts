/**
 * Standalone `Retry-After` HTTP header parser.
 *
 * Layer: `src/adapters/` — no domain or port imports needed; this module is
 * a pure utility consumed by `SpicetifyCatalogEnricher` (WP05).
 *
 * Follows the charter Input Validation pattern (NFR-008):
 * - `parseRetryAfter` throws `RetryAfterParseError` on malformed input.
 * - `isRetryAfterParseError` is the paired classifier predicate so callers can
 *   pre-check without `try`/`catch`.
 *
 * Architecture constraint (`test/architecture.test.ts`):
 * `src/adapters/` must not import from `src/store/` or `src/ui/`.
 *
 * Research reference:
 * `kitty-specs/duplicate-track-detection-01KTFH5H/research.md` §R-009.
 */

// ---------------------------------------------------------------------------
// RetryAfterParseError
// ---------------------------------------------------------------------------

/**
 * Thrown by `parseRetryAfter` when the supplied `Retry-After` header value
 * cannot be interpreted as a valid non-negative delay.
 *
 * Carries the raw header value (or `undefined` if the header was absent) so
 * callers can include it in diagnostic messages without re-parsing.
 */
export class RetryAfterParseError extends Error {
  /** The raw header value that could not be parsed. `undefined` when the header was absent. */
  readonly headerValue: string | undefined;

  constructor(headerValue: string | undefined, message: string) {
    super(message);
    this.name = 'RetryAfterParseError';
    this.headerValue = headerValue;
  }
}

// ---------------------------------------------------------------------------
// isRetryAfterParseError — classifier predicate
// ---------------------------------------------------------------------------

/**
 * Returns `true` iff `x` is a `RetryAfterParseError` instance.
 *
 * Paired with `parseRetryAfter` per NFR-008 / charter Input Validation so
 * callers (e.g. `SpicetifyCatalogEnricher`) can pre-check or narrow a caught
 * value without `instanceof` boilerplate at every catch site.
 */
export function isRetryAfterParseError(x: unknown): x is RetryAfterParseError {
  return x instanceof RetryAfterParseError;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Regex for a strict decimal number: optional leading sign, digits, optional
 * decimal point with trailing digits. Rejects scientific notation (`1e3`),
 * whitespace-only, and other non-decimal forms that `Number()` would accept.
 *
 * Whitespace around the value is trimmed before testing, matching HTTP
 * header laxness (RFC 7230 §3.2.6 allows optional whitespace).
 */
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

// ---------------------------------------------------------------------------
// parseRetryAfter
// ---------------------------------------------------------------------------

/**
 * Parse a `Retry-After` HTTP header into a millisecond delay.
 *
 * **Accepted forms** (per RFC 7231 §7.1.3 and research §R-009):
 * - **Integer seconds** (`'0'` … `'86400'`): returned as `n * 1000` ms.
 * - **Fractional seconds** (`'0.5'`, `'1.25'`): returned as
 *   `Math.ceil(n * 1000)` ms — rounds *up* to the nearest ms so the client
 *   never retries earlier than the server requested.
 * - **RFC-7231 HTTP-date** (`'Mon, 06 Jun 2026 13:00:00 GMT'`): parsed via
 *   `Date.parse()`; returned as `Math.max(0, date − now())`. Past dates
 *   clamp to 0 ms.
 *
 * **Rejected forms** → throws `RetryAfterParseError`:
 * - `undefined` (header absent).
 * - Empty string `''`.
 * - Negative numbers (`'-1'`, `'-0.5'`).
 * - Scientific notation (`'1e3'`).
 * - Non-numeric non-date strings (`'abc'`, `'not a date'`).
 *
 * @param headerValue - The raw `Retry-After` header string, or `undefined`
 *   when the header is absent.
 * @param now - Injectable clock returning the current UTC epoch in ms.
 *   Defaults to `Date.now`. Used by the HTTP-date branch; pass a deterministic
 *   function in tests to avoid real-time dependencies.
 *
 * @returns Delay in milliseconds (non-negative integer).
 *
 * @throws `RetryAfterParseError` when `headerValue` is `undefined`, empty,
 *   negative, scientific notation, or not a valid numeric/date string.
 */
export function parseRetryAfter(
  headerValue: string | undefined,
  now: () => number = Date.now,
): number {
  // 1. Reject missing header.
  if (headerValue === undefined) {
    throw new RetryAfterParseError(
      undefined,
      'Retry-After header is absent',
    );
  }

  // 2. Trim optional HTTP whitespace before any further checks.
  const trimmed = headerValue.trim();

  // 3. Reject empty string (after trim).
  if (trimmed === '') {
    throw new RetryAfterParseError(
      headerValue,
      'Retry-After header is empty',
    );
  }

  // 4. Try strict decimal parse first (integer or fractional).
  //    DECIMAL_RE rejects scientific notation, whitespace-only, and non-numeric
  //    non-decimal strings that Number() would silently accept.
  if (DECIMAL_RE.test(trimmed)) {
    const n = Number(trimmed);

    // Reject negative values (includes -0 edge case — Math.sign(-0) === 0,
    // but Number('-0') === 0 which is non-negative; "-0" passes the regex
    // as "-0" and Number('-0') === -0. Object.is(-0, 0) === false but
    // -0 >= 0 is true in JS. Since -0 means "no wait", treat it as 0.
    if (n < 0) {
      throw new RetryAfterParseError(
        headerValue,
        `Retry-After value must be non-negative, got: ${headerValue}`,
      );
    }

    if (Number.isInteger(n)) {
      // Integer seconds path: exact conversion.
      return n * 1000;
    } else {
      // Fractional seconds path: round up to avoid retrying too early.
      return Math.ceil(n * 1000);
    }
  }

  // 5. Try HTTP-date parse (RFC-7231 IMF-fixdate).
  //    Date.parse returns NaN for unrecognised strings.
  const dateParsed = Date.parse(trimmed);
  if (Number.isFinite(dateParsed)) {
    // Clamp past dates to 0 ms.
    return Math.max(0, dateParsed - now());
  }

  // 6. Nothing matched — reject loudly.
  throw new RetryAfterParseError(
    headerValue,
    `Retry-After value is not a valid integer, fractional second, or HTTP-date: ${headerValue}`,
  );
}
