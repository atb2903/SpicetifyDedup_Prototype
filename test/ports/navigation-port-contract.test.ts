/**
 * Cross-implementation contract test for `NavigationPort`.
 *
 * Mirrors the `playlists-loader-contract.test.ts` pattern: the exported
 * `runNavigationPortContract` factory is the executable spec of the
 * port. Any implementation that passes the suite satisfies the contract
 * documented in
 * `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/contracts/navigation-port.md`.
 *
 * The fake adapter is parametrised in directly below. The production
 * `SpicetifyNavigation` adapter re-imports this factory from
 * `test/adapters/spicetify-navigation.test.ts` and runs it against a
 * `vi.stubGlobal('Spicetify', …)` scaffold so the same observable
 * behaviour gates both adapters (C-1..C-7).
 */
import { describe, it, expect } from 'vitest';
import type { NavigationPort } from '../../src/ports/navigation';
import { FakeNavigation } from '../adapters/fake-navigation';

/**
 * Driver bundle every contract conformance factory must produce.
 *
 * `port` is the adapter under test. `setPath` is the test-side mutator
 * the contract uses to simulate a host navigation event; for
 * `FakeNavigation` it forwards to the public test helper, and for the
 * stubbed Spicetify adapter it dispatches into the captured
 * `Platform.History.listen` callback.
 */
export interface NavigationPortDriver {
  port: NavigationPort;
  setPath: (path: string) => void;
}

export function runNavigationPortContract(
  name: string,
  factory: (initialPath: string) => NavigationPortDriver,
): void {
  describe(`NavigationPort contract — ${name}`, () => {
    it('C-1 — subscribe(l1) followed by setPath("/x") delivers "/x" to l1', () => {
      const driver = factory('/');
      const received: string[] = [];
      driver.port.subscribe((p) => received.push(p));
      driver.setPath('/x');
      expect(received).toEqual(['/x']);
    });

    it('C-2 — unsubscribe stops further calls to the listener', () => {
      const driver = factory('/');
      const received: string[] = [];
      const unsubscribe = driver.port.subscribe((p) => received.push(p));
      driver.setPath('/a');
      unsubscribe();
      driver.setPath('/b');
      expect(received).toEqual(['/a']);
    });

    it('C-3 — calling unsubscribe twice is a no-op (no throw)', () => {
      const driver = factory('/');
      const unsubscribe = driver.port.subscribe(() => {});
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });

    it('C-4 — two distinct listeners both receive events; unsubscribing one does not affect the other', () => {
      const driver = factory('/');
      const a: string[] = [];
      const b: string[] = [];
      const unsubA = driver.port.subscribe((p) => a.push(p));
      driver.port.subscribe((p) => b.push(p));
      driver.setPath('/x');
      unsubA();
      driver.setPath('/y');
      expect(a).toEqual(['/x']);
      expect(b).toEqual(['/x', '/y']);
    });

    it('C-5 — currentPath() returns the initial path before any setPath call', () => {
      const driver = factory('/initial');
      expect(driver.port.currentPath()).toBe('/initial');
    });

    it('C-6 — after setPath("/y"), currentPath() returns "/y"', () => {
      const driver = factory('/initial');
      driver.setPath('/y');
      expect(driver.port.currentPath()).toBe('/y');
    });

    it('C-7 — subscribe(l) MUST NOT invoke l synchronously at subscription time', () => {
      const driver = factory('/start');
      const received: string[] = [];
      driver.port.subscribe((p) => received.push(p));
      // No setPath yet — the listener must not have been called.
      expect(received).toEqual([]);
    });
  });
}

runNavigationPortContract('FakeNavigation', (initialPath) => {
  const fake = new FakeNavigation(initialPath);
  return {
    port: fake,
    setPath: (p) => fake.setPath(p),
  };
});
