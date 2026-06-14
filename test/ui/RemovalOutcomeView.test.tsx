/**
 * Tests for `RemovalOutcomeView` (T022 / WP06 / FR-010 / AS-8; T012 / WP04 / NFR-004).
 *
 * Pure-props component shown by the host only in phase `partial`. It renders
 * one of two messages, derived purely from `outcome`:
 *
 * - A **timed-out** message when the outcome is an all-failed *stall* (every
 *   `failed[].reason` begins with the `stalled:` prefix WP03 writes in the
 *   store's catch). No raw stack / `RemovalError` / exception text leaks
 *   (NFR-004).
 * - The existing **partial-failure** message otherwise — naming how many
 *   tracks did NOT complete (`outcome.failed.length`, pluralized).
 *
 * The still-present copies are rendered by the summary itself; this view is
 * just the message. Both branches are asserted to keep `role="status"`.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RemovalOutcomeView } from '../../src/ui/RemovalOutcomeView';
import type { RemovalOutcome } from '../../src/domain/removal-types';

/** A non-stalled partial outcome: `removedN` removed, `failedN` ordinary failures. */
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

/**
 * An all-failed *stall* outcome: every failure carries the `stalled:` prefix
 * the store's catch writes for a ceiling timeout (WP03), e.g.
 * `stalled: RemovalExecutor.remove exceeded the stall ceiling`.
 */
function stalledOutcome(failedN: number): RemovalOutcome {
  return {
    removed: [],
    failed: Array.from({ length: failedN }, (_, i) => ({
      track: { uri: `spotify:track:f${i}` },
      reason: 'stalled: RemovalExecutor.remove exceeded the stall ceiling',
    })),
  };
}

describe('RemovalOutcomeView — generic partial failure', () => {
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

  it('uses the generic copy when some tracks DID remove (not all-failed)', () => {
    // One removed + one `stalled:`-prefixed failure → NOT a stall (not all-failed).
    const mixed: RemovalOutcome = {
      removed: [{ uri: 'spotify:track:r0' }],
      failed: [{ track: { uri: 'spotify:track:f0' }, reason: 'stalled: x' }],
    };
    render(<RemovalOutcomeView outcome={mixed} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toMatch(/couldn.t be removed|did not|failed/i);
    expect(text).not.toMatch(/timed out/i);
  });

  it('uses the generic copy when reasons are mixed (not every failure stalled)', () => {
    const mixed: RemovalOutcome = {
      removed: [],
      failed: [
        { track: { uri: 'spotify:track:f0' }, reason: 'stalled: x' },
        { track: { uri: 'spotify:track:f1' }, reason: 'executor-failed: y' },
      ],
    };
    render(<RemovalOutcomeView outcome={mixed} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).not.toMatch(/timed out/i);
    expect(text).toMatch(/couldn.t be removed|did not|failed/i);
  });
});

describe('RemovalOutcomeView — stall (timed-out copy, NFR-004)', () => {
  it('renders the plain-language timed-out message for an all-stalled outcome', () => {
    render(<RemovalOutcomeView outcome={stalledOutcome(1)} />);
    const view = screen.getByRole('status');
    expect(view.textContent).toMatch(/timed out/i);
    expect(view.textContent).toMatch(/try again/i);
  });

  it('renders the timed-out message regardless of failed count (plural)', () => {
    render(<RemovalOutcomeView outcome={stalledOutcome(3)} />);
    expect(screen.getByRole('status').textContent).toMatch(/timed out/i);
  });

  it('preserves role="status" on the stall path', () => {
    render(<RemovalOutcomeView outcome={stalledOutcome(2)} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('leaks no raw stack / RemovalError / exception text in the message', () => {
    render(<RemovalOutcomeView outcome={stalledOutcome(1)} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).not.toMatch(/RemovalError/);
    expect(text).not.toMatch(/stalled:/);
    expect(text).not.toMatch(/\bat\b.*\(.*:\d+:\d+\)/); // stack-frame shape
    expect(text).not.toMatch(/Error:/);
  });
});
