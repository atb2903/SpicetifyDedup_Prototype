/**
 * Production `NavigationPort` adapter.
 *
 * The only module besides `SpicetifyPlaylistsLoader` that reads from the
 * global `Spicetify` object. Wraps `Spicetify.Platform.History.listen`
 * (the same primitive `data-porter` uses) and reads
 * `Spicetify.Platform.History.location.pathname` for the current path.
 *
 * Responsibilities (mirrors `SpicetifyPlaylistsLoader.requirePlatform`):
 *   1. Host-availability check on every public method call. Missing
 *      `Spicetify`, `Platform`, `History`, or `History.location` →
 *      `PlaylistsLoaderError('host-unavailable', …)`.
 *   2. Forward `History.listen` subscription and its returned
 *      unsubscribe handle to the caller, mapping `loc.pathname` from
 *      the host event object to the port's flat-string listener
 *      signature.
 *
 * **Error catalog choice** (per contract §2): reuses
 * `PlaylistsLoaderError` with reason `'host-unavailable'` rather than
 * introducing a separate `NavigationPortError` class. Reason: the
 * error catalog stays unified at one class, and the React error
 * boundary that catches loader unavailability also catches navigation
 * unavailability without code duplication. ADR-0004 documents this
 * decision and the conditions under which a future iteration might
 * split the catalog.
 *
 * Architecture (`test/architecture.test.ts`): adapters may NOT import
 * from `store/` or `ui/`. This file imports only the port type and the
 * shared typed error from `src/domain/`.
 */
import type { NavigationPort } from '../ports/navigation';
import { PlaylistsLoaderError } from '../domain/errors';

/** Shape the adapter expects from `Spicetify.Platform.History`. Validated
 *  at runtime in `requireHistory` before any access. */
interface HostHistory {
  listen: (listener: (loc: { pathname: string }) => void) => () => void;
  location: { pathname: string };
}

export class SpicetifyNavigation implements NavigationPort {
  subscribe(listener: (path: string) => void): () => void {
    const history = this.requireHistory();
    return history.listen((loc) => listener(loc.pathname));
  }

  currentPath(): string {
    const history = this.requireHistory();
    if (typeof history.location.pathname !== 'string') {
      throw new PlaylistsLoaderError(
        'host-unavailable',
        'Spicetify.Platform.History.location.pathname is not a string',
      );
    }
    return history.location.pathname;
  }

  /**
   * Walks `globalThis.Spicetify.Platform.History` and throws
   * `host-unavailable` if any segment is missing or wrong-typed. Mirrors
   * `SpicetifyPlaylistsLoader.requirePlatform`'s shape so behaviour
   * (and the error message format) stays uniform across host adapters.
   */
  private requireHistory(): HostHistory {
    const spicetify = (globalThis as { Spicetify?: unknown }).Spicetify;
    if (
      typeof spicetify !== 'object' ||
      spicetify === null ||
      typeof (spicetify as { Platform?: unknown }).Platform !== 'object' ||
      (spicetify as { Platform?: unknown }).Platform === null
    ) {
      throw new PlaylistsLoaderError(
        'host-unavailable',
        'Spicetify.Platform is not available; cannot read navigation state',
      );
    }
    const platform = (spicetify as { Platform: Record<string, unknown> })
      .Platform;
    const history = platform.History;
    if (typeof history !== 'object' || history === null) {
      throw new PlaylistsLoaderError(
        'host-unavailable',
        'Spicetify.Platform.History is not available',
      );
    }
    const location = (history as { location?: unknown }).location;
    if (typeof location !== 'object' || location === null) {
      throw new PlaylistsLoaderError(
        'host-unavailable',
        'Spicetify.Platform.History.location is not available',
      );
    }
    return history as HostHistory;
  }
}
