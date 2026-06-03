/**
 * Integration smoke test for `src/app.tsx` (T037 / WP09).
 *
 * Stubs the global `Spicetify` so the production `SpicetifyPlaylistsLoader`
 * can be constructed safely, then dynamically imports the default `App`
 * and renders it. Asserts the initial idle surface (the Load button is
 * present) without invoking `triggerLoad` — `Spicetify.Platform.*`
 * methods are intentionally absent and would throw if accessed.
 *
 * This preserves the unconditional 100 % coverage guarantee declared by
 * the charter: the wiring lines in `src/app.tsx` (singleton creation +
 * provider JSX) are exercised by exactly this one test.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('src/app.tsx', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('mounts the Dedup page in the idle state (no host fetches)', async () => {
    vi.stubGlobal('Spicetify', {
      Platform: { RootlistAPI: {}, LibraryAPI: {} },
    });
    const { default: App } = await import('../src/app');
    render(<App />);
    expect(
      screen.getByRole('button', { name: /load/i }),
    ).toBeInTheDocument();
  });
});
