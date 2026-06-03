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
 */

import React from 'react';
import type {
  CollectionViewModel,
  OwnerIdentity,
} from '../domain/view-models';

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
    <li className="dedup-row dedup-row--playlist">
      <Cover imageUrl={row.imageUrl} />
      <div className="dedup-row__text">
        <span className="dedup-row__name">{row.displayName}</span>
        <span className="dedup-row__owner">{ownerLabel(row.owner)}</span>
      </div>
      <span className="dedup-row__count">
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
    return <img className="dedup-row__cover" src={imageUrl} alt="" />;
  }
  return (
    <div
      className="dedup-row__cover dedup-row__cover--placeholder"
      role="img"
      aria-label="No cover image"
    />
  );
}
