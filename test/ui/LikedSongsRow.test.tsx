/**
 * LikedSongsRow tests (T033 / WP08).
 *
 * The pinned Liked Songs row must read as distinct from a normal
 * playlist row: fixed copy ("Liked Songs" / "Your Library"), heart icon
 * marker, dedicated CSS class. View model is passed in as a prop — no
 * store wiring here.
 *
 * Numeric bounds tested for `trackCount`: 0 / 1 / nominal / large.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LikedSongsRow } from '../../src/ui/LikedSongsRow';
import type { CollectionViewModel } from '../../src/domain/view-models';

const sample = (
  overrides: Partial<CollectionViewModel> = {},
): CollectionViewModel => ({
  key: 'liked-songs',
  kind: 'liked-songs',
  displayName: 'Liked Songs',
  owner: { kind: 'system-library' },
  trackCount: 42,
  imageUrl: null,
  ...overrides,
});

describe('LikedSongsRow', () => {
  it('renders "Liked Songs" as the name', () => {
    render(<LikedSongsRow row={sample()} />);
    expect(screen.getByText('Liked Songs')).toBeInTheDocument();
  });

  it('renders "Your Library" as the owner label', () => {
    render(<LikedSongsRow row={sample()} />);
    expect(screen.getByText('Your Library')).toBeInTheDocument();
  });

  it('renders the heart icon with an accessible label', () => {
    render(<LikedSongsRow row={sample()} />);
    expect(screen.getByLabelText(/liked songs icon/i)).toBeInTheDocument();
  });

  it('carries a stable data-row-kind="liked-songs" hook for distinct styling', () => {
    // We no longer query by classname (CSS-module hashes rotate per
    // build). Instead the component exposes a stable `data-row-kind`
    // attribute so the parent (LoadedView) and the suite can route to
    // the row variant without depending on the styling layer.
    const { container } = render(<LikedSongsRow row={sample()} />);
    expect(
      container.querySelector('[data-row-kind="liked-songs"]'),
    ).not.toBeNull();
  });

  it('renders "0 tracks" at the zero-saved-tracks boundary', () => {
    render(<LikedSongsRow row={sample({ trackCount: 0 })} />);
    expect(screen.getByText(/^0 tracks$/i)).toBeInTheDocument();
  });

  it('renders "1 track" (singular) at the one-track boundary', () => {
    render(<LikedSongsRow row={sample({ trackCount: 1 })} />);
    expect(screen.getByText(/^1 track$/i)).toBeInTheDocument();
  });

  it('renders "{n} tracks" (plural) at the nominal track count', () => {
    render(<LikedSongsRow row={sample({ trackCount: 42 })} />);
    expect(screen.getByText(/^42 tracks$/i)).toBeInTheDocument();
  });

  it('renders "{n} tracks" (plural) at a large track count', () => {
    render(<LikedSongsRow row={sample({ trackCount: 50000 })} />);
    expect(screen.getByText(/^50000 tracks$/i)).toBeInTheDocument();
  });

  it('exposes the row as a listitem so the parent ul wraps it semantically', () => {
    render(
      <ul>
        <LikedSongsRow row={sample()} />
      </ul>,
    );
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  // WP02 / T010 / FR-004: row spans (heart, name, owner, count) must not
  // collapse into a single visual word. Grid/flex layout is required.
  it('FR-004 — Row uses a grid or flex layout so spans do not collapse', () => {
    render(
      <ul>
        <LikedSongsRow row={sample()} />
      </ul>,
    );
    const row = screen.getByRole('listitem');
    const display = getComputedStyle(row).display;
    expect(['grid', 'flex']).toContain(display);
  });

  // FR-004: rows have visible separation from siblings.
  it('FR-004 — Row has visible separation (non-zero border-bottom)', () => {
    render(
      <ul>
        <LikedSongsRow row={sample()} />
      </ul>,
    );
    const row = screen.getByRole('listitem');
    const cs = getComputedStyle(row);
    const hasBorder =
      (cs.borderBottomWidth !== '' && cs.borderBottomWidth !== '0px') ||
      (cs.borderBottom !== '' && !cs.borderBottom.startsWith('0px'));
    expect(hasBorder).toBe(true);
  });
});

describe('LikedSongsRow — Dedup button (WP04)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // (a) FR-001 / NFR-002 — the pinned Liked Songs row mounts a Dedup button
  //     whose accessible name is the verbatim `Dedup Liked Songs` (uniform
  //     wording per research §7.2).
  it('renders a Dedup button with accessible name "Dedup Liked Songs"', () => {
    render(<LikedSongsRow row={sample()} />);
    expect(
      screen.getByRole('button', { name: /^Dedup Liked Songs$/ }),
    ).toBeInTheDocument();
  });

  // (b) FR-003 / FR-004 — clicking the button emits exactly one diagnostic
  //     line `[Dedup] clicked: Liked Songs (spotify:collection:tracks)` via
  //     WP01's logDedupClick helper. The literals are hardcoded at the call
  //     site (research §7.1) and must propagate verbatim.
  it('logs [Dedup] clicked: Liked Songs (spotify:collection:tracks) on click', () => {
    render(<LikedSongsRow row={sample()} />);
    const button = screen.getByRole('button', {
      name: /^Dedup Liked Songs$/,
    });
    fireEvent.click(button);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: Liked Songs (spotify:collection:tracks)',
    );
  });

  // (c) NFR-003 — mounting the button must not displace the row's existing
  //     copy: "Liked Songs" / "Your Library" / the heart icon all still
  //     render alongside the new affordance.
  it('preserves Liked Songs / Your Library copy and the heart icon alongside the button', () => {
    render(<LikedSongsRow row={sample()} />);
    expect(screen.getByText('Liked Songs')).toBeInTheDocument();
    expect(screen.getByText('Your Library')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Liked Songs icon/ }),
    ).toBeInTheDocument();
  });

  // (d) Skipped: the existing `LikedSongsRow` suite already exercises the
  //     `data-row-kind="liked-songs"` routing attribute on the `<li>` (see
  //     the "carries a stable data-row-kind" test above). The attribute is
  //     set unconditionally in the source and adding a Dedup button cannot
  //     reach it. A non-regression assertion here would duplicate coverage.
});
