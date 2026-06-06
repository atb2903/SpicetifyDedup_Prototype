/**
 * The pinned Liked Songs row (FR-003).
 *
 * Visually and structurally distinct from `PlaylistRow`:
 * - Fixed copy ("Liked Songs" / "Your Library").
 * - Heart glyph on a Spotify-purple tile as the visual marker instead
 *   of a cover image.
 * - Carries a stable `data-row-kind="liked-songs"` attribute so the
 *   parent surface (and tests) can route to the row variant without
 *   depending on the (hashed) CSS-module classname.
 *
 * Takes the same `CollectionViewModel` shape as `PlaylistRow` so
 * `LoadedView` can dispatch by `kind` without case-specific prop wiring.
 * Reads only `trackCount` off the model — name, owner, and image are
 * hardcoded because the row is system-owned.
 *
 * Styling (WP02 / T010): ships its own CSS module with the same grid
 * footprint as `PlaylistRow` so the loaded list reads as one consistent
 * surface, differing only in the heart-tile cover treatment.
 *
 * WP04 (FR-001 / NFR-002 / NFR-003): mounts a `<DedupButton>` in the
 * trailing grid cell using the hardcoded literals `"Liked Songs"` and
 * `"spotify:collection:tracks"` at the call site, per research §7.1.
 * The synthetic-row pattern already hardcodes the display name and
 * owner label, so the URI literal fits the same shape; threading a
 * `canonicalUri` field through `CollectionViewModel` would have a wide
 * blast radius (transform, view-model type, every consumer) for a
 * single call-site value. See ADR-0006 for the diagnostic-only click
 * contract.
 */

import React from 'react';
import type { CollectionViewModel } from '../domain/view-models';
import { DedupButton } from './DedupButton';
import styles from './LikedSongsRow.module.scss';

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
    <li
      className={styles.row}
      data-row-kind="liked-songs"
      data-row-name="Liked Songs"
    >
      <span
        className={styles.heart}
        role="img"
        aria-label="Liked Songs icon"
      >
        ♥
      </span>
      <div className={styles.text}>
        <span className={styles.name}>Liked Songs</span>
        <span className={styles.owner}>Your Library</span>
      </div>
      <span className={styles.count}>
        {row.trackCount === 1 ? '1 track' : `${row.trackCount} tracks`}
      </span>
      <DedupButton playlistName="Liked Songs" playlistUri="spotify:collection:tracks" />
    </li>
  );
}
