/**
 * ScanningView tests (T020 / WP07).
 *
 * Covered:
 * - Each stage ('enumerating', 'enriching', 'matching') renders its label.
 * - `total === null` renders no denominator (shows processed alone).
 * - `total === 0` renders "0 / 0" (boundary — do not divide by zero).
 * - `total > 0` renders `processed / total`.
 * - Container has `role="status"` and `aria-live="polite"`.
 * - Re-render with new progress event updates the displayed counter
 *   (regression check for prop-change handling).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScanningView } from '../../src/ui/ScanningView';
import type { ScanningViewProps } from '../../src/ui/ScanningView';

describe('ScanningView', () => {
  describe('stage labels', () => {
    it('renders "Enumerating tracks" for stage enumerating', () => {
      render(
        <ScanningView
          progress={{ stage: 'enumerating', processed: 0, total: null }}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(/Enumerating tracks/);
    });

    it('renders "Enriching catalog data" for stage enriching', () => {
      render(
        <ScanningView
          progress={{ stage: 'enriching', processed: 50, total: 100 }}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        /Enriching catalog data/,
      );
    });

    it('renders "Matching duplicates" for stage matching', () => {
      render(
        <ScanningView
          progress={{ stage: 'matching', processed: 0, total: 478 }}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(/Matching duplicates/);
    });
  });

  describe('counter display', () => {
    it('renders processed alone (no denominator) when total is null', () => {
      render(
        <ScanningView
          progress={{ stage: 'enumerating', processed: 42, total: null }}
        />,
      );
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('42');
      // Must NOT contain a slash that would indicate "X / Y"
      expect(status.textContent).not.toMatch(/42\s*\/\s*\d/);
    });

    it('renders "0 / 0" when total is 0 (boundary — no divide-by-zero)', () => {
      render(
        <ScanningView
          progress={{ stage: 'enriching', processed: 0, total: 0 }}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(/0\s*\/\s*0/);
    });

    it('renders "processed / total" when total > 0', () => {
      render(
        <ScanningView
          progress={{ stage: 'enriching', processed: 150, total: 478 }}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(/150\s*\/\s*478/);
    });

    it('renders stage label alongside the processed-only count', () => {
      render(
        <ScanningView
          progress={{ stage: 'enumerating', processed: 42, total: null }}
        />,
      );
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(/Enumerating tracks/);
      expect(status).toHaveTextContent('42');
    });

    it('renders stage label alongside processed / total', () => {
      render(
        <ScanningView
          progress={{ stage: 'matching', processed: 150, total: 478 }}
        />,
      );
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(/Matching duplicates/);
      expect(status).toHaveTextContent(/150\s*\/\s*478/);
    });
  });

  describe('ARIA attributes', () => {
    it('container has role="status"', () => {
      render(
        <ScanningView
          progress={{ stage: 'enumerating', processed: 0, total: null }}
        />,
      );
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('container has aria-live="polite"', () => {
      render(
        <ScanningView
          progress={{ stage: 'enumerating', processed: 0, total: null }}
        />,
      );
      const el = screen.getByRole('status');
      expect(el.getAttribute('aria-live')).toBe('polite');
    });
  });

  describe('prop-change regression', () => {
    it('updates the displayed counter when the progress prop changes', () => {
      const props: ScanningViewProps = {
        progress: { stage: 'enriching', processed: 10, total: 100 },
      };
      const { rerender } = render(<ScanningView {...props} />);
      expect(screen.getByRole('status')).toHaveTextContent(/10\s*\/\s*100/);

      rerender(
        <ScanningView
          progress={{ stage: 'enriching', processed: 55, total: 100 }}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(/55\s*\/\s*100/);
    });

    it('updates stage label when the stage prop changes', () => {
      const { rerender } = render(
        <ScanningView
          progress={{ stage: 'enumerating', processed: 0, total: null }}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(/Enumerating tracks/);

      rerender(
        <ScanningView
          progress={{ stage: 'matching', processed: 0, total: 200 }}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(/Matching duplicates/);
    });
  });

  describe('layout', () => {
    it('container has flex display (CSS module is injected)', () => {
      const { container } = render(
        <ScanningView
          progress={{ stage: 'enumerating', processed: 0, total: null }}
        />,
      );
      const root = container.firstChild as HTMLElement;
      expect(root).not.toBeNull();
      expect(getComputedStyle(root).display).toBe('flex');
    });
  });
});
