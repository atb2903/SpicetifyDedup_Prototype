import { describe, it, expect } from 'vitest';
import {
  toViewModels,
  isRawCollection,
  type RawCollection,
  type LikedSongsSummary,
} from '../../src/domain/view-models';

const liked: LikedSongsSummary = { trackCount: 42 };

const playlist: RawCollection = {
  uri: 'spotify:playlist:abc',
  name: 'My Playlist',
  owner: { kind: 'self', displayName: 'me' },
  trackCount: 10,
  imageUrl: 'https://i.scdn.co/image/abc',
  isOwnedByMe: true,
  isCollaborative: false,
  canEdit: false,
};

describe('toViewModels (FR-003/FR-005/FR-006)', () => {
  it('pins Liked Songs first then yields each playlist', () => {
    const result = toViewModels([playlist], liked);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe('liked-songs');
    expect(result[0].key).toBe('liked-songs');
    expect(result[0].displayName).toBe('Liked Songs');
    expect(result[0].owner).toEqual({ kind: 'system-library' });
    expect(result[0].trackCount).toBe(42);
    expect(result[0].imageUrl).toBe(null);
    expect(result[1].kind).toBe('playlist');
    expect(result[1].key).toBe(playlist.uri);
    expect(result[1].displayName).toBe(playlist.name);
    expect(result[1].owner).toEqual(playlist.owner);
    expect(result[1].trackCount).toBe(playlist.trackCount);
    expect(result[1].imageUrl).toBe(playlist.imageUrl);
  });

  it('preserves input order across multiple eligible playlists', () => {
    const a: RawCollection = { ...playlist, uri: 'spotify:playlist:a', name: 'A' };
    const b: RawCollection = { ...playlist, uri: 'spotify:playlist:b', name: 'B' };
    const c: RawCollection = { ...playlist, uri: 'spotify:playlist:c', name: 'C' };
    const result = toViewModels([a, b, c], liked);
    expect(result.map((r) => r.key)).toEqual([
      'liked-songs',
      'spotify:playlist:a',
      'spotify:playlist:b',
      'spotify:playlist:c',
    ]);
  });
});

describe('toViewModels edge cases', () => {
  it('passes through null imageUrl unchanged (UI substitutes the placeholder)', () => {
    const p: RawCollection = { ...playlist, imageUrl: null };
    const result = toViewModels([p], liked);
    expect(result[1].imageUrl).toBe(null);
  });

  it('preserves very long names verbatim (UI is responsible for truncation styling)', () => {
    const longName = 'A'.repeat(500);
    const p: RawCollection = { ...playlist, name: longName };
    const result = toViewModels([p], liked);
    expect(result[1].displayName).toBe(longName);
  });

  it('preserves owner identity variants (self, other)', () => {
    const selfOwned: RawCollection = {
      ...playlist,
      owner: { kind: 'self', displayName: 'me' },
    };
    const otherOwned: RawCollection = {
      ...playlist,
      uri: 'spotify:playlist:xyz',
      owner: { kind: 'other', displayName: 'friend' },
    };
    const result = toViewModels([selfOwned, otherOwned], liked);
    expect(result[1].owner).toEqual({ kind: 'self', displayName: 'me' });
    expect(result[2].owner).toEqual({ kind: 'other', displayName: 'friend' });
  });

  it('with zero eligible playlists, returns only the Liked Songs row', () => {
    const result = toViewModels([], liked);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('liked-songs');
  });

  it('handles a Liked Songs trackCount of 0 (still pinned)', () => {
    const result = toViewModels([], { trackCount: 0 });
    expect(result[0].trackCount).toBe(0);
    expect(result[0].kind).toBe('liked-songs');
  });

  it('handles a single eligible playlist (boundary n=1)', () => {
    const result = toViewModels([playlist], liked);
    expect(result).toHaveLength(2);
  });

  it('handles a large playlist count (NFR-002 headroom)', () => {
    const many: RawCollection[] = Array.from({ length: 1000 }, (_, i) => ({
      ...playlist,
      uri: `spotify:playlist:${i}`,
      name: `Playlist ${i}`,
    }));
    const result = toViewModels(many, liked);
    expect(result).toHaveLength(1001);
    expect(result[0].kind).toBe('liked-songs');
    expect(result.slice(1).every((r) => r.kind === 'playlist')).toBe(true);
  });
});

describe('isRawCollection classifier', () => {
  it('accepts a fully-shaped RawCollection', () => {
    expect(isRawCollection(playlist)).toBe(true);
  });

  it('accepts a RawCollection with system-library owner', () => {
    expect(isRawCollection({ ...playlist, owner: { kind: 'system-library' } })).toBe(true);
  });

  it('accepts a RawCollection with other-kind owner', () => {
    expect(
      isRawCollection({ ...playlist, owner: { kind: 'other', displayName: 'friend' } }),
    ).toBe(true);
  });

  it('rejects null', () => {
    expect(isRawCollection(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isRawCollection(undefined)).toBe(false);
  });

  it('rejects a string', () => {
    expect(isRawCollection('x')).toBe(false);
  });

  it('rejects a number', () => {
    expect(isRawCollection(7)).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(isRawCollection({})).toBe(false);
  });

  it('rejects an object missing isOwnedByMe', () => {
    const { isOwnedByMe: _omit, ...rest } = playlist;
    void _omit;
    expect(isRawCollection(rest)).toBe(false);
  });

  it('rejects an object missing isCollaborative', () => {
    const { isCollaborative: _omit, ...rest } = playlist;
    void _omit;
    expect(isRawCollection(rest)).toBe(false);
  });

  it('rejects an object missing canEdit', () => {
    const { canEdit: _omit, ...rest } = playlist;
    void _omit;
    expect(isRawCollection(rest)).toBe(false);
  });

  it('rejects an object with empty uri', () => {
    expect(isRawCollection({ ...playlist, uri: '' })).toBe(false);
  });

  it('rejects an object with non-string name', () => {
    expect(isRawCollection({ ...playlist, name: 42 })).toBe(false);
  });

  it('rejects an object with non-integer trackCount', () => {
    expect(isRawCollection({ ...playlist, trackCount: 1.5 })).toBe(false);
  });

  it('rejects an object with negative trackCount (boundary: -1)', () => {
    expect(isRawCollection({ ...playlist, trackCount: -1 })).toBe(false);
  });

  it('accepts an object with trackCount 0 (boundary: nominal-low)', () => {
    expect(isRawCollection({ ...playlist, trackCount: 0 })).toBe(true);
  });

  it('accepts an object with trackCount 1 (boundary: just-above-zero)', () => {
    expect(isRawCollection({ ...playlist, trackCount: 1 })).toBe(true);
  });

  it('accepts an object with a large trackCount (boundary: high)', () => {
    expect(isRawCollection({ ...playlist, trackCount: 1_000_000 })).toBe(true);
  });

  it('accepts an object with imageUrl null', () => {
    expect(isRawCollection({ ...playlist, imageUrl: null })).toBe(true);
  });

  it('rejects an object where imageUrl is a number', () => {
    expect(isRawCollection({ ...playlist, imageUrl: 5 })).toBe(false);
  });

  it('rejects an object where owner is not an OwnerIdentity', () => {
    expect(isRawCollection({ ...playlist, owner: { kind: 'bogus' } })).toBe(false);
  });

  it('rejects a self-owner with empty displayName', () => {
    expect(
      isRawCollection({ ...playlist, owner: { kind: 'self', displayName: '' } }),
    ).toBe(false);
  });

  it('rejects an other-owner with non-string displayName', () => {
    expect(
      isRawCollection({ ...playlist, owner: { kind: 'other', displayName: 7 } }),
    ).toBe(false);
  });

  it('rejects an owner that is null', () => {
    expect(isRawCollection({ ...playlist, owner: null })).toBe(false);
  });

  it('rejects an object where flags are not strict booleans', () => {
    expect(isRawCollection({ ...playlist, isOwnedByMe: 'true' })).toBe(false);
    expect(isRawCollection({ ...playlist, isCollaborative: 1 })).toBe(false);
    expect(isRawCollection({ ...playlist, canEdit: null })).toBe(false);
  });
});
