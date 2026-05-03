import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { arrayLogger } from '../helpers/logger.js';

vi.mock('@inquirer/prompts', () => ({ confirm: vi.fn() }));
vi.mock('execa', async (importOriginal) => {
  const real = await importOriginal<typeof import('execa')>();
  return { ...real, execa: vi.fn() };
});

import { confirm } from '@inquirer/prompts';
import { execa } from 'execa';
import { installGhForPlatform, findTool, npmGlobalBin } from '../../src/lib/platform.js';
import { isVaultkitError } from '../../src/lib/errors.js';

let origPlatform: NodeJS.Platform;

beforeEach(() => {
  origPlatform = process.platform;
  vi.mocked(confirm).mockReset();
  vi.mocked(execa).mockReset();
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: origPlatform, writable: true });
});

describe('installGhForPlatform', () => {
  it('on Windows with skipInstallCheck=true, invokes winget with the full canonical argv', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    vi.mocked(execa).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } as never);

    await installGhForPlatform({ log: arrayLogger([]), skipInstallCheck: true });

    // confirm() must NOT be invoked when skipInstallCheck is set.
    expect(vi.mocked(confirm)).not.toHaveBeenCalled();

    // winget argv shape (per platform.ts:166): the full set of flags
    // matters — `-e` (exact match), `--accept-package-agreements`,
    // `--accept-source-agreements`. A regression that drops `-e` could
    // match the wrong package (`GitHub.cli` matches partial names).
    const wingetCall = vi.mocked(execa).mock.calls.find(c => c[0] === 'winget');
    expect(wingetCall).toBeDefined();
    expect(wingetCall?.[1]).toEqual([
      'install', '--id', 'GitHub.cli', '-e',
      '--accept-package-agreements', '--accept-source-agreements',
    ]);
  });

  it('on Windows with confirm() returning false, does NOT invoke winget', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    vi.mocked(confirm).mockResolvedValue(false);

    await installGhForPlatform({ log: arrayLogger([]), skipInstallCheck: false });

    expect(vi.mocked(confirm)).toHaveBeenCalledTimes(1);
    const wingetCall = vi.mocked(execa).mock.calls.find(c => c[0] === 'winget');
    expect(wingetCall).toBeUndefined();
  });

  it('on darwin with brew available, invokes `brew install gh`', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
    vi.mocked(execa).mockImplementation((async (cmd: string, args?: readonly string[]) => {
      // `which brew` succeeds → falls into the brew branch.
      if (cmd === 'which' && args?.[0] === 'brew') {
        return { exitCode: 0, stdout: '/opt/homebrew/bin/brew', stderr: '' };
      }
      // brew install completes successfully.
      if (cmd === 'brew') {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 1, stdout: '', stderr: 'not found' };
    }) as never);

    await installGhForPlatform({ log: arrayLogger([]) });

    const brewCall = vi.mocked(execa).mock.calls.find(c => c[0] === 'brew');
    expect(brewCall).toBeDefined();
    expect(brewCall?.[1]).toEqual(['install', 'gh']);
  });

  it('throws VaultkitError("TOOL_MISSING") when no platform package manager is available', async () => {
    // Simulate freebsd (or any platform without winget/brew/apt/dnf).
    Object.defineProperty(process, 'platform', { value: 'freebsd', writable: true });
    // All `which <pkg-mgr>` probes return exit 1 (not found).
    vi.mocked(execa).mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'not found' } as never);

    let caught: unknown = null;
    try {
      await installGhForPlatform({ log: arrayLogger([]) });
    } catch (err) {
      caught = err;
    }
    expect(isVaultkitError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe('TOOL_MISSING');
    // The error message points at the manual install URL.
    expect((caught as Error).message).toMatch(/cli\.github\.com/);
  });

  it('on darwin without brew, falls through to apt/dnf checks then throws TOOL_MISSING', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
    // `which brew`, `which apt-get`, `which dnf` all exit 1 → throws.
    vi.mocked(execa).mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'not found' } as never);

    let caught: unknown = null;
    try {
      await installGhForPlatform({ log: arrayLogger([]) });
    } catch (err) {
      caught = err;
    }
    expect(isVaultkitError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe('TOOL_MISSING');
  });
});

describe('findTool — findOnPath fallback (mocked where/which)', () => {
  it('returns the first line when `where` emits multiple paths (Windows CRLF)', async () => {
    // `where gh` on Windows returns CRLF-separated paths when multiple
    // hits exist (e.g. user has both winget and a manual install).
    // findOnPath at platform.ts:99-101 splits on '\n' and trims, so CRLF
    // ends up trimmed to just the first absolute path.
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    // Tool name unknown → all Windows shortcut candidates miss
    // → falls through to findOnPath which calls `where`.
    vi.mocked(execa).mockImplementation((async (cmd: string) => {
      if (cmd === 'where') {
        return {
          exitCode: 0,
          stdout: 'C:\\Users\\test\\.local\\bin\\sometool.exe\r\nC:\\Program Files\\sometool\\sometool.exe',
          stderr: '',
        };
      }
      return { exitCode: 1, stdout: '', stderr: '' };
    }) as never);

    const result = await findTool('sometool');
    expect(result).toBe('C:\\Users\\test\\.local\\bin\\sometool.exe');
  });

  it('returns null when where/which exits non-zero', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    vi.mocked(execa).mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'not found' } as never);

    const result = await findTool('nope');
    expect(result).toBeNull();
  });

  it('returns null when where/which exits 0 with empty stdout', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    vi.mocked(execa).mockResolvedValue({ exitCode: 0, stdout: '   \n', stderr: '' } as never);

    const result = await findTool('nope');
    expect(result).toBeNull();
  });

  it('returns null when execa itself rejects (binary missing entirely)', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    vi.mocked(execa).mockRejectedValue(new Error('ENOENT'));

    const result = await findTool('nope');
    expect(result).toBeNull();
  });
});

describe('npmGlobalBin (mocked execa)', () => {
  it('returns `prefix` verbatim on Windows (no `/bin` suffix)', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    vi.mocked(execa).mockResolvedValue({
      exitCode: 0,
      stdout: 'C:\\Users\\test\\AppData\\Roaming\\npm',
      stderr: '',
    } as never);

    const result = await npmGlobalBin();
    expect(result).toBe('C:\\Users\\test\\AppData\\Roaming\\npm');
  });

  it('appends "bin" to prefix on POSIX (via path.join)', async () => {
    // path.join uses RUNTIME native separators regardless of the faked
    // process.platform — assert via join() so the test passes on both
    // Windows and POSIX runners. What this test pins is the BRANCH
    // (is-not-windows takes the join path; the prefix is wrapped, not
    // returned verbatim).
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    vi.mocked(execa).mockResolvedValue({
      exitCode: 0,
      stdout: '/usr/local',
      stderr: '',
    } as never);

    const result = await npmGlobalBin();
    expect(result).toBe(join('/usr/local', 'bin'));
  });

  it('trims trailing whitespace from npm config get prefix output', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    vi.mocked(execa).mockResolvedValue({
      exitCode: 0,
      stdout: '/usr/local\n',
      stderr: '',
    } as never);

    const result = await npmGlobalBin();
    expect(result).toBe(join('/usr/local', 'bin'));
  });

  it('returns null when `npm config get prefix` exits non-zero', async () => {
    vi.mocked(execa).mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'npm not found' } as never);

    const result = await npmGlobalBin();
    expect(result).toBeNull();
  });

  it('returns null when execa itself rejects (npm missing)', async () => {
    vi.mocked(execa).mockRejectedValue(new Error('ENOENT'));

    const result = await npmGlobalBin();
    expect(result).toBeNull();
  });
});
