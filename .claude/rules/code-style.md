---
paths:
  - "src/commands/*.ts"
  - "src/lib/*.ts"
  - "bin/vaultkit.ts"
---

# Code Style

## TypeScript (all bin/, src/, tests/)

- ESM only — `import`/`export`, no `require()`.
- Imports use `.js` extensions even when the target is `.ts` (NodeNext resolution requirement). `tsc` rewrites at compile time.
- Use `execa` (not `child_process`) for external process calls.
- Command modules export a single `async function run(params, options?: <Name>Options): Promise<...>`. Per-command options interfaces extend `RunOptions` from `src/types.ts`.
- Validate vault names via `validateName` from `src/lib/vault.ts` before any operation. Or use `Vault.tryFromName(name, cfgPath)` which validates internally.
- Resolve vault directories via `Vault.tryFromName` or `getVaultDir` from `src/lib/registry.ts` — never from raw user input.
- Use `findTool` from `src/lib/platform.ts` — never assume `gh` or `claude` are on PATH.
- Throw on errors (the `wrap()` in `bin/vaultkit.ts` catches and exits non-zero).
- No silent catch-and-continue — if you catch, either re-throw or log + throw.

## Type discipline

- Strict mode is on (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).
- Prefer `interface` for object shapes, `type` for unions and aliases.
- Cast `JSON.parse(...)` output to a typed shape (e.g., `as ClaudeConfig`) at the boundary, then narrow as needed. Never leave `any` floating.
- For execa results: `String(result.stdout ?? '').trim()` is the standard pattern (execa types `stdout` as the wide `string | string[] | unknown[] | Uint8Array` because `Options` could enable line/buffer modes — narrowing once at the access site keeps the rest of the code clean).
- For RegExp matches and array indexing under `noUncheckedIndexedAccess`: use `?.[0] ?? defaultValue` or default destructure `[a = '', b = '']`.
- Catch blocks: `err` is `unknown`; narrow via `as { message?: string }` (or similar) at the access site, not via type assertion at the catch.
- Avoid `any`. If absolutely necessary, leave a comment explaining why.

## Templates (lib/mcp-start.js.tmpl, lib/deploy.yml.tmpl)

- The launcher template stays as raw JavaScript — every existing user vault SHA-256-verifies its bytes. **Never edit `lib/mcp-start.js.tmpl` casually.**
- Templates are copied verbatim via `copyFileSync` — no preprocessing.
- `mcp-start.js.tmpl` must parse as valid JavaScript when executed.
- Never inline template content into command files — always `copyFileSync` from the source path. After build, the post-build script copies them into `dist/lib/` so the same relative path works in both raw and compiled execution contexts.
