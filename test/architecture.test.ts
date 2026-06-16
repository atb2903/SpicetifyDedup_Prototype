/**
 * Architecture import-graph test.
 *
 * Encodes the hexagonal boundaries declared in ADR-0001
 * (`.claude/adr/0001-hexagonal-load-dedupable-playlists.md`). For each `src`
 * file, resolves every imported module specifier to its owning layer and
 * asserts that no file crosses a forbidden edge.
 *
 * Why an AST analyser (NFR-005, finding L):
 * - This used to be a regex content-scan (`/from\s+['"][^'"]*\/adapters\//`).
 *   Its own header documented the gap: re-exports (`export … from`), dynamic
 *   `import()`, and unusually-written type-only imports slipped through. We now
 *   parse each file with the TypeScript Compiler API (`typescript` is already a
 *   devDependency — no new dependency, no `ts-morph` / `dependency-cruiser`) and
 *   walk all FOUR specifier-bearing node kinds:
 *     1. `ImportDeclaration`        — `import … from '…'` (incl. `import type`),
 *     2. `ExportDeclaration`        — re-exports `export … from '…'` / `export *`,
 *     3. `ImportEqualsDeclaration`  — `import x = require('…')`,
 *     4. `CallExpression` whose `expression.kind === ImportKeyword` — dynamic
 *        `import('…')`.
 * - Each `(file, forbidden-target)` pair becomes one Vitest `it()` so a failure
 *   still names the exact offending file and rule (the developer experience the
 *   regex version had).
 *
 * Type-only nuance (NFR-001 type consolidation): `src/ui` is allowed to import
 * **types** from `src/domain` (the view-models / discriminated unions live
 * there), so `domain` is simply absent from `ui`'s forbidden list. A type-only
 * import of an *adapter* or *port*, however, is still a forbidden edge — the
 * analyser does NOT exempt `import type`. The fixtures below prove both halves.
 *
 * Missing folders are warnings, not failures (a fresh tree may not yet have
 * every layer). Extending: add an entry to `RULES` keyed by source layer with
 * the set of layers/packages it must not import; keep it in sync with ADR-0001.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = join(__dirname, '..');
const SRC_ROOT = join(REPO_ROOT, 'src');

/** Layers that the import-graph rules are expressed over. */
type Layer = 'domain' | 'ports' | 'adapters' | 'store' | 'ui';

/**
 * The ADR-0001 forbidden-edge table, keyed by the importing file's layer.
 * `packages` are bare npm specifiers a layer must not depend on; `layers` are
 * sibling `src/` layers it must not reach into. `domain` is intentionally
 * absent from `ui`'s forbidden set — UI may import domain types.
 */
interface Rule {
  packages: string[];
  layers: Layer[];
}

const RULES: Record<Layer, Rule> = {
  domain: {
    packages: ['react', 'react-dom', 'zustand'],
    layers: ['adapters', 'store', 'ui'],
  },
  ports: {
    packages: [],
    layers: ['adapters', 'store', 'ui'],
  },
  adapters: {
    packages: [],
    layers: ['store', 'ui'],
  },
  store: {
    packages: [],
    layers: ['ui', 'adapters'],
  },
  ui: {
    packages: [],
    layers: ['adapters', 'ports'],
  },
};

/**
 * Resolve which layer (if any) an absolute file path belongs to. Returns
 * `undefined` for files outside the known `src/<layer>/` subtrees.
 */
function layerOfPath(absPath: string): Layer | undefined {
  const rel = relative(SRC_ROOT, absPath);
  if (rel.startsWith('..')) return undefined;
  const top = rel.split(/[\\/]/)[0];
  if (
    top === 'domain' ||
    top === 'ports' ||
    top === 'adapters' ||
    top === 'store' ||
    top === 'ui'
  ) {
    return top;
  }
  return undefined;
}

/**
 * Resolve a module specifier seen inside `fromFile` to the layer it targets.
 * Bare package specifiers (no leading `.`) are returned verbatim as
 * `{ package: name }`; relative specifiers are resolved against `fromFile`'s
 * directory and mapped to a `src/` layer when they land inside one.
 */
function resolveTarget(
  specifier: string,
  fromFile: string,
): { layer: Layer } | { package: string } | undefined {
  if (specifier.startsWith('.')) {
    const abs = resolve(dirname(fromFile), specifier);
    const layer = layerOfPath(abs);
    return layer ? { layer } : undefined;
  }
  // Bare specifier — record the leading package name (drop subpaths/scope tail).
  const pkg = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  return { package: pkg };
}

/**
 * Walk a parsed `SourceFile` and collect every module specifier reachable from
 * the four specifier-bearing node kinds. This is the AST core that replaces the
 * regex; the fixtures below exercise each branch for coverage.
 */
function collectModuleSpecifiers(source: ts.SourceFile): string[] {
  const specifiers: string[] = [];

  const visit = (node: ts.Node): void => {
    // 1. import … from '…'   (incl. `import type`)
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(node)) {
      // 2. export … from '…' / export * from '…'  (re-exports)
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      // 3. import x = require('…')
      const ref = node.moduleReference;
      if (
        ts.isExternalModuleReference(ref) &&
        ref.expression &&
        ts.isStringLiteral(ref.expression)
      ) {
        specifiers.push(ref.expression.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      // 4. dynamic import('…')
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        specifiers.push(arg.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return specifiers;
}

/** Parse source text to a `SourceFile` (TSX-aware) for analysis. */
function parse(fileName: string, sourceText: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * For a file's text + path, return the forbidden edges it crosses, as
 * `(rule)` strings naming what was illegally reached. Empty array == clean.
 */
function forbiddenEdges(absPath: string, sourceText: string): string[] {
  const layer = layerOfPath(absPath);
  if (!layer) return [];
  const rule = RULES[layer];
  const source = parse(absPath, sourceText);
  const violations: string[] = [];
  for (const spec of collectModuleSpecifiers(source)) {
    const target = resolveTarget(spec, absPath);
    if (!target) continue;
    if ('package' in target) {
      if (rule.packages.includes(target.package)) {
        violations.push(`package '${target.package}'`);
      }
    } else if (rule.layers.includes(target.layer)) {
      violations.push(`layer 'src/${target.layer}'`);
    }
  }
  return violations;
}

/** Recursively collect `.ts`/`.tsx` source files (excluding `.d.ts`). */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const LAYERS: Layer[] = ['domain', 'ports', 'adapters', 'store', 'ui'];

describe('hexagonal import boundaries (ADR-0001)', () => {
  for (const layer of LAYERS) {
    const absFolder = join(SRC_ROOT, layer);
    if (!existsSync(absFolder)) {
      console.warn(
        `[architecture.test] src/${layer} does not exist yet; ` +
          `import rules will begin enforcing when files land there.`,
      );
      continue;
    }
    const files = walk(absFolder);
    if (files.length === 0) {
      console.warn(
        `[architecture.test] src/${layer} exists but contains no source ` +
          `files; rules apply once files are added.`,
      );
      continue;
    }
    const rule = RULES[layer];
    const forbiddenTargets = [
      ...rule.packages.map((p) => `package '${p}'`),
      ...rule.layers.map((l) => `layer 'src/${l}'`),
    ];
    for (const file of files) {
      const rel = relative(REPO_ROOT, file);
      const text = readFileSync(file, 'utf8');
      const edges = forbiddenEdges(file, text);
      // Per-(file, forbidden-target) granularity: a failure names file + rule.
      for (const target of forbiddenTargets) {
        it(`${rel} must not import ${target}`, () => {
          expect(edges).not.toContain(target);
        });
      }
    }
  }

  it('rules table covers every layer', () => {
    expect(Object.keys(RULES).sort()).toEqual([...LAYERS].sort());
  });
});

/**
 * Regression fixtures (NFR-005 proof). Each fixture is an inline source string
 * parsed by the analyser through `forbiddenEdges`, exercising one import-kind
 * branch that the old regex missed. We assert both that the forbidden edge is
 * caught AND that removing it makes the same file clean — no false-positive
 * test. The fixtures are pinned to a synthetic `src/<layer>/<fixture>` path so
 * relative `../adapters` / `../ports` / `../domain` resolve to real layers.
 */
describe('analyser catches the previously-missed import forms (NFR-005)', () => {
  const UI_FIXTURE = join(SRC_ROOT, 'ui', '__fixture__.tsx');
  const DOMAIN_FIXTURE = join(SRC_ROOT, 'domain', '__fixture__.ts');

  it('flags a forbidden re-export (export … from adapters)', () => {
    const bad = `export { SpicetifyRemovalExecutor } from '../adapters/x';`;
    expect(forbiddenEdges(UI_FIXTURE, bad)).toContain(`layer 'src/adapters'`);
    const good = `export const local = 1;`;
    expect(forbiddenEdges(UI_FIXTURE, good)).toEqual([]);
  });

  it('flags a forbidden re-export wildcard (export * from ports)', () => {
    const bad = `export * from '../ports/removal-executor';`;
    expect(forbiddenEdges(UI_FIXTURE, bad)).toContain(`layer 'src/ports'`);
  });

  it('flags a forbidden dynamic import() of a port', () => {
    const bad = `async function f() { return await import('../ports/scheduler'); }`;
    expect(forbiddenEdges(UI_FIXTURE, bad)).toContain(`layer 'src/ports'`);
    const good = `async function f() { return await import('../domain/load-state'); }`;
    expect(forbiddenEdges(UI_FIXTURE, good)).toEqual([]);
  });

  it('flags a forbidden type-only import of an adapter', () => {
    const bad = `import type { T } from '../adapters/spicetify-removal-executor';`;
    expect(forbiddenEdges(UI_FIXTURE, bad)).toContain(`layer 'src/adapters'`);
  });

  it('flags a forbidden import = require() of an adapter', () => {
    const bad = `import x = require('../adapters/spicetify-removal-executor');`;
    expect(forbiddenEdges(UI_FIXTURE, bad)).toContain(`layer 'src/adapters'`);
  });

  it('PERMITS a type-only import of a domain type from UI (NFR-001)', () => {
    const ok = `import type { LoadState } from '../domain/load-state';`;
    expect(forbiddenEdges(UI_FIXTURE, ok)).toEqual([]);
  });

  it('flags a domain file importing a forbidden package (react)', () => {
    const bad = `import { useState } from 'react';`;
    expect(forbiddenEdges(DOMAIN_FIXTURE, bad)).toContain(`package 'react'`);
    const scoped = `import { x } from '@scope/pkg/sub';`;
    expect(forbiddenEdges(DOMAIN_FIXTURE, scoped)).toEqual([]);
  });

  it('ignores files outside any known src layer, and bare-but-allowed pkgs', () => {
    const inside = join(SRC_ROOT, 'app.tsx');
    expect(forbiddenEdges(inside, `import 'react';`)).toEqual([]);
    const whollyOutside = join(REPO_ROOT, 'scripts', 'x.ts');
    expect(forbiddenEdges(whollyOutside, `import '../adapters/y';`)).toEqual([]);
  });

  it('handles a file with no imports without error', () => {
    expect(forbiddenEdges(UI_FIXTURE, `export const noop = () => {};`)).toEqual(
      [],
    );
  });
});

/**
 * On-disk regression fixtures under `test/architecture-fixtures/`. These are the
 * tangible NFR-005 proof artefacts: each `.ts.txt` file is a small UI-layer
 * source demonstrating one forbidden edge the old regex missed. They are stored
 * as `.ts.txt` so the project `tsc` does not attempt to compile their
 * deliberately-illegal imports; the analyser reads their text and parses it as
 * if the file lived at `src/ui/<name>.tsx`. Each must be flagged with the
 * expected forbidden layer.
 */
describe('on-disk architecture fixtures are flagged (NFR-005)', () => {
  const FIXTURE_DIR = join(__dirname, 'architecture-fixtures');
  const cases: { file: string; expect: string }[] = [
    { file: 'forbidden-reexport.ts.txt', expect: `layer 'src/adapters'` },
    { file: 'forbidden-dynamic-import.ts.txt', expect: `layer 'src/ports'` },
    { file: 'forbidden-type-only-import.ts.txt', expect: `layer 'src/adapters'` },
  ];

  for (const { file, expect: target } of cases) {
    it(`${file} is flagged as importing ${target}`, () => {
      const text = readFileSync(join(FIXTURE_DIR, file), 'utf8');
      // Analyse the fixture text as though it lived in the UI layer.
      const edges = forbiddenEdges(join(SRC_ROOT, 'ui', '__fixture__.tsx'), text);
      expect(edges).toContain(target);
    });
  }
});
