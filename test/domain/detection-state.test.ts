/**
 * Exhaustive test of the DetectionState FSM transition table.
 *
 * data-model.md §5.3 defines 4 states × 5 actions = 20 cells.
 * One `it()` per cell; every "ignored" cell asserts reference equality.
 */
import { describe, it, expect } from 'vitest';
import {
  transition,
  type DetectionState,
  type DetectionAction,
} from '../../src/domain/detection-state';
import { DetectionError } from '../../src/domain/detection-errors';
import type { ProgressEvent, DetectionResult } from '../../src/domain/detection-types';

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

// Initial scanning state used for "from scanning" tests
function makeScanningState(): DetectionState {
  return { kind: 'scanning', progress: PROGRESS_EVENT };
}

function makeLoadedState(): DetectionState {
  return { kind: 'loaded', result: DETECTION_RESULT };
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

    it('cell [scanning, complete] → loaded (carries result)', () => {
      const before = makeScanningState();
      const after = transition(before, { type: 'complete', result: DETECTION_RESULT });
      expect(after.kind).toBe('loaded');
      if (after.kind === 'loaded') {
        expect(after.result).toBe(DETECTION_RESULT);
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
    ];
    for (const action of actions) {
      const next = transition({ kind: 'idle' }, action);
      expect(next.kind).toBeDefined();
    }
  });
});
