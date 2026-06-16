import { describe, it, expect } from 'vitest';
import {
  DetectionError,
  isDetectionError,
  type DetectionErrorReason,
} from '../../src/domain/detection-errors';

// ── All five reachable reasons (data-model §1) ───────────────────────────────

const REASONS = [
  'auth-token-expired',
  'enumerator-failed',
  'host-unavailable',
  'internal-error',
  'aborted',
] as const satisfies readonly DetectionErrorReason[];

// ── DetectionError construction ───────────────────────────────────────────────

describe('DetectionError', () => {
  it('constructs with reason and message', () => {
    const e = new DetectionError('auth-token-expired', 'token expired');
    expect(e.reason).toBe('auth-token-expired');
    expect(e.message).toBe('token expired');
    expect(e instanceof Error).toBe(true);
  });

  it('sets name to "DetectionError" for recognizable stack traces', () => {
    const e = new DetectionError('host-unavailable', 'host not ready');
    expect(e.name).toBe('DetectionError');
  });

  it('is an instance of Error (subclass check)', () => {
    const e = new DetectionError('aborted', 'scan aborted');
    expect(e instanceof Error).toBe(true);
    expect(e instanceof DetectionError).toBe(true);
  });

  it('preserves cause when provided', () => {
    const original = new Error('underlying internal error');
    const e = new DetectionError('internal-error', 'wrapped', {
      cause: original,
    });
    expect(e.cause).toBe(original);
  });

  it('preserves cause when cause is a non-Error value (e.g. string)', () => {
    const e = new DetectionError('internal-error', 'rejected', {
      cause: 'unexpected value',
    });
    expect(e.cause).toBe('unexpected value');
  });

  it('leaves cause undefined when no options passed', () => {
    const e = new DetectionError('enumerator-failed', 'lib threw');
    expect(e.cause).toBeUndefined();
  });

  it('leaves cause undefined when options object lacks cause', () => {
    const e = new DetectionError('enumerator-failed', 'lib threw', {});
    expect(e.cause).toBeUndefined();
  });

  it('preserves context when provided', () => {
    const ctx = { detail: 'diagnostic', url: 'https://example.com' } as const;
    const e = new DetectionError('internal-error', 'rejected', {
      context: ctx,
    });
    expect(e.context).toEqual(ctx);
  });

  it('leaves context undefined when no options passed', () => {
    const e = new DetectionError('auth-token-expired', 'expired');
    expect(e.context).toBeUndefined();
  });

  it('leaves context undefined when options object lacks context', () => {
    const e = new DetectionError('auth-token-expired', 'expired', {});
    expect(e.context).toBeUndefined();
  });

  it('accepts both cause and context simultaneously', () => {
    const cause = new Error('root cause');
    const context = { detail: 'diagnostic' };
    const e = new DetectionError('internal-error', 'unexpected fault', {
      cause,
      context,
    });
    expect(e.cause).toBe(cause);
    expect(e.context).toEqual(context);
  });

  it('round-trips all fields on construction', () => {
    const cause = new Error('src');
    const context = { info: 'unexpected internal fault' };
    const e = new DetectionError(
      'internal-error',
      'unexpected fault',
      { cause, context },
    );
    expect(e.reason).toBe('internal-error');
    expect(e.message).toBe('unexpected fault');
    expect(e.name).toBe('DetectionError');
    expect(e.cause).toBe(cause);
    expect(e.context).toEqual(context);
  });
});

// ── isDetectionError ──────────────────────────────────────────────────────────

describe('isDetectionError', () => {
  it('returns true for a DetectionError instance', () => {
    const e = new DetectionError('aborted', 'cancelled');
    expect(isDetectionError(e)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isDetectionError(new Error('plain'))).toBe(false);
  });

  it('returns false for a shape-equal plain object (not instanceof)', () => {
    expect(
      isDetectionError({ reason: 'auth-token-expired', message: 'x' }),
    ).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDetectionError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isDetectionError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isDetectionError('not an error')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isDetectionError(42)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isDetectionError({})).toBe(false);
  });
});

// ── Per-reason round-trip ─────────────────────────────────────────────────────

describe.each(REASONS)('reason "%s"', (reason) => {
  it('constructs and classifies correctly', () => {
    const e = new DetectionError(reason, `test message for ${reason}`);
    expect(e.reason).toBe(reason);
    expect(e.name).toBe('DetectionError');
    expect(isDetectionError(e)).toBe(true);
    expect(e instanceof Error).toBe(true);
  });
});
