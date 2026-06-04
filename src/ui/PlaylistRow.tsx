/**
 * Per-playlist row (FR-005, SC-3).
 *
 * Presentational only — takes a `CollectionViewModel` as a prop and
 * renders the playlist's name, owner label, cover image (or accessible
 * placeholder when `imageUrl === null`), and pluralized track count.
 *
 * No store, port, or adapter imports — by design and enforced by
 * `test/architecture.test.ts`. The view-model transform (WP03) has
 * already resolved everything this component needs, so rendering is a
 * pure function of `row`.
 *
 * Styling (WP02 / T010): ships its own CSS module with a three-column
 * grid (cover | text | count) so adjacent spans cannot collapse into a
 * single visual word (FR-004 — the P2 defect). Null `imageUrl` rows
 * render a placeholder glyph instead of a broken `<img>` (FR-005). The
 * row gets a low-opacity bottom border so siblings read as a list.
 */

import React from 'react';
import type {
  CollectionViewModel,
  OwnerIdentity,
} from '../domain/view-models';
import styles from './PlaylistRow.module.scss';

/** Props for the `PlaylistRow` component. */
export type PlaylistRowProps = { row: CollectionViewModel };

/**
 * Render a single playlist row.
 *
 * Owner labels:
 * - `self` → "by you"
 * - `other` → "by {displayName}"
 * - `system-library` → "Your Library" (defensive; `LikedSongsRow` handles
 *   this variant in normal flow)
 */
export function PlaylistRow({ row }: PlaylistRowProps) {
  return (
    <li
      className={styles.row}
      data-row-kind="playlist"
      data-row-name={row.displayName}
    >
      <Cover imageUrl={row.imageUrl} />
      <div className={styles.text}>
        <span className={styles.name}>{row.displayName}</span>
        <span className={styles.owner}>{ownerLabel(row.owner)}</span>
      </div>
      <span className={styles.count}>
        {formatTrackCount(row.trackCount)}
      </span>
    </li>
  );
}

function ownerLabel(owner: OwnerIdentity): string {
  if (owner.kind === 'self') return 'by you';
  if (owner.kind === 'other') return `by ${owner.displayName}`;
  return 'Your Library';
}

function formatTrackCount(n: number): string {
  return n === 1 ? '1 track' : `${n} tracks`;
}

function Cover({ imageUrl }: { imageUrl: string | null }) {
  if (imageUrl !== null) {
    return <img className={styles.cover} src={imageUrl} alt="" />;
  }
  return (
    <div
      className={`${styles.cover} ${styles.placeholder}`}
      role="img"
      aria-label="No cover image"
    />
  );
}
