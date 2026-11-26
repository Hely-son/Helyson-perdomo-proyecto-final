import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// TK-01.4 · O1 de TK-01.2 (restricción de diseño en backlog/TRACKER.md, "Seguimientos abiertos"): el manejador de
// pérdida de sesión se registra UNA sola vez, en el nivel superior de src/routes/router.ts, y no se traslada a
// componentes ni a otros módulos (registrarlo en un montaje reiniciaría la coordinación a mitad de una pérdida).
// Prueba estática con el analizador de TypeScript sobre todo src/. Matriz: docs/qa/TK-01.4-matrix.md (N10).

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

interface Registration {
  file: string;
  topLevelStatement: boolean;
}

function registrations(): Registration[] {
  const found: Registration[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    // Nombres locales con los que se llama: el propio y cualquier alias de importación (`as`).
    const names = new Set(['setSessionLostHandler']);
    const collectAliases = (node: ts.Node): void => {
      if (ts.isImportSpecifier(node) && (node.propertyName ?? node.name).text === 'setSessionLostHandler') names.add(node.name.text);
      ts.forEachChild(node, collectAliases);
    };
    collectAliases(source);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
        if (name !== null && names.has(name)) {
          found.push({
            file: relative(SRC, file).split('\\').join('/'),
            // Nivel superior: la llamada es la expresión de una sentencia hija directa del módulo.
            topLevelStatement: ts.isExpressionStatement(node.parent) && ts.isSourceFile(node.parent.parent),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe('QA-01.4-N10 (O1 de TK-01.2): registro único del manejador de pérdida de sesión', () => {
  it('src/ contiene exactamente una llamada a setSessionLostHandler, en una sentencia del nivel superior de routes/router.ts', () => {
    expect(registrations()).toEqual([{ file: 'routes/router.ts', topLevelStatement: true }]);
  });
});
