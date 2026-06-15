# Contract: structural import-graph architecture test — NFR-005

Rebuilds `test/architecture.test.ts` on the **TypeScript Compiler API**
(no new dependency) to enforce the ADR-0001 hexagonal forbidden-edge table
structurally instead of by content regex.

## Forbidden edges (unchanged from ADR-0001 / current `RULES`)

| Folder | MUST NOT import from |
|---|---|
| `src/domain` | `react`, `react-dom`, `zustand`, `src/adapters`, `src/store`, `src/ui` |
| `src/ports` | `src/adapters`, `src/store`, `src/ui` |
| `src/adapters` | `src/store`, `src/ui` |
| `src/store` | `src/ui`, `src/adapters` |
| `src/ui` | `src/adapters`, `src/ports` |

> `src/ui` → `src/domain` (type imports) remains **allowed** — the analyser must
> not flag it (relevant to NFR-001 type consolidation).

## Import forms the analyser MUST detect (the NFR-005 gap closure)

For each `src/**/*.{ts,tsx}` (excluding `.d.ts`), parse to a `ts.SourceFile` and
resolve module specifiers from:

1. `ImportDeclaration` — `import … from '…'` (incl. `import type`).
2. `ExportDeclaration` with a module specifier — **re-exports** (`export … from '…'`, `export * from '…'`).
3. `ImportEqualsDeclaration` — `import x = require('…')` / external module ref.
4. `CallExpression` whose `expression.kind === ts.SyntaxKind.ImportKeyword` — **dynamic `import('…')`**.

Each resolved specifier is mapped to its owning layer; a forbidden edge fails.

## Output granularity

Keep one Vitest `it()` per `(file, forbidden-target)` so a violation still names
the exact file + rule (preserve the current developer experience).

## Regression fixtures (the NFR-005 proof)

Add fixtures demonstrating the previously-missed forms are now caught, e.g.:
- a re-export `export { X } from '../adapters/…'` from a `ui`-layer fixture → flagged;
- a dynamic `await import('../ports/…')` from a `ui`-layer fixture → flagged;
- an unusual `import type { T } from '../adapters/…'` → flagged.

Fixtures may be inline source strings parsed by the analyser (preferred — keeps
them out of the compiled `src` tree) or dedicated fixture files under `test/`.
Each fixture also provides branch coverage for its import-kind handler (C-001).

## Tests

- Real `src` tree passes all rules (no regressions).
- Each fixture form is flagged by the correct rule.
- The analyser handles a file with no imports, and a `.d.ts` exclusion, without error.
