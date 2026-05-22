import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");

export interface FileScanFinding {
  filePath: string;
  lineNumber: number;
  ruleName: string;
  severity: "critical" | "medium" | "minor";
  message: string;
  snippet: string;
}

export interface FileScanReport {
  timestamp: string;
  durationMs: number;
  totalFindings: number;
  findings: FileScanFinding[];
}

const SCAN_DIRS = [
  "artifacts/admin/src",
  "artifacts/api-server/src",
  "artifacts/rider-app/src",
  "artifacts/vendor-app/src",
  "lib",
];

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);

interface Rule {
  name: string;
  severity: "critical" | "medium" | "minor";
  message: string;
  test: (line: string, lineIndex: number, lines: string[]) => boolean;
}

const RULES: Rule[] = [
  {
    name: "empty-catch",
    severity: "critical",
    message: "Empty catch block silently swallows errors",
    test: (line, i, lines) => {
      if (/\bcatch\s*\(/.test(line) || /\bcatch\s*\{/.test(line)) {
        const catchIdx = line.indexOf("catch");
        const braceAfterCatch = line.indexOf("{", catchIdx);
        if (braceAfterCatch !== -1) {
          const rest = line.slice(braceAfterCatch + 1).trim();
          if (rest === "}" || rest === "") {
            const nextLine = lines[i + 1]?.trim() ?? "";
            return nextLine === "}" || nextLine === "";
          }
        }
      }
      return false;
    },
  },
  {
    name: "console-log",
    severity: "minor",
    message: "console.log found — use structured logger instead",
    test: (line) => /\bconsole\.log\s*\(/.test(line) && !/\/\/.*console\.log/.test(line),
  },
  {
    name: "todo-fixme-hack",
    severity: "minor",
    message: "TODO/FIXME/HACK comment needs resolution",
    test: (line) =>
      /\/\/.*\b(TODO|FIXME|HACK|XXX)\b/i.test(line) ||
      /\/\*.*\b(TODO|FIXME|HACK|XXX)\b/i.test(line),
  },
  {
    name: "async-no-trycatch",
    severity: "medium",
    message: "async function without surrounding try/catch — unhandled rejections possible",
    test: (line, i, lines) => {
      if (!/^\s*(export\s+)?(async\s+function|const\s+\w+\s*=\s*async\s*\()/.test(line))
        return false;
      const next5 = lines.slice(i + 1, i + 6).join("\n");
      return !/try\s*\{/.test(next5);
    },
  },
  {
    name: "route-no-trycatch",
    severity: "critical",
    message: "Express route handler without try/catch — unhandled exceptions will crash the route",
    test: (line, i, lines) => {
      if (!/router\.(get|post|put|patch|delete|use)\s*\(/.test(line)) return false;
      const block = lines.slice(i, i + 10).join("\n");
      return !/try\s*\{/.test(block) && /async/.test(block);
    },
  },
  {
    name: "missing-null-check",
    severity: "minor",
    message: "Potential null/undefined access without optional chaining",
    test: (line) => {
      if (/\?\.[a-zA-Z_$]/.test(line)) return false;
      return (
        /\breq\.(body|params|query)\.[a-zA-Z_$]+\.[a-zA-Z_$]+/.test(line) ||
        /\bres\.locals\.[a-zA-Z_$]+\.[a-zA-Z_$]+/.test(line)
      );
    },
  },
  {
    name: "unhandled-promise",
    severity: "medium",
    message: "Promise-returning call without await, .then(), or .catch()",
    test: (line) => {
      if (/^\s*(\/\/|\/\*)/.test(line)) return false;
      if (/\bawait\b/.test(line) || /\.then\s*\(/.test(line) || /\.catch\s*\(/.test(line))
        return false;
      return /\b(fetch|axios|got|superagent|request)\s*\(/.test(line);
    },
  },
  {
    name: "silent-catch-continue",
    severity: "medium",
    message: "catch block with only a comment — error is silently ignored",
    test: (line, i, lines) => {
      if (!/\bcatch\s*[\({]/.test(line)) return false;
      const nextLines = lines.slice(i + 1, i + 4);
      const nonEmpty = nextLines.filter((l) => {
        const t = l.trim();
        return t.length > 0 && t !== "}";
      });
      return nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*(\/\/|\/\*)/.test(l));
    },
  },
];

function walkDir(dir: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return;
  }
  for (const entry of entries) {
    if (
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "build"
    )
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, results);
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
}

const FILE_SIZE_LIMIT_BYTES = 500 * 1024;

function scanFile(filePath: string, relPath: string): FileScanFinding[] {
  const findings: FileScanFinding[] = [];
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > FILE_SIZE_LIMIT_BYTES) {
      logger.warn(
        { filePath: relPath, sizeBytes: stat.size },
        "[file-scanner] skipping oversized file"
      );
      return findings;
    }
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), filePath: relPath },
      "[file-scanner] stat failed"
    );
    return findings;
  }
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return findings;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const rule of RULES) {
      try {
        if (rule.test(line, i, lines)) {
          findings.push({
            filePath: relPath,
            lineNumber: i + 1,
            ruleName: rule.name,
            severity: rule.severity,
            message: rule.message,
            snippet: line.trim().slice(0, 200),
          });
        }
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[fn] rule error — skip`
        );
      }
    }
  }
  return findings;
}

export async function runFileScanner(): Promise<FileScanReport> {
  const start = Date.now();
  const allFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs)) {
      walkDir(abs, allFiles);
    }
  }

  const allFindings: FileScanFinding[] = [];
  for (const file of allFiles) {
    const rel = path.relative(ROOT, file);
    const findings = scanFile(file, rel);
    allFindings.push(...findings);
  }

  return {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    totalFindings: allFindings.length,
    findings: allFindings,
  };
}
