/**
 * Tests for `RemovalOutcomeView` (T022 / WP06 / FR-010 / AS-8).
 *
 * Pure-props component shown by the host only in phase `partial`. States that
 * the removal partially failed and how many tracks did NOT complete
 * (`outcome.failed.length`, pluralized). The still-present copies are rendered
 * by the summary itself; this view is just the message.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RemovalOutcomeView } from '../../src/ui/RemovalOutcomeView';
import type { RemovalOutcome } from '../../src/domain/removal-types';

function outcomeWith(removedN: number, failedN: number): RemovalOutcome {
  return {
    removed: Array.from({ length: removedN }, (_, i) => ({
      uri: `spotify:track:r${i}`,
    })),
    failed: Array.from({ length: failedN }, (_, i) => ({
      track: { uri: `spotify:track:f${i}` },
      reason: 'fake-fail',
    })),
  };
}

describe('RemovalOutcomeView', () => {
  it('conveys partial failure and names the failed count (plural)', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(5, 2)} />);
    const view = screen.getByRole('status');
    expect(view.textContent).toMatch(/2/);
    expect(view.textContent).toMatch(/couldn.t be removed|did not|failed/i);
  });

  it('uses plural "tracks" for 2 failures', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(5, 2)} />);
    expect(screen.getByRole('status').textContent).toMatch(/2 tracks/);
  });

  it('uses singular "track" for exactly 1 failure', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(5, 1)} />);
    expect(screen.getByRole('status').textContent).toMatch(/1 track\b/);
  });
});
