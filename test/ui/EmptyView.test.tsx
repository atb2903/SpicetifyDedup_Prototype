/**
 * EmptyView tests (T030 / WP07).
 *
 * The empty state (FR-009, SC-5) must look distinct from loading and
 * failed. These assertions pin that contract: no spinner-style status
 * role, no button, no alert role.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyView } from '../../src/ui/EmptyView';

describe('EmptyView', () => {
  it('renders an empty-state message', () => {
    render(<EmptyView />);
    expect(
      screen.getByText(/no dedup-eligible collections/i),
    ).toBeInTheDocument();
  });

  it('does not render a status role (distinct from loading)', () => {
    render(<EmptyView />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not render a button (no retry affordance)', () => {
    render(<EmptyView />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render an alert role (distinct from failed)', () => {
    render(<EmptyView />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
