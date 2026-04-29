# VaultKit

CLI that connects Claude Code to Obsidian vaults via MCP. No build step required.

## Commands
test:       npm test
test:watch: npm run test:watch
check:      npm run check

## Architecture

**Runtime**: Node.js ≥22, ESM (`"type": "module"`)

**Dispatch flow**: `vaultkit <cmd>` → `bin/vaultkit.js` (commander) → `src/commands/<cmd>.js`

**State**: `~/.claude.json` — the `mcpServers` object is the vault registry. Commands read it via `src/lib/registry.js`.

**Launcher template**: `lib/mcp-start.js.tmpl` is the single source of truth for the per-vault `.mcp-start.js`. `init.js` and `update.js` `copyFileSync` it into vaults — never duplicate the template inline.

**Windows**: `src/lib/platform.js` provides `findTool`, `isWindows`, `vaultsRoot`, `claudeJsonPath`. Never assume `gh` or `claude` are on PATH — use `findTool`.

**Audit logging**: Set `VAULTKIT_LOG=<path>` to append TSV rows (timestamp, command, args, exit code, duration) to a file.

## Command → Module Map

| Command    | Module                     |
|-----------|----------------------------|
| init       | src/commands/init.js       |
| connect    | src/commands/connect.js    |
| disconnect | src/commands/disconnect.js |
| destroy    | src/commands/destroy.js    |
| pull       | src/commands/pull.js       |
| update     | src/commands/update.js     |
| doctor     | src/commands/doctor.js     |
| verify     | src/commands/verify.js     |
| status     | src/commands/status.js     |
| backup     | src/commands/backup.js     |
| visibility | src/commands/visibility.js |

To add a command: see `/add-command`.

## Shared Libraries — `src/lib/`

| File | Key Exports |
|---|---|
| `registry.js` | `getAllVaults`, `getVaultDir`, `getExpectedHash` — reads `~/.claude.json` |
| `vault.js` | `validateName`, `isVaultLike`, `sha256` + `render*` functions for vault file templates |
| `platform.js` | `isWindows`, `claudeJsonPath`, `vaultsRoot`, `findTool`, `npmGlobalBin` |
| `git.js` | `init`, `add`, `commit`, `push`, `pull`, `getStatus`, `pushOrPr`, `archiveZip`, `clone` |
| `github.js` | `createRepo`, `deleteRepo`, `repoExists`, `isAdmin`, `getVisibility`, `enablePages`, and more |

## Templates — `lib/`

| File | Purpose |
|---|---|
| `lib/mcp-start.js.tmpl` | Single source of truth for `.mcp-start.js`. SHA-256 self-verification on every Claude Code session. |
| `lib/deploy.yml.tmpl` | GitHub Actions workflow for Quartz/GitHub Pages deployment. |

Both are listed in `package.json#files` and ship with the npm package.

## Local Development

```bash
npm link          # one-time: point global vaultkit at this directory
vaultkit <command>
npm unlink -g @aleburrascano/vaultkit   # undo when done
```

## Adding a New Command (summary — use `/add-command` for guided scaffold)

1. Create `src/commands/<name>.js`. Export `async function run(params, options = {})`.
2. Add `.command('<name> ...')` to the `program` in `bin/vaultkit.js` with a dynamic `import('../src/commands/<name>.js')` inside `wrap()`.
3. Confirm `src/` is in the `files` array in `package.json` (it already is).
4. Add a row to README.md.
5. Add an entry under `## [Unreleased]` in CHANGELOG.md.

## Security Invariants — Never Break These

- **Vault names** must match `^[a-zA-Z0-9_-]+$`, max 64 chars. Use `validateName` from `src/lib/vault.js`.
- **Vault paths** for destructive ops must come from the MCP registry (`getVaultDir` from `src/lib/registry.js`), never raw user input or filesystem fallbacks. `connect`/`init` are the only commands allowed to create new entries.
- **MCP registration** must include `--expected-sha256=<hash>` so the launcher can self-verify on every Claude Code session.
- **`gh repo delete`** must be preceded by an explicit ownership check (`isAdmin` from `src/lib/github.js`) and a typed-name confirmation.
- **`isVaultLike`** from `src/lib/vault.js` must be checked before any directory deletion.
- **`delete_repo` scope** must be requested only when actually about to delete (skip for collaborators who can't delete anyway).

## Hard Invariants

- No build step — repo files are published files. `src/` ships verbatim.
- Windows compatibility is mandatory — use `platform.js` helpers; test Windows path branches.
- Never duplicate the `.mcp-start.js` template — `copyFileSync` from `lib/mcp-start.js.tmpl`.
- ESM only — `"type": "module"` in package.json; no `require()`.

## Standing Workflows
- Bug fix: write a failing test that reproduces the bug first. Show it fail. Fix it. Show it pass. Run full suite.
- Feature: run full test suite before and after.
- Refactor: confirm all tests pass before touching anything; confirm they still pass after.

## Known Hallucination Patterns
@.claude/rules/hallucination-patterns.md
