import { SilentLogger, type Logger } from '../../src/lib/logger.js';

export { SilentLogger } from '../../src/lib/logger.js';

/** Shared SilentLogger instance — drop into any `log:` slot when you don't
 *  care about output. Replaces the pre-Logger pattern of `log: () => {}`. */
export const silent: Logger = new SilentLogger();

/**
 * Returns a Logger that pushes every message (info/warn/error) into the
 * provided array. Designed to bridge the pre-Logger test pattern of
 * `log: (m: unknown) => lines.push(String(m))`.
 *
 * Debug calls are silently dropped so test assertions don't accidentally
 * match against verbose-mode noise.
 */
export function arrayLogger(lines: string[]): Logger {
  const push = (...args: unknown[]): void => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  };
  return {
    info: push,
    warn: push,
    error: push,
    debug: () => {},
  };
}
