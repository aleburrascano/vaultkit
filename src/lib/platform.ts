import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';
import { execa } from 'execa';
import { confirm } from '@inquirer/prompts';
import { VaultkitError } from './errors.js';
import type { Logger } from './logger.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the byte-immutable launcher template
 * (`lib/mcp-start.js.tmpl`). In dev resolves to `<repo>/lib/...`; after
 * `npm run build` the post-build script copies the template into
 * `dist/lib/`, so the same `'../../lib/...'` offset works from
 * `dist/src/lib/platform.js`. Single source of truth — `init.ts` and
 * `update.ts` should call this rather than recomputing the path.
 */
export function getLauncherTemplate(): string {
  return join(SCRIPT_DIR, '../../lib/mcp-start.js.tmpl');
}

/**
 * Absolute path to the GitHub Pages deploy workflow template
 * (`lib/deploy.yml.tmpl`). Same resolution rules as `getLauncherTemplate`.
 * Used by `init.ts` (initial vault scaffolding) and `visibility.ts`
 * (when toggling a vault to a publishing mode that needs the workflow).
 */
export function getDeployTemplate(): string {
  return join(SCRIPT_DIR, '../../lib/deploy.yml.tmpl');
}

/**
 * Absolute path to the freshness GitHub Action template
 * (`lib/freshness.yml.tmpl`). Scheduled weekly run that invokes
 * `vaultkit refresh --vault-dir .` and opens a PR with the report.
 * Same dev/post-build resolution as `getLauncherTemplate`.
 */
export function getFreshnessTemplate(): string {
  return join(SCRIPT_DIR, '../../lib/freshness.yml.tmpl');
}

/**
 * Absolute path to the PR description scaffold
 * (`lib/pr-template.md.tmpl`). Asks contributors to declare the
 * Claude Code session config they used (model, thinking, effort)
 * when applying a freshness report. Same resolution as above.
 */
export function getPrTemplate(): string {
  return join(SCRIPT_DIR, '../../lib/pr-template.md.tmpl');
}

/**
 * Absolute path to the project-scoped Claude Code settings template
 * (`lib/claude-settings.json.tmpl`). Pins recommended model defaults
 * for refresh sessions where the vault directory is the cwd.
 * Same resolution as above.
 */
export function getClaudeSettingsTemplate(): string {
  return join(SCRIPT_DIR, '../../lib/claude-settings.json.tmpl');
}

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

/**
 * Bootstraps the GitHub CLI for the current platform: winget on Windows,
 * brew on macOS, apt or dnf on Linux. Used by `vaultkit init` when `findTool('gh')`
 * comes back empty. Throws `VaultkitError('TOOL_MISSING')` when the platform's
 * package manager isn't recognized so the caller can surface a manual-install
 * hint with the documented exit code.
 */
export async function installGhForPlatform(
  { log, skipInstallCheck = false }: { log: Logger; skipInstallCheck?: boolean },
): Promise<void> {
  log.info('GitHub CLI not found — installing...');
  if (isWindows()) {
    const ok = skipInstallCheck || await confirm({ message: 'Install GitHub CLI via winget?', default: true });
    if (ok) {
      await execa('winget', ['install', '--id', 'GitHub.cli', '-e',
        '--accept-package-agreements', '--accept-source-agreements'], { reject: false });
      // Probe known install paths
      const dirs = [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'GitHub CLI'),
        'C:\\Program Files\\GitHub CLI',
        join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links'),
      ];
      for (const d of dirs) {
        if (existsSync(d)) {
          process.env.PATH = `${d};${process.env.PATH ?? ''}`;
        }
      }
    }
  } else if (process.platform === 'darwin' && await execa('which', ['brew'], { reject: false }).then(r => r.exitCode === 0)) {
    await execa('brew', ['install', 'gh']);
  } else if (await execa('which', ['apt-get'], { reject: false }).then(r => r.exitCode === 0)) {
    await execa('bash', ['-c',
      'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null && ' +
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && ' +
      'sudo apt-get update -qq && sudo apt-get install gh -y',
    ]);
  } else if (await execa('which', ['dnf'], { reject: false }).then(r => r.exitCode === 0)) {
    await execa('bash', ['-c',
      'sudo dnf install "dnf-command(config-manager)" -y && ' +
      'sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo && ' +
      'sudo dnf install gh --repo gh-cli -y',
    ]);
  } else {
    throw new VaultkitError('TOOL_MISSING', 'Cannot auto-install gh. Install from https://cli.github.com and re-run.');
  }
}
