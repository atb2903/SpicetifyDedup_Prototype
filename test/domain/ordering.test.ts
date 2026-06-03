import { describe, it, expect } from 'vitest';
import { orderRootlist } from '../../src/domain/ordering';
import type { RawCollection } from '../../src/domain/view-models';

function row(overrides: Partial<RawCollection>): RawCollection {
  return {
    uri: 'spotify:playlist:0',
    name: 'Test',
    owner: { kind: 'self', displayName: 'me' },
    trackCount: 0,
    imageUrl: null,
    isOwnedByMe: false,
    isCollaborative: false,
    canEdit: false,
    ...overrides,
  };
}

describe('orderRootlist (FR-006)', () => {
  it('preserves input order', () => {
    const a = row({ uri: 'spotify:playlist:a', name: 'A' });
    const b = row({ uri: 'spotify:playlist:b', name: 'B' });
    const c = row({ uri: 'spotify:playlist:c', name: 'C' });
    expect(orderRootlist([a, b, c])).toEqual([a, b, c]);
  });

  it('returns a new array (callers may safely mutate the result)', () => {
    const input = [row({ uri: 'spotify:playlist:a' })];
    const output = orderRootlist(input);
    expect(output).not.toBe(input);
  });

  it('returns an empty array when given an empty array', () => {
    expect(orderRootlist([])).toEqual([]);
  });
});
