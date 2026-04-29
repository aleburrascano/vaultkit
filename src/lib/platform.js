import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { execa } from 'execa';

export function isWindows() {
  return process.platform === 'win32';
}

export function claudeJsonPath() {
  if (isWindows()) {
    return join(process.env.USERPROFILE ?? '', '.claude.json');
  }
  return join(process.env.HOME ?? '', '.claude.json');
}

export function vaultsRoot() {
  if (process.env.VAULTKIT_HOME) return process.env.VAULTKIT_HOME;
  const home = isWindows() ? (process.env.USERPROFILE ?? '') : (process.env.HOME ?? '');
  return join(home, 'vaults');
}

function probeWinGetGhPath() {
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

async function findOnPath(name) {
  try {
    const cmd = isWindows() ? 'where' : 'which';
    const result = await execa(cmd, [name], { reject: false });
    if (result.exitCode === 0) return result.stdout.trim().split('\n')[0].trim();
  } catch { /* ignore */ }
  return null;
}

export async function findTool(name) {
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

export async function npmGlobalBin() {
  try {
    const result = await execa('npm', ['config', 'get', 'prefix'], { reject: false });
    if (result.exitCode !== 0) return null;
    const prefix = result.stdout.trim();
    return isWindows() ? prefix : join(prefix, 'bin');
  } catch {
    return null;
  }
}
