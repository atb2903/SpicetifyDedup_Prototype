/**
 * Unit tests for the shared host auth-expired predicate `looksLikeHostAuthExpired`.
 *
 * The predicate is the single canonical definition consumed by both host adapters
 * (`spicetify-tracks-enumerator.ts` and `spicetify-playlists-loader.ts`). It must
 * inspect `code` — the field `Spicetify.CosmosAsync` actually populates (ADR-0010) —
 * NOT `status`. The `{ status: 401 }` → false case is the regression pin for the
 * corrected field (finding D).
 */
import { describe, it, expect } from 'vitest';
import { looksLikeHostAuthExpired } from '../../src/domain/host-auth';

describe('looksLikeHostAuthExpired — code field (corrected per ADR-0010)', () => {
  it('returns true for { code: 401 } (the field Spicetify.CosmosAsync populates)', () => {
    expect(looksLikeHostAuthExpired({ code: 401 })).toBe(true);
  });

  it('returns false for { status: 401 } — documents the corrected field (regression pin, finding D)', () => {
    expect(looksLikeHostAuthExpired({ status: 401 })).toBe(false);
  });

  it('returns false for a non-401 code without an auth message', () => {
    expect(looksLikeHostAuthExpired({ code: 500 })).toBe(false);
  });

  it('returns false for a non-number code', () => {
    expect(looksLikeHostAuthExpired({ code: '401' })).toBe(false);
  });
});

describe('looksLikeHostAuthExpired — message-substring fallbacks', () => {
  it('returns true when the message contains "401"', () => {
    expect(looksLikeHostAuthExpired({ message: 'HTTP 401 unauthorized' })).toBe(true);
  });

  it('returns true for "token expired" in the message', () => {
    expect(looksLikeHostAuthExpired({ message: 'The access token expired' })).toBe(true);
  });

  it('returns true for "token invalid" in the message', () => {
    expect(looksLikeHostAuthExpired({ message: 'token invalid for this resource' })).toBe(true);
  });

  it('is case-insensitive on the message ("Access Token Expired")', () => {
    expect(looksLikeHostAuthExpired({ message: 'Access Token Expired, please refresh' })).toBe(true);
  });

  it('returns false for "token" without "expired" or "invalid"', () => {
    expect(looksLikeHostAuthExpired({ message: 'token refreshed' })).toBe(false);
  });

  it('returns false for "expired" without "token"', () => {
    expect(looksLikeHostAuthExpired({ message: 'session expired' })).toBe(false);
  });

  it('returns false for an unrelated error message', () => {
    expect(looksLikeHostAuthExpired({ message: 'network down' })).toBe(false);
  });

  it('returns false when the message is a non-string', () => {
    expect(looksLikeHostAuthExpired({ message: 42 })).toBe(false);
  });
});

describe('looksLikeHostAuthExpired — non-object causes', () => {
  it('returns false for null', () => {
    expect(looksLikeHostAuthExpired(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(looksLikeHostAuthExpired(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(looksLikeHostAuthExpired('401')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(looksLikeHostAuthExpired(401)).toBe(false);
  });

  it('returns false for an empty object (no code, no message)', () => {
    expect(looksLikeHostAuthExpired({})).toBe(false);
  });
});
