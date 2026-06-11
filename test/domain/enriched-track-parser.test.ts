/**
 * Tests for `src/domain/enriched-track-parser.ts`.
 *
 * Covers the fail-loud + classifier pair that guards the catalog → algorithm
 * boundary. Every validation rule in data-model §1.2 has at least one explicit
 * test case; numeric bounds are tested at min−1, min, nominal, and max+1.
 */

import { describe, it, expect } from 'vitest';
import { asEnrichedTrack, isEnrichedTrack } from '../../src/domain/enriched-track-parser';
import { isDetectionError } from '../../src/domain/detection-errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid raw catalog object that `asEnrichedTrack` will accept. */
function validRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uri: 'spotify:track:ABC123',
    name: 'Test Song',
    artists: [{ name: 'Test Artist' }],
    duration_ms: 180000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// asEnrichedTrack — happy paths
// ---------------------------------------------------------------------------

describe('asEnrichedTrack — happy paths', () => {
  it('returns a fully-typed EnrichedTrack for a valid minimal object', () => {
    const result = asEnrichedTrack(validRaw(), 0);
    expect(result.position).toBe(0);
    expect(result.uri).toBe('spotify:track:ABC123');
    expect(result.canonicalUri).toBe('spotify:track:ABC123');
    expect(result.name).toBe('Test Song');
    expect(result.artists).toEqual([{ name: 'Test Artist' }]);
    expect(result.durationMs).toBe(180000);
  });

  it('uses linked_from.uri as canonicalUri when present', () => {
    const raw = validRaw({
      uri: 'spotify:track:RELINKED',
      linked_from: { uri: 'spotify:track:ORIGINAL' },
    });
    const result = asEnrichedTrack(raw, 5);
    expect(result.uri).toBe('spotify:track:RELINKED');
    expect(result.canonicalUri).toBe('spotify:track:ORIGINAL');
    expect(result.position).toBe(5);
  });

  it('uses uri as canonicalUri when linked_from is absent', () => {
    const result = asEnrichedTrack(validRaw(), 0);
    expect(result.canonicalUri).toBe('spotify:track:ABC123');
  });

  it('accepts multiple artists; only first is required to be non-empty', () => {
    const raw = validRaw({
      artists: [{ name: 'Artist One' }, { name: 'Artist Two' }, { name: '' }],
    });
    const result = asEnrichedTrack(raw, 0);
    expect(result.artists).toEqual([{ name: 'Artist One' }, { name: 'Artist Two' }, { name: '' }]);
  });

  it('accepts empty name (catalog may return empty display names)', () => {
    const result = asEnrichedTrack(validRaw({ name: '' }), 0);
    expect(result.name).toBe('');
  });

  it('accepts duration_ms of 0 (boundary — minimum valid integer)', () => {
    const result = asEnrichedTrack(validRaw({ duration_ms: 0 }), 0);
    expect(result.durationMs).toBe(0);
  });

  it('accepts duration_ms of 1 (nominal lower edge)', () => {
    const result = asEnrichedTrack(validRaw({ duration_ms: 1 }), 0);
    expect(result.durationMs).toBe(1);
  });

  it('passes position through to the returned EnrichedTrack', () => {
    const result = asEnrichedTrack(validRaw(), 42);
    expect(result.position).toBe(42);
  });

  it('accepts a URI with alphanumeric track ID of various lengths', () => {
    const raw = validRaw({ uri: 'spotify:track:abcABC012' });
    const result = asEnrichedTrack(raw, 0);
    expect(result.uri).toBe('spotify:track:abcABC012');
  });
});

// ---------------------------------------------------------------------------
// asEnrichedTrack — validation failures (fail-loud)
// ---------------------------------------------------------------------------

describe('asEnrichedTrack — validation failures', () => {
  /**
   * Assert that `asEnrichedTrack(input, position)` throws a
   * `DetectionError('malformed-enrichment-payload')`.
   *
   * @param missingFieldPattern - substring expected in `err.message`; when it
   *   exactly matches a field name it is also asserted against
   *   `err.context?.missingField`.
   * @param expectedContextField - explicit override for the `context.missingField`
   *   assertion when the pattern differs from the field name.
   */
  function expectMalformed(
    input: unknown,
    position: number,
    missingFieldPattern?: string,
    expectedContextField?: string,
  ): void {
    let threw = false;
    try {
      asEnrichedTrack(input, position);
    } catch (err) {
      threw = true;
      expect(isDetectionError(err)).toBe(true);
      if (isDetectionError(err)) {
        expect(err.reason).toBe('malformed-enrichment-payload');
        if (missingFieldPattern !== undefined) {
          expect(err.message).toContain(missingFieldPattern);
        }
        // Assert the structured diagnostic payload when a field name is known.
        const contextField = expectedContextField ?? missingFieldPattern;
        if (contextField !== undefined) {
          expect(err.context?.missingField).toBe(contextField);
        }
      }
    }
    expect(threw).toBe(true);
  }

  it('throws on null input', () => {
    expectMalformed(null, 0);
  });

  it('throws on non-object input (number)', () => {
    expectMalformed(42, 0);
  });

  it('throws on non-object input (string)', () => {
    expectMalformed('track', 0);
  });

  it('throws when uri is missing', () => {
    const { uri: _, ...rest } = validRaw();
    expectMalformed(rest, 0, 'uri');
  });

  it('throws when uri is not a string', () => {
    expectMalformed(validRaw({ uri: 123 }), 0, 'uri');
  });

  it('throws when uri is malformed (not spotify:track:...)', () => {
    expectMalformed(validRaw({ uri: 'spotify:artist:ABC123' }), 0, 'uri');
  });

  it('throws when uri contains a local track pattern', () => {
    expectMalformed(validRaw({ uri: 'spotify:local:artist:album:track:300' }), 0, 'uri');
  });

  it('throws when name is missing', () => {
    const { name: _, ...rest } = validRaw();
    expectMalformed(rest, 0, 'name');
  });

  it('throws when name is not a string (number)', () => {
    expectMalformed(validRaw({ name: 42 }), 0, 'name');
  });

  it('throws when artists is missing', () => {
    const { artists: _, ...rest } = validRaw();
    expectMalformed(rest, 0, 'artists');
  });

  it('throws when artists is an empty array (FR-005 requires at least one)', () => {
    expectMalformed(validRaw({ artists: [] }), 0, 'artists');
  });

  it('throws when artists is not an array', () => {
    expectMalformed(validRaw({ artists: { name: 'Solo' } }), 0, 'artists');
  });

  it('throws when first artist has no name property', () => {
    expectMalformed(validRaw({ artists: [{ uri: 'spotify:artist:X' }] }), 0, 'artists');
  });

  it('throws when first artist name is empty string (first artist must be non-empty)', () => {
    expectMalformed(validRaw({ artists: [{ name: '' }] }), 0, 'artists');
  });

  it('throws when duration_ms is missing', () => {
    const { duration_ms: _, ...rest } = validRaw();
    expectMalformed(rest, 0, 'duration_ms');
  });

  it('throws when duration_ms is -1 (min−1 boundary: negative)', () => {
    expectMalformed(validRaw({ duration_ms: -1 }), 0, 'duration_ms');
  });

  it('throws when duration_ms is -0.5 (negative fraction)', () => {
    expectMalformed(validRaw({ duration_ms: -0.5 }), 0, 'duration_ms');
  });

  it('throws when duration_ms is 1.5 (non-integer)', () => {
    expectMalformed(validRaw({ duration_ms: 1.5 }), 0, 'duration_ms');
  });

  it('throws when duration_ms is not a number (string)', () => {
    expectMalformed(validRaw({ duration_ms: '180000' }), 0, 'duration_ms');
  });

  it('throws when linked_from.uri is present but malformed', () => {
    const raw = validRaw({ linked_from: { uri: 'not-a-track-uri' } });
    expectMalformed(raw, 0, 'linked_from');
  });

  it('throws when linked_from is present but uri property is missing', () => {
    const raw = validRaw({ linked_from: {} });
    expectMalformed(raw, 0, 'linked_from');
  });

  it('includes position in the error context', () => {
    let err: unknown;
    try {
      asEnrichedTrack(null, 7);
    } catch (e) {
      err = e;
    }
    expect(isDetectionError(err)).toBe(true);
    if (isDetectionError(err)) {
      expect(err.context?.position).toBe(7);
    }
  });
});

// ---------------------------------------------------------------------------
// isEnrichedTrack — classifier predicate
// ---------------------------------------------------------------------------

describe('isEnrichedTrack — classifier predicate', () => {
  it('returns true for an object produced by asEnrichedTrack', () => {
    const result = asEnrichedTrack(validRaw(), 0);
    expect(isEnrichedTrack(result)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isEnrichedTrack(null)).toBe(false);
  });

  it('returns false for a plain object missing durationMs', () => {
    expect(isEnrichedTrack({ uri: 'spotify:track:X', name: 'x', artists: [{ name: 'a' }] })).toBe(
      false,
    );
  });

  it('returns false for a number', () => {
    expect(isEnrichedTrack(42)).toBe(false);
  });

  it('returns false for an object with malformed uri', () => {
    expect(
      isEnrichedTrack({
        position: 0,
        uri: 'not-a-track-uri',
        canonicalUri: 'not-a-track-uri',
        name: '',
        artists: [{ name: 'x' }],
        durationMs: 1000,
      }),
    ).toBe(false);
  });

  it('returns false for an object with empty first-artist name', () => {
    expect(
      isEnrichedTrack({
        position: 0,
        uri: 'spotify:track:ABC',
        canonicalUri: 'spotify:track:ABC',
        name: '',
        artists: [{ name: '' }],
        durationMs: 1000,
      }),
    ).toBe(false);
  });

  it('returns false for an object with negative durationMs', () => {
    expect(
      isEnrichedTrack({
        position: 0,
        uri: 'spotify:track:ABC',
        canonicalUri: 'spotify:track:ABC',
        name: '',
        artists: [{ name: 'x' }],
        durationMs: -1,
      }),
    ).toBe(false);
  });

  it('returns false when artists array is empty', () => {
    expect(
      isEnrichedTrack({
        position: 0,
        uri: 'spotify:track:ABC',
        canonicalUri: 'spotify:track:ABC',
        name: '',
        artists: [],
        durationMs: 0,
      }),
    ).toBe(false);
  });

  it('returns false when canonicalUri is malformed (valid uri, invalid canonicalUri)', () => {
    expect(
      isEnrichedTrack({
        position: 0,
        uri: 'spotify:track:ABC',
        canonicalUri: 'not-a-track-uri',
        name: 'Song',
        artists: [{ name: 'Artist' }],
        durationMs: 1000,
      }),
    ).toBe(false);
  });

  it('returns false when position is negative', () => {
    expect(
      isEnrichedTrack({
        position: -1,
        uri: 'spotify:track:ABC',
        canonicalUri: 'spotify:track:ABC',
        name: 'Song',
        artists: [{ name: 'Artist' }],
        durationMs: 1000,
      }),
    ).toBe(false);
  });

  it('returns false when name is not a string', () => {
    expect(
      isEnrichedTrack({
        position: 0,
        uri: 'spotify:track:ABC',
        canonicalUri: 'spotify:track:ABC',
        name: 42,
        artists: [{ name: 'Artist' }],
        durationMs: 1000,
      }),
    ).toBe(false);
  });

  it('returns true for a hand-crafted valid EnrichedTrack shape', () => {
    expect(
      isEnrichedTrack({
        position: 3,
        uri: 'spotify:track:XYZ',
        canonicalUri: 'spotify:track:XYZ',
        name: 'Some Song',
        artists: [{ name: 'Some Artist' }],
        durationMs: 210000,
      }),
    ).toBe(true);
  });
});
