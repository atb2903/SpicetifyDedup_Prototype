import { describe, it, expect } from 'vitest';
import {
  RemovalError,
  isRemovalError,
  type RemovalErrorCode,
} from '../../src/domain/removal-errors';

// ── All four codes (data-model §4) ────────────────────────────────────────────

const CODES = [
  'malformed-result',
  'outcome-mismatch',
  'executor-failed',
  'host-unavailable',
] as const satisfies readonly RemovalErrorCode[];

// ── Exhaustiveness lock: RemovalErrorCode has EXACTLY these four members ───────
// Bidirectional `satisfies` so adding OR removing a union member fails to compile.
// `'stalled'` was removed (FR-012 / NEW-5) as orphaned dead code — it must not
// reappear here, and `RemovalOutcomeProvenance.'stalled'` is a different symbol.
type _CodesCoverUnion = RemovalErrorCode extends (typeof CODES)[number]
  ? true
  : never;
const _exhaustiveness: _CodesCoverUnion = true;
void _exhaustiveness;

// ── RemovalError construction ─────────────────────────────────────────────────

describe('RemovalError', () => {
  it('constructs with code and message', () => {
    const e = new RemovalError('malformed-result', 'bad result');
    expect(e.code).toBe('malformed-result');
    expect(e.message).toBe('bad result');
    expect(e instanceof Error).toBe(true);
  });

  it('sets name to "RemovalError" for recognizable stack traces', () => {
    const e = new RemovalError('executor-failed', 'host rejected');
    expect(e.name).toBe('RemovalError');
  });

  it('is an instance of Error (subclass check)', () => {
    const e = new RemovalError('host-unavailable', 'no platform');
    expect(e instanceof Error).toBe(true);
    expect(e instanceof RemovalError).toBe(true);
  });

  it('preserves cause when provided', () => {
    const original = new Error('underlying host error');
    const e = new RemovalError('executor-failed', 'wrapped', {
      cause: original,
    });
    expect(e.cause).toBe(original);
  });

  it('preserves cause when cause is a non-Error value (e.g. string)', () => {
    const e = new RemovalError('executor-failed', 'rejected', {
      cause: 'host said no',
    });
    expect(e.cause).toBe('host said no');
  });

  it('leaves cause undefined when no options passed', () => {
    const e = new RemovalError('outcome-mismatch', 'unknown track');
    expect(e.cause).toBeUndefined();
  });

  it('leaves cause undefined when options object lacks cause', () => {
    const e = new RemovalError('outcome-mismatch', 'unknown track', {});
    expect(e.cause).toBeUndefined();
  });

  it('preserves context when provided', () => {
    const ctx = { uri: 'spotify:track:abc' } as const;
    const e = new RemovalError('outcome-mismatch', 'mismatch', {
      context: ctx,
    });
    expect(e.context).toEqual(ctx);
  });

  it('leaves context undefined when no options passed', () => {
    const e = new RemovalError('host-unavailable', 'absent');
    expect(e.context).toBeUndefined();
  });

  it('leaves context undefined when options object lacks context', () => {
    const e = new RemovalError('host-unavailable', 'absent', {});
    expect(e.context).toBeUndefined();
  });

  it('accepts both cause and context simultaneously', () => {
    const cause = new Error('root cause');
    const context = { count: 3 };
    const e = new RemovalError('malformed-result', 'bad', {
      cause,
      context,
    });
    expect(e.cause).toBe(cause);
    expect(e.context).toEqual(context);
  });

  it('round-trips all fields on construction', () => {
    const cause = new Error('src');
    const context = { info: 'result was null' };
    const e = new RemovalError('malformed-result', 'unexpected shape', {
      cause,
      context,
    });
    expect(e.code).toBe('malformed-result');
    expect(e.message).toBe('unexpected shape');
    expect(e.name).toBe('RemovalError');
    expect(e.cause).toBe(cause);
    expect(e.context).toEqual(context);
  });
});

// ── isRemovalError ─────────────────────────────────────────────────────────────

describe('isRemovalError', () => {
  it('returns true for a RemovalError instance', () => {
    const e = new RemovalError('executor-failed', 'rejected');
    expect(isRemovalError(e)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isRemovalError(new Error('plain'))).toBe(false);
  });

  it('returns false for a shape-equal plain object (not instanceof)', () => {
    expect(isRemovalError({ code: 'malformed-result', message: 'x' })).toBe(
      false,
    );
  });

  it('returns false for null', () => {
    expect(isRemovalError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRemovalError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRemovalError('not an error')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isRemovalError(42)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isRemovalError({})).toBe(false);
  });
});

// ── Per-code round-trip ─────────────────────────────────────────────────────────

describe.each(CODES)('code "%s"', (code) => {
  it('constructs and classifies correctly', () => {
    const e = new RemovalError(code, `test message for ${code}`);
    expect(e.code).toBe(code);
    expect(e.name).toBe('RemovalError');
    expect(isRemovalError(e)).toBe(true);
    expect(e instanceof Error).toBe(true);
  });
});
