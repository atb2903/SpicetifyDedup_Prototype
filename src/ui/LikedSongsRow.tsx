/**
 * The pinned Liked Songs row (FR-003).
 *
 * Visually and structurally distinct from `PlaylistRow`:
 * - Fixed copy ("Liked Songs" / "Your Library").
 * - Heart glyph as the visual marker instead of a cover image.
 * - Dedicated CSS class (`dedup-row--liked-songs`) for separate styling.
 *
 * Takes the same `CollectionViewModel` shape as `PlaylistRow` so
 * `LoadedView` can dispatch by `kind` without case-specific prop wiring.
 * Reads only `trackCount` off the model — name, owner, and image are
 * hardcoded because the row is system-owned.
 */

import React from 'react';
import type { CollectionViewModel } from '../domain/view-models';

/** Props for the `LikedSongsRow` component. */
export type LikedSongsRowProps = { row: CollectionViewModel };

/**
 * Render the pinned Liked Songs row.
 *
 * A future iteration may swap the literal heart glyph for
 * `Spicetify.ReactComponent.IconComponent` with the `'heart'` icon name;
 * the glyph is sufficient for the current iteration and avoids a host
 * dependency in the test suite.
 */
export function LikedSongsRow({ row }: LikedSongsRowProps) {
  return (
    <li className="dedup-row dedup-row--liked-songs">
      <span
        className="dedup-row__heart"
        role="img"
        aria-label="Liked Songs icon"
      >
        ♥
      </span>
      <div className="dedup-row__text">
        <span className="dedup-row__name">Liked Songs</span>
        <span className="dedup-row__owner">Your Library</span>
      </div>
      <span className="dedup-row__count">
        {row.trackCount === 1 ? '1 track' : `${row.trackCount} tracks`}
      </span>
    </li>
  );
}
