# Domain Language

- **vault** = a local Obsidian directory containing `.obsidian/`, `CLAUDE.md`, `raw/`, and `wiki/` subdirectories, registered in `~/.claude.json` for Claude Code MCP access.
- **vault name** = user-chosen identifier matching `^[a-zA-Z0-9_-]+$`, max 64 chars; used as the key in the MCP registry.
- **vault dir** = the full filesystem path to a vault on disk; always resolved via the MCP registry, never from user input.
- **MCP registry** = the `mcpServers` object in `~/.claude.json`, where each vault is registered with its path and expected SHA-256 hash.
- **launcher** = `.mcp-start.js` in each vault root; bytes copied verbatim from `lib/mcp-start.js.tmpl`, pinned to a SHA-256 hash for self-verification.
- **launcher template** = `lib/mcp-start.js.tmpl` — the single source of truth for the launcher. Stays as raw JS (not migrated to TS) because every user vault byte-pins its SHA-256.
- **GitHub Pages** = static site hosting integrated via `src/commands/visibility.ts` and `lib/deploy.yml.tmpl` for publishing `raw/` and `wiki/` content.
- **dispatch** = the flow `vaultkit <cmd>` → `bin/vaultkit.ts` (commander) → `src/commands/<cmd>.ts`. The published package ships compiled `dist/bin/vaultkit.js` → `dist/src/commands/<cmd>.js`.
- **command module** = a `src/commands/<name>.ts` file that exports `async function run(params, options?: <Name>Options): Promise<...>`. Per-command `<Name>Options` interfaces extend `RunOptions` from `src/types.ts`.
- **lib module** = a `src/lib/<name>.ts` file shared by command modules. Current libs: `registry`, `vault`, `platform`, `git`, `github`.
- **Vault class** = the rich object form of a registered vault, defined in `src/lib/vault.ts`. Wraps name + dir + expectedHash and exposes disk/path checks (`existsOnDisk`, `isVaultLike`, `hasGitRepo`, `hasLauncher`, `sha256OfLauncher`). Construct via `Vault.tryFromName(name, cfgPath?)` or `Vault.fromRecord(record)`.

Run `/common-ground` at the start of each session to surface assumptions about this domain.
