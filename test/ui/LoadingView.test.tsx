/**
 * LoadingView tests (T029 / WP07).
 *
 * Stateless, propless component. Asserts the accessibility contract
 * (role=status with a meaningful accessible name) and that the component
 * renders without props or context.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingView } from '../../src/ui/LoadingView';

describe('LoadingView', () => {
  it('renders without crashing when given no props', () => {
    render(<LoadingView />);
    // No assertion beyond render succeeding; absence of throw is the test.
  });

  it('exposes a status role for assistive tech', () => {
    render(<LoadingView />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('gives the status region a meaningful accessible name', () => {
    render(<LoadingView />);
    expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i);
  });

  it('shows user-facing copy explaining the wait', () => {
    render(<LoadingView />);
    expect(
      screen.getByText(/loading your dedup-able playlists/i),
    ).toBeInTheDocument();
  });

  // WP02 / T009 / FR-006: the spinner must be visually recognizable as a
  // spinner — a CSS animation shorthand is present on the spinner span.
  // Assert via getComputedStyle on the spinner element (queried by
  // aria-hidden); we cannot rely on classnames (CSS-module hash is
  // unstable). happy-dom does not expand the `animation` shorthand into
  // its longhand `animation-name`, so we assert on the shorthand string.
  it('FR-006 — Loading view renders a recognisable spinner element with an animation', () => {
    const { container } = render(<LoadingView />);
    const spinner = container.querySelector('[aria-hidden="true"]');
    expect(spinner).not.toBeNull();
    const cs = getComputedStyle(spinner as Element);
    expect(cs.animation).not.toBe('');
    expect(cs.animation).toMatch(/infinite/);
  });

  // FR-003: the loading container has its own layout (centred flex)
  // distinguishing it from the idle view's centred layout via the
  // presence of a spinner element above the copy.
  it('FR-003 — Loading view container has a non-default flex layout', () => {
    const { container } = render(<LoadingView />);
    const root = container.firstChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(getComputedStyle(root).display).toBe('flex');
  });
});
