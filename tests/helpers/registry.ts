import { writeFileSync } from 'node:fs';

export interface VaultEntry {
  dir: string;
  hash?: string | null;
}

/**
 * Write a fake `~/.claude.json` (with a populated `mcpServers` object)
 * for use in tests. Accepts either `name → dir` shorthand or
 * `name → { dir, hash? }` when a pinned SHA-256 needs to be present in
 * the registry record.
 *
 * Replaces 14 near-identical local helpers — one per test file — with a
 * single shape. Use whichever value form is convenient at the call
 * site:
 *
 *     writeCfg(cfgPath, { MyVault: '/tmp/my-vault' });
 *     writeCfg(cfgPath, { MyVault: { dir: '/tmp/my-vault', hash: 'abc' } });
 */
export function writeCfg(
  cfgPath: string,
  vaults: Record<string, string | VaultEntry>,
): void {
  const mcpServers: Record<string, { command: string; args: string[] }> = {};
  for (const [name, value] of Object.entries(vaults)) {
    const entry: VaultEntry = typeof value === 'string' ? { dir: value } : value;
    const args = [`${entry.dir}/.mcp-start.js`];
    if (entry.hash) args.push(`--expected-sha256=${entry.hash}`);
    mcpServers[name] = { command: 'node', args };
  }
  writeFileSync(cfgPath, JSON.stringify({ mcpServers }), 'utf8');
}
