const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = '/workspaces/ajkmart123';
const scanPath = '/tmp/scan-i18n-out.json';

function loadScan(pathname) {
  const raw = fs.readFileSync(pathname, 'utf8');
  const lastBracketIndex = raw.lastIndexOf(']');
  if (lastBracketIndex === -1) {
    throw new Error(`Invalid JSON scan file: ${pathname}`);
  }
  const jsonText = raw.slice(0, lastBracketIndex + 1);
  return JSON.parse(jsonText);
}

function isTypeContext(node) {
  let current = node.parent;
  while (current) {
    if (ts.isTypeNode(current)) return true;
    current = current.parent;
  }
  return false;
}

function findFirstComponentBody(sourceFile) {
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.body) return stmt.body;
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body && ts.isBlock(init.body)) {
          return init.body;
        }
      }
    }
  }
  return null;
}

function ensureImports(fileText) {
  const lines = fileText.split('\n');
  let needsLanguageImport = !/^\s*import\s+\{[^}]*useLanguage[^}]*\}\s+from\s+['\"]@\/context\/LanguageContext['\"];?/m.test(fileText);
  let i18nImportIndex = -1;
  let i18nLine = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*import\s+\{[^}]*\}\s+from\s+['\"]@workspace\/i18n['\"];?/.test(line)) {
      i18nImportIndex = i;
      i18nLine = line;
      break;
    }
  }

  let insertIndex = lines.findIndex(line => /^\s*import\b/.test(line));
  if (insertIndex === -1) insertIndex = 0;
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\b/.test(lines[i])) lastImportIndex = i;
  }
  if (lastImportIndex === -1) lastImportIndex = insertIndex - 1;

  if (needsLanguageImport) {
    lines.splice(lastImportIndex + 1, 0, 'import { useLanguage } from "@/context/LanguageContext";');
    lastImportIndex += 1;
  }

  if (i18nImportIndex === -1) {
    lines.splice(lastImportIndex + 1, 0, 'import { tDual, type TranslationKey } from "@workspace/i18n";');
  } else {
    const line = lines[i18nImportIndex];
    const hasTDual = /\btDual\b/.test(line);
    const hasTranslationKey = /\bTranslationKey\b/.test(line);
    if (!hasTDual || !hasTranslationKey) {
      const named = line.replace(/^\s*import\s+\{\s*([^}]*)\s*\}\s+from\s+(['\"]@workspace\/i18n['\"]\s*;?)/, (_, existing, rest) => {
        const parts = existing.split(',').map(part => part.trim()).filter(Boolean);
        if (!hasTDual) parts.unshift('tDual');
        if (!hasTranslationKey) parts.push('type TranslationKey');
        const unique = [...new Set(parts)];
        return `import { ${unique.join(', ')} } from ${rest}`;
      });
      lines[i18nImportIndex] = line.replace(/^\s*import\s+\{[^}]*\}\s+from\s+['\"]@workspace\/i18n['\"];?/, line => line.replace(/^\s*import\s+\{\s*([^}]*)\s*\}\s+from\s+/, (_, existing) => {
        const parts = existing.split(',').map(part => part.trim()).filter(Boolean);
        if (!hasTDual) parts.unshift('tDual');
        if (!hasTranslationKey) parts.push('type TranslationKey');
        const unique = [...new Set(parts)];
        return `import { ${unique.join(', ')} } from `;
      }));
    }
  }

  return lines.join('\n');
}

function insertHelper(fileText) {
  if (/\bconst\s+T\s*=\s*\(key\s*:\s*TranslationKey\)\s*=>\s*tDual\(key,\s*language\);?/.test(fileText)) {
    return fileText;
  }
  if (!/\buseLanguage\b/.test(fileText) || !/\btDual\b/.test(fileText)) {
    return fileText;
  }

  const helperText = '  const { language } = useLanguage();\n  const T = (key: TranslationKey) => tDual(key, language);\n\n';
  const patterns = [
    /export\s+default\s+function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{\s*/m,
    /function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{\s*/m,
    /const\s+[A-Za-z0-9_]+\s*=\s*\([^)]*\)\s*=>\s*\{\s*/m,
  ];

  for (const pattern of patterns) {
    const match = fileText.match(pattern);
    if (match) {
      const insertAt = match.index + match[0].length;
      return fileText.slice(0, insertAt) + '\n' + helperText + fileText.slice(insertAt);
    }
  }

  return fileText;
}

function processFile(item) {
  const filePath = path.join(root, item.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements = [];
  const valueToKey = new Map(item.matches.map((m) => [m.value, m.key]));
  const matchedValues = new Set();

  function visit(node) {
    if (ts.isJsxText(node)) {
      const raw = node.getText(sourceFile);
      const trimmed = raw.trim();
      if (valueToKey.has(trimmed)) {
        const key = valueToKey.get(trimmed);
        if (key) {
          const prefix = raw.match(/^\s*/)?.[0] ?? '';
          const suffix = raw.match(/\s*$/)?.[0] ?? '';
          const replacement = `${prefix}{T("${key}")}${suffix}`;
          replacements.push({ start: node.getStart(sourceFile), end: node.getEnd(), text: replacement });
          matchedValues.add(trimmed);
        }
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && valueToKey.has(node.text) && !isTypeContext(node)) {
      const key = valueToKey.get(node.text);
      if (key) {
        const parent = node.parent;
        let replacement = `T("${key}")`;
        if (ts.isJsxAttribute(parent) && parent.initializer === node) {
          replacement = `{T("${key}")}`;
        } else if (ts.isJsxExpression(parent) && parent.expression === node) {
          replacement = `T("${key}")`;
        }
        replacements.push({ start: node.getStart(sourceFile), end: node.getEnd(), text: replacement });
        matchedValues.add(node.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (replacements.length === 0) {
    console.log(`No replacements for ${item.file}`);
    return;
  }

  replacements.sort((a, b) => b.start - a.start);
  let updated = sourceText;
  for (const rep of replacements) {
    updated = updated.slice(0, rep.start) + rep.text + updated.slice(rep.end);
  }

  updated = ensureImports(updated);
  updated = insertHelper(updated);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`Patched ${item.file} (${replacements.length} replacements, ${matchedValues.size} unique values)`);
}

const scanData = loadScan(scanPath);
scanData.forEach(processFile);
console.log('Done');
