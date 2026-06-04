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
import styles from '../src/ui/DedupPage.module.scss';

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

  it('FR-001 — production App renders DedupPage inside a wrapper bearing the page CSS-module class', async () => {
    // Belt-and-suspenders sibling to the unit assertion in
    // test/ui/DedupPage.test.tsx: production wiring (App → provider →
    // DedupPage) must surface the wrapper element so the topbar offset
    // applies in the live client, not just in isolated unit renders.
    vi.stubGlobal('Spicetify', {
      Platform: { RootlistAPI: {}, LibraryAPI: {} },
    });
    const { default: App } = await import('../src/app');
    const { container } = render(<App />);
    const pageClass = (styles as { page?: string }).page;
    expect(typeof pageClass).toBe('string');
    expect(pageClass).not.toBe('');
    // The wrapper sits at (or under) the App's root. Locate it by class
    // rather than position so any benign top-level provider wrapping
    // does not break the assertion.
    const wrapper = container.querySelector(`.${pageClass}`);
    expect(wrapper).not.toBeNull();
    // The Load button must live inside the wrapper.
    const btn = screen.getByRole('button', { name: /load/i });
    expect(wrapper!.contains(btn)).toBe(true);
  });
});
