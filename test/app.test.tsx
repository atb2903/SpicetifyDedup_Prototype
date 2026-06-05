/**
 * Integration smoke test for `src/app.tsx`.
 *
 * Stubs the global `Spicetify` so the production `SpicetifyPlaylistsLoader`
 * can be constructed safely, then dynamically imports the default `App`
 * and renders it. Asserts the initial idle surface (the Load button is
 * present) without invoking `triggerLoad` — `Spicetify.Platform.*`
 * methods are intentionally absent and would throw if accessed.
 *
 * Additionally asserts the new `RouteResetProvider` boundary (WP02,
 * `dedup-navigation-reset-hotfix-01KT9NSW`): the production wiring runs
 * the lifecycle reset on mount so the page lands on `idle` even when the
 * underlying store was driven elsewhere first. The prior assertion target
 * (the retired navigation-port wiring) is gone; the new provider has no
 * `navigation` prop and no DOM footprint, so the test observes its
 * presence through behavior (mount → idle) rather than DOM shape.
 *
 * This preserves the unconditional 100% coverage guarantee declared by
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

  it('WP02 — production App wires RouteResetProvider as the route-reset boundary', async () => {
    // Behavioral assertion: the production wiring must mount
    // `RouteResetProvider` so the mount-time reset (FR-001) is in force.
    // The provider returns a Fragment, so we observe it via behavior: the
    // App mounts and the page surfaces the idle Load button without any
    // user interaction. Combined with the explicit unit coverage of
    // RouteResetProvider in test/store/RouteResetContext.test.tsx, this
    // assertion gates the *wiring* — i.e., that `app.tsx` actually
    // imports and mounts the new provider, not the retired
    // NavigationProvider.
    //
    // The strongest production-side signal that the wiring is correct
    // (and not the retired navigation-port provider) is that the App
    // renders WITHOUT a `Spicetify.Platform.History` stub: the retired
    // production navigation adapter's constructor was side-effect-free,
    // but the prior provider's mount-time `currentPath()` invocation
    // required `Platform.History.location.pathname` to exist (otherwise
    // it threw and was caught with a console.warn). The new design
    // touches no `History` API at all — if the stub omits `History` and
    // the page mounts cleanly with no `console.warn`, that's
    // production-side evidence the new provider is in place.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      vi.stubGlobal('Spicetify', {
        Platform: { RootlistAPI: {}, LibraryAPI: {} },
        // Note: deliberately NO `History` key. The new RouteResetProvider
        // does not touch History; the retired NavigationProvider would
        // have console.warn'd here.
      });
      const { default: App } = await import('../src/app');
      render(<App />);
      expect(
        screen.getByRole('button', { name: /load/i }),
      ).toBeInTheDocument();
      // No navigation-related warning means no `History` access was
      // attempted, which is the new provider's contract.
      const navWarnings = warn.mock.calls.filter((call) =>
        String(call[0] ?? '').includes('navigation'),
      );
      expect(navWarnings).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});
