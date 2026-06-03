/**
 * Decides whether a single `RawCollection` appears in the loaded list.
 *
 * Per spec FR-001 / FR-002 / FR-004: include playlists the user owns,
 * and collaborative playlists where the user has edit rights. Exclude
 * everything else (followed playlists, curated playlists, other users'
 * playlists the user cannot mutate).
 *
 * The Liked Songs collection is NOT a `RawCollection` and is handled
 * separately by `toViewModels` (it's a `LikedSongsSummary`, pinned
 * first regardless of eligibility). This predicate never sees it.
 *
 * Pure — no React, Zustand, or Spicetify imports.
 */

import type { RawCollection } from './view-models';

export function isEligible(c: RawCollection): boolean {
  if (c.isOwnedByMe) return true;
  if (c.isCollaborative && c.canEdit) return true;
  return false;
}
