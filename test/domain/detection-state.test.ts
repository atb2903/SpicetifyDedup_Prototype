/**
 * Exhaustive test of the DetectionState FSM transition table.
 *
 * data-model.md §5.3 defines 4 states × 5 scan actions = 20 cells.
 * data-model.md §5.1 adds the removal sub-FSM on `loaded.removal`:
 * 5 removal phases × 6 removal actions = 30 cells, plus the `confirmFirst`
 * boundary booleans and the non-loaded ignores.
 * One `it()` per cell; every "ignored" cell asserts reference equality.
 */
import { describe, it, expect } from 'vitest';
import {
  transition,
  type DetectionState,
  type DetectionAction,
  type RemovalState,
} from '../../src/domain/detection-state';
import { DetectionError } from '../../src/domain/detection-errors';
import type { ProgressEvent, DetectionResult } from '../../src/domain/detection-types';
import type {
  RemovalOutcome,
  RemovalProgressEvent,
  TrackRef,
} from '../../src/domain/removal-types';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const PROGRESS_EVENT: ProgressEvent = {
  stage: 'enriching',
  processed: 10,
  total: 100,
};

const DETECTION_RESULT: DetectionResult = {
  collectionKey: 'liked-songs',
  completedAt: 1_700_000_000_000,
  groups: [],
  duplicateTrackCount: 0,
  removableTrackCount: 0,
  skippedLocalCount: 0,
  unenrichedCount: 0,
  scannedTrackCount: 50,
};

const DETECTION_ERROR = new DetectionError('network-failure', 'host unreachable');

// A non-empty result so removeComplete's new result is distinguishable from
// the pre-removal one by reference.
const REMOVAL_RESULT: DetectionResult = {
  collectionKey: 'liked-songs',
  completedAt: 1_700_000_000_001,
  groups: [],
  duplicateTrackCount: 0,
  removableTrackCount: 0,
  skippedLocalCount: 0,
  unenrichedCount: 0,
  scannedTrackCount: 50,
};

const TRACK_REF: TrackRef = { uri: 'spotify:track:abc' };

const REMOVAL_PROGRESS: RemovalProgressEvent = { removedSoFar: 3, total: 10 };

const OUTCOME_ALL_OK: RemovalOutcome = {
  removed: [TRACK_REF],
  failed: [],
};

const OUTCOME_PARTIAL: RemovalOutcome = {
  removed: [],
  failed: [{ track: TRACK_REF, reason: 'host rejected' }],
};

// Initial scanning state used for "from scanning" tests
function makeScanningState(): DetectionState {
  return { kind: 'scanning', progress: PROGRESS_EVENT };
}

function makeLoadedState(removal: RemovalState = { phase: 'none' }): DetectionState {
  return { kind: 'loaded', result: DETECTION_RESULT, removal };
}

function makeFailedState(): DetectionState {
  return { kind: 'failed', reason: DETECTION_ERROR };
}

// ── FSM transition table (data-model.md §5.3) ─────────────────────────────────

describe('DetectionState FSM — full 4×5 transition grid', () => {

  // ── From idle ───────────────────────────────────────────────────────────────
  describe('from idle', () => {
    const before: DetectionState = { kind: 'idle' };

    it('cell [idle, start] → scanning (initial progress with stage=enumerating, processed=0, total=null)', () => {
      const after = transition(before, { type: 'start' });
      expect(after.kind).toBe('scanning');
      if (after.kind === 'scanning') {
        expect(after.progress.stage).toBe('enumerating');
        expect(after.progress.processed).toBe(0);
        expect((after.progress as { stage: 'enumerating'; processed: number; total: number | null }).total).toBeNull();
      }
    });

    it('cell [idle, progress] → idle (ignored, same reference)', () => {
      const after = transition(before, { type: 'progress', event: PROGRESS_EVENT });
      expect(after).toBe(before);
    });

    it('cell [idle, complete] → idle (ignored, same reference)', () => {
      const after = transition(before, { type: 'complete', result: DETECTION_RESULT });
      expect(after).toBe(before);
    });

    it('cell [idle, fail] → idle (ignored, same reference)', () => {
      const after = transition(before, { type: 'fail', reason: DETECTION_ERROR });
      expect(after).toBe(before);
    });

    it('cell [idle, cancel] → idle (fresh object, kind=idle)', () => {
      const after = transition(before, { type: 'cancel' });
      expect(after.kind).toBe('idle');
    });
  });

  // ── From scanning ───────────────────────────────────────────────────────────
  describe('from scanning', () => {
    it('cell [scanning, start] → scanning (ignored, same reference)', () => {
      const before = makeScanningState();
      const after = transition(before, { type: 'start' });
      expect(after).toBe(before);
    });

    it('cell [scanning, progress] → scanning (new object with the action event by reference)', () => {
      const before = makeScanningState();
      const newEvent: ProgressEvent = { stage: 'matching', processed: 0, total: 50 };
      const after = transition(before, { type: 'progress', event: newEvent });
      expect(after.kind).toBe('scanning');
      expect(after).not.toBe(before);
      if (after.kind === 'scanning') {
        expect(after.progress).toBe(newEvent); // event by reference
      }
    });

    it('cell [scanning, complete] → loaded (carries result, removal phase=none)', () => {
      const before = makeScanningState();
      const after = transition(before, { type: 'complete', result: DETECTION_RESULT });
      expect(after.kind).toBe('loaded');
      if (after.kind === 'loaded') {
        expect(after.result).toBe(DETECTION_RESULT);
        expect(after.removal).toEqual({ phase: 'none' });
      }
    });

    it('cell [scanning, fail] → failed (carries reason)', () => {
      const before = makeScanningState();
      const after = transition(before, { type: 'fail', reason: DETECTION_ERROR });
      expect(after.kind).toBe('failed');
      if (after.kind === 'failed') {
        expect(after.reason).toBe(DETECTION_ERROR);
      }
    });

    it('cell [scanning, cancel] → idle (fresh idle object)', () => {
      const before = makeScanningState();
      const after = transition(before, { type: 'cancel' });
      expect(after.kind).toBe('idle');
    });
  });

  // ── From loaded ─────────────────────────────────────────────────────────────
  describe('from loaded', () => {
    it('cell [loaded, start] → scanning (fresh scanning with enumerating/0/null)', () => {
      const before = makeLoadedState();
      const after = transition(before, { type: 'start' });
      expect(after.kind).toBe('scanning');
      if (after.kind === 'scanning') {
        expect(after.progress.stage).toBe('enumerating');
        expect(after.progress.processed).toBe(0);
        expect((after.progress as { stage: 'enumerating'; processed: number; total: number | null }).total).toBeNull();
      }
    });

    it('cell [loaded, progress] → loaded (ignored, same reference)', () => {
      const before = makeLoadedState();
      const after = transition(before, { type: 'progress', event: PROGRESS_EVENT });
      expect(after).toBe(before);
    });

    it('cell [loaded, complete] → loaded (ignored, same reference)', () => {
      const before = makeLoadedState();
      const after = transition(before, { type: 'complete', result: DETECTION_RESULT });
      expect(after).toBe(before);
    });

    it('cell [loaded, fail] → loaded (ignored, same reference)', () => {
      const before = makeLoadedState();
      const after = transition(before, { type: 'fail', reason: DETECTION_ERROR });
      expect(after).toBe(before);
    });

    it('cell [loaded, cancel] → idle (fresh idle object)', () => {
      const before = makeLoadedState();
      const after = transition(before, { type: 'cancel' });
      expect(after.kind).toBe('idle');
    });
  });

  // ── From failed ─────────────────────────────────────────────────────────────
  describe('from failed', () => {
    it('cell [failed, start] → scanning (fresh scanning with enumerating/0/null)', () => {
      const before = makeFailedState();
      const after = transition(before, { type: 'start' });
      expect(after.kind).toBe('scanning');
      if (after.kind === 'scanning') {
        expect(after.progress.stage).toBe('enumerating');
        expect(after.progress.processed).toBe(0);
        expect((after.progress as { stage: 'enumerating'; processed: number; total: number | null }).total).toBeNull();
      }
    });

    it('cell [failed, progress] → failed (ignored, same reference)', () => {
      const before = makeFailedState();
      const after = transition(before, { type: 'progress', event: PROGRESS_EVENT });
      expect(after).toBe(before);
    });

    it('cell [failed, complete] → failed (ignored, same reference)', () => {
      const before = makeFailedState();
      const after = transition(before, { type: 'complete', result: DETECTION_RESULT });
      expect(after).toBe(before);
    });

    it('cell [failed, fail] → failed (ignored, same reference)', () => {
      const before = makeFailedState();
      const after = transition(before, { type: 'fail', reason: DETECTION_ERROR });
      expect(after).toBe(before);
    });

    it('cell [failed, cancel] → idle (fresh idle object)', () => {
      const before = makeFailedState();
      const after = transition(before, { type: 'cancel' });
      expect(after.kind).toBe('idle');
    });
  });
});

// ── Allocation guarantees ─────────────────────────────────────────────────────

describe('DetectionState FSM — allocation guarantees', () => {
  it('start from loaded allocates a fresh scanning object (not same reference)', () => {
    const before = makeLoadedState();
    const after = transition(before, { type: 'start' });
    expect(after).not.toBe(before);
  });

  it('start from failed allocates a fresh scanning object (not same reference)', () => {
    const before = makeFailedState();
    const after = transition(before, { type: 'start' });
    expect(after).not.toBe(before);
  });

  it('start from idle allocates a fresh scanning object (not same reference)', () => {
    const before: DetectionState = { kind: 'idle' };
    const after = transition(before, { type: 'start' });
    expect(after).not.toBe(before);
  });

  it('progress from scanning allocates new state but keeps event by reference', () => {
    const before = makeScanningState();
    const event: ProgressEvent = { stage: 'matching', processed: 50, total: 50 };
    const after = transition(before, { type: 'progress', event });
    expect(after).not.toBe(before);
    if (after.kind === 'scanning') {
      expect(after.progress).toBe(event);
    }
  });

  it('cancel from any state returns a fresh idle object', () => {
    const states: DetectionState[] = [
      { kind: 'idle' },
      makeScanningState(),
      makeLoadedState(),
      makeFailedState(),
    ];
    for (const state of states) {
      const after = transition(state, { type: 'cancel' });
      expect(after.kind).toBe('idle');
    }
  });
});

// ── Exhaustiveness check on DetectionAction union ────────────────────────────

describe('DetectionAction union — every variant is exercised at the value level', () => {
  it('accepts every documented action variant without TypeScript error', () => {
    const actions: DetectionAction[] = [
      { type: 'start' },
      { type: 'progress', event: PROGRESS_EVENT },
      { type: 'complete', result: DETECTION_RESULT },
      { type: 'fail', reason: DETECTION_ERROR },
      { type: 'cancel' },
      { type: 'removeRequest' },
      { type: 'confirmFirst', requiresSecondConfirm: false },
      { type: 'confirmSecond' },
      { type: 'removeCancel' },
      { type: 'removeProgress', event: REMOVAL_PROGRESS },
      { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_ALL_OK },
    ];
    for (const action of actions) {
      const next = transition({ kind: 'idle' }, action);
      expect(next.kind).toBeDefined();
    }
  });
});

// ── Removal sub-FSM (data-model.md §5.1) ──────────────────────────────────────

/**
 * Helper: assert `after` is `loaded` and return its `removal` phase. Fails the
 * test if `after` is not `loaded`.
 */
function loadedRemoval(state: DetectionState): RemovalState {
  expect(state.kind).toBe('loaded');
  if (state.kind !== 'loaded') throw new Error('expected loaded');
  return state.removal;
}

// The six removal actions, used to drive the non-loaded ignore sweep.
const REMOVAL_ACTIONS: DetectionAction[] = [
  { type: 'removeRequest' },
  { type: 'confirmFirst', requiresSecondConfirm: false },
  { type: 'confirmSecond' },
  { type: 'removeCancel' },
  { type: 'removeProgress', event: REMOVAL_PROGRESS },
  { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_ALL_OK },
];

describe('Removal sub-FSM — full 5×6 grid on loaded.removal', () => {
  // ── from removal phase `none` ───────────────────────────────────────────────
  describe('from loaded.removal=none', () => {
    it('cell [none, removeRequest] → confirming', () => {
      const after = transition(makeLoadedState({ phase: 'none' }), { type: 'removeRequest' });
      expect(loadedRemoval(after)).toEqual({ phase: 'confirming' });
    });
    it('cell [none, confirmFirst] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'none' });
      expect(transition(before, { type: 'confirmFirst', requiresSecondConfirm: false })).toBe(before);
    });
    it('cell [none, confirmSecond] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'none' });
      expect(transition(before, { type: 'confirmSecond' })).toBe(before);
    });
    it('cell [none, removeCancel] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'none' });
      expect(transition(before, { type: 'removeCancel' })).toBe(before);
    });
    it('cell [none, removeProgress] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'none' });
      expect(transition(before, { type: 'removeProgress', event: REMOVAL_PROGRESS })).toBe(before);
    });
    it('cell [none, removeComplete] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'none' });
      expect(transition(before, { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_ALL_OK })).toBe(before);
    });
  });

  // ── from removal phase `confirming` ─────────────────────────────────────────
  describe('from loaded.removal=confirming', () => {
    it('cell [confirming, removeRequest] → ignored (FR-012 concurrency, same reference)', () => {
      const before = makeLoadedState({ phase: 'confirming' });
      expect(transition(before, { type: 'removeRequest' })).toBe(before);
    });
    it('cell [confirming, confirmFirst{false}] → removing', () => {
      const after = transition(makeLoadedState({ phase: 'confirming' }), { type: 'confirmFirst', requiresSecondConfirm: false });
      expect(loadedRemoval(after)).toEqual({ phase: 'removing' });
    });
    it('cell [confirming, confirmFirst{true}] → confirming2', () => {
      const after = transition(makeLoadedState({ phase: 'confirming' }), { type: 'confirmFirst', requiresSecondConfirm: true });
      expect(loadedRemoval(after)).toEqual({ phase: 'confirming2' });
    });
    it('cell [confirming, confirmSecond] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'confirming' });
      expect(transition(before, { type: 'confirmSecond' })).toBe(before);
    });
    it('cell [confirming, removeCancel] → none', () => {
      const after = transition(makeLoadedState({ phase: 'confirming' }), { type: 'removeCancel' });
      expect(loadedRemoval(after)).toEqual({ phase: 'none' });
    });
    it('cell [confirming, removeProgress] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'confirming' });
      expect(transition(before, { type: 'removeProgress', event: REMOVAL_PROGRESS })).toBe(before);
    });
    it('cell [confirming, removeComplete] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'confirming' });
      expect(transition(before, { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_ALL_OK })).toBe(before);
    });
  });

  // ── from removal phase `confirming2` ────────────────────────────────────────
  describe('from loaded.removal=confirming2', () => {
    it('cell [confirming2, removeRequest] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'confirming2' });
      expect(transition(before, { type: 'removeRequest' })).toBe(before);
    });
    it('cell [confirming2, confirmFirst] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'confirming2' });
      expect(transition(before, { type: 'confirmFirst', requiresSecondConfirm: true })).toBe(before);
    });
    it('cell [confirming2, confirmSecond] → removing', () => {
      const after = transition(makeLoadedState({ phase: 'confirming2' }), { type: 'confirmSecond' });
      expect(loadedRemoval(after)).toEqual({ phase: 'removing' });
    });
    it('cell [confirming2, removeCancel] → none', () => {
      const after = transition(makeLoadedState({ phase: 'confirming2' }), { type: 'removeCancel' });
      expect(loadedRemoval(after)).toEqual({ phase: 'none' });
    });
    it('cell [confirming2, removeProgress] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'confirming2' });
      expect(transition(before, { type: 'removeProgress', event: REMOVAL_PROGRESS })).toBe(before);
    });
    it('cell [confirming2, removeComplete] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'confirming2' });
      expect(transition(before, { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_ALL_OK })).toBe(before);
    });
  });

  // ── from removal phase `removing` ───────────────────────────────────────────
  describe('from loaded.removal=removing', () => {
    it('cell [removing, removeRequest] → ignored (FR-012, same reference)', () => {
      const before = makeLoadedState({ phase: 'removing' });
      expect(transition(before, { type: 'removeRequest' })).toBe(before);
    });
    it('cell [removing, confirmFirst] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'removing' });
      expect(transition(before, { type: 'confirmFirst', requiresSecondConfirm: false })).toBe(before);
    });
    it('cell [removing, confirmSecond] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'removing' });
      expect(transition(before, { type: 'confirmSecond' })).toBe(before);
    });
    it('cell [removing, removeCancel] → ignored (same reference)', () => {
      const before = makeLoadedState({ phase: 'removing' });
      expect(transition(before, { type: 'removeCancel' })).toBe(before);
    });
    it('cell [removing, removeProgress] → removing carrying the new progress', () => {
      const before = makeLoadedState({ phase: 'removing' });
      const after = transition(before, { type: 'removeProgress', event: REMOVAL_PROGRESS });
      expect(after).not.toBe(before);
      const removal = loadedRemoval(after);
      expect(removal.phase).toBe('removing');
      if (removal.phase === 'removing') {
        expect(removal.progress).toBe(REMOVAL_PROGRESS); // event by reference
      }
    });
    it('cell [removing, removeComplete{failed=[]}] → loaded(result, none)', () => {
      const before = makeLoadedState({ phase: 'removing' });
      const after = transition(before, { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_ALL_OK });
      expect(after.kind).toBe('loaded');
      if (after.kind === 'loaded') {
        expect(after.result).toBe(REMOVAL_RESULT);
        expect(after.removal).toEqual({ phase: 'none' });
      }
    });
    it('cell [removing, removeComplete{failed≠[]}] → loaded(result, partial carrying outcome)', () => {
      const before = makeLoadedState({ phase: 'removing' });
      const after = transition(before, { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_PARTIAL });
      expect(after.kind).toBe('loaded');
      if (after.kind === 'loaded') {
        expect(after.result).toBe(REMOVAL_RESULT);
        expect(after.removal.phase).toBe('partial');
        if (after.removal.phase === 'partial') {
          expect(after.removal.outcome).toBe(OUTCOME_PARTIAL);
        }
      }
    });
  });

  // ── from removal phase `partial` ────────────────────────────────────────────
  describe('from loaded.removal=partial', () => {
    const partial: RemovalState = { phase: 'partial', outcome: OUTCOME_PARTIAL };
    it('cell [partial, removeRequest] → confirming (retry)', () => {
      const after = transition(makeLoadedState(partial), { type: 'removeRequest' });
      expect(loadedRemoval(after)).toEqual({ phase: 'confirming' });
    });
    it('cell [partial, confirmFirst] → ignored (same reference)', () => {
      const before = makeLoadedState(partial);
      expect(transition(before, { type: 'confirmFirst', requiresSecondConfirm: false })).toBe(before);
    });
    it('cell [partial, confirmSecond] → ignored (same reference)', () => {
      const before = makeLoadedState(partial);
      expect(transition(before, { type: 'confirmSecond' })).toBe(before);
    });
    it('cell [partial, removeCancel] → ignored (same reference)', () => {
      const before = makeLoadedState(partial);
      expect(transition(before, { type: 'removeCancel' })).toBe(before);
    });
    it('cell [partial, removeProgress] → ignored (same reference)', () => {
      const before = makeLoadedState(partial);
      expect(transition(before, { type: 'removeProgress', event: REMOVAL_PROGRESS })).toBe(before);
    });
    it('cell [partial, removeComplete] → ignored (same reference)', () => {
      const before = makeLoadedState(partial);
      expect(transition(before, { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_ALL_OK })).toBe(before);
    });
  });
});

// ── confirmFirst boundary booleans (FR-006; count mapping tested in WP05) ─────

describe('Removal sub-FSM — confirmFirst discriminator branches', () => {
  it('requiresSecondConfirm=false from confirming → removing (no second dialog)', () => {
    const after = transition(makeLoadedState({ phase: 'confirming' }), { type: 'confirmFirst', requiresSecondConfirm: false });
    expect(loadedRemoval(after)).toEqual({ phase: 'removing' });
  });
  it('requiresSecondConfirm=true from confirming → confirming2 (second dialog)', () => {
    const after = transition(makeLoadedState({ phase: 'confirming' }), { type: 'confirmFirst', requiresSecondConfirm: true });
    expect(loadedRemoval(after)).toEqual({ phase: 'confirming2' });
  });
});

// ── removeComplete failed-length branch (explicit) ───────────────────────────

describe('Removal sub-FSM — removeComplete failed-length branch', () => {
  it('empty failed → removal.phase === none', () => {
    const after = transition(makeLoadedState({ phase: 'removing' }), { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_ALL_OK });
    expect(loadedRemoval(after).phase).toBe('none');
  });
  it('non-empty failed → removal.phase === partial carrying the outcome', () => {
    const after = transition(makeLoadedState({ phase: 'removing' }), { type: 'removeComplete', result: REMOVAL_RESULT, outcome: OUTCOME_PARTIAL });
    const removal = loadedRemoval(after);
    expect(removal.phase).toBe('partial');
    if (removal.phase === 'partial') expect(removal.outcome).toBe(OUTCOME_PARTIAL);
  });
});

// ── Removal actions from non-loaded states are ignored (by reference) ────────

describe('Removal sub-FSM — non-loaded states ignore every removal action', () => {
  const nonLoaded: Array<{ name: string; make: () => DetectionState }> = [
    { name: 'idle', make: () => ({ kind: 'idle' }) },
    { name: 'scanning', make: makeScanningState },
    { name: 'failed', make: makeFailedState },
  ];
  for (const { name, make } of nonLoaded) {
    for (const action of REMOVAL_ACTIONS) {
      it(`[${name}, ${action.type}] → input by reference`, () => {
        const before = make();
        expect(transition(before, action)).toBe(before);
      });
    }
  }
});
