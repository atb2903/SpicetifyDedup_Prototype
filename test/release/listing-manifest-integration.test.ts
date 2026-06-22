/**
 * WP04 integration test — the executable form of SC-001.
 *
 * Unlike the WP01 unit tests (which feed the validator inline fixtures), this
 * test loads the REAL root `manifest.json` committed to the repository and
 * asserts:
 *   1. it parses and passes `validateListingManifest` (structural validity);
 *   2. every relative-path field (`preview`, `main`, `readme`) resolves to an
 *      existing file via the real `FsManifestPathResolver` bound to the repo
 *      root;
 *   3. the committed install bundle `marketplace/dedup/` carries all three
 *      files Spicetify needs (`index.js`, `style.css`, `manifest.json`).
 *
 * This is the cross-WP gate: it only passes once WP02 (manifest + bundle),
 * WP03 (README) and WP04 (preview.png) have all landed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateListingManifest } from '../../src/release/listing-manifest-validator';
import { FsManifestPathResolver } from '../../src/release/fs-manifest-path-resolver';

const REPO_ROOT = join(__dirname, '..', '..');

describe('marketplace listing manifest (real committed artifacts)', () => {
  const raw = readFileSync(join(REPO_ROOT, 'manifest.json'), 'utf8');
  const parsed: unknown = JSON.parse(raw);

  it('the real root manifest.json passes structural validation', () => {
    expect(() => validateListingManifest(parsed)).not.toThrow();
  });

  const manifest = validateListingManifest(parsed);
  const resolver = new FsManifestPathResolver(REPO_ROOT);

  it.each([
    ['preview', () => manifest.preview],
    ['main', () => manifest.main],
    ['readme', () => manifest.readme],
  ])('the %s path resolves to an existing committed file', (_field, get) => {
    expect(resolver.exists(get())).toBe(true);
  });

  it.each(['index.js', 'style.css', 'manifest.json'])(
    'the install bundle marketplace/dedup/ contains %s',
    (file) => {
      const p = join(REPO_ROOT, 'marketplace', 'dedup', file);
      expect(existsSync(p) && statSync(p).isFile()).toBe(true);
    },
  );
});
