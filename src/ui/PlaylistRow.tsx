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
 * Styling (WP02 / T010): ships its own CSS module with a four-column
 * grid (cover | text | count | dedup-button) so adjacent spans cannot
 * collapse into a single visual word (FR-004 — the P2 defect). Null
 * `imageUrl` rows render a placeholder glyph instead of a broken `<img>`
 * (FR-005). The row gets a low-opacity bottom border so siblings read as
 * a list.
 *
 * WP03 (FR-001 / NFR-002 / NFR-003): mounts a `<DedupButton>` in the
 * trailing grid cell so every playlist row exposes a per-row dedup
 * affordance — see ADR-0006 for the diagnostic-only click contract.
 */

import React from 'react';
import type {
  CollectionViewModel,
  OwnerIdentity,
} from '../domain/view-models';
import { DedupButton } from './DedupButton';
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
      <DedupButton playlistName={row.displayName} playlistUri={row.key} />
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
