import { describe, it, expect, vi, afterEach } from 'vitest';
import { SpicetifyPlaylistsLoader } from '../../src/adapters/spicetify-playlists-loader';
import {
  PlaylistsLoaderError,
  isPlaylistsLoaderError,
} from '../../src/domain/errors';
import type {
  RawCollection,
  LikedSongsSummary,
} from '../../src/domain/view-models';
import { runPlaylistsLoaderContract } from '../ports/playlists-loader-contract.test';
import rootlistFixture from './fixtures/rootlist-response.sample.json';
import likedFixture from './fixtures/liked-songs-response.sample.json';

/**
 * Unit suite for the production PlaylistsLoader adapter.
 *
 * Drives the global `Spicetify` via `vi.stubGlobal` so every branch of
 * `SpicetifyPlaylistsLoader` is reachable from a unit test. The shared
 * cross-implementation contract (`runPlaylistsLoaderContract`) is
 * additionally exercised against this adapter at the bottom of the file
 * to guarantee drop-in parity with `FakePlaylistsLoader`.
 *
 * Each describe block has its own `afterEach(unstubAllGlobals)` so test
 * isolation is per-it; the same hook applies to the nested describe
 * created by `runPlaylistsLoaderContract` via Vitest's hook cascading.
 */

// --- Helpers ----------------------------------------------------------------

/** Minimal host shape for a single playlist node. Fields omitted from the
 * partial are intentionally absent; tests use this to drive missing-field
 * error branches. */
type HostPlaylist = Record<string, unknown> & { type: 'playlist' };

function validPlaylist(overrides: Partial<HostPlaylist> = {}): HostPlaylist {
  return {
    type: 'playlist',
    uri: 'spotify:playlist:VALID',
    name: 'Valid',
    owner: { displayName: 'Test User' },
    totalLength: 1,
    isOwnedBySelf: true,
    canAdd: true,
    canRemove: true,
    collaborators: { count: 0 },
    images: [],
    ...overrides,
  };
}

function rootlistOf(items: unknown[]): unknown {
  return { type: 'folder', items, name: '<root>' };
}

function likedOf(totalLength: unknown): unknown {
  return { items: [], offset: 0, limit: 1, totalLength };
}

function stubSpicetify(opts: {
  getContents?: () => Promise<unknown>;
  getTracks?: (p: { limit: number; offset: number }) => Promise<unknown>;
  add?: (...a: unknown[]) => unknown;
  remove?: (...a: unknown[]) => unknown;
}): { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } {
  const add = vi.fn(opts.add);
  const remove = vi.fn(opts.remove);
  vi.stubGlobal('Spicetify', {
    Platform: {
      RootlistAPI: {
        getContents: vi.fn(opts.getContents ?? (async () => rootlistOf([]))),
        add,
        remove,
      },
      LibraryAPI: {
        getTracks: vi.fn(opts.getTracks ?? (async () => likedOf(0))),
        add,
        remove,
      },
    },
  });
  return { add, remove };
}

async function expectReason(
  promise: Promise<unknown>,
  reason: string,
): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => isPlaylistsLoaderError(e) && e.reason === reason,
  );
}

// --- host-unavailable -------------------------------------------------------

describe('SpicetifyPlaylistsLoader — host availability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws host-unavailable when the Spicetify global is undefined', async () => {
    vi.stubGlobal('Spicetify', undefined);
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-unavailable');
  });

  it('throws host-unavailable when the Spicetify global is null', async () => {
    vi.stubGlobal('Spicetify', null);
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-unavailable');
  });

  it('throws host-unavailable when Spicetify.Platform is missing', async () => {
    vi.stubGlobal('Spicetify', {});
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-unavailable');
  });

  it('throws host-unavailable when Spicetify.Platform is null', async () => {
    vi.stubGlobal('Spicetify', { Platform: null });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-unavailable');
  });

  it('throws host-unavailable when Spicetify.Platform.RootlistAPI is missing', async () => {
    vi.stubGlobal('Spicetify', { Platform: { LibraryAPI: {} } });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-unavailable');
  });

  it('throws host-unavailable when Spicetify.Platform.RootlistAPI is null', async () => {
    vi.stubGlobal('Spicetify', { Platform: { RootlistAPI: null, LibraryAPI: {} } });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-unavailable');
  });

  it('throws host-unavailable when Spicetify.Platform.LibraryAPI is missing', async () => {
    vi.stubGlobal('Spicetify', { Platform: { RootlistAPI: {} } });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-unavailable');
  });

  it('throws host-unavailable when Spicetify.Platform.LibraryAPI is null', async () => {
    vi.stubGlobal('Spicetify', { Platform: { RootlistAPI: {}, LibraryAPI: null } });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-unavailable');
  });
});

// --- happy path against the captured fixture -------------------------------

describe('SpicetifyPlaylistsLoader — happy path against captured fixture', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns every playlist node from the captured fixture (including nested), in host order', async () => {
    stubSpicetify({
      getContents: async () => rootlistFixture,
      getTracks: async () => likedFixture,
    });
    const { playlists, likedSongs } = await new SpicetifyPlaylistsLoader().load();
    // Captured fixture: DJ, current batch, new releases, synthetic-collab,
    // and one nested playlist inside the synthetic folder = 5 playlists.
    expect(playlists.map((p) => p.uri)).toEqual([
      'spotify:playlist:37i9dQZF1EYkqdzj48dyYq',
      'spotify:playlist:1R399C4c5ojsn96b1xVag3',
      'spotify:playlist:5uXCgEG0Ogjz6mOzuFXWOO',
      'spotify:playlist:SYNTHETICcollab0000000',
      'spotify:playlist:SYNTHETICnested000000',
    ]);
    expect(likedSongs).toEqual<LikedSongsSummary>({ trackCount: 73020 });
  });

  it('maps owner kind=other for Spotify-curated playlists', async () => {
    stubSpicetify({
      getContents: async () => rootlistFixture,
      getTracks: async () => likedFixture,
    });
    const { playlists } = await new SpicetifyPlaylistsLoader().load();
    const dj = playlists.find(
      (p) => p.uri === 'spotify:playlist:37i9dQZF1EYkqdzj48dyYq',
    );
    expect(dj?.owner).toEqual({ kind: 'other', displayName: 'Spotify' });
    expect(dj?.isOwnedByMe).toBe(false);
    expect(dj?.canEdit).toBe(false);
    expect(dj?.isCollaborative).toBe(false);
  });

  it('maps owner kind=self for user-owned playlists and exposes imageUrl', async () => {
    stubSpicetify({
      getContents: async () => rootlistFixture,
      getTracks: async () => likedFixture,
    });
    const { playlists } = await new SpicetifyPlaylistsLoader().load();
    const owned = playlists.find(
      (p) => p.uri === 'spotify:playlist:1R399C4c5ojsn96b1xVag3',
    );
    expect(owned?.owner).toEqual({ kind: 'self', displayName: 'Test User' });
    expect(owned?.isOwnedByMe).toBe(true);
    expect(owned?.canEdit).toBe(true);
    expect(owned?.trackCount).toBe(1013);
    expect(owned?.imageUrl).toMatch(/^spotify:mosaic:/);
  });

  it('flags the synthetic collaborative entry as isCollaborative=true and not owned', async () => {
    stubSpicetify({
      getContents: async () => rootlistFixture,
      getTracks: async () => likedFixture,
    });
    const { playlists } = await new SpicetifyPlaylistsLoader().load();
    const collab = playlists.find(
      (p) => p.uri === 'spotify:playlist:SYNTHETICcollab0000000',
    );
    expect(collab?.isCollaborative).toBe(true);
    expect(collab?.isOwnedByMe).toBe(false);
    expect(collab?.canEdit).toBe(true);
    expect(collab?.imageUrl).toBeNull();
  });
});

// --- rootlist-fetch-failed + host-auth-expired ------------------------------

describe('SpicetifyPlaylistsLoader — rootlist fetch failures', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws rootlist-fetch-failed on a plain rejection', async () => {
    stubSpicetify({
      getContents: async () => {
        throw new Error('network down');
      },
    });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'rootlist-fetch-failed');
  });

  it('throws rootlist-fetch-failed on a non-object rejection', async () => {
    stubSpicetify({
      getContents: async () => {
        throw 'string-rejection';
      },
    });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'rootlist-fetch-failed');
  });

  it('throws rootlist-fetch-failed on a null rejection', async () => {
    stubSpicetify({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getContents: async () => {
        throw null as unknown as Error;
      },
    });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'rootlist-fetch-failed');
  });

  it('throws rootlist-fetch-failed when the error has no auth-expired signal', async () => {
    stubSpicetify({
      getContents: async () => {
        throw Object.assign(new Error('something else broke'), { status: 500 });
      },
    });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'rootlist-fetch-failed');
  });

  it('throws rootlist-fetch-failed when the error has a non-string message', async () => {
    stubSpicetify({
      getContents: async () => {
        const e = new Error();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e as any).message = 12345;
        throw e;
      },
    });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'rootlist-fetch-failed');
  });

  it('throws host-auth-expired when the rejection has status 401', async () => {
    stubSpicetify({
      getContents: async () => {
        throw Object.assign(new Error('unauthorized'), { status: 401 });
      },
    });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-auth-expired');
  });

  it('throws host-auth-expired when the message includes "401"', async () => {
    stubSpicetify({
      getContents: async () => {
        throw new Error('request failed with status 401');
      },
    });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-auth-expired');
  });

  it('throws host-auth-expired when the message includes "token expired"', async () => {
    stubSpicetify({
      getContents: async () => {
        throw new Error('Access token expired');
      },
    });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-auth-expired');
  });

  it('throws host-auth-expired when the message includes "token invalid"', async () => {
    stubSpicetify({
      getContents: async () => {
        throw new Error('Token invalid for this resource');
      },
    });
    await expectReason(new SpicetifyPlaylistsLoader().load(), 'host-auth-expired');
  });
});

// --- rootlist normalization errors -----------------------------------------

describe('SpicetifyPlaylistsLoader — rootlist normalization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws rootlist-item-unsupported-shape when the response is not an object', async () => {
    stubSpicetify({ getContents: async () => 'not-an-object' });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'rootlist-item-unsupported-shape',
    );
  });

  it('throws rootlist-item-unsupported-shape when the response is null', async () => {
    stubSpicetify({ getContents: async () => null });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'rootlist-item-unsupported-shape',
    );
  });

  it('throws rootlist-item-unsupported-shape when items is not an array', async () => {
    stubSpicetify({ getContents: async () => ({ type: 'folder', items: 'nope' }) });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'rootlist-item-unsupported-shape',
    );
  });

  it('throws rootlist-item-unsupported-shape when an item is not an object', async () => {
    stubSpicetify({
      getContents: async () => ({ type: 'folder', items: ['not-an-object'] }),
    });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'rootlist-item-unsupported-shape',
    );
  });

  it('throws rootlist-item-unsupported-shape when a playlist has no uri', async () => {
    stubSpicetify({
      getContents: async () => rootlistOf([validPlaylist({ uri: undefined })]),
    });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'rootlist-item-unsupported-shape',
    );
  });

  it('throws rootlist-item-unsupported-shape when a playlist has an empty uri', async () => {
    stubSpicetify({
      getContents: async () => rootlistOf([validPlaylist({ uri: '' })]),
    });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'rootlist-item-unsupported-shape',
    );
  });

  it('silently skips unknown node types', async () => {
    stubSpicetify({
      getContents: async () =>
        rootlistOf([
          { type: 'separator' },
          validPlaylist({ uri: 'spotify:playlist:KEEP' }),
        ]),
    });
    const { playlists } = await new SpicetifyPlaylistsLoader().load();
    expect(playlists.map((p) => p.uri)).toEqual(['spotify:playlist:KEEP']);
  });

  it('treats folders with no items array as empty (no throw)', async () => {
    stubSpicetify({
      getContents: async () =>
        rootlistOf([
          { type: 'folder', name: 'broken-folder' },
          validPlaylist({ uri: 'spotify:playlist:KEEP' }),
        ]),
    });
    const { playlists } = await new SpicetifyPlaylistsLoader().load();
    expect(playlists.map((p) => p.uri)).toEqual(['spotify:playlist:KEEP']);
  });

  it.each([
    ['name is missing', { name: undefined }],
    ['name is empty', { name: '' }],
    ['name is non-string', { name: 42 }],
  ])('throws rootlist-item-missing-name when %s', async (_label, overrides) => {
    stubSpicetify({
      getContents: async () => rootlistOf([validPlaylist(overrides)]),
    });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'rootlist-item-missing-name',
    );
  });

  it.each([
    ['owner is missing', { owner: undefined }],
    ['owner is null', { owner: null }],
    ['owner has no displayName', { owner: {} }],
    ['owner displayName is empty', { owner: { displayName: '' } }],
    ['owner displayName is non-string', { owner: { displayName: 12 } }],
  ])('throws rootlist-item-missing-owner when %s', async (_label, overrides) => {
    stubSpicetify({
      getContents: async () => rootlistOf([validPlaylist(overrides)]),
    });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'rootlist-item-missing-owner',
    );
  });

  it.each([
    ['totalLength is missing', { totalLength: undefined }],
    ['totalLength is a string', { totalLength: 'ten' }],
    ['totalLength is fractional', { totalLength: 1.5 }],
    ['totalLength is negative', { totalLength: -1 }],
  ])(
    'throws rootlist-item-invalid-track-count when %s',
    async (_label, overrides) => {
      stubSpicetify({
        getContents: async () => rootlistOf([validPlaylist(overrides)]),
      });
      await expectReason(
        new SpicetifyPlaylistsLoader().load(),
        'rootlist-item-invalid-track-count',
      );
    },
  );

  it.each([
    ['isOwnedBySelf is missing', { isOwnedBySelf: undefined }],
    ['isOwnedBySelf is a string', { isOwnedBySelf: 'yes' }],
    ['canAdd is missing', { canAdd: undefined }],
    ['canAdd is a string', { canAdd: 'yes' }],
    ['canRemove is missing', { canRemove: undefined }],
    ['canRemove is a string', { canRemove: 'yes' }],
  ])('throws rootlist-item-missing-flag when %s', async (_label, overrides) => {
    stubSpicetify({
      getContents: async () => rootlistOf([validPlaylist(overrides)]),
    });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'rootlist-item-missing-flag',
    );
  });

  it.each([
    ['collaborators is missing', { collaborators: undefined }],
    ['collaborators is not an object', { collaborators: 'nope' }],
    ['collaborators.count is missing', { collaborators: {} }],
    ['collaborators.count is non-number', { collaborators: { count: 'one' } }],
    ['collaborators.count is zero', { collaborators: { count: 0 } }],
  ])(
    'treats playlists with %s as not collaborative',
    async (_label, overrides) => {
      stubSpicetify({
        getContents: async () => rootlistOf([validPlaylist(overrides)]),
      });
      const { playlists } = await new SpicetifyPlaylistsLoader().load();
      expect(playlists[0]?.isCollaborative).toBe(false);
    },
  );

  it.each([
    ['images is missing', { images: undefined }],
    ['images is empty', { images: [] }],
    ['first image is null', { images: [null] }],
    ['first image is not an object', { images: ['nope'] }],
    ['first image url is missing', { images: [{ label: 'standard' }] }],
    ['first image url is empty', { images: [{ url: '' }] }],
    ['first image url is non-string', { images: [{ url: 7 }] }],
  ])('returns imageUrl=null when %s', async (_label, overrides) => {
    stubSpicetify({
      getContents: async () => rootlistOf([validPlaylist(overrides)]),
    });
    const { playlists } = await new SpicetifyPlaylistsLoader().load();
    expect(playlists[0]?.imageUrl).toBeNull();
  });
});

// --- liked songs fetch + parse errors --------------------------------------

describe('SpicetifyPlaylistsLoader — liked songs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws liked-songs-fetch-failed on a rejection', async () => {
    stubSpicetify({
      getTracks: async () => {
        throw new Error('liked-down');
      },
    });
    await expectReason(
      new SpicetifyPlaylistsLoader().load(),
      'liked-songs-fetch-failed',
    );
  });

  it.each([
    ['response is a string', 'not-json'],
    ['response is null', null],
    ['totalLength is missing', { items: [], offset: 0, limit: 1 }],
    ['totalLength is a string', likedOf('seventy-three thousand')],
    ['totalLength is fractional', likedOf(1.5)],
    ['totalLength is negative', likedOf(-1)],
  ])(
    'throws liked-songs-invalid-track-count when %s',
    async (_label, response) => {
      stubSpicetify({ getTracks: async () => response });
      await expectReason(
        new SpicetifyPlaylistsLoader().load(),
        'liked-songs-invalid-track-count',
      );
    },
  );

  it('returns the totalLength as trackCount when valid', async () => {
    stubSpicetify({ getTracks: async () => likedOf(42) });
    const { likedSongs } = await new SpicetifyPlaylistsLoader().load();
    expect(likedSongs.trackCount).toBe(42);
  });
});

// --- no-mutation assertion -------------------------------------------------

describe('SpicetifyPlaylistsLoader — read-only invariant', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never invokes mutation APIs (add/remove) during load()', async () => {
    const { add, remove } = stubSpicetify({
      getContents: async () => rootlistFixture,
      getTracks: async () => likedFixture,
    });
    await new SpicetifyPlaylistsLoader().load();
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('never invokes mutation APIs on the failure path either', async () => {
    const { add, remove } = stubSpicetify({
      getContents: async () => {
        throw new Error('boom');
      },
    });
    await expect(new SpicetifyPlaylistsLoader().load()).rejects.toBeInstanceOf(
      PlaylistsLoaderError,
    );
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

// --- Contract suite parity with FakePlaylistsLoader ------------------------

/**
 * Builds a host-shaped rootlist response from a domain `RawCollection[]`.
 * The inverse of `normalizeRootlist`; used only inside this contract test
 * factory so the same `runPlaylistsLoaderContract` exercises both adapters.
 */
function buildHostRootlist(playlists: RawCollection[]): unknown {
  return {
    type: 'folder',
    name: '<root>',
    items: playlists.map((p) => ({
      type: 'playlist',
      uri: p.uri,
      name: p.name,
      owner: {
        displayName:
          p.owner.kind === 'system-library' ? 'system' : p.owner.displayName,
      },
      totalLength: p.trackCount,
      isOwnedBySelf: p.isOwnedByMe,
      canAdd: p.canEdit,
      canRemove: p.canEdit,
      collaborators: { count: p.isCollaborative ? 1 : 0 },
      images: p.imageUrl ? [{ url: p.imageUrl, label: 'standard' }] : [],
    })),
  };
}

/**
 * Per-reason stub configurator. Each entry returns a Spicetify scaffold
 * that drives the production adapter to throw exactly the requested
 * `PlaylistsLoaderErrorReason`.
 */
function configureForReason(reason: string): void {
  switch (reason) {
    case 'host-unavailable':
      vi.stubGlobal('Spicetify', undefined);
      return;
    case 'host-auth-expired':
      stubSpicetify({
        getContents: async () => {
          throw Object.assign(new Error('access token expired'), { status: 401 });
        },
      });
      return;
    case 'rootlist-fetch-failed':
      stubSpicetify({
        getContents: async () => {
          throw new Error('plain failure');
        },
      });
      return;
    case 'rootlist-item-missing-name':
      stubSpicetify({
        getContents: async () => rootlistOf([validPlaylist({ name: '' })]),
      });
      return;
    case 'rootlist-item-missing-owner':
      stubSpicetify({
        getContents: async () => rootlistOf([validPlaylist({ owner: undefined })]),
      });
      return;
    case 'rootlist-item-invalid-track-count':
      stubSpicetify({
        getContents: async () => rootlistOf([validPlaylist({ totalLength: -1 })]),
      });
      return;
    case 'rootlist-item-missing-flag':
      stubSpicetify({
        getContents: async () =>
          rootlistOf([validPlaylist({ isOwnedBySelf: undefined })]),
      });
      return;
    case 'rootlist-item-unsupported-shape':
      stubSpicetify({
        getContents: async () => 'not-an-object',
      });
      return;
    case 'liked-songs-fetch-failed':
      stubSpicetify({
        getTracks: async () => {
          throw new Error('liked-failure');
        },
      });
      return;
    case 'liked-songs-invalid-track-count':
      stubSpicetify({ getTracks: async () => ({}) });
      return;
    default:
      throw new Error(`No stub configuration for reason: ${reason}`);
  }
}

describe('SpicetifyPlaylistsLoader — shared contract suite', () => {
  afterEach(() => vi.unstubAllGlobals());

  runPlaylistsLoaderContract('SpicetifyPlaylistsLoader', (result) => {
    if ('throws' in result) {
      configureForReason(result.throws.reason);
    } else {
      stubSpicetify({
        getContents: async () => buildHostRootlist(result.playlists),
        getTracks: async () => likedOf(result.likedSongs.trackCount),
      });
    }
    return new SpicetifyPlaylistsLoader();
  });
});
