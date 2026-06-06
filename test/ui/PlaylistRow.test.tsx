/**
 * PlaylistRow tests (T032 / WP08).
 *
 * Pure presentational component — view model in via props, no store.
 * Covers owner-identity variants (self / other), placeholder image
 * fallback, long-name passthrough, and the singular/plural boundary on
 * `trackCount` (0 / 1 / nominal / large) per charter.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    // adjacent to descriptive text); query by tag, not by role. We query
    // by `<img>` rather than by the CSS-module classname because the
    // module hash rotates per build.
    const { container } = render(
      <PlaylistRow
        row={sample({ imageUrl: 'https://example.com/cover.jpg' })}
      />,
    );
    const img = container.querySelector('img');
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

  // WP02 / T010 / FR-004: the row spans (cover, name, owner, count) must
  // NOT collapse into a single visual word. Asserts the row uses a
  // grid/flex layout so the spans are positioned, not inlined.
  it('FR-004 — Row uses a grid or flex layout so spans do not collapse', () => {
    render(
      <ul>
        <PlaylistRow row={sample()} />
      </ul>,
    );
    const row = screen.getByRole('listitem');
    const display = getComputedStyle(row).display;
    expect(['grid', 'flex']).toContain(display);
  });

  // WP02 / T010 / FR-004: rows must have visible separation from siblings.
  // Asserts a non-zero `border-bottom-width` (the styling approach the
  // module uses) so adjacent rows do not visually run together.
  it('FR-004 — Row has visible separation (non-zero border-bottom)', () => {
    render(
      <ul>
        <PlaylistRow row={sample()} />
      </ul>,
    );
    const row = screen.getByRole('listitem');
    const cs = getComputedStyle(row);
    // happy-dom returns the shorthand `border-bottom` or the longhand
    // `border-bottom-width`; either signalling presence is acceptable.
    const hasBorder =
      (cs.borderBottomWidth !== '' && cs.borderBottomWidth !== '0px') ||
      (cs.borderBottom !== '' && !cs.borderBottom.startsWith('0px'));
    expect(hasBorder).toBe(true);
  });
});

describe('PlaylistRow — Dedup button (WP03)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // (a) FR-001 — every playlist row mounts a Dedup button whose accessible
  //     name is `Dedup <playlistName>` (NFR-002 contract from WP02).
  it('renders a Dedup button on every playlist row', () => {
    render(
      <PlaylistRow
        row={sample({
          displayName: 'My Playlist',
          key: 'spotify:playlist:abc',
        })}
      />,
    );
    expect(
      screen.getByRole('button', { name: /^Dedup My Playlist$/ }),
    ).toBeInTheDocument();
  });

  // (b) FR-002 / FR-004 — the row binds the button to its own display name
  //     and key (URI) so click activation logs that row's identity exactly
  //     once via WP01's logDedupClick helper.
  it("binds the button to the row's display name and key (URI)", () => {
    render(
      <PlaylistRow
        row={sample({
          displayName: 'My Playlist',
          key: 'spotify:playlist:abc',
        })}
      />,
    );
    const button = screen.getByRole('button', {
      name: /^Dedup My Playlist$/,
    });
    fireEvent.click(button);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: My Playlist (spotify:playlist:abc)',
    );
  });

  // (c) NFR-003 — mounting the button must not truncate the playlist's
  //     display name, owner label, or formatted track count. Long-name +
  //     multi-track fixture mirrors the pattern used earlier in this file.
  it('does not truncate the playlist name, owner label, or track count when the button is present', () => {
    const long = 'A'.repeat(500);
    render(
      <PlaylistRow
        row={sample({
          displayName: long,
          owner: { kind: 'other', displayName: 'friend' },
          trackCount: 1000,
        })}
      />,
    );
    // (i) Display name is fully present (no truncation).
    expect(screen.getByText(long)).toBeInTheDocument();
    // (ii) Owner label is present.
    expect(screen.getByText(/by friend/i)).toBeInTheDocument();
    // (iii) Formatted track count is present.
    expect(screen.getByText(/^1000 tracks$/i)).toBeInTheDocument();
  });

  // (d) Skipped: the existing `PlaylistRow` suite already exercises the
  //     `data-row-kind="playlist"` routing attribute implicitly through
  //     the `<li>` rendering — the attribute is set unconditionally in
  //     the source and adding a Dedup button cannot reach it. The
  //     non-regression assertion would duplicate existing coverage.
});
