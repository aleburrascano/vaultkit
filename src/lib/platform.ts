import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { execa } from 'execa';

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function claudeJsonPath(): string {
  if (isWindows()) {
    return join(process.env.USERPROFILE ?? '', '.claude.json');
  }
  return join(process.env.HOME ?? '', '.claude.json');
}

export function vaultsRoot(): string {
  if (process.env.VAULTKIT_HOME) return process.env.VAULTKIT_HOME;
  const home = isWindows() ? (process.env.USERPROFILE ?? '') : (process.env.HOME ?? '');
  return join(home, 'vaults');
}

function probeWinGetGhPath(): string | null {
  const base = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  try {
    const entries = readdirSync(base);
    for (const entry of entries) {
      if (entry.startsWith('GitHub.cli_')) {
        const p = join(base, entry, 'tools', 'gh.exe');
        if (existsSync(p)) return p;
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function findOnPath(name: string): Promise<string | null> {
  try {
    const cmd = isWindows() ? 'where' : 'which';
    const result = await execa(cmd, [name], { reject: false });
    if (result.exitCode === 0) {
      const out = String(result.stdout ?? '').trim();
      const first = out.split('\n')[0]?.trim() ?? '';
      return first || null;
    }
  } catch { /* ignore */ }
  return null;
}

export async function findTool(name: string): Promise<string | null> {
  if (isWindows()) {
    if (name === 'gh') {
      const candidates = [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'GitHub CLI', 'gh.exe'),
        'C:\\Program Files\\GitHub CLI\\gh.exe',
        join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'gh.exe'),
      ];
      for (const p of candidates) {
        if (existsSync(p)) return p;
      }
      const wingetHit = probeWinGetGhPath();
      if (wingetHit) return wingetHit;
    }
    if (name === 'claude') {
      const npmPaths = [
        join(process.env.APPDATA ?? '', 'npm', 'claude.cmd'),
        join(process.env.APPDATA ?? '', 'npm', 'claude'),
      ];
      for (const p of npmPaths) {
        if (existsSync(p)) return p;
      }
      const bin = await npmGlobalBin();
      if (bin) {
        for (const candidate of ['claude.cmd', 'claude']) {
          const p = join(bin, candidate);
          if (existsSync(p)) return p;
        }
      }
    }
  }
  return findOnPath(name);
}

export async function npmGlobalBin(): Promise<string | null> {
  try {
    const result = await execa('npm', ['config', 'get', 'prefix'], { reject: false });
    if (result.exitCode !== 0) return null;
    const prefix = String(result.stdout ?? '').trim();
    return isWindows() ? prefix : join(prefix, 'bin');
  } catch {
    return null;
  }
}
