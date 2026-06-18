/**
 * Tests for `RemovalOutcomeView` (T022 / WP06; T018 / WP03 / NFR-004 / FR-003 / FR-009).
 *
 * Pure-props component shown by the host only in phase `partial`. It branches on
 * the typed `outcome.provenance` discriminator (NFR-004 — no `startsWith` over
 * `failed[].reason` any more) to render one of these truthful messages:
 *
 * - `stalled` + nothing removed → "timed out, removed nothing" copy.
 * - `stalled` + some removed     → a truthful partial count (FR-003 — never
 *   "removed nothing" when deletions occurred).
 * - `compute-failed`            → "couldn't compute the removal" copy that names
 *   no track and no count (FR-009).
 * - `executor-failed` / `host`  → the existing truthful partial-failure copy.
 *
 * No raw stack / `RemovalError` / exception text leaks. Every branch keeps
 * `role="status"`.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RemovalOutcomeView } from '../../src/ui/RemovalOutcomeView';
import type {
  RemovalOutcome,
  RemovalOutcomeProvenance,
} from '../../src/domain/removal-types';

/** A `provenance`-tagged outcome: `removedN` removed, `failedN` failures. */
function outcomeWith(
  removedN: number,
  failedN: number,
  provenance: RemovalOutcomeProvenance = 'host',
): RemovalOutcome {
  return {
    removed: Array.from({ length: removedN }, (_, i) => ({
      uri: `spotify:track:r${i}`,
    })),
    failed: Array.from({ length: failedN }, (_, i) => ({
      track: { uri: `spotify:track:f${i}` },
      reason: 'fake-fail',
    })),
    provenance,
  };
}

describe('RemovalOutcomeView — host / executor-failed partial (truthful copy)', () => {
  it('conveys partial failure and names the failed count (plural)', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(5, 2, 'host')} />);
    const view = screen.getByRole('status');
    expect(view.textContent).toMatch(/2/);
    expect(view.textContent).toMatch(/couldn.t be removed|did not|failed/i);
  });

  it('uses plural "tracks" for 2 failures', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(5, 2, 'host')} />);
    expect(screen.getByRole('status').textContent).toMatch(/2 tracks/);
  });

  it('uses singular "track" for exactly 1 failure', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(5, 1, 'host')} />);
    expect(screen.getByRole('status').textContent).toMatch(/1 track\b/);
  });

  it('executor-failed renders the truthful partial-failure copy', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(0, 3, 'executor-failed')} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toMatch(/3 tracks/);
    expect(text).toMatch(/couldn.t be removed|did not|failed/i);
    expect(text).not.toMatch(/timed out/i);
  });
});

describe('RemovalOutcomeView — stalled (provenance-driven, FR-003)', () => {
  it('renders the timed-out / removed-nothing copy when stalled with zero removed', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(0, 1, 'stalled')} />);
    const view = screen.getByRole('status');
    expect(view.textContent).toMatch(/timed out/i);
    expect(view.textContent).toMatch(/try again/i);
  });

  it('renders a truthful partial count when stalled AFTER some progress (FR-003)', () => {
    // 3 removed before the watchdog tripped, 2 left undeleted. The view must
    // NOT claim "removed nothing"; it must surface the real removed count.
    render(<RemovalOutcomeView outcome={outcomeWith(3, 2, 'stalled')} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).not.toMatch(/removed nothing|no tracks were removed/i);
    expect(text).toMatch(/3/); // the truthful removed count
  });

  it('uses the singular "track" in the partial-stall count when exactly 1 removed', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(1, 2, 'stalled')} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toMatch(/removing 1 track\b/i);
    expect(text).not.toMatch(/1 tracks/);
  });

  it('preserves role="status" on the stall path', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(0, 2, 'stalled')} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('leaks no raw stack / RemovalError / exception / prefix text on the stall path', () => {
    render(<RemovalOutcomeView outcome={outcomeWith(0, 1, 'stalled')} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).not.toMatch(/RemovalError/);
    expect(text).not.toMatch(/stalled:/);
    expect(text).not.toMatch(/\bat\b.*\(.*:\d+:\d+\)/); // stack-frame shape
    expect(text).not.toMatch(/Error:/);
  });
});

describe('RemovalOutcomeView — compute-failed (FR-009)', () => {
  it('names no track and no count', () => {
    const outcome: RemovalOutcome = {
      removed: [],
      failed: [],
      provenance: 'compute-failed',
    };
    render(<RemovalOutcomeView outcome={outcome} />);
    const text = screen.getByRole('status').textContent ?? '';
    // FR-009: no fabricated count, no "track"/"tracks" noun.
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/\btracks?\b/i);
    // Honest "couldn't compute" framing.
    expect(text).toMatch(/couldn.t (be )?comput/i);
  });

  it('is TERMINAL — no retry-invitation wording (NEW-4 / FR-007 / SC-004)', () => {
    const outcome: RemovalOutcome = {
      removed: [],
      failed: [],
      provenance: 'compute-failed',
    };
    render(<RemovalOutcomeView outcome={outcome} />);
    const text = screen.getByRole('status').textContent ?? '';
    // No "try again" / "retry" invitation — retry cannot be dispatched.
    expect(text).not.toMatch(/try again/i);
    expect(text).not.toMatch(/\bretry\b/i);
    // States the operation cannot be retried and points to the route reset
    // (leaving / returning to the page) as the way out.
    expect(text).toMatch(/can.?not be retried|cannot be retried/i);
    expect(text).toMatch(/leav|return|page/i);
  });

  it('preserves role="status" on the compute-failed path', () => {
    const outcome: RemovalOutcome = {
      removed: [],
      failed: [],
      provenance: 'compute-failed',
    };
    render(<RemovalOutcomeView outcome={outcome} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});

describe('RemovalOutcomeView — exhaustiveness default branch (runtime guard)', () => {
  it('renders an "unknown" fallback for an unrecognised provenance (runtime-only path)', () => {
    // Cast past the closed union to reach the `never` default branch at
    // runtime, mirroring the DetectionFailedView guard. Confirms the defensive
    // fallback is in place if a future provenance is added without a case.
    const outcome: RemovalOutcome = {
      removed: [],
      failed: [],
      provenance: 'unknown-future-provenance' as RemovalOutcomeProvenance,
    };
    render(<RemovalOutcomeView outcome={outcome} />);
    expect(screen.getByText(/Removal outcome unknown/i)).toBeInTheDocument();
  });
});
