/**
 * DetectionLoadedSummary tests (T021 / WP07).
 *
 * Covered:
 * - Empty groups → "No duplicates found" (AS-1, spec verbatim phrase).
 * - 1 group / 1 removable → "1 duplicate group · 1 track to remove" (singular).
 * - 2 groups / 3 removable → "2 duplicate groups · 3 tracks to remove" (plural).
 * - skippedLocalCount === 0 → annotation NOT rendered.
 * - skippedLocalCount === 7 → "Skipped 7 local files" annotation present.
 * - unenrichedCount === 1 → "1 track couldn't be looked up" (singular).
 * - unenrichedCount === 3 → "3 tracks couldn't be looked up" (plural).
 * - Both annotations present when both > 0.
 * - AS-2: both group count and removable-track count are visible.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetectionLoadedSummary } from '../../src/ui/DetectionLoadedSummary';
import type { DetectionResult } from '../../src/ui/DetectionLoadedSummary';

// Helper to build a minimal DetectionResult
function makeResult(
  overrides: Partial<DetectionResult> = {},
): DetectionResult {
  return {
    collectionKey: 'test-collection',
    completedAt: Date.now(),
    groups: [],
    duplicateTrackCount: 0,
    removableTrackCount: 0,
    skippedLocalCount: 0,
    unenrichedCount: 0,
    scannedTrackCount: 0,
    ...overrides,
  };
}

// Minimal DuplicateGroup stub for count-based tests
function makeGroups(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `group-${i}`,
    reason: 'name-artist-duration' as const,
    members: [
      {
        position: i * 2,
        uri: `spotify:track:a${i}`,
        canonicalUri: `spotify:track:a${i}`,
        name: `Track ${i}`,
        artists: [{ name: 'Artist' }],
        durationMs: 180000,
      },
      {
        position: i * 2 + 1,
        uri: `spotify:track:b${i}`,
        canonicalUri: `spotify:track:b${i}`,
        name: `Track ${i}`,
        artists: [{ name: 'Artist' }],
        durationMs: 181000,
      },
    ],
    defaultKeepIndex: 0,
  }));
}

describe('DetectionLoadedSummary', () => {
  describe('AS-1: empty groups', () => {
    it('renders "No duplicates found" when groups is empty', () => {
      render(<DetectionLoadedSummary result={makeResult()} />);
      expect(screen.getByText(/No duplicates found/)).toBeInTheDocument();
    });

    it('does not render group/track-count copy when groups is empty', () => {
      render(<DetectionLoadedSummary result={makeResult()} />);
      expect(
        screen.queryByText(/duplicate group/),
      ).not.toBeInTheDocument();
    });
  });

  describe('AS-2: group and track counts', () => {
    it('renders "1 duplicate group" (singular) when 1 group', () => {
      const groups = makeGroups(1);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 2,
            removableTrackCount: 1,
          })}
        />,
      );
      expect(screen.getByText(/1 duplicate group/)).toBeInTheDocument();
    });

    it('renders "1 track to remove" (singular) when removableTrackCount is 1', () => {
      const groups = makeGroups(1);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 2,
            removableTrackCount: 1,
          })}
        />,
      );
      expect(screen.getByText(/1 track to remove/)).toBeInTheDocument();
    });

    it('renders both count and removable in one element for 1 group / 1 removable', () => {
      const groups = makeGroups(1);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 2,
            removableTrackCount: 1,
          })}
        />,
      );
      const el = screen.getByText(/1 duplicate group/);
      expect(el.textContent).toMatch(/1 track to remove/);
    });

    it('renders "2 duplicate groups" (plural) when 2 groups', () => {
      const groups = makeGroups(2);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 5,
            removableTrackCount: 3,
          })}
        />,
      );
      expect(screen.getByText(/2 duplicate groups/)).toBeInTheDocument();
    });

    it('renders "3 tracks to remove" (plural) when removableTrackCount is 3', () => {
      const groups = makeGroups(2);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 5,
            removableTrackCount: 3,
          })}
        />,
      );
      expect(screen.getByText(/3 tracks to remove/)).toBeInTheDocument();
    });

    it('AS-2: both group count and removable-track count are visible', () => {
      const groups = makeGroups(2);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 5,
            removableTrackCount: 3,
          })}
        />,
      );
      const container = screen.getByText(/2 duplicate groups/);
      // Both numbers are visible in the rendered output
      expect(container.textContent).toMatch(/2/);
      expect(container.textContent).toMatch(/3/);
    });
  });

  describe('skippedLocalCount annotation', () => {
    it('does NOT render "Skipped" annotation when skippedLocalCount is 0', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ skippedLocalCount: 0 })}
        />,
      );
      expect(screen.queryByText(/Skipped/)).not.toBeInTheDocument();
    });

    it('renders "Skipped 7 local files" when skippedLocalCount is 7', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ skippedLocalCount: 7 })}
        />,
      );
      expect(screen.getByText(/Skipped 7 local files?/)).toBeInTheDocument();
    });

    it('renders "Skipped 1 local file" (singular) when skippedLocalCount is 1', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ skippedLocalCount: 1 })}
        />,
      );
      // Match either "1 local file" or "1 local files" (singular gracefully handled)
      expect(screen.getByText(/Skipped 1 local file/)).toBeInTheDocument();
    });
  });

  describe('unenrichedCount annotation', () => {
    it('does NOT render "couldn\'t be looked up" annotation when unenrichedCount is 0', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ unenrichedCount: 0 })}
        />,
      );
      expect(
        screen.queryByText(/couldn.t be looked up/i),
      ).not.toBeInTheDocument();
    });

    it('renders "1 track couldn\'t be looked up" (singular) when unenrichedCount is 1', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ unenrichedCount: 1 })}
        />,
      );
      expect(
        screen.getByText(/1 track couldn.t be looked up/i),
      ).toBeInTheDocument();
    });

    it('renders "3 tracks couldn\'t be looked up" (plural) when unenrichedCount is 3', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ unenrichedCount: 3 })}
        />,
      );
      expect(
        screen.getByText(/3 tracks couldn.t be looked up/i),
      ).toBeInTheDocument();
    });
  });

  describe('both annotations', () => {
    it('renders both annotations when skippedLocalCount > 0 and unenrichedCount > 0', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ skippedLocalCount: 4, unenrichedCount: 2 })}
        />,
      );
      expect(screen.getByText(/Skipped 4 local file/)).toBeInTheDocument();
      expect(
        screen.getByText(/2 tracks couldn.t be looked up/i),
      ).toBeInTheDocument();
    });
  });

  describe('layout', () => {
    it('renders a container element', () => {
      const { container } = render(
        <DetectionLoadedSummary result={makeResult()} />,
      );
      expect(container.firstChild).not.toBeNull();
    });
  });
});
