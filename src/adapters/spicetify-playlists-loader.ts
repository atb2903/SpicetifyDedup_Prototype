/**
 * Production `PlaylistsLoader` adapter.
 *
 * The single module in the codebase that touches the global `Spicetify`
 * object. Reads the user's rootlist (playlist tree) from
 * `Spicetify.Platform.RootlistAPI.getContents()` and the Liked Songs
 * track count from `Spicetify.Platform.LibraryAPI.getTracks({limit:1,offset:0})`.
 *
 * Responsibilities:
 *   1. Host-availability check (`requirePlatform`).
 *   2. Per-call try/catch translation to typed `PlaylistsLoaderError`.
 *   3. Structural validation of every host item (`normalizeRootlist`)
 *      with fail-loud throws on missing/invalid fields, paired with the
 *      `isRawCollection` classifier for final structural confirmation.
 *   4. Recursive walk of the rootlist folder tree.
 *
 * The architecture test (`test/architecture.test.ts`) forbids
 * `store/` and `ui/` imports from this folder; the adapter is consumed
 * via the `PlaylistsLoader` port, never imported directly by upper
 * layers.
 *
 * Field-mapping notes (derived from captured fixtures in
 * `test/adapters/fixtures/`):
 * - `isOwnedBySelf` (host) → `isOwnedByMe` (domain).
 * - `totalLength` (host) → `trackCount` (domain).
 * - `canAdd && canRemove` (host) → `canEdit` (domain). The host's
 *   `canEditItems` flag is unreliable — it reports `false` even for
 *   user-owned playlists, so it is intentionally not consulted.
 * - `collaborators.count > 0` (host) → `isCollaborative` (domain).
 * - `images[0].url` (host) → `imageUrl` (domain). May be a
 *   `spotify:mosaic:` URI rather than an https URL; the domain accepts
 *   any non-empty string.
 */
import type { PlaylistsLoader } from '../ports/playlists-loader';
import type {
  RawCollection,
  LikedSongsSummary,
  OwnerIdentity,
} from '../domain/view-models';
import { PlaylistsLoaderError } from '../domain/errors';
import { looksLikeHostAuthExpired } from '../domain/host-auth';

export class SpicetifyPlaylistsLoader implements PlaylistsLoader {
  async load(): Promise<{
    playlists: RawCollection[];
    likedSongs: LikedSongsSummary;
  }> {
    const platform = this.requirePlatform();
    const playlists = await this.fetchRootlist(platform.RootlistAPI);
    const likedSongs = await this.fetchLikedSongs(platform.LibraryAPI);
    return { playlists, likedSongs };
  }

  private requirePlatform(): { RootlistAPI: unknown; LibraryAPI: unknown } {
    const spicetify = (globalThis as { Spicetify?: unknown }).Spicetify;
    if (
      typeof spicetify !== 'object' ||
      spicetify === null ||
      typeof (spicetify as { Platform?: unknown }).Platform !== 'object' ||
      (spicetify as { Platform?: unknown }).Platform === null
    ) {
      throw new PlaylistsLoaderError(
        'host-unavailable',
        'Spicetify.Platform is not available; cannot read library state',
      );
    }
    const platform = (spicetify as { Platform: Record<string, unknown> }).Platform;
    if (
      typeof platform.RootlistAPI !== 'object' ||
      platform.RootlistAPI === null ||
      typeof platform.LibraryAPI !== 'object' ||
      platform.LibraryAPI === null
    ) {
      throw new PlaylistsLoaderError(
        'host-unavailable',
        'Spicetify.Platform.{RootlistAPI,LibraryAPI} not available',
      );
    }
    return {
      RootlistAPI: platform.RootlistAPI,
      LibraryAPI: platform.LibraryAPI,
    };
  }

  private async fetchRootlist(api: unknown): Promise<RawCollection[]> {
    let raw: unknown;
    try {
      raw = await (api as { getContents: () => Promise<unknown> }).getContents();
    } catch (cause) {
      if (looksLikeHostAuthExpired(cause)) {
        throw new PlaylistsLoaderError(
          'host-auth-expired',
          'Spicetify.Platform.RootlistAPI.getContents() rejected with an auth-expired signal',
          { cause },
        );
      }
      throw new PlaylistsLoaderError(
        'rootlist-fetch-failed',
        'Spicetify.Platform.RootlistAPI.getContents() rejected',
        { cause },
      );
    }
    return this.normalizeRootlist(raw);
  }

  private normalizeRootlist(raw: unknown): RawCollection[] {
    if (typeof raw !== 'object' || raw === null) {
      throw new PlaylistsLoaderError(
        'rootlist-item-unsupported-shape',
        'rootlist response is not an object',
      );
    }
    const items = (raw as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      throw new PlaylistsLoaderError(
        'rootlist-item-unsupported-shape',
        'rootlist response is missing an `items` array',
      );
    }
    const out: RawCollection[] = [];
    this.walkItems(items, out);
    return out;
  }

  /**
   * Recursively walks a rootlist `items[]` array and appends one
   * `RawCollection` per accepted playlist node to `out`.
   *
   * Per-node decisions (kept in sync with the contract in
   * `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/contracts/adapter-uri-type-acceptance.md` §1):
   *
   * - `type === 'folder'` — recurses into `node.items` if present.
   * - `type === 'playlist'` or `type === 'playlist-v2'` — converted via
   *   `toRawCollection(node)` and appended to `out`. The `'playlist-v2'`
   *   acceptance is the FR-010 widening: the data model declares both
   *   variants valid, and prior to this change only `'playlist'` was
   *   honored. The widening is by *exact match* on two named types —
   *   a hypothetical `'playlist-v3'` is NOT accepted.
   * - any other string (`'show'`, `'episode'`, separators, future kinds)
   *   — silently skipped.
   * - non-object entries — throws `PlaylistsLoaderError('rootlist-item-unsupported-shape', …)`.
   *
   * @param items - the raw `items[]` array from a rootlist node.
   * @param out   - accumulator the caller passes in; mutated in place.
   */
  private walkItems(items: unknown[], out: RawCollection[]): void {
    for (const item of items) {
      if (typeof item !== 'object' || item === null) {
        throw new PlaylistsLoaderError(
          'rootlist-item-unsupported-shape',
          'rootlist contains a non-object entry',
        );
      }
      const node = item as Record<string, unknown>;
      const type = node.type;
      if (type === 'folder') {
        const childItems = node.items;
        if (Array.isArray(childItems)) {
          this.walkItems(childItems, out);
        }
        continue;
      }
      if (type === 'playlist' || type === 'playlist-v2') {
        out.push(this.toRawCollection(node));
        continue;
      }
      // Unknown node types (separators, future kinds, e.g. a hypothetical
      // 'playlist-v3', as well as 'show'/'episode') are silently skipped.
    }
  }

  private toRawCollection(node: Record<string, unknown>): RawCollection {
    const uri = node.uri;
    if (typeof uri !== 'string' || uri.length === 0) {
      throw new PlaylistsLoaderError(
        'rootlist-item-unsupported-shape',
        'playlist item missing a non-empty uri',
      );
    }
    const name = node.name;
    if (typeof name !== 'string' || name.length === 0) {
      throw new PlaylistsLoaderError(
        'rootlist-item-missing-name',
        `playlist ${uri} has no non-empty name`,
      );
    }
    const owner = this.parseOwner(node.owner, uri, node.isOwnedBySelf);
    const trackCount = node.totalLength;
    if (
      typeof trackCount !== 'number' ||
      !Number.isInteger(trackCount) ||
      trackCount < 0
    ) {
      throw new PlaylistsLoaderError(
        'rootlist-item-invalid-track-count',
        `playlist ${uri} has invalid totalLength: ${String(trackCount)}`,
      );
    }
    const isOwnedByMe = node.isOwnedBySelf;
    const canAdd = node.canAdd;
    const canRemove = node.canRemove;
    if (
      typeof isOwnedByMe !== 'boolean' ||
      typeof canAdd !== 'boolean' ||
      typeof canRemove !== 'boolean'
    ) {
      throw new PlaylistsLoaderError(
        'rootlist-item-missing-flag',
        `playlist ${uri} is missing one of isOwnedBySelf / canAdd / canRemove`,
      );
    }
    const collaborators = node.collaborators;
    const collabCount =
      typeof collaborators === 'object' && collaborators !== null
        ? (collaborators as { count?: unknown }).count
        : undefined;
    const isCollaborative = typeof collabCount === 'number' && collabCount > 0;
    const imageUrl = this.firstImageUrl(node.images);

    return {
      uri,
      name,
      owner,
      trackCount,
      imageUrl,
      isOwnedByMe,
      isCollaborative,
      canEdit: canAdd && canRemove,
    };
  }

  private parseOwner(
    raw: unknown,
    uri: string,
    isOwnedBySelf: unknown,
  ): OwnerIdentity {
    if (typeof raw !== 'object' || raw === null) {
      throw new PlaylistsLoaderError(
        'rootlist-item-missing-owner',
        `playlist ${uri} has no owner object`,
      );
    }
    const displayName = (raw as { displayName?: unknown }).displayName;
    if (typeof displayName !== 'string' || displayName.length === 0) {
      throw new PlaylistsLoaderError(
        'rootlist-item-missing-owner',
        `playlist ${uri} owner has no non-empty displayName`,
      );
    }
    return isOwnedBySelf === true
      ? { kind: 'self', displayName }
      : { kind: 'other', displayName };
  }

  private firstImageUrl(images: unknown): string | null {
    if (!Array.isArray(images) || images.length === 0) return null;
    const first = images[0];
    if (typeof first !== 'object' || first === null) return null;
    const url = (first as { url?: unknown }).url;
    return typeof url === 'string' && url.length > 0 ? url : null;
  }

  private async fetchLikedSongs(api: unknown): Promise<LikedSongsSummary> {
    let raw: unknown;
    try {
      raw = await (
        api as {
          getTracks: (p: { limit: number; offset: number }) => Promise<unknown>;
        }
      ).getTracks({ limit: 1, offset: 0 });
    } catch (cause) {
      throw new PlaylistsLoaderError(
        'liked-songs-fetch-failed',
        'Spicetify.Platform.LibraryAPI.getTracks() rejected',
        { cause },
      );
    }
    const totalLength =
      typeof raw === 'object' && raw !== null
        ? (raw as { totalLength?: unknown }).totalLength
        : undefined;
    if (
      typeof totalLength !== 'number' ||
      !Number.isInteger(totalLength) ||
      totalLength < 0
    ) {
      throw new PlaylistsLoaderError(
        'liked-songs-invalid-track-count',
        `Expected liked-songs totalLength to be a non-negative integer; got ${String(totalLength)}`,
      );
    }
    return { trackCount: totalLength };
  }
}
