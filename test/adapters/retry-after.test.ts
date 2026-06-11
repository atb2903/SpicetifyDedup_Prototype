/**
 * Unit tests for `src/adapters/retry-after.ts`.
 *
 * TDD order: tests written first (WP03/T010), then implementation.
 * Covers every boundary row from the WP03 spec table and the
 * data-model §9 boundary obligations.
 */
import { describe, it, expect } from 'vitest';
import {
  parseRetryAfter,
  RetryAfterParseError,
  isRetryAfterParseError,
} from '../../src/adapters/retry-after';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a UTC ISO string to a millisecond epoch timestamp, used to supply
 * the deterministic `now` callback without vi.useFakeTimers().
 */
function ms(iso: string): number {
  return new Date(iso).getTime();
}

// ---------------------------------------------------------------------------
// RetryAfterParseError — class shape
// ---------------------------------------------------------------------------

describe('RetryAfterParseError', () => {
  it('is an instance of Error', () => {
    const err = new RetryAfterParseError('bad', 'test message');
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to RetryAfterParseError', () => {
    const err = new RetryAfterParseError('bad', 'msg');
    expect(err.name).toBe('RetryAfterParseError');
  });

  it('exposes headerValue', () => {
    const err = new RetryAfterParseError('foo', 'msg');
    expect(err.headerValue).toBe('foo');
  });

  it('exposes headerValue when undefined', () => {
    const err = new RetryAfterParseError(undefined, 'msg');
    expect(err.headerValue).toBeUndefined();
  });

  it('exposes message', () => {
    const err = new RetryAfterParseError('bar', 'custom message');
    expect(err.message).toBe('custom message');
  });
});

// ---------------------------------------------------------------------------
// isRetryAfterParseError — classifier predicate
// ---------------------------------------------------------------------------

describe('isRetryAfterParseError', () => {
  it('returns true for a RetryAfterParseError instance', () => {
    const err = new RetryAfterParseError('abc', 'msg');
    expect(isRetryAfterParseError(err)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isRetryAfterParseError(new Error('plain'))).toBe(false);
  });

  it('returns false for a plain object', () => {
    expect(isRetryAfterParseError({ headerValue: '1', message: 'msg' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRetryAfterParseError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRetryAfterParseError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRetryAfterParseError('RetryAfterParseError')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseRetryAfter — throws on invalid input
// ---------------------------------------------------------------------------

describe('parseRetryAfter — throws on invalid input', () => {
  it('throws RetryAfterParseError for undefined', () => {
    expect(() => parseRetryAfter(undefined)).toThrow(RetryAfterParseError);
  });

  it('throws RetryAfterParseError for empty string', () => {
    expect(() => parseRetryAfter('')).toThrow(RetryAfterParseError);
  });

  it('exposes the headerValue on the thrown error for undefined', () => {
    let caught: unknown;
    try { parseRetryAfter(undefined); } catch (e) { caught = e; }
    expect(isRetryAfterParseError(caught)).toBe(true);
    expect((caught as RetryAfterParseError).headerValue).toBeUndefined();
  });

  it('exposes the headerValue on the thrown error for empty string', () => {
    let caught: unknown;
    try { parseRetryAfter(''); } catch (e) { caught = e; }
    expect(isRetryAfterParseError(caught)).toBe(true);
    expect((caught as RetryAfterParseError).headerValue).toBe('');
  });

  it('throws for negative integer (-1)', () => {
    expect(() => parseRetryAfter('-1')).toThrow(RetryAfterParseError);
  });

  it('throws for negative fractional (-0.5)', () => {
    expect(() => parseRetryAfter('-0.5')).toThrow(RetryAfterParseError);
  });

  it('throws for non-numeric non-date string (abc)', () => {
    expect(() => parseRetryAfter('abc')).toThrow(RetryAfterParseError);
  });

  it('throws for scientific notation (1e3) — strict numeric parse required', () => {
    // Number('1e3') === 1000, but we do not accept scientific notation.
    expect(() => parseRetryAfter('1e3')).toThrow(RetryAfterParseError);
  });

  it('throws for malformed date string', () => {
    expect(() => parseRetryAfter('not a date')).toThrow(RetryAfterParseError);
  });

  it('exposes headerValue for non-numeric input', () => {
    let caught: unknown;
    try { parseRetryAfter('abc'); } catch (e) { caught = e; }
    expect(isRetryAfterParseError(caught)).toBe(true);
    expect((caught as RetryAfterParseError).headerValue).toBe('abc');
  });
});

// ---------------------------------------------------------------------------
// parseRetryAfter — integer seconds path
// ---------------------------------------------------------------------------

describe('parseRetryAfter — integer seconds', () => {
  it('returns 0 ms for "0" (boundary: don\'t wait)', () => {
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('returns 1000 ms for "1" (nominal lower edge)', () => {
    expect(parseRetryAfter('1')).toBe(1000);
  });

  it('returns 3_600_000 ms for "3600" (nominal upper)', () => {
    expect(parseRetryAfter('3600')).toBe(3_600_000);
  });

  it('returns 86_400_000 ms for "86400" (large upper bound)', () => {
    expect(parseRetryAfter('86400')).toBe(86_400_000);
  });

  it('handles leading/trailing whitespace (HTTP header laxness)', () => {
    // HTTP headers can include optional whitespace; we trim before parsing.
    expect(parseRetryAfter(' 5 ')).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// parseRetryAfter — fractional seconds path
// ---------------------------------------------------------------------------

describe('parseRetryAfter — fractional seconds', () => {
  it('returns 500 ms for "0.5"', () => {
    expect(parseRetryAfter('0.5')).toBe(500);
  });

  it('returns 1250 ms for "1.25"', () => {
    expect(parseRetryAfter('1.25')).toBe(1250);
  });

  it('rounds up to nearest ms (Math.ceil)', () => {
    // 0.001 s = 1 ms; 0.0011 s = 1.1 ms → ceil → 2 ms
    expect(parseRetryAfter('0.0011')).toBe(2);
  });

  it('rounds up exactly at half-ms boundary', () => {
    // 0.5005 s = 500.5 ms → ceil → 501 ms
    expect(parseRetryAfter('0.5005')).toBe(501);
  });
});

// ---------------------------------------------------------------------------
// parseRetryAfter — HTTP-date path
// ---------------------------------------------------------------------------

describe('parseRetryAfter — HTTP-date (RFC-7231 IMF-fixdate)', () => {
  const nowMs = ms('2026-06-06T12:00:00Z'); // 1749211200000
  const nowFn = () => nowMs;

  it('returns 3_600_000 ms for a date 1 hour in the future', () => {
    // Mon, 06 Jun 2026 13:00:00 GMT = now + 3600 s
    const header = 'Mon, 06 Jun 2026 13:00:00 GMT';
    expect(parseRetryAfter(header, nowFn)).toBe(3_600_000);
  });

  it('clamps to 0 ms for a date 1 hour in the past', () => {
    // Mon, 06 Jun 2026 11:00:00 GMT = now - 3600 s → clamped to 0
    const header = 'Mon, 06 Jun 2026 11:00:00 GMT';
    expect(parseRetryAfter(header, nowFn)).toBe(0);
  });

  it('returns 0 ms for a date exactly equal to now', () => {
    const header = 'Mon, 06 Jun 2026 12:00:00 GMT';
    expect(parseRetryAfter(header, nowFn)).toBe(0);
  });

  it('uses Date.now() when no now callback is provided (smoke check — non-zero for future date)', () => {
    // 1 Jan 3000 is safely in the future from any real run date
    const header = 'Mon, 01 Jan 3000 00:00:00 GMT';
    const result = parseRetryAfter(header);
    expect(result).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// parseRetryAfter — classifier pairing (NFR-008)
// ---------------------------------------------------------------------------

describe('parseRetryAfter — classifier pairing with thrown error', () => {
  it('isRetryAfterParseError(thrown) is true for undefined input', () => {
    let caught: unknown;
    try { parseRetryAfter(undefined); } catch (e) { caught = e; }
    expect(isRetryAfterParseError(caught)).toBe(true);
  });

  it('isRetryAfterParseError(thrown) is true for invalid numeric input', () => {
    let caught: unknown;
    try { parseRetryAfter('-1'); } catch (e) { caught = e; }
    expect(isRetryAfterParseError(caught)).toBe(true);
  });

  it('isRetryAfterParseError(new Error()) is false', () => {
    expect(isRetryAfterParseError(new Error('plain error'))).toBe(false);
  });

  it('isRetryAfterParseError({}) is false', () => {
    expect(isRetryAfterParseError({})).toBe(false);
  });
});
