import { vi } from 'vitest';
import { execa } from 'execa';

/**
 * Replace the execa mock with a stub that responds to `git config user.name`
 * and `git config user.email` with the supplied values, treats `gh auth status`
 * as authenticated, and returns success-with-empty-stdout for everything else.
 *
 * Use only in tests whose entire execa surface is git config + a default
 * 'success' fallback. Tests that compose multiple specific handlers (init,
 * destroy-mocked) keep their own inline mockImplementation.
 */
export function mockGitConfig({ name = 'Test User', email = 'test@example.com' }: {
  name?: string;
  email?: string;
} = {}): void {
  vi.mocked(execa).mockImplementation((async (cmd: string, args?: readonly string[]) => {
    if (cmd === 'git' && args?.[0] === 'auth') return { exitCode: 0, stdout: '', stderr: '' };
    if (args?.includes('user.name')) return { exitCode: 0, stdout: name, stderr: '' };
    if (args?.includes('user.email')) return { exitCode: 0, stdout: email, stderr: '' };
    return { exitCode: 0, stdout: '', stderr: '' };
  }) as never);
}
