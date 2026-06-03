/**
 * Orders the host rootlist for rendering.
 *
 * Today this is the identity function (with a shallow copy): the host
 * already returns rootlist items in the user's native library order, and
 * FR-006 says we honor that. Exported as a named function so future
 * iterations (alphabetical-sort toggle, recently-modified-first, etc.)
 * can extend the ordering rule without touching call sites.
 *
 * Liked Songs pinning is NOT done here — `toViewModels` owns that, since
 * Liked Songs is a separate input (`LikedSongsSummary`), not a member of
 * the `RawCollection` array.
 *
 * Returns a shallow copy so callers may safely mutate the result without
 * affecting the caller-owned input array.
 *
 * Pure — no React, Zustand, or Spicetify imports.
 */

import type { RawCollection } from './view-models';

export function orderRootlist(items: RawCollection[]): RawCollection[] {
  return [...items];
}
