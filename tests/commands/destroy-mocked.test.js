import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@inquirer/prompts', () => ({ input: vi.fn(), confirm: vi.fn() }));
vi.mock('execa', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, execa: vi.fn() };
});
vi.mock('../../src/lib/platform.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, findTool: vi.fn() };
});
vi.mock('../../src/lib/github.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, isAdmin: vi.fn(), ensureDeleteRepoScope: vi.fn() };
});

import { input } from '@inquirer/prompts';
import { execa } from 'execa';
import { findTool } from '../../src/lib/platform.js';
import { isAdmin, ensureDeleteRepoScope } from '../../src/lib/github.js';

let tmp;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'vk-destroy-mock-'));
  vi.mocked(input).mockReset();
  vi.mocked(execa).mockReset();
  vi.mocked(findTool).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(ensureDeleteRepoScope).mockReset();
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeCfg(cfgPath, vaults) {
  const mcpServers = {};
  for (const [name, dir] of Object.entries(vaults)) {
    mcpServers[name] = { command: 'node', args: [`${dir}/.mcp-start.js`] };
  }
  writeFileSync(cfgPath, JSON.stringify({ mcpServers }), 'utf8');
}

function makeVaultDir(dir, withGit = false) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'CLAUDE.md'), '');
  mkdirSync(join(dir, 'raw'), { recursive: true });
  mkdirSync(join(dir, 'wiki'), { recursive: true });
  if (withGit) mkdirSync(join(dir, '.git'), { recursive: true });
}

function mockGitRemote(url) {
  vi.mocked(execa).mockImplementation(async (cmd, args) => {
    if (args?.[2] === 'remote' && args?.[3] === 'get-url') {
      return { exitCode: 0, stdout: url, stderr: '' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  });
}

// ── DE-1: non-admin collaborator — GitHub deletion skipped ───────────────────

describe('DE-1: non-admin user', () => {
  it('skips GitHub deletion and notes repo ownership', async () => {
    const vaultDir = join(tmp, 'CollabVault');
    makeVaultDir(vaultDir, true);
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { CollabVault: vaultDir });

    mockGitRemote('https://github.com/owner/CollabVault.git');
    vi.mocked(isAdmin).mockResolvedValueOnce(false);
    vi.mocked(ensureDeleteRepoScope).mockResolvedValue(undefined);
    vi.mocked(findTool).mockResolvedValue(null);
    vi.mocked(input).mockResolvedValueOnce('CollabVault');

    const { run } = await import('../../src/commands/destroy.js');
    const lines = [];
    await run('CollabVault', { cfgPath, skipMcp: true, log: (m) => lines.push(m) });

    expect(lines.some(l => /don't own|skipping/i.test(l))).toBe(true);
    expect(existsSync(vaultDir)).toBe(false);
  });
});

// ── DE-2: admin user, wrong name typed → aborts ──────────────────────────────

describe('DE-2: admin user, wrong name typed', () => {
  it('aborts and does not delete directory', async () => {
    const vaultDir = join(tmp, 'AdminVault');
    makeVaultDir(vaultDir, true);
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { AdminVault: vaultDir });

    mockGitRemote('https://github.com/me/AdminVault.git');
    vi.mocked(isAdmin).mockResolvedValueOnce(true);
    vi.mocked(ensureDeleteRepoScope).mockResolvedValue(undefined);
    vi.mocked(input).mockResolvedValueOnce('wrongname');

    const { run } = await import('../../src/commands/destroy.js');
    const lines = [];
    await run('AdminVault', { cfgPath, log: (m) => lines.push(m) });

    expect(lines.some(l => /aborted/i.test(l))).toBe(true);
    expect(existsSync(vaultDir)).toBe(true);
  });
});

// ── DE-3: admin user confirms — gh repo delete called ────────────────────────

describe('DE-3: admin user confirms deletion', () => {
  it('calls gh repo delete with --yes', async () => {
    const vaultDir = join(tmp, 'DeleteVault');
    makeVaultDir(vaultDir, true);
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { DeleteVault: vaultDir });

    vi.mocked(isAdmin).mockResolvedValueOnce(true);
    vi.mocked(ensureDeleteRepoScope).mockResolvedValue(undefined);
    vi.mocked(input).mockResolvedValueOnce('DeleteVault');
    vi.mocked(findTool).mockImplementation(async (name) => {
      if (name === 'gh') return '/usr/bin/gh';
      if (name === 'claude') return null;
      return null;
    });
    // mock all execa calls including git remote and gh repo delete
    vi.mocked(execa).mockImplementation(async (cmd, args) => {
      if (args?.[2] === 'remote' && args?.[3] === 'get-url') {
        return { exitCode: 0, stdout: 'https://github.com/me/DeleteVault.git', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const { run } = await import('../../src/commands/destroy.js');
    const lines = [];
    await run('DeleteVault', { cfgPath, skipMcp: true, log: (m) => lines.push(m) });

    const deleteCalls = vi.mocked(execa).mock.calls.filter(c =>
      c[1]?.includes('delete') && c[1]?.includes('--yes')
    );
    expect(deleteCalls.length).toBeGreaterThan(0);
    expect(existsSync(vaultDir)).toBe(false);
  });
});

// ── DE-4: GitHub deletion fails — continues with local + MCP cleanup ──────────

describe('DE-4: GitHub deletion fails', () => {
  it('logs warning but still deletes local directory', async () => {
    const vaultDir = join(tmp, 'PartialVault');
    makeVaultDir(vaultDir, true);
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { PartialVault: vaultDir });

    vi.mocked(isAdmin).mockResolvedValueOnce(true);
    vi.mocked(ensureDeleteRepoScope).mockResolvedValue(undefined);
    vi.mocked(findTool).mockImplementation(async (name) => {
      if (name === 'gh') return '/usr/bin/gh';
      return null;
    });
    vi.mocked(execa).mockImplementation(async (cmd, args) => {
      if (args?.[2] === 'remote' && args?.[3] === 'get-url') {
        return { exitCode: 0, stdout: 'https://github.com/me/PartialVault.git', stderr: '' };
      }
      if (args?.includes('delete')) {
        return { exitCode: 1, stdout: '', stderr: 'permission denied' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const { run } = await import('../../src/commands/destroy.js');
    const lines = [];
    await run('PartialVault', { cfgPath, skipConfirm: true, skipMcp: true, log: (m) => lines.push(m) });

    expect(lines.some(l => /GitHub repo deletion failed|continuing/i.test(l))).toBe(true);
    expect(existsSync(vaultDir)).toBe(false);
  });
});

// ── DE-5: MCP removal skipped when claude not found ──────────────────────────

describe('DE-5: MCP removal skipped', () => {
  it('logs warning when claude not found', async () => {
    const vaultDir = join(tmp, 'NoMcpVault');
    makeVaultDir(vaultDir);
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { NoMcpVault: vaultDir });

    vi.mocked(isAdmin).mockRejectedValueOnce(new Error('no git'));
    vi.mocked(findTool).mockResolvedValue(null);
    vi.mocked(execa).mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

    const { run } = await import('../../src/commands/destroy.js');
    const lines = [];
    await run('NoMcpVault', { cfgPath, skipConfirm: true, log: (m) => lines.push(m) });

    expect(lines.some(l => /Claude Code not found|MCP cleanup skipped/i.test(l))).toBe(true);
  });
});

// ── DE-6: summary shows github/mcp/local status ───────────────────────────────

describe('DE-6: summary output', () => {
  it('shows summary with GitHub, MCP, and Local statuses', async () => {
    const vaultDir = join(tmp, 'SummaryVault');
    makeVaultDir(vaultDir);
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { SummaryVault: vaultDir });

    vi.mocked(isAdmin).mockRejectedValueOnce(new Error('no git'));
    vi.mocked(findTool).mockResolvedValue(null);
    vi.mocked(execa).mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

    const { run } = await import('../../src/commands/destroy.js');
    const lines = [];
    await run('SummaryVault', { cfgPath, skipConfirm: true, log: (m) => lines.push(m) });

    expect(lines.some(l => /Summary/i.test(l))).toBe(true);
    expect(lines.some(l => /GitHub/i.test(l))).toBe(true);
    expect(lines.some(l => /MCP/i.test(l))).toBe(true);
    expect(lines.some(l => /Local/i.test(l))).toBe(true);
  });
});
