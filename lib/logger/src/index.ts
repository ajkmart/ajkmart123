/* eslint-disable no-console */
/**
 * @workspace/logger
 *
 * Shared frontend logger for all AJKMart web/mobile apps and shared libs.
 *
 * - Dev:  all levels print to console with a coloured [Namespace] prefix.
 * - Prod: debug + warn are no-ops; error forwards to the registered error
 *         handler (connected to each app's error-reporting pipeline).
 *
 * Usage:
 *   const log = createLogger('[MyModule]');
 *   log.debug('data loaded', data);
 *   log.warn('slow response', ms);
 *   log.error('request failed', err);
 *
 * Wiring (call once in each app entry point):
 *   import { registerErrorHandler } from '@workspace/logger';
 *   import { reportError } from './lib/error-reporter';
 *   registerErrorHandler(reportError);
 */

declare const __DEV__: boolean | undefined;

type ErrorHandler = (opts: {
  errorType: "ui_error";
  errorMessage: string;
  functionName?: string;
  stackTrace?: string;
}) => void;

let _errorHandler: ErrorHandler | null = null;

/**
 * Register the app-local error reporter so that production `log.error()`
 * calls reach the server-side error-reports pipeline.
 * Call this once in the app's entry point before rendering.
 */
export function registerErrorHandler(handler: ErrorHandler): void {
  _errorHandler = handler;
}

/** Cross-platform development-mode detection. */
function isDevMode(): boolean {
  if (typeof __DEV__ !== "undefined") return !!__DEV__;
  try {
    return !!(import.meta as any)?.env?.DEV;
  } catch {
    return false;
  }
}

/** ANSI-free colour prefix for browser devtools. */
const COLOURS = [
  "#7c3aed",
  "#0284c7",
  "#059669",
  "#d97706",
  "#db2777",
  "#16a34a",
  "#9333ea",
  "#0891b2",
];
let _colourIdx = 0;

function pickColour(): string {
  return COLOURS[_colourIdx++ % COLOURS.length]!;
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Create a namespaced logger.
 * @param namespace - bracketed label, e.g. `'[MyModule]'`
 */
export function createLogger(namespace: string): Logger {
  const colour = pickColour();
  const dev = isDevMode();

  if (dev) {
    const prefix = `%c${namespace}`;
    const style = `color:${colour};font-weight:600`;
    return {
      debug: (...args) => console.debug(prefix, style, ...args),
      info: (...args) => console.info(prefix, style, ...args),
      warn: (...args) => console.warn(prefix, style, ...args),
      error: (...args) => console.error(prefix, style, ...args),
    };
  }

  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (...args) => {
      if (!_errorHandler) return;
      const msg = args
        .map((a) => {
          if (a instanceof Error) return a.message;
          if (typeof a === "string") return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(" ");
      const stack = args.find((a): a is Error => a instanceof Error)?.stack;
      _errorHandler({
        errorType: "ui_error",
        errorMessage: msg.slice(0, 5000),
        functionName: namespace,
        stackTrace: stack,
      });
    },
  };
}
