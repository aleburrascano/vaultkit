---
paths:
  - "src/commands/*.js"
  - "src/lib/*.js"
  - "bin/vaultkit.js"
---

# Code Style

## JavaScript (all src/ and bin/)

- ESM only — `import`/`export`, no `require()`.
- Use `execa` (not `child_process`) for external process calls.
- Command modules export a single `async function run(params, options = {})`.
- Validate vault names via `validateName` from `src/lib/vault.js` before any operation.
- Resolve vault directories via `getVaultDir` from `src/lib/registry.js`, never from raw user input.
- Use `findTool` from `src/lib/platform.js` — never assume `gh` or `claude` are on PATH.
- Throw on errors (the `wrap()` in `bin/vaultkit.js` catches and exits non-zero).
- No silent catch-and-continue — if you catch, either re-throw or log + throw.

## Templates (lib/mcp-start.js.tmpl, lib/deploy.yml.tmpl)

- Templates are copied verbatim via `copyFileSync` — no preprocessing.
- Keep them small and focused (they live in vaults).
- `mcp-start.js.tmpl` must parse as valid JavaScript when executed.
- Never inline template content into command files — always `copyFileSync` from source.
