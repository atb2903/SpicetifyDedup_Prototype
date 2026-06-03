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
});
