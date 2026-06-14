/**
 * In-memory, scripted `RemovalExecutor` test double.
 *
 * Has no host: instead of batching deletes against Spicetify, it maps a
 * developer-supplied **script** onto the `tracks` it receives, records the
 * call, and synthesises a {@link RemovalOutcome}. This lets the store (WP05)
 * and UI (WP06) be built and fully tested against the *same* port the real
 * `SpicetifyRemovalExecutor` (WP04) implements — the black-box integration
 * seam mandated by `DIRECTIVE_036`.
 *
 * Lives in `src/adapters/` so the architecture test treats it like any other
 * adapter — it may import from `src/domain/` and `src/ports/` only (no
 * Spicetify, no store, no UI).
 *
 * Scripting model (documented): a single **default script** (applied to every
 * call) plus an optional **per-call queue** consumed one entry per `remove`
 * call. While the queue has entries each call shifts the next one; once the
 * queue is exhausted calls fall back to the default script. When neither a
 * default nor a queue entry applies, the effective script is `ok`.
 *
 * Used by:
 * - `detection-store.test.ts` (WP05) — drives removal plumbing without a host.
 * - removal UI/integration tests (WP06) — partial-failure + progress rendering.
 */
import type { RemovalExecutor } from '../ports/removal-executor';
import type {
  RemovalTarget,
  TrackRef,
  RemovalOutcome,
  RemovalProgressEvent,
} from '../domain/removal-types';

/**
 * Reason string attached to every track the fake reports as `failed`. Distinct,
 * fixed value so store/UI tests can assert the partial-failure path without
 * coupling to a host message.
 */
export const FAKE_FAIL_REASON = 'fake-fail';

/**
 * Declarative description of what a single `remove` call should do.
 *
 * - `ok` — every requested track is removed.
 * - `partial` — the tracks whose `uri` is in `failUris` fail; the rest are
 *   removed. (Liked Songs identity is by `uri`.)
 * - `partial-uids` — the tracks whose `uid` is in `failUids` fail; the rest are
 *   removed. (Playlist identity is by `uid`.)
 * - `throw` — the whole call rejects with `error` (inject a `RemovalError` or
 *   any value), modelling an unattributable whole-operation fault.
 * - `hang` — the call is recorded in `calls`, then returns a never-settling
 *   promise (`new Promise(() => {})`), modelling a host call that never
 *   resolves or rejects.
 */
export type FakeRemovalScript =
  | { kind: 'ok' }
  | { kind: 'partial'; failUris: ReadonlyArray<string> }
  | { kind: 'partial-uids'; failUids: ReadonlyArray<string> }
  | { kind: 'throw'; error: unknown }
  | { kind: 'hang' };

/**
 * A recorded `remove` invocation, for assertions about single-collection scope
 * and partial-failure plumbing.
 */
export interface RecordedRemoveCall {
  /** The collection this call targeted. */
  target: RemovalTarget;
  /**
   * A **copy** of the tracks the caller passed, snapshotted at call time so
   * later mutation of the caller's array cannot corrupt the record.
   */
  tracks: ReadonlyArray<TrackRef>;
}

/**
 * Scripted `RemovalExecutor` for tests. See the module JSDoc for the scripting
 * model and the {@link RemovalExecutor} port for the post-conditions this
 * upholds.
 */
export class FakeRemovalExecutor implements RemovalExecutor {
  /**
   * Every `remove` call that reached the script stage, in order. A call aborted
   * at entry (pre-aborted `signal`) is **not** recorded — it never reaches the
   * script stage. The `throw` script *is* recorded before it rejects.
   */
  readonly calls: RecordedRemoveCall[] = [];

  private readonly defaultScript: FakeRemovalScript;
  private readonly queue: FakeRemovalScript[];

  /**
   * @param defaultScript - Script applied to every call once the queue is
   *   exhausted (and to every call if no queue is given). Defaults to `ok`.
   * @param scripts - Optional per-call queue; each `remove` call shifts the next
   *   entry. When empty, the `defaultScript` is used.
   */
  constructor(
    defaultScript: FakeRemovalScript = { kind: 'ok' },
    scripts: ReadonlyArray<FakeRemovalScript> = [],
  ) {
    this.defaultScript = defaultScript;
    this.queue = [...scripts];
  }

  /**
   * Apply the next script to `tracks` and synthesise a {@link RemovalOutcome}.
   *
   * Honors the {@link RemovalExecutor} post-conditions: total accounting,
   * disjointness, single-collection scope, and rejection reserved for
   * whole-operation faults (the `throw` script and abort).
   *
   * @param target - The single collection to delete from (recorded).
   * @param tracks - Requested occurrences; copied into `calls`.
   * @param signal - If already aborted at entry, the call throws
   *   `DOMException('AbortError')` before recording or scripting.
   * @param onProgress - If provided, invoked once with a terminal
   *   `{ removedSoFar, total }` after partitioning. Never called under the
   *   `hang` script.
   * @returns The aggregate outcome, or — under the `hang` script — a promise
   *   that never settles.
   * @throws `DOMException('AbortError')` if `signal` is pre-aborted.
   * @throws the injected `error` if the active script is `throw`.
   */
  async remove(
    target: RemovalTarget,
    tracks: ReadonlyArray<TrackRef>,
    signal: AbortSignal,
    onProgress?: (event: RemovalProgressEvent) => void,
  ): Promise<RemovalOutcome> {
    // Abort at entry: reject before recording or scripting.
    if (signal.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }

    // Record the call with a snapshot copy of the tracks array.
    this.calls.push({ target, tracks: [...tracks] });

    const script = this.queue.length > 0 ? this.queue.shift()! : this.defaultScript;

    // Whole-operation fault: reject with the injected value.
    if (script.kind === 'throw') {
      return Promise.reject(script.error);
    }

    // Non-settling host call: never resolves, never rejects, never reports
    // progress. Recorded above (parity with `throw`) so callers can still
    // assert the call reached the executor.
    if (script.kind === 'hang') {
      return new Promise<RemovalOutcome>(() => {});
    }

    const outcome = partition(tracks, script);

    if (onProgress !== undefined) {
      onProgress({ removedSoFar: outcome.removed.length, total: tracks.length });
    }

    return outcome;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Partition `tracks` into removed/failed according to a settling, non-throw
 * `script`. Upholds total accounting and disjointness by construction (each
 * track lands in exactly one partition).
 *
 * @param tracks - Requested occurrences.
 * @param script - An `ok`, `partial`, or `partial-uids` script (the `throw`
 *   and `hang` scripts return before reaching here).
 * @returns The partitioned {@link RemovalOutcome}.
 */
function partition(
  tracks: ReadonlyArray<TrackRef>,
  script: Exclude<FakeRemovalScript, { kind: 'throw' } | { kind: 'hang' }>,
): RemovalOutcome {
  const removed: TrackRef[] = [];
  const failed: Array<{ track: TrackRef; reason: string }> = [];

  for (const track of tracks) {
    if (shouldFail(track, script)) {
      failed.push({ track, reason: FAKE_FAIL_REASON });
    } else {
      removed.push(track);
    }
  }

  return { removed, failed };
}

/**
 * Decide whether `track` fails under `script`.
 *
 * @param track - A requested occurrence.
 * @param script - An `ok`, `partial`, or `partial-uids` script (the `throw`
 *   and `hang` scripts return before reaching here).
 * @returns `true` iff the track should be reported as failed.
 */
function shouldFail(
  track: TrackRef,
  script: Exclude<FakeRemovalScript, { kind: 'throw' } | { kind: 'hang' }>,
): boolean {
  switch (script.kind) {
    case 'partial':
      return script.failUris.includes(track.uri);
    case 'partial-uids':
      return track.uid !== undefined && script.failUids.includes(track.uid);
    case 'ok':
      return false;
  }
}
