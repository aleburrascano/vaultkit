import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger, SilentLogger, type Logger } from '../../src/lib/logger.js';

describe('ConsoleLogger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalVerbose = process.env.VAULTKIT_VERBOSE;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.VAULTKIT_VERBOSE;
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    if (originalVerbose === undefined) delete process.env.VAULTKIT_VERBOSE;
    else process.env.VAULTKIT_VERBOSE = originalVerbose;
  });

  describe('routing by level', () => {
    it('info() routes to console.log (stdout)', () => {
      new ConsoleLogger().info('hello');
      expect(logSpy).toHaveBeenCalledWith('hello');
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('warn() routes to console.warn (stderr)', () => {
      new ConsoleLogger().warn('careful');
      expect(warnSpy).toHaveBeenCalledWith('careful');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('error() routes to console.error (stderr)', () => {
      new ConsoleLogger().error('boom');
      expect(errorSpy).toHaveBeenCalledWith('boom');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('forwards multiple arguments unchanged', () => {
      new ConsoleLogger().info('a', 1, { b: 2 });
      expect(logSpy).toHaveBeenCalledWith('a', 1, { b: 2 });
    });
  });

  describe('debug() gating', () => {
    it('is silent by default (no opt, no env var)', () => {
      new ConsoleLogger().debug('quiet');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('emits when constructed with { verbose: true }', () => {
      new ConsoleLogger({ verbose: true }).debug('loud');
      expect(errorSpy).toHaveBeenCalledWith('[debug]', 'loud');
    });

    it('emits when VAULTKIT_VERBOSE=1 env var is set', () => {
      process.env.VAULTKIT_VERBOSE = '1';
      new ConsoleLogger().debug('env');
      expect(errorSpy).toHaveBeenCalledWith('[debug]', 'env');
    });

    it('does not emit when VAULTKIT_VERBOSE is set to a value other than "1"', () => {
      process.env.VAULTKIT_VERBOSE = '0';
      new ConsoleLogger().debug('zero');
      expect(errorSpy).not.toHaveBeenCalled();

      process.env.VAULTKIT_VERBOSE = 'true';
      new ConsoleLogger().debug('true-string');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('explicit { verbose: false } overrides VAULTKIT_VERBOSE=1', () => {
      process.env.VAULTKIT_VERBOSE = '1';
      new ConsoleLogger({ verbose: false }).debug('forced-off');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('captures the env var at construction time, not at call time', () => {
      const logger = new ConsoleLogger();
      process.env.VAULTKIT_VERBOSE = '1';
      logger.debug('after');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('prefixes debug output with [debug]', () => {
      new ConsoleLogger({ verbose: true }).debug('msg', 42);
      expect(errorSpy).toHaveBeenCalledWith('[debug]', 'msg', 42);
    });
  });
});

describe('SilentLogger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('info(), warn(), error(), debug() all no-op (no console output)', () => {
    const logger: Logger = new SilentLogger();
    logger.info('a');
    logger.warn('b');
    logger.error('c');
    logger.debug('d');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('satisfies the Logger interface', () => {
    const logger: Logger = new SilentLogger();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });
});
