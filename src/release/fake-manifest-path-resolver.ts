/**
 * In-memory fake `ManifestPathResolver` for deterministic unit tests
 * (ADR-0023). Constructed with the exact set of paths considered "existing";
 * `exists` is a membership check. No filesystem access.
 */

import type { ManifestPathResolver } from './manifest-path-resolver';

/**
 * A `ManifestPathResolver` backed by a fixed set of known-existing paths.
 * Lets tests drive the present/absent boundary without touching disk.
 */
export class FakeManifestPathResolver implements ManifestPathResolver {
  private readonly existing: ReadonlySet<string>;

  /**
   * @param existingPaths - The repo-root-relative paths that should report as
   *                        existing; every other path reports as absent.
   */
  constructor(existingPaths: readonly string[]) {
    this.existing = new Set(existingPaths);
  }

  /**
   * @param relativePath - A repo-root-relative path.
   * @returns `true` iff it is in the known set.
   */
  exists(relativePath: string): boolean {
    return this.existing.has(relativePath);
  }
}
