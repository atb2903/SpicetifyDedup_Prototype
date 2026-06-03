/**
 * PlaylistRow tests (T032 / WP08).
 *
 * Pure presentational component — view model in via props, no store.
 * Covers owner-identity variants (self / other), placeholder image
 * fallback, long-name passthrough, and the singular/plural boundary on
 * `trackCount` (0 / 1 / nominal / large) per charter.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaylistRow } from '../../src/ui/PlaylistRow';
import type { CollectionViewModel } from '../../src/domain/view-models';

const sample = (
  overrides: Partial<CollectionViewModel> = {},
): CollectionViewModel => ({
  key: 'spotify:playlist:abc',
  kind: 'playlist',
  displayName: 'My Playlist',
  owner: { kind: 'self', displayName: 'me' },
  trackCount: 10,
  imageUrl: 'https://i.scdn.co/image/abc',
  ...overrides,
});

describe('PlaylistRow', () => {
  it('shows the playlist name', () => {
    render(<PlaylistRow row={sample()} />);
    expect(screen.getByText('My Playlist')).toBeInTheDocument();
  });

  it('shows "by you" for self-owned playlists', () => {
    render(
      <PlaylistRow
        row={sample({ owner: { kind: 'self', displayName: 'me' } })}
      />,
    );
    expect(screen.getByText(/by you/i)).toBeInTheDocument();
  });

  it('shows "by {displayName}" for other-owned (collaborative) playlists', () => {
    render(
      <PlaylistRow
        row={sample({ owner: { kind: 'other', displayName: 'friend' } })}
      />,
    );
    expect(screen.getByText(/by friend/i)).toBeInTheDocument();
  });

  it('renders the cover image when imageUrl is provided', () => {
    // The cover img uses alt="" (correct ARIA for decorative imagery
    // adjacent to descriptive text); query by tag, not by role.
    const { container } = render(
      <PlaylistRow
        row={sample({ imageUrl: 'https://example.com/cover.jpg' })}
      />,
    );
    const img = container.querySelector('img.dedup-row__cover');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('does not render a placeholder when imageUrl is provided', () => {
    render(
      <PlaylistRow
        row={sample({ imageUrl: 'https://example.com/cover.jpg' })}
      />,
    );
    expect(screen.queryByLabelText(/no cover image/i)).not.toBeInTheDocument();
  });

  it('renders a placeholder with an accessible label when imageUrl is null', () => {
    render(<PlaylistRow row={sample({ imageUrl: null })} />);
    expect(screen.getByLabelText(/no cover image/i)).toBeInTheDocument();
  });

  it('passes very long names through verbatim', () => {
    const long = 'A'.repeat(500);
    render(<PlaylistRow row={sample({ displayName: long })} />);
    expect(screen.getByText(long)).toBeInTheDocument();
  });

  it('renders "0 tracks" at the zero-track boundary', () => {
    render(<PlaylistRow row={sample({ trackCount: 0 })} />);
    expect(screen.getByText(/^0 tracks$/i)).toBeInTheDocument();
  });

  it('renders "1 track" (singular) at the one-track boundary', () => {
    render(<PlaylistRow row={sample({ trackCount: 1 })} />);
    expect(screen.getByText(/^1 track$/i)).toBeInTheDocument();
  });

  it('renders "{n} tracks" (plural) at the nominal track count', () => {
    render(<PlaylistRow row={sample({ trackCount: 10 })} />);
    expect(screen.getByText(/^10 tracks$/i)).toBeInTheDocument();
  });

  it('renders "{n} tracks" (plural) at a large track count', () => {
    render(<PlaylistRow row={sample({ trackCount: 1000 })} />);
    expect(screen.getByText(/^1000 tracks$/i)).toBeInTheDocument();
  });

  it('carries a li role so the parent ul can wrap it semantically', () => {
    render(
      <ul>
        <PlaylistRow row={sample()} />
      </ul>,
    );
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  it('defensively renders "Your Library" when given a system-library owner', () => {
    // LoadedView dispatches system-library rows to LikedSongsRow, but
    // OwnerIdentity's type signature includes the variant — exercise the
    // defensive branch so the contract is explicit.
    render(
      <PlaylistRow row={sample({ owner: { kind: 'system-library' } })} />,
    );
    expect(screen.getByText('Your Library')).toBeInTheDocument();
  });
});
