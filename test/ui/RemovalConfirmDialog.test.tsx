/**
 * Tests for `RemovalConfirmDialog` (T021 / WP06 / FR-005 / FR-006 / FR-007 / NFR-001).
 *
 * Pure-props component (no store): the host wires `onConfirm`/`onCancel`.
 * - Step-1 copy names the collection and the EXACT count and that the earliest
 *   copy of each group is kept.
 * - Step-2 copy is the bulk reconfirmation naming the count again.
 * - Distinct Cancel/Remove controls; click → the matching callback once.
 * - NFR-001: the destructive `Remove` is NOT the auto-focused single-keypress
 *   default (assert `document.activeElement`).
 * - Boundary copy at count 24/25/26 renders the exact number.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RemovalConfirmDialog } from '../../src/ui/RemovalConfirmDialog';

describe('RemovalConfirmDialog — step 1 copy', () => {
  it('names the collection and the exact count', () => {
    render(
      <RemovalConfirmDialog
        collectionName="My Playlist"
        count={3}
        step={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/My Playlist/);
    expect(dialog.textContent).toMatch(/3/);
  });

  it('states that the earliest copy of each duplicate is kept', () => {
    render(
      <RemovalConfirmDialog
        collectionName="My Playlist"
        count={3}
        step={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog').textContent).toMatch(/earliest copy/i);
  });

  it('pluralizes "tracks" for count 3', () => {
    render(
      <RemovalConfirmDialog
        collectionName="P"
        count={3}
        step={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog').textContent).toMatch(/3 tracks/);
  });

  it('uses singular "track" for count 1', () => {
    render(
      <RemovalConfirmDialog
        collectionName="P"
        count={1}
        step={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog').textContent).toMatch(/1 track\b/);
  });
});

describe('RemovalConfirmDialog — step 2 (bulk reconfirmation)', () => {
  it('is an explicit bulk reconfirmation naming the count', () => {
    render(
      <RemovalConfirmDialog
        collectionName="My Playlist"
        count={40}
        step={2}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/40/);
    expect(dialog.textContent).toMatch(/confirm/i);
  });
});

describe('RemovalConfirmDialog — controls', () => {
  it('Cancel click calls onCancel once and not onConfirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <RemovalConfirmDialog
        collectionName="P"
        count={3}
        step={1}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Remove click calls onConfirm once and not onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <RemovalConfirmDialog
        collectionName="P"
        count={3}
        step={1}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('RemovalConfirmDialog — NFR-001 accidental-activation guard', () => {
  it('does NOT autofocus the destructive Remove button on mount', () => {
    render(
      <RemovalConfirmDialog
        collectionName="P"
        count={3}
        step={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const removeBtn = screen.getByRole('button', { name: /^Remove$/ });
    expect(document.activeElement).not.toBe(removeBtn);
  });

  it('focuses Cancel by default on mount', () => {
    render(
      <RemovalConfirmDialog
        collectionName="P"
        count={3}
        step={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /^Cancel$/ }),
    );
  });
});

describe('RemovalConfirmDialog — boundary copy (NFR-003)', () => {
  it.each([24, 25, 26])('renders the exact count %i', (count) => {
    render(
      <RemovalConfirmDialog
        collectionName="P"
        count={count}
        step={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog').textContent).toMatch(
      new RegExp(`${count} tracks`),
    );
  });
});
