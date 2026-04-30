---
name: add-command
description: Scaffold a new vaultkit command
---

Scaffold a new vaultkit command called "$ARGUMENTS".

1. Read `src/commands/status.ts` as the reference (simplest command that uses registry + vault libs and demonstrates the `Vault.tryFromName` pattern).
2. Create `src/commands/$ARGUMENTS.ts`:
   - Import from `src/lib/` as needed (`Vault` from `vault.js`, `findTool` from `platform.js`, etc.). Note: import specifiers use `.js` extension even for TS source — NodeNext resolution rule.
   - Define `<Name>Options extends RunOptions` (from `../types.js`) for any command-specific options.
   - Export `async function run(params, options?: <Name>Options = {}): Promise<...>`.
   - Throw a descriptive `Error` on failure — do not `process.exit()` inside the module.
3. In `bin/vaultkit.ts`, add a `.command(...)` block that:
   - Declares the command signature (e.g., `'$ARGUMENTS <name>'`)
   - Wraps the dynamic import in `wrap()`:
     ```ts
     await wrap(async () => {
       const { run } = await import('../src/commands/$ARGUMENTS.js');
       await run(name);
     }, '$ARGUMENTS', [name]);
     ```
4. `package.json#files` is `["dist/"]` and `bin` points at `"dist/bin/vaultkit.js"` — no change needed for new commands. The build (`npm run build`) compiles the new `.ts` automatically.
5. Add a row to README.md command table.
6. Add an entry under `## [Unreleased]` in CHANGELOG.md.
7. Add a test file at `tests/commands/$ARGUMENTS.test.ts` covering the happy path and key error cases.
8. Run `npm run check` (type-check) and `npm test` (suite) — both must pass.
9. Show a summary of all changes made.
