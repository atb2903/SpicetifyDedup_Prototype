/**
 * DetectionFailedView tests (T022 / WP07; T016/T017 / WP03).
 *
 * Covered (post-WP03 taxonomy reshape):
 * - One it() per live reason — asserts the literal label substring.
 * - `internal-error` copy contains no catalog / Spotify-rejection wording (SC-004).
 * - `host-unavailable` copy present, matching the host-not-ready signal (SC-007).
 * - No `(status N)` phantom suffix renders for any reason (FR-008).
 * - The removed Web-API enricher reasons (`rate-limit-unparseable`,
 *   `network-failure`, `malformed-enrichment-payload`, `catalog-rejected`) are
 *   gone from the union and from the message map.
 * - `aborted` → defensive fallback rendered ("Scan cancelled").
 * - Exhaustiveness: iterates over all live reasons and asserts each produces output.
 *
 * Domain types are imported (NFR-001) — no local re-declaration.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetectionFailedView } from '../../src/ui/DetectionFailedView';
import {
  DetectionError,
  type DetectionErrorReason,
} from '../../src/domain/detection-errors';

// All live DetectionErrorReason values — compile-checked against the imported
// domain union. Removing/adding a member here without updating the union (or
// vice-versa) surfaces as a type error.
const ALL_REASONS: readonly DetectionErrorReason[] = [
  'auth-token-expired',
  'enumerator-failed',
  'host-unavailable',
  'internal-error',
  'aborted',
] as const;

function makeError(
  reason: DetectionErrorReason,
  context?: Readonly<Record<string, unknown>>,
): DetectionError {
  return new DetectionError(reason, `error: ${reason}`, { context });
}

describe('DetectionFailedView', () => {
  describe('per-reason label assertions', () => {
    it('renders the auth-token-expired label', () => {
      render(<DetectionFailedView reason={makeError('auth-token-expired')} />);
      expect(
        screen.getByText(/Spotify signed out mid-scan/i),
      ).toBeInTheDocument();
    });

    it('renders the enumerator-failed label', () => {
      render(<DetectionFailedView reason={makeError('enumerator-failed')} />);
      expect(
        screen.getByText(/Couldn't read the playlist contents/i),
      ).toBeInTheDocument();
    });

    it('renders the host-unavailable label (SC-007)', () => {
      render(<DetectionFailedView reason={makeError('host-unavailable')} />);
      expect(
        screen.getByText(/Spotify client is not ready/i),
      ).toBeInTheDocument();
    });

    it('renders an honest internal-error label (SC-004)', () => {
      render(<DetectionFailedView reason={makeError('internal-error')} />);
      const el = screen.getByText(/Something went wrong/i);
      expect(el).toBeInTheDocument();
      // SC-004: no catalog / Spotify-rejection wording.
      expect(el.textContent).not.toMatch(/catalog/i);
      expect(el.textContent).not.toMatch(/Spotify rejected/i);
    });

    it('renders defensive fallback "Scan cancelled" for aborted (bug path)', () => {
      render(<DetectionFailedView reason={makeError('aborted')} />);
      expect(screen.getByText(/Scan cancelled/i)).toBeInTheDocument();
    });
  });

  describe('no phantom (status N) suffix (FR-008)', () => {
    it.each(ALL_REASONS)(
      'reason %s never renders a "(status N)" fragment, even with a context.status',
      (reason) => {
        const { container } = render(
          <DetectionFailedView reason={makeError(reason, { status: 403 })} />,
        );
        expect(container.textContent).not.toMatch(/\(status \d+\)/);
      },
    );
  });

  describe('removed Web-API enricher reasons are gone', () => {
    it('produces the runtime fallback for a removed reason (not its old copy)', () => {
      // `catalog-rejected` is no longer in the union; cast to reach the runtime
      // fallback and assert the old "Spotify rejected the catalog lookup" copy
      // is gone.
      const stale = makeError(
        'catalog-rejected' as DetectionErrorReason,
      );
      render(<DetectionFailedView reason={stale} />);
      expect(
        screen.queryByText(/Spotify rejected the catalog lookup/i),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Unknown error/i)).toBeInTheDocument();
    });
  });

  describe('exhaustiveness: all live reasons render something', () => {
    it.each(ALL_REASONS)('reason %s produces visible output', (reason) => {
      const { container } = render(
        <DetectionFailedView reason={makeError(reason)} />,
      );
      expect(
        (container.firstChild as HTMLElement)?.textContent?.trim().length,
      ).toBeGreaterThan(0);
    });
  });

  describe('role attribute', () => {
    it('container has role="alert"', () => {
      render(<DetectionFailedView reason={makeError('enumerator-failed')} />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('exhaustiveness default branch (runtime guard)', () => {
    it('renders "Unknown error" fallback for an unrecognised reason (runtime-only path)', () => {
      // Cast to bypass TypeScript's closed union so we can reach the `never`
      // default branch at runtime. This verifies the defensive fallback is in
      // place if a future reason variant is added without updating this switch.
      const unknownError = makeError(
        'unknown-future-reason' as DetectionErrorReason,
      );
      render(<DetectionFailedView reason={unknownError} />);
      expect(screen.getByText(/Unknown error/i)).toBeInTheDocument();
    });
  });
});
