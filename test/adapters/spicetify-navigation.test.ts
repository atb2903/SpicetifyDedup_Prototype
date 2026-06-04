/**
 * Unit suite for the production `SpicetifyNavigation` adapter.
 *
 * Black-box per DIRECTIVE_036: the adapter is exercised through its
 * public `NavigationPort` surface; the host coupling is faked via
 * `vi.stubGlobal('Spicetify', …)`, mirroring the
 * `SpicetifyPlaylistsLoader` test's approach.
 *
 * The shared cross-implementation contract (`runNavigationPortContract`)
 * is additionally re-run against this adapter at the bottom of the file
 * so the same C-1..C-7 assertions that gate `FakeNavigation` also gate
 * the production adapter. The contract setPath path dispatches into the
 * captured `Platform.History.listen` callback to simulate a host event
 * without depending on the adapter's internals.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SpicetifyNavigation } from '../../src/adapters/spicetify-navigation';
import {
  PlaylistsLoaderError,
  isPlaylistsLoaderError,
} from '../../src/domain/errors';
import {
  runNavigationPortContract,
  type NavigationPortDriver,
} from '../ports/navigation-port-contract.test';

type HistoryListener = (loc: { pathname: string }) => void;

interface StubHistoryHandle {
  listeners: Set<HistoryListener>;
  /** Mutable location object the adapter reads pathname from. */
  location: { pathname: string };
  /** Replaces every captured listener with `loc`. Test-side mutator. */
  emit: (pathname: string) => void;
}

/**
 * Install a `globalThis.Spicetify` whose `Platform.History.listen`
 * captures subscribers into a Set and returns the matching idempotent
 * unsubscribe function. Returns the captured Set + the live `location`
 * object so the test can drive both currentPath and event emission.
 */
function stubSpicetifyHistory(initialPath: string): StubHistoryHandle {
  const listeners = new Set<HistoryListener>();
  const location = { pathname: initialPath };
  const listen = vi.fn((listener: HistoryListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  vi.stubGlobal('Spicetify', {
    Platform: {
      History: { listen, location },
    },
  });
  return {
    listeners,
    location,
    emit(pathname: string): void {
      location.pathname = pathname;
      listeners.forEach((l) => l({ pathname }));
    },
  };
}

async function expectHostUnavailable(
  fn: () => unknown,
): Promise<void> {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(PlaylistsLoaderError);
  expect(
    isPlaylistsLoaderError(caught) && caught.reason === 'host-unavailable',
  ).toBe(true);
}

describe('SpicetifyNavigation — host availability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('subscribe throws host-unavailable when the Spicetify global is undefined', async () => {
    vi.stubGlobal('Spicetify', undefined);
    const nav = new SpicetifyNavigation();
    await expectHostUnavailable(() => nav.subscribe(() => {}));
  });

  it('subscribe throws host-unavailable when the Spicetify global is null', async () => {
    vi.stubGlobal('Spicetify', null);
    const nav = new SpicetifyNavigation();
    await expectHostUnavailable(() => nav.subscribe(() => {}));
  });

  it('subscribe throws host-unavailable when Spicetify.Platform is missing', async () => {
    vi.stubGlobal('Spicetify', {});
    const nav = new SpicetifyNavigation();
    await expectHostUnavailable(() => nav.subscribe(() => {}));
  });

  it('subscribe throws host-unavailable when Spicetify.Platform is null', async () => {
    vi.stubGlobal('Spicetify', { Platform: null });
    const nav = new SpicetifyNavigation();
    await expectHostUnavailable(() => nav.subscribe(() => {}));
  });

  it('subscribe throws host-unavailable when Spicetify.Platform.History is missing', async () => {
    vi.stubGlobal('Spicetify', { Platform: {} });
    const nav = new SpicetifyNavigation();
    await expectHostUnavailable(() => nav.subscribe(() => {}));
  });

  it('subscribe throws host-unavailable when Spicetify.Platform.History is null', async () => {
    vi.stubGlobal('Spicetify', { Platform: { History: null } });
    const nav = new SpicetifyNavigation();
    await expectHostUnavailable(() => nav.subscribe(() => {}));
  });

  it('currentPath throws host-unavailable when the Spicetify global is undefined', async () => {
    vi.stubGlobal('Spicetify', undefined);
    const nav = new SpicetifyNavigation();
    await expectHostUnavailable(() => nav.currentPath());
  });

  it('currentPath throws host-unavailable when Spicetify.Platform.History.location is missing', async () => {
    vi.stubGlobal('Spicetify', {
      Platform: { History: { listen: () => () => {} } },
    });
    const nav = new SpicetifyNavigation();
    await expectHostUnavailable(() => nav.currentPath());
  });

  it('currentPath throws host-unavailable when Spicetify.Platform.History.location.pathname is not a string', async () => {
    vi.stubGlobal('Spicetify', {
      Platform: {
        History: { listen: () => () => {}, location: { pathname: 42 } },
      },
    });
    const nav = new SpicetifyNavigation();
    await expectHostUnavailable(() => nav.currentPath());
  });
});

describe('SpicetifyNavigation — subscribe forwarding', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('subscribe registers a History.listen callback and forwards loc.pathname to the listener', () => {
    const stub = stubSpicetifyHistory('/');
    const nav = new SpicetifyNavigation();
    const received: string[] = [];
    nav.subscribe((p) => received.push(p));
    expect(stub.listeners.size).toBe(1);
    stub.emit('/spicetify-dedup');
    expect(received).toEqual(['/spicetify-dedup']);
  });

  it('returns the unsubscribe value from History.listen', () => {
    const stub = stubSpicetifyHistory('/');
    const nav = new SpicetifyNavigation();
    const received: string[] = [];
    const unsubscribe = nav.subscribe((p) => received.push(p));
    expect(stub.listeners.size).toBe(1);
    unsubscribe();
    expect(stub.listeners.size).toBe(0);
    stub.emit('/home');
    expect(received).toEqual([]);
  });

  it('currentPath returns Spicetify.Platform.History.location.pathname', () => {
    const stub = stubSpicetifyHistory('/initial');
    const nav = new SpicetifyNavigation();
    expect(nav.currentPath()).toBe('/initial');
    stub.location.pathname = '/somewhere-else';
    expect(nav.currentPath()).toBe('/somewhere-else');
  });
});

// --- Contract suite parity with FakeNavigation -----------------------------

describe('SpicetifyNavigation — shared NavigationPort contract suite', () => {
  afterEach(() => vi.unstubAllGlobals());

  runNavigationPortContract('SpicetifyNavigation', (initialPath): NavigationPortDriver => {
    const stub = stubSpicetifyHistory(initialPath);
    return {
      port: new SpicetifyNavigation(),
      setPath: (p) => stub.emit(p),
    };
  });
});
