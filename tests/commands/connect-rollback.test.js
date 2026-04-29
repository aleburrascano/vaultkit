/**
 * Transactional rollback tests for the connect command.
 *
 * connect.js uses a `cloned` flag + finally block to ensure that
 * if anything fails after the git clone, the cloned directory is removed.
 * These tests verify that invariant.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@inquirer/prompts', () => ({ confirm: vi.fn() }));
vi.mock('execa', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, execa: vi.fn() };
});
vi.mock('../../src/lib/platform.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, findTool: vi.fn(), vaultsRoot: vi.fn(), npmGlobalBin: vi.fn() };
});
vi.mock('../../src/lib/git.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, clone: vi.fn() };
});

import { confirm } from '@inquirer/prompts';
import { execa } from 'execa';
import { findTool, vaultsRoot } from '../../src/lib/platform.js';
import { clone } from '../../src/lib/git.js';

let tmp;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'vk-connect-rollback-'));
  vi.mocked(confirm).mockReset();
  vi.mocked(execa).mockReset();
  vi.mocked(findTool).mockReset();
  vi.mocked(vaultsRoot).mockReset();
  vi.mocked(clone).mockReset();

  vi.mocked(vaultsRoot).mockReturnValue(tmp);
  vi.mocked(findTool).mockResolvedValue('/usr/bin/claude');
  vi.mocked(execa).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ── TR-1: clone failure — nothing left on disk ─────────────────────────────────

describe('TR-1: clone fails — no directory left', () => {
  it('leaves no directory when clone throws', async () => {
    vi.mocked(clone).mockRejectedValueOnce(new Error('repository not found'));
    const vaultDir = join(tmp, 'MyVault');

    const { run } = await import('../../src/commands/connect.js');
    await expect(run('owner/MyVault', { cfgPath: join(tmp, '.claude.json'), log: () => {} }))
      .rejects.toThrow(/repository not found/i);

    expect(existsSync(vaultDir)).toBe(false);
  });
});

// ── TR-2: clone succeeds but .mcp-start.js missing — no orphaned dir ──────────

describe('TR-2: clone succeeds, launcher missing', () => {
  it('cloned dir is NOT deleted when launcher is missing (warns and exits cleanly)', async () => {
    // connect.js logs a warning and returns cleanly (doesn't throw) when .mcp-start.js is absent
    const vaultDir = join(tmp, 'NoLauncher');
    vi.mocked(clone).mockImplementation(async () => {
      mkdirSync(vaultDir, { recursive: true });
      // No .mcp-start.js written
    });

    const { run } = await import('../../src/commands/connect.js');
    const lines = [];
    await run('owner/NoLauncher', { cfgPath: join(tmp, '.claude.json'), log: (m) => lines.push(m) });

    // Warning logged, vault dir left intact (user cloned a vault without launcher)
    expect(lines.some(l => /missing .mcp-start.js|MCP registration skipped/i.test(l))).toBe(true);
    expect(existsSync(vaultDir)).toBe(true);
  });
});

// ── TR-3: user declines MCP registration — dir stays, no MCP entry ────────────

describe('TR-3: user declines MCP registration', () => {
  it('keeps cloned dir but skips MCP registration', async () => {
    const vaultDir = join(tmp, 'DeclineVault');
    vi.mocked(clone).mockImplementation(async () => {
      mkdirSync(vaultDir, { recursive: true });
      writeFileSync(join(vaultDir, '.mcp-start.js'), '// launcher');
      writeFileSync(join(vaultDir, 'CLAUDE.md'), '');
      mkdirSync(join(vaultDir, 'raw'), { recursive: true });
      mkdirSync(join(vaultDir, 'wiki'), { recursive: true });
    });
    vi.mocked(confirm).mockResolvedValueOnce(false);

    const { run } = await import('../../src/commands/connect.js');
    const lines = [];
    await run('owner/DeclineVault', { cfgPath: join(tmp, '.claude.json'), log: (m) => lines.push(m) });

    expect(lines.some(l => /skipped|To register later/i.test(l))).toBe(true);
    expect(existsSync(vaultDir)).toBe(true);
    expect(vi.mocked(execa).mock.calls.some(c => c[1]?.includes('add'))).toBe(false);
  });
});

// ── TR-4: MCP registration throws — partial clone removed ─────────────────────

describe('TR-4: MCP registration fails — partial clone removed', () => {
  it('removes cloned dir when claude mcp add throws', async () => {
    const vaultDir = join(tmp, 'McpFailVault');
    vi.mocked(clone).mockImplementation(async () => {
      mkdirSync(vaultDir, { recursive: true });
      writeFileSync(join(vaultDir, '.mcp-start.js'), '// launcher');
      writeFileSync(join(vaultDir, 'CLAUDE.md'), '');
      mkdirSync(join(vaultDir, 'raw'), { recursive: true });
      mkdirSync(join(vaultDir, 'wiki'), { recursive: true });
    });
    vi.mocked(confirm).mockResolvedValueOnce(true); // user confirms MCP registration

    vi.mocked(execa).mockImplementation(async (cmd, args) => {
      if (args?.includes('add') && args?.includes('--scope')) {
        throw new Error('claude mcp add: permission denied');
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const { run } = await import('../../src/commands/connect.js');
    const lines = [];
    await expect(
      run('owner/McpFailVault', { cfgPath: join(tmp, '.claude.json'), log: (m) => lines.push(m) })
    ).rejects.toThrow(/permission denied/i);

    expect(lines.some(l => /partial clone|Connect failed/i.test(l))).toBe(true);
    expect(existsSync(vaultDir)).toBe(false);
  });
});

// ── TR-5: successful connect — dir and MCP both present ───────────────────────

describe('TR-5: successful connect', () => {
  it('leaves dir intact and calls mcp add', async () => {
    const vaultDir = join(tmp, 'SuccessVault');
    vi.mocked(clone).mockImplementation(async () => {
      mkdirSync(vaultDir, { recursive: true });
      writeFileSync(join(vaultDir, '.mcp-start.js'), '// launcher');
      writeFileSync(join(vaultDir, 'CLAUDE.md'), '');
      mkdirSync(join(vaultDir, 'raw'), { recursive: true });
      mkdirSync(join(vaultDir, 'wiki'), { recursive: true });
    });
    vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(execa).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    const { run } = await import('../../src/commands/connect.js');
    const lines = [];
    await run('owner/SuccessVault', { cfgPath: join(tmp, '.claude.json'), log: (m) => lines.push(m) });

    expect(existsSync(vaultDir)).toBe(true);
    const addCalls = vi.mocked(execa).mock.calls.filter(c =>
      c[1]?.includes('add') && c[1]?.some(a => String(a).includes('expected-sha256'))
    );
    expect(addCalls.length).toBeGreaterThan(0);
    expect(lines.some(l => /done/i.test(l))).toBe(true);
  });
});
