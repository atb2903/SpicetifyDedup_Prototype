/**
 * Narrow ambient typings for the `Spicetify.Platform` sub-namespaces this
 * project depends on.
 *
 * The official `spicetify/cli/globals.d.ts` types `Spicetify.Platform` as
 * `any` (it is an internal, unstable, undocumented surface). This file
 * augments that namespace with just the methods the load-dedupable-playlists
 * iteration consumes, so the production adapter (`src/adapters/`, WP05) gets
 * field-access checking under `tsc --noEmit`.
 *
 * Refined in WP05 against the captured Devtools fixture; widened again in WP04
 * for the removal seam (`LibraryAPI.remove`, `PlaylistAPI.remove`, and the
 * playlist-item `uid` field). The adapter's runtime validator/guard remains
 * authoritative if the live shape ever drifts from what is declared here.
 */

declare namespace Spicetify {
  namespace Platform {
    interface RootlistAPI {
      /**
       * Returns the user's rootlist (folder tree of playlists). Exact method
       * name and response shape captured live in WP05; treated as `unknown`
       * here so call sites must explicitly narrow before consuming.
       */
      getContents(...args: unknown[]): Promise<unknown>;
    }

    interface LibraryAPI {
      /**
       * Returns paged saved tracks. WP01 + WP05 only need `totalLength` for
       * the Liked Songs row's track count; later iterations widen the
       * `items` type from `unknown[]` when track-level enrichment lands.
       */
      getTracks(params: { limit: number; offset: number }): Promise<{
        items: unknown[];
        totalLength: number;
        offset: number;
        limit: number;
      }>;

      /** Delete saved tracks by URI. URIs are unique in the saved set. (WP04, live-verified) */
      remove(param: { uris: string[]; silent?: boolean }): Promise<void>;
    }

    interface PlaylistAPI {
      /** Delete specific playlist occurrences by `{ uri, uid }`. (WP04, live-verified) */
      remove(playlistUri: string, tracks: { uri: string; uid: string }[]): Promise<void>;

      /**
       * Returns paged playlist contents. Each item carries a `uid` (the
       * per-occurrence id used by {@link PlaylistAPI.remove}). Item element
       * type stays `unknown` so call sites narrow at the runtime guard.
       */
      getContents(uri: string, params: { limit: number; offset: number }): Promise<{
        items: unknown[];
        totalLength: number;
        offset: number;
        limit: number;
      }>;
    }

    const RootlistAPI: RootlistAPI;
    const LibraryAPI: LibraryAPI;
    const PlaylistAPI: PlaylistAPI;
  }
}
