/**
 * Real `ManifestPathResolver` adapter backed by `node:fs`, bound to a repo
 * root (ADR-0023). Used by the WP04 composed integration check and any
 * release-readiness verify script to confirm a listing manifest's relative
 * `preview`/`main`/`readme` targets resolve to real tracked files.
 *
 * Release tooling only; isolates the single filesystem touch behind the port.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ManifestPathResolver } from './manifest-path-resolver';

/**
 * A `ManifestPathResolver` that resolves repo-root-relative paths against a
 * fixed root directory and reports whether each is an existing file.
 */
export class FsManifestPathResolver implements ManifestPathResolver {
  /**
   * @param root - Absolute path to the repository root the manifest's
   *               relative paths are resolved against.
   */
  constructor(private readonly root: string) {}

  /**
   * @param relativePath - A repo-root-relative path from a manifest field.
   * @returns `true` iff `join(root, relativePath)` exists and is a regular file.
   */
  exists(relativePath: string): boolean {
    const abs = join(this.root, relativePath);
    return existsSync(abs) && statSync(abs).isFile();
  }
}
