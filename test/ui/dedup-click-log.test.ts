/**
 * Tests for the `logDedupClick` diagnostic helper (WP01, FR-003).
 *
 * Asserts the verbatim-passthrough log format
 *   `[Dedup] clicked: <name> (<uri>)`
 * for the three spec edge-case inputs (ASCII, empty name, mixed special
 * characters with quotes + emoji). Each test spies on `console.log`,
 * invokes the helper once, and asserts the spy was called exactly once
 * with the single expected string. The spy is restored in `afterEach` so
 * other suites are unaffected.
 *
 * Exact-equality (`toBe` / `toHaveBeenCalledWith`) is used throughout —
 * see WP01 §Risks: the spec's edge cases assert verbatim passthrough, so
 * substring matches would mask a hidden newline or trailing space.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { logDedupClick } from '../../src/ui/dedup-click-log';

describe('logDedupClick', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('emits [Dedup] clicked: <name> (<uri>) for an ASCII playlist', () => {
    logDedupClick('My Playlist', 'spotify:playlist:abc');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: My Playlist (spotify:playlist:abc)',
    );
  });

  it('emits the verbatim format when name is empty', () => {
    logDedupClick('', 'spotify:playlist:xyz');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked:  (spotify:playlist:xyz)',
    );
  });

  it('emits the verbatim format when name has quotes and emoji', () => {
    logDedupClick('has "quotes" and 🎵', 'spotify:playlist:special');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: has "quotes" and 🎵 (spotify:playlist:special)',
    );
  });
});
