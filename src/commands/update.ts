import { existsSync, mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirm } from '@inquirer/prompts';
import { execa } from 'execa';
import { Vault, sha256 } from '../lib/vault.js';
import {
  renderClaudeMd, renderReadme, renderDuplicateCheckYaml,
  renderGitignore, renderGitattributes, renderIndexMd, renderLogMd,
} from '../lib/vault-templates.js';
import { findTool } from '../lib/platform.js';
import { runMcpRepin, manualMcpRepinCommands } from '../lib/mcp.js';
import { add, commit, pushOrPr } from '../lib/git.js';
import { ConsoleLogger } from '../lib/logger.js';
import { VaultkitError } from '../lib/errors.js';
import type { CommandModule, RunOptions } from '../types.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TMPL_PATH = join(SCRIPT_DIR, '../../lib/mcp-start.js.tmpl');

export interface UpdateOptions extends RunOptions {
  skipConfirm?: boolean;
}

function isDirEmpty(dir: string): boolean {
  try { return readdirSync(dir).length === 0; } catch { return true; }
}

export async function run(
  name: string,
  { cfgPath, log = new ConsoleLogger(), skipConfirm = false }: UpdateOptions = {},
): Promise<void> {
  const vault = await Vault.tryFromName(name, cfgPath);
  if (!vault) throw new VaultkitError('NOT_REGISTERED', `"${name}" is not a registered vault.`);

  if (!vault.hasGitRepo()) {
    throw new Error(`${vault.dir} is not a git repository — aborting.`);
  }

  log.info(`Updating ${name} at ${vault.dir}...`);

  // Launcher refresh detection
  const beforeHash = vault.hasLauncher() ? await vault.sha256OfLauncher() : '';
  const tmplHash = await sha256(TMPL_PATH);
  const launcherWillChange = beforeHash !== tmplHash;

  // Layout-repair detection
  const missing: string[] = [];
  if (!existsSync(join(vault.dir, 'CLAUDE.md'))) missing.push('CLAUDE.md');
  if (!existsSync(join(vault.dir, 'README.md'))) missing.push('README.md');
  if (!existsSync(join(vault.dir, 'index.md'))) missing.push('index.md');
  if (!existsSync(join(vault.dir, 'log.md'))) missing.push('log.md');
  if (!existsSync(join(vault.dir, '.gitignore'))) missing.push('.gitignore');
  if (!existsSync(join(vault.dir, '.gitattributes'))) missing.push('.gitattributes');
  if (!existsSync(join(vault.dir, '.github', 'workflows', 'duplicate-check.yml')))
    missing.push('.github/workflows/duplicate-check.yml');
  if (!existsSync(join(vault.dir, 'raw')) || isDirEmpty(join(vault.dir, 'raw')))
    missing.push('raw/.gitkeep');
  if (!existsSync(join(vault.dir, 'wiki')) || isDirEmpty(join(vault.dir, 'wiki')))
    missing.push('wiki/.gitkeep');

  // Summary
  log.info('');
  if (launcherWillChange) {
    log.info(`  .mcp-start.js: ${beforeHash || '(missing)'} → ${tmplHash}`);
  } else {
    log.info(`  .mcp-start.js: up to date (${beforeHash})`);
  }
  if (missing.length > 0) {
    log.info(`  Missing layout files (${missing.length}):`);
    for (const f of missing) log.info(`    - ${f}`);
  } else {
    log.info('  Layout: complete.');
  }

  if (!launcherWillChange && missing.length === 0) {
    log.info('');
    log.info('Already up to date. Re-pinning MCP registration anyway (idempotent).');
  }

  if (!skipConfirm) {
    log.info('');
    const ok = await confirm({ message: 'Proceed?', default: false });
    if (!ok) { log.info('Aborted.'); return; }
    log.info('');
  }

  // Apply: copy launcher
  copyFileSync(TMPL_PATH, vault.launcherPath);
  const afterHash = await vault.sha256OfLauncher();

  // Apply: create missing layout files
  const added: string[] = [];
  for (const f of missing) {
    const target = join(vault.dir, f);
    mkdirSync(dirname(target), { recursive: true });
    switch (f) {
      case 'CLAUDE.md': writeFileSync(target, renderClaudeMd(name)); break;
      case 'README.md': writeFileSync(target, renderReadme(name, '')); break;
      case 'index.md': writeFileSync(target, renderIndexMd()); break;
      case 'log.md': writeFileSync(target, renderLogMd()); break;
      case 'raw/.gitkeep': writeFileSync(target, ''); break;
      case 'wiki/.gitkeep': writeFileSync(target, ''); break;
      case '.gitignore': writeFileSync(target, renderGitignore()); break;
      case '.gitattributes': writeFileSync(target, renderGitattributes()); break;
      case '.github/workflows/duplicate-check.yml':
        writeFileSync(target, renderDuplicateCheckYaml()); break;
    }
    added.push(f);
  }

  // Re-pin MCP
  const claudePath = await findTool('claude');
  if (claudePath) {
    log.info(`Re-pinning MCP registration with SHA-256 ${afterHash}...`);
    await runMcpRepin(claudePath, name, vault.launcherPath, afterHash);
  } else {
    const manual = manualMcpRepinCommands(name, vault.launcherPath, afterHash);
    log.info('Warning: Claude Code not found — MCP re-registration skipped.');
    log.info(`  Once installed, run:`);
    log.info(`    ${manual.remove}`);
    log.info(`    ${manual.add}`);
  }

  const launcherChanged = afterHash !== beforeHash;
  if (!launcherChanged && added.length === 0) {
    log.info('');
    log.info('  Nothing to commit.');
    log.info('Done. Restart Claude Code to apply the re-pinned registration.');
    return;
  }

  // Commit
  const filesToStage: string[] = [];
  if (launcherChanged) filesToStage.push('.mcp-start.js');
  filesToStage.push(...added);

  await add(vault.dir, filesToStage);

  const stagedResult = await execa('git', ['-C', vault.dir, 'diff', '--cached', '--name-only'], { reject: false });
  const staged = String(stagedResult.stdout ?? '').trim();
  if (!staged) {
    log.info('  Nothing staged — skipping commit.');
    log.info('Done. Restart Claude Code to apply.');
    return;
  }

  let commitMsg: string;
  if (launcherChanged && added.length > 0) {
    commitMsg = 'chore: update .mcp-start.js + restore standard layout files';
  } else if (launcherChanged) {
    commitMsg = 'chore: update .mcp-start.js to latest vaultkit version';
  } else {
    commitMsg = 'chore: restore standard vaultkit layout files';
  }

  await commit(vault.dir, commitMsg);
  log.info('');

  const pushResult = await pushOrPr(vault.dir, {
    branchPrefix: 'vaultkit-update',
    prTitle: commitMsg,
    prBody: 'Brings the vault up to the current vaultkit standard.',
  });

  if (pushResult.mode === 'direct') {
    log.info('Done. Restart Claude Code to apply the update.');
  } else {
    log.info(`Done. Changes will take effect after the PR (branch: ${pushResult.branch}) is merged.`);
  }
}

// Compile-time check: `run` matches the CommandModule contract.
const _module: CommandModule<[string], UpdateOptions, void> = { run };
void _module;
