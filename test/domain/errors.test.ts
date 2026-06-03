import { describe, it, expect } from 'vitest';
import {
  PlaylistsLoaderError,
  isPlaylistsLoaderError,
  type PlaylistsLoaderErrorReason,
} from '../../src/domain/errors';

describe('PlaylistsLoaderError', () => {
  it('constructs with reason and message', () => {
    const e = new PlaylistsLoaderError('rootlist-fetch-failed', 'fetch blew up');
    expect(e.reason).toBe('rootlist-fetch-failed');
    expect(e.message).toBe('fetch blew up');
    expect(e instanceof Error).toBe(true);
  });

  it('sets name to "PlaylistsLoaderError" for recognizable stack traces', () => {
    const e = new PlaylistsLoaderError('host-unavailable', 'host missing');
    expect(e.name).toBe('PlaylistsLoaderError');
  });

  it('preserves cause when provided', () => {
    const original = new Error('underlying');
    const e = new PlaylistsLoaderError('rootlist-fetch-failed', 'wrapped', {
      cause: original,
    });
    expect(e.cause).toBe(original);
  });

  it('leaves cause undefined when no options passed', () => {
    const e = new PlaylistsLoaderError('host-auth-expired', 'expired');
    expect(e.cause).toBeUndefined();
  });

  it('leaves cause undefined when options object lacks cause', () => {
    const e = new PlaylistsLoaderError('host-auth-expired', 'expired', {});
    expect(e.cause).toBeUndefined();
  });

  it('accepts a non-Error cause (e.g. string, plain object)', () => {
    const e = new PlaylistsLoaderError('rootlist-fetch-failed', 'string cause', {
      cause: 'just a string',
    });
    expect(e.cause).toBe('just a string');
  });
});

describe('isPlaylistsLoaderError', () => {
  it('returns true for a PlaylistsLoaderError instance', () => {
    const e = new PlaylistsLoaderError('host-unavailable', 'x');
    expect(isPlaylistsLoaderError(e)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isPlaylistsLoaderError(new Error('plain'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPlaylistsLoaderError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isPlaylistsLoaderError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isPlaylistsLoaderError('not an error')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isPlaylistsLoaderError(42)).toBe(false);
  });

  it('returns false for a plain object that looks like an error', () => {
    expect(
      isPlaylistsLoaderError({ reason: 'rootlist-fetch-failed', message: 'x' }),
    ).toBe(false);
  });
});

const REASONS = [
  'rootlist-fetch-failed',
  'rootlist-item-missing-name',
  'rootlist-item-missing-owner',
  'rootlist-item-invalid-track-count',
  'rootlist-item-missing-flag',
  'rootlist-item-unsupported-shape',
  'liked-songs-fetch-failed',
  'liked-songs-invalid-track-count',
  'host-unavailable',
  'host-auth-expired',
] as const satisfies readonly PlaylistsLoaderErrorReason[];

describe.each(REASONS)('reason "%s"', (reason) => {
  it('constructs and classifies', () => {
    const e = new PlaylistsLoaderError(reason, `test message for ${reason}`);
    expect(e.reason).toBe(reason);
    expect(isPlaylistsLoaderError(e)).toBe(true);
  });
});
