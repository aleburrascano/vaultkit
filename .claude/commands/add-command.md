---
name: add-command
description: Scaffold a new vaultkit command
---

Scaffold a new vaultkit command called "$ARGUMENTS".

1. Read `src/commands/status.js` as the reference (simplest command that uses registry + vault libs).
2. Create `src/commands/$ARGUMENTS.js`:
   - Import from `src/lib/` as needed (`validateName`, `getVaultDir`, `platform`, etc.)
   - Export `async function run(params, options = {})`.
   - Throw a descriptive `Error` on failure — do not `process.exit()` inside the module.
3. In `bin/vaultkit.js`, add a `.command(...)` block that:
   - Declares the command signature (e.g., `'$ARGUMENTS <name>'`)
   - Wraps the dynamic import in `wrap()`:
     ```js
     await wrap(async () => {
       const { run } = await import('../src/commands/$ARGUMENTS.js');
       await run(name);
     }, '$ARGUMENTS', [name]);
     ```
4. Confirm `src/` is already in the `files` array in `package.json` — no change needed.
5. Add a row to README.md command table.
6. Add an entry under `## [Unreleased]` in CHANGELOG.md.
7. Add a test file at `tests/commands/$ARGUMENTS.test.js` covering the happy path and key error cases.
8. Run `npm test` to confirm everything passes.
9. Show a summary of all changes made.
