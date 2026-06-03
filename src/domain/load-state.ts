/**
 * The page's load-state finite state machine.
 *
 * Pure data + a pure `transition` function. No React, no Zustand, no
 * Spicetify — tests run without `happy-dom`. The store (WP06) wires this
 * up to UI dispatches; consumers parameterize `LoadState<Item>` with
 * their concrete item type (the page will use `CollectionViewModel`).
 *
 * The transition table lives in `data-model.md` §6 and is the basis for
 * every test case in `test/domain/load-state.test.ts`. Cells marked
 * "ignored" pass through unchanged — defensive against dispatch races.
 */

import type { PlaylistsLoaderError } from './errors';

/**
 * The five user-visible states the page can be in. Discriminated union;
 * narrowing by `kind` reveals each variant's payload (if any).
 *
 * `Item` defaults to `unknown` so consumers can refer to `LoadState`
 * without a parameter when the items' shape is irrelevant. The store
 * specializes this as `LoadState<CollectionViewModel>` once that type
 * exists.
 */
export type LoadState<Item = unknown> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; items: Item[] }
  | { kind: 'empty' }
  | { kind: 'failed'; reason: PlaylistsLoaderError };

/**
 * The five actions that can be dispatched into the FSM.
 *
 * - `trigger` — user clicked the load button (exits `idle`).
 * - `load-succeeded` — adapter returned a non-empty list (the store
 *   guarantees this; the FSM itself is permissive).
 * - `load-completed-empty` — adapter returned an empty list; the store
 *   dispatches this rather than `load-succeeded` with `items: []`.
 * - `load-failed` — adapter threw a `PlaylistsLoaderError`.
 * - `retry` — user clicked the retry button from the `failed` state.
 */
export type LoadAction =
  | { type: 'trigger' }
  | { type: 'load-succeeded'; items: unknown[] }
  | { type: 'load-completed-empty' }
  | { type: 'load-failed'; reason: PlaylistsLoaderError }
  | { type: 'retry' };

/**
 * Pure transition function. Returns a new `LoadState` for every state ×
 * action pair from `data-model.md` §6. Never mutates the input.
 *
 * For "ignored" cells (e.g. `loaded + trigger`), the input state is
 * returned by reference — callers who need a fresh object should not
 * rely on reference equality after `transition`.
 */
export function transition<Item>(
  state: LoadState<Item>,
  action: LoadAction,
): LoadState<Item> {
  switch (state.kind) {
    case 'idle':
      if (action.type === 'trigger') return { kind: 'loading' };
      return state;

    case 'loading':
      switch (action.type) {
        case 'load-succeeded':
          return { kind: 'loaded', items: action.items as Item[] };
        case 'load-completed-empty':
          return { kind: 'empty' };
        case 'load-failed':
          return { kind: 'failed', reason: action.reason };
        default:
          return state;
      }

    case 'loaded':
      return state;

    case 'empty':
      return state;

    case 'failed':
      if (action.type === 'retry') return { kind: 'loading' };
      return state;
  }
}
