/**
 * Structured logger interface used across vaultkit commands. Replaces the
 * earlier `LogFn = (...args: unknown[]) => void` one-liner.
 *
 * The four levels mirror what most CLI tools expose:
 *   - info   — normal operational output (was: every `log(...)` call)
 *   - warn   — recoverable conditions, partial-failure notices
 *   - error  — fatal-but-handled error explanations
 *   - debug  — verbose-only diagnostic output (gated by --verbose)
 *
 * This is deliberately *not* a full logging library. No structured fields,
 * no log objects, no transports — just a small typed shape that callers
 * can implement (`ConsoleLogger`, `SilentLogger`, test spies). Upgrade
 * later if telemetry needs structured output.
 */
export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

/**
 * Default Logger implementation: routes info to stdout, warn/error/debug
 * to stderr. Debug output is suppressed unless verbose mode is on, which
 * is enabled by either an explicit constructor flag or the
 * `VAULTKIT_VERBOSE=1` env var (set by the `--verbose` global option in
 * `bin/vaultkit.ts`, or pre-set by scripted callers).
 */
export class ConsoleLogger implements Logger {
  private readonly verbose: boolean;

  constructor(opts: { verbose?: boolean } = {}) {
    this.verbose = opts.verbose ?? process.env.VAULTKIT_VERBOSE === '1';
  }

  info(...args: unknown[]): void {
    console.log(...args);
  }

  warn(...args: unknown[]): void {
    console.warn(...args);
  }

  error(...args: unknown[]): void {
    console.error(...args);
  }

  debug(...args: unknown[]): void {
    if (this.verbose) console.error('[debug]', ...args);
  }
}

/**
 * No-op Logger for tests that don't care about log output. Use in place of
 * `log: () => {}` so the test signal is "I didn't pass a logger" rather
 * than "I passed a half-implemented one".
 */
export class SilentLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
}
