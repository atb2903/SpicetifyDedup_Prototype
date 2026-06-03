/**
 * Architecture import-graph test.
 *
 * Encodes the hexagonal boundaries declared in ADR-0001
 * (`.claude/adr/0001-hexagonal-load-dedupable-playlists.md`). For each src
 * subtree, asserts that no source file matches a forbidden import regex.
 *
 * Trade-offs:
 * - Regex-level scan over file contents, not an AST parse. Sufficient because
 *   our forbidden patterns are absolute (`from 'react'`) or path-prefix
 *   (`from '../adapters/...'`). Re-exports and dynamic `import()` are not
 *   currently covered; if they become load-bearing, swap in a real parser.
 * - Each (file, regex) pair becomes one Vitest `it()` so a failure points at
 *   the exact offending file and rule rather than a single aggregated error.
 * - Missing folders are warnings, not failures. WP01 lands before any of
 *   `domain/`, `ports/`, `adapters/`, `store/`, `ui/` exist; the rules begin
 *   enforcing for real as soon as WP02+ create files under each folder.
 *
 * Extending: add a new entry to `RULES` with the folder (relative to repo
 * root) and the regexes that imports from that folder must not match. Keep
 * the rules table in sync with ADR-0001's "Decision" section.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = join(__dirname, '..');

interface Rule {
  folder: string;
  forbidden: RegExp[];
}

const RULES: Rule[] = [
  {
    folder: 'src/domain',
    forbidden: [
      /from\s+['"]react['"]/,
      /from\s+['"]react-dom['"]/,
      /from\s+['"]zustand['"]/,
      /from\s+['"][^'"]*\/adapters\//,
      /from\s+['"][^'"]*\/store\//,
      /from\s+['"][^'"]*\/ui\//,
    ],
  },
  {
    folder: 'src/ports',
    forbidden: [
      /from\s+['"][^'"]*\/adapters\//,
      /from\s+['"][^'"]*\/store\//,
      /from\s+['"][^'"]*\/ui\//,
    ],
  },
  {
    folder: 'src/adapters',
    forbidden: [
      /from\s+['"][^'"]*\/store\//,
      /from\s+['"][^'"]*\/ui\//,
    ],
  },
  {
    folder: 'src/store',
    forbidden: [
      /from\s+['"][^'"]*\/ui\//,
      /from\s+['"][^'"]*\/adapters\//,
    ],
  },
  {
    folder: 'src/ui',
    forbidden: [
      /from\s+['"][^'"]*\/adapters\//,
      /from\s+['"][^'"]*\/ports\//,
    ],
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('hexagonal import boundaries (ADR-0001)', () => {
  for (const { folder, forbidden } of RULES) {
    const absFolder = join(REPO_ROOT, folder);
    if (!existsSync(absFolder)) {
      console.warn(
        `[architecture.test] ${folder} does not exist yet; ` +
          `import rules will begin enforcing when files land there.`,
      );
      continue;
    }
    const files = walk(absFolder);
    if (files.length === 0) {
      console.warn(
        `[architecture.test] ${folder} exists but contains no source files; ` +
          `rules apply once files are added.`,
      );
      continue;
    }
    for (const file of files) {
      const body = readFileSync(file, 'utf8');
      const rel = file.slice(REPO_ROOT.length + 1);
      for (const rx of forbidden) {
        it(`${rel} must not match ${rx}`, () => {
          expect(body).not.toMatch(rx);
        });
      }
    }
  }

  it('rules table is non-empty', () => {
    expect(RULES.length).toBeGreaterThan(0);
  });
});
