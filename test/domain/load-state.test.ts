import { describe, it, expect } from 'vitest';
import {
  transition,
  type LoadAction,
  type LoadState,
} from '../../src/domain/load-state';
import { PlaylistsLoaderError } from '../../src/domain/errors';

const REASON = new PlaylistsLoaderError('rootlist-fetch-failed', 'boom');

describe('load-state FSM', () => {
  it('idle + trigger → loading', () => {
    const next = transition({ kind: 'idle' }, { type: 'trigger' });
    expect(next).toEqual({ kind: 'loading' });
  });
});

describe('FSM transition table (data-model.md §6)', () => {
  describe('from idle', () => {
    const before: LoadState = { kind: 'idle' };

    it('idle + trigger → loading', () => {
      expect(transition(before, { type: 'trigger' })).toEqual({
        kind: 'loading',
      });
    });

    it('idle + load-succeeded → idle (ignored)', () => {
      expect(
        transition(before, { type: 'load-succeeded', items: ['x'] }),
      ).toEqual(before);
    });

    it('idle + load-completed-empty → idle (ignored)', () => {
      expect(transition(before, { type: 'load-completed-empty' })).toEqual(
        before,
      );
    });

    it('idle + load-failed → idle (ignored)', () => {
      expect(
        transition(before, { type: 'load-failed', reason: REASON }),
      ).toEqual(before);
    });

    it('idle + retry → idle (ignored)', () => {
      expect(transition(before, { type: 'retry' })).toEqual(before);
    });
  });

  describe('from loading', () => {
    const before: LoadState = { kind: 'loading' };

    it('loading + trigger → loading (ignored)', () => {
      expect(transition(before, { type: 'trigger' })).toEqual(before);
    });

    it('loading + load-succeeded → loaded with the items', () => {
      const items = ['a', 'b'];
      expect(
        transition(before, { type: 'load-succeeded', items }),
      ).toEqual({ kind: 'loaded', items });
    });

    it('loading + load-completed-empty → empty', () => {
      expect(transition(before, { type: 'load-completed-empty' })).toEqual({
        kind: 'empty',
      });
    });

    it('loading + load-failed → failed (NFR-004)', () => {
      expect(
        transition(before, { type: 'load-failed', reason: REASON }),
      ).toEqual({ kind: 'failed', reason: REASON });
    });

    it('loading + retry → loading (ignored)', () => {
      expect(transition(before, { type: 'retry' })).toEqual(before);
    });
  });

  describe('from loaded (terminal)', () => {
    const before: LoadState<number> = { kind: 'loaded', items: [1, 2, 3] };

    it('loaded + trigger → loaded (terminal)', () => {
      expect(transition(before, { type: 'trigger' })).toEqual(before);
    });

    it('loaded + load-succeeded → loaded (terminal, ignored)', () => {
      expect(
        transition(before, { type: 'load-succeeded', items: [9] }),
      ).toEqual(before);
    });

    it('loaded + load-completed-empty → loaded (terminal, ignored)', () => {
      expect(transition(before, { type: 'load-completed-empty' })).toEqual(
        before,
      );
    });

    it('loaded + load-failed → loaded (terminal, ignored)', () => {
      expect(
        transition(before, { type: 'load-failed', reason: REASON }),
      ).toEqual(before);
    });

    it('loaded + retry → loaded (terminal, ignored)', () => {
      expect(transition(before, { type: 'retry' })).toEqual(before);
    });
  });

  describe('from empty (terminal)', () => {
    const before: LoadState = { kind: 'empty' };

    it('empty + trigger → empty (terminal)', () => {
      expect(transition(before, { type: 'trigger' })).toEqual(before);
    });

    it('empty + load-succeeded → empty (terminal, ignored)', () => {
      expect(
        transition(before, { type: 'load-succeeded', items: ['x'] }),
      ).toEqual(before);
    });

    it('empty + load-completed-empty → empty (terminal, ignored)', () => {
      expect(transition(before, { type: 'load-completed-empty' })).toEqual(
        before,
      );
    });

    it('empty + load-failed → empty (terminal, ignored)', () => {
      expect(
        transition(before, { type: 'load-failed', reason: REASON }),
      ).toEqual(before);
    });

    it('empty + retry → empty (terminal, ignored)', () => {
      expect(transition(before, { type: 'retry' })).toEqual(before);
    });
  });

  describe('from failed', () => {
    const before: LoadState = { kind: 'failed', reason: REASON };

    it('failed + trigger → failed (ignored)', () => {
      expect(transition(before, { type: 'trigger' })).toEqual(before);
    });

    it('failed + load-succeeded → failed (ignored)', () => {
      expect(
        transition(before, { type: 'load-succeeded', items: ['x'] }),
      ).toEqual(before);
    });

    it('failed + load-completed-empty → failed (ignored)', () => {
      expect(transition(before, { type: 'load-completed-empty' })).toEqual(
        before,
      );
    });

    it('failed + load-failed → failed (ignored; latest reason wins via retry path only)', () => {
      const newReason = new PlaylistsLoaderError('host-auth-expired', 'expired');
      expect(
        transition(before, { type: 'load-failed', reason: newReason }),
      ).toEqual(before);
    });

    it('failed + retry → loading (FR-008)', () => {
      expect(transition(before, { type: 'retry' })).toEqual({ kind: 'loading' });
    });
  });
});

describe('FSM purity', () => {
  it('does not mutate the input state object', () => {
    const before: LoadState<number> = { kind: 'loaded', items: [1, 2, 3] };
    const snapshot = { kind: before.kind, items: [...before.items] };
    transition(before, { type: 'trigger' });
    expect(before.kind).toBe(snapshot.kind);
    expect(before.items).toEqual(snapshot.items);
  });

  it('returns a new object on a real transition (no reference equality)', () => {
    const before: LoadState = { kind: 'idle' };
    const after = transition(before, { type: 'trigger' });
    expect(after).not.toBe(before);
  });
});

describe('boundary: items.length', () => {
  it('loading + load-succeeded with 1 item → loaded with that 1 item (min)', () => {
    const next = transition(
      { kind: 'loading' },
      { type: 'load-succeeded', items: ['a'] },
    );
    expect(next).toEqual({ kind: 'loaded', items: ['a'] });
  });

  it('loading + load-succeeded with 2 items → loaded with those 2 items (nominal)', () => {
    const next = transition(
      { kind: 'loading' },
      { type: 'load-succeeded', items: ['a', 'b'] },
    );
    expect(next).toEqual({ kind: 'loaded', items: ['a', 'b'] });
  });

  it('loading + load-completed-empty → empty (the empty-list path)', () => {
    expect(
      transition({ kind: 'loading' }, { type: 'load-completed-empty' }),
    ).toEqual({ kind: 'empty' });
  });

  it('loading + load-succeeded with 1000 items → loaded with 1000 items (NFR-002 headroom max)', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const next = transition(
      { kind: 'loading' },
      { type: 'load-succeeded', items },
    );
    expect(next.kind).toBe('loaded');
    expect((next as { kind: 'loaded'; items: number[] }).items.length).toBe(
      1000,
    );
  });

  it('loading + load-succeeded with 1001 items → loaded with 1001 items (max+1; FSM is permissive)', () => {
    const items = Array.from({ length: 1001 }, (_, i) => i);
    const next = transition(
      { kind: 'loading' },
      { type: 'load-succeeded', items },
    );
    expect(next.kind).toBe('loaded');
    expect((next as { kind: 'loaded'; items: number[] }).items.length).toBe(
      1001,
    );
  });

  it('loading + load-succeeded with empty array → loaded with empty array (the store is responsible for not dispatching this)', () => {
    const next = transition(
      { kind: 'loading' },
      { type: 'load-succeeded', items: [] },
    );
    expect(next).toEqual({ kind: 'loaded', items: [] });
  });
});

describe('LoadAction type union exhaustiveness', () => {
  it('accepts every documented action variant at the value level', () => {
    const actions: LoadAction[] = [
      { type: 'trigger' },
      { type: 'load-succeeded', items: [1, 2, 3] },
      { type: 'load-completed-empty' },
      { type: 'load-failed', reason: REASON },
      { type: 'retry' },
    ];
    for (const action of actions) {
      const next = transition({ kind: 'loading' }, action);
      expect(next.kind).toBeDefined();
    }
  });
});
