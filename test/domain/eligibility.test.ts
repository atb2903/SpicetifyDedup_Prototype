import { describe, it, expect } from 'vitest';
import { isEligible } from '../../src/domain/eligibility';
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

describe('isEligible', () => {
  it('owned by me → eligible', () => {
    expect(isEligible(row({ isOwnedByMe: true }))).toBe(true);
  });
});

describe('isEligible truth table (FR-001/FR-002/FR-004)', () => {
  const cases: Array<{
    isOwnedByMe: boolean;
    isCollaborative: boolean;
    canEdit: boolean;
    expected: boolean;
  }> = [
    { isOwnedByMe: false, isCollaborative: false, canEdit: false, expected: false },
    { isOwnedByMe: false, isCollaborative: false, canEdit: true, expected: false },
    { isOwnedByMe: false, isCollaborative: true, canEdit: false, expected: false },
    { isOwnedByMe: false, isCollaborative: true, canEdit: true, expected: true },
    { isOwnedByMe: true, isCollaborative: false, canEdit: false, expected: true },
    { isOwnedByMe: true, isCollaborative: false, canEdit: true, expected: true },
    { isOwnedByMe: true, isCollaborative: true, canEdit: false, expected: true },
    { isOwnedByMe: true, isCollaborative: true, canEdit: true, expected: true },
  ];

  for (const c of cases) {
    const label = `owned=${c.isOwnedByMe} collab=${c.isCollaborative} canEdit=${c.canEdit}`;
    it(`${label} → ${c.expected}`, () => {
      expect(isEligible(row(c))).toBe(c.expected);
    });
  }
});
