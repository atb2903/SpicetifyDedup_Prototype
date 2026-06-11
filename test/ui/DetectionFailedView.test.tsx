/**
 * DetectionFailedView tests (T022 / WP07).
 *
 * Covered:
 * - One it() per non-'aborted' reason — asserts the literal label substring.
 * - 'catalog-rejected' with context.status === 403 → label includes "(status 403)".
 * - 'catalog-rejected' with no context.status → label omits status fragment.
 * - 'aborted' → defensive fallback rendered ("Scan cancelled").
 * - Exhaustiveness: iterates over all 7 reasons and asserts each produces output.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetectionFailedView } from '../../src/ui/DetectionFailedView';
import type { DetectionError } from '../../src/ui/DetectionFailedView';

// All 7 DetectionErrorReason values — compile-checked against the union
const ALL_REASONS = [
  'auth-token-expired',
  'rate-limit-unparseable',
  'network-failure',
  'malformed-enrichment-payload',
  'enumerator-failed',
  'catalog-rejected',
  'aborted',
] as const;

function makeError(
  reason: DetectionError['reason'],
  context?: DetectionError['context'],
): DetectionError {
  return { reason, message: `error: ${reason}`, context };
}

describe('DetectionFailedView', () => {
  describe('per-reason label assertions', () => {
    it('renders the auth-token-expired label', () => {
      render(
        <DetectionFailedView reason={makeError('auth-token-expired')} />,
      );
      expect(
        screen.getByText(/Spotify signed out mid-scan/i),
      ).toBeInTheDocument();
    });

    it('renders the rate-limit-unparseable label', () => {
      render(
        <DetectionFailedView reason={makeError('rate-limit-unparseable')} />,
      );
      expect(
        screen.getByText(/Spotify is throttling/i),
      ).toBeInTheDocument();
    });

    it('renders the network-failure label', () => {
      render(
        <DetectionFailedView reason={makeError('network-failure')} />,
      );
      expect(
        screen.getByText(/Couldn't reach Spotify/i),
      ).toBeInTheDocument();
    });

    it('renders the malformed-enrichment-payload label', () => {
      render(
        <DetectionFailedView
          reason={makeError('malformed-enrichment-payload')}
        />,
      );
      expect(
        screen.getByText(/Spotify returned unexpected data/i),
      ).toBeInTheDocument();
    });

    it('renders the enumerator-failed label', () => {
      render(
        <DetectionFailedView reason={makeError('enumerator-failed')} />,
      );
      expect(
        screen.getByText(/Couldn't read the playlist contents/i),
      ).toBeInTheDocument();
    });

    it('renders the catalog-rejected label without status when context is absent', () => {
      render(
        <DetectionFailedView reason={makeError('catalog-rejected')} />,
      );
      const el = screen.getByText(/Spotify rejected the catalog lookup/i);
      expect(el).toBeInTheDocument();
      // No "(status ...)" fragment when context.status is absent
      expect(el.textContent).not.toMatch(/\(status \d+\)/);
    });

    it('renders catalog-rejected with "(status 403)" when context.status is 403', () => {
      render(
        <DetectionFailedView
          reason={makeError('catalog-rejected', { status: 403 })}
        />,
      );
      expect(
        screen.getByText(/Spotify rejected the catalog lookup/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/\(status 403\)/),
      ).toBeInTheDocument();
    });

    it('omits status fragment when context.status is absent (catalog-rejected)', () => {
      render(
        <DetectionFailedView
          reason={makeError('catalog-rejected', {})}
        />,
      );
      const el = screen.getByText(/Spotify rejected the catalog lookup/i);
      expect(el.textContent).not.toMatch(/\(status/);
    });

    it('renders defensive fallback "Scan cancelled" for aborted (bug path)', () => {
      render(
        <DetectionFailedView reason={makeError('aborted')} />,
      );
      expect(screen.getByText(/Scan cancelled/i)).toBeInTheDocument();
    });
  });

  describe('exhaustiveness: all 7 reasons render something', () => {
    it.each(ALL_REASONS)('reason %s produces visible output', (reason) => {
      const ctx =
        reason === 'catalog-rejected' ? { status: 400 } : undefined;
      render(
        <DetectionFailedView reason={makeError(reason, ctx)} />,
      );
      // The container should have text content
      const { container } = render(
        <DetectionFailedView reason={makeError(reason, ctx)} />,
      );
      expect(
        (container.firstChild as HTMLElement)?.textContent?.trim().length,
      ).toBeGreaterThan(0);
    });
  });

  describe('role attribute', () => {
    it('container has role="alert"', () => {
      render(
        <DetectionFailedView reason={makeError('network-failure')} />,
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('exhaustiveness default branch (runtime guard)', () => {
    it('renders "Unknown error" fallback for an unrecognised reason (runtime-only path)', () => {
      // Cast to bypass TypeScript's closed union so we can reach the `never`
      // default branch at runtime. This verifies the defensive fallback is in
      // place if a future reason variant is added without updating this switch.
      const unknownError = makeError(
        'unknown-future-reason' as DetectionError['reason'],
      );
      render(<DetectionFailedView reason={unknownError} />);
      expect(screen.getByText(/Unknown error/i)).toBeInTheDocument();
    });
  });
});
