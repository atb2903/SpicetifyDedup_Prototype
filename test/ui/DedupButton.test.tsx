// happy-dom 20.9 probe (2026-06-05): fireEvent.keyDown does NOT
// synthesise click on a focused native <button>. T009 added
// `@testing-library/user-event` as a devDependency; keyboard tests
// below use `userEvent.keyboard('{Enter}')` and `userEvent.keyboard(' ')`.
// Re-probe if happy-dom upgrades — if the probe ever passes, drop
// user-event and switch back to fireEvent.keyDown.

/**
 * Tests for `DedupButton` (WP02).
 *
 * Pins down:
 *  - FR-001 (accessible button renders)
 *  - FR-002 (one button per row, but here we cover the props contract)
 *  - FR-003 (verbatim `[Dedup] clicked: <name> (<uri>)` log line)
 *  - FR-004 (binding is preserved under mouse / keyboard interaction)
 *  - FR-007 (no Spicetify / store side effects on click)
 *  - NFR-001 (keyboard activation: Enter + Space, focusable)
 *  - NFR-002 (accessible name includes the playlist name)
 *  - SC-003 (keyboard-only interaction is enough)
 *  - Decision 8 (visible text "Dedup", name lives in aria-label)
 *  - data-model §1 string-edge boundary cases (empty, single char,
 *    500 char, mixed-special including emoji/CJK/RTL override).
 *
 * Conventions:
 *  - `console.log` is spied with `vi.spyOn(...).mockImplementation(() => {})`
 *    in `beforeEach`, restored in `afterEach`.
 *  - Side-effect isolation uses `vi.stubGlobal('Spicetify', { ... })` in
 *    `beforeEach` with `vi.unstubAllGlobals()` in `afterEach`.
 *  - String-edge tests use exact equality (`toBe`, `toHaveBeenCalledWith`).
 *  - Accessible-name regex is anchored: `/^Dedup <name>$/`.
 */

import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DedupButton } from '../../src/ui/DedupButton';

type LogSpy = ReturnType<typeof vi.spyOn>;

describe('DedupButton', () => {
  let logSpy: LogSpy;
  let rootlistGetContents: ReturnType<typeof vi.fn>;
  let libraryGetTracks: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    rootlistGetContents = vi.fn();
    libraryGetTracks = vi.fn();
    vi.stubGlobal('Spicetify', {
      Platform: {
        RootlistAPI: { getContents: rootlistGetContents },
        LibraryAPI: { getTracks: libraryGetTracks },
      },
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('renders an accessible button labelled "Dedup <name>"', () => {
    render(
      <DedupButton
        playlistName="My Playlist"
        playlistUri="spotify:playlist:abc"
      />,
    );

    const btn = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    expect(btn).toBeInTheDocument();
  });

  it('shows visible text "Dedup"', () => {
    render(
      <DedupButton
        playlistName="My Playlist"
        playlistUri="spotify:playlist:abc"
      />,
    );

    expect(screen.getByText('Dedup')).toBeInTheDocument();
  });

  it('logs [Dedup] clicked: <name> (<uri>) on mouse click', () => {
    render(
      <DedupButton
        playlistName="My Playlist"
        playlistUri="spotify:playlist:abc"
      />,
    );

    const btn = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    fireEvent.click(btn);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: My Playlist (spotify:playlist:abc)',
    );
  });

  it('logs the same line when Enter is pressed on a focused button', async () => {
    const user = userEvent.setup();
    render(
      <DedupButton
        playlistName="My Playlist"
        playlistUri="spotify:playlist:abc"
      />,
    );

    const btn = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    btn.focus();
    await user.keyboard('{Enter}');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: My Playlist (spotify:playlist:abc)',
    );
  });

  it('logs the same line when Space is pressed on a focused button', async () => {
    const user = userEvent.setup();
    render(
      <DedupButton
        playlistName="My Playlist"
        playlistUri="spotify:playlist:abc"
      />,
    );

    const btn = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    btn.focus();
    await user.keyboard(' ');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: My Playlist (spotify:playlist:abc)',
    );
  });

  it('is tab-focusable (document.activeElement after .focus())', () => {
    render(
      <DedupButton
        playlistName="My Playlist"
        playlistUri="spotify:playlist:abc"
      />,
    );

    const btn = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('does not touch any Spicetify or store API on click', () => {
    render(
      <DedupButton
        playlistName="My Playlist"
        playlistUri="spotify:playlist:abc"
      />,
    );

    const btn = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    fireEvent.click(btn);

    expect(rootlistGetContents).toHaveBeenCalledTimes(0);
    expect(libraryGetTracks).toHaveBeenCalledTimes(0);
  });
});

describe('DedupButton — string edges', () => {
  let logSpy: LogSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('handles an empty playlist name (aria-label "Dedup ", verbatim log)', () => {
    render(
      <DedupButton playlistName="" playlistUri="spotify:playlist:xyz" />,
    );

    // Accessible-name normalisation (per the ARIA spec) collapses
    // trailing whitespace, so `getByRole`'s `name:` matcher sees
    // `"Dedup"` once the playlist name is empty. The raw `aria-label`
    // attribute, which is what the log line is derived from, must
    // still hold the trailing space verbatim.
    const btn = screen.getByRole('button', { name: /^Dedup$/ });
    expect(btn.getAttribute('aria-label')).toBe('Dedup ');

    fireEvent.click(btn);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked:  (spotify:playlist:xyz)',
    );
  });

  it('handles a single-character playlist name', () => {
    render(
      <DedupButton
        playlistName="A"
        playlistUri="spotify:playlist:single"
      />,
    );

    const btn = screen.getByRole('button', { name: /^Dedup A$/ });
    expect(btn.getAttribute('aria-label')).toBe('Dedup A');

    fireEvent.click(btn);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: A (spotify:playlist:single)',
    );
  });

  it('handles a 500-character playlist name without truncation', () => {
    const longName = 'A'.repeat(500);
    render(
      <DedupButton
        playlistName={longName}
        playlistUri="spotify:playlist:long"
      />,
    );

    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe(`Dedup ${longName}`);

    fireEvent.click(btn);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      `[Dedup] clicked: ${longName} (spotify:playlist:long)`,
    );
  });

  it('handles a mixed-special playlist name (emoji / CJK / quotes / RTL override)', () => {
    const mixed = '🎵 漢字 "quoted" ‮';
    render(
      <DedupButton
        playlistName={mixed}
        playlistUri="spotify:playlist:special"
      />,
    );

    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe(`Dedup ${mixed}`);

    fireEvent.click(btn);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      `[Dedup] clicked: ${mixed} (spotify:playlist:special)`,
    );
  });
});
