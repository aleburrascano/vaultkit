---
name: add-command
description: Use when the user wants to scaffold a new vaultkit command. Walks through strict RED-GREEN TDD discipline — failing test first, minimum implementation second, refactor third — then wires the command into the CLI and docs.
---

Scaffold a new vaultkit command called "$ARGUMENTS" using strict RED-GREEN TDD discipline. The test file is written **first** as a failing contract; the implementation only gets written to make that contract pass.

Read `src/commands/status.ts` as the reference (simplest command that uses registry + vault libs and demonstrates the `Vault.tryFromName` pattern). Read [.claude/rules/testing.md](../rules/testing.md) and [.claude/rules/code-style.md](../rules/code-style.md) before starting.

## Phase 1: Specify the contract

Before writing any code, ask the user (or infer from `$ARGUMENTS`):
- What does the command DO in one sentence?
- What positional argument(s) does it take?
- What `RunOptions`-extended option fields does it need (cfgPath, log, skipConfirm, etc.)?
- What does it return? Or is it side-effect-only (`Promise<void>`)?
- What error categories should it throw (`VaultkitError` codes from `src/lib/errors.ts`)?

Output the contract as a short checklist before moving on. This is your test target.

## Phase 2: RED — write the failing test

Create `tests/commands/$ARGUMENTS.test.ts`. Write tests that exercise the contract from Phase 1:
- The happy path (correct args → expected result/side effect).
- One key error per `VaultkitError` code the command throws.
- Use existing helpers from `tests/helpers/`:
  - `silent` / `arrayLogger` for logger
  - `writeCfg` for `~/.claude.json` test fixtures
  - `liveDescribe` if the command touches real GitHub (skips Windows in CI)
  - `makeLocalVault` if it needs a real vault layout but no GitHub remote
  - `mockGitConfig` for the simple-git-only execa surface

For commands that touch git/gh, also create `tests/commands/$ARGUMENTS-mocked.test.ts` with `vi.mock('execa')` for failure-mode coverage.

Run only your new test file: `npx vitest run tests/commands/$ARGUMENTS.test.ts`. **Confirm it FAILS** — typically with "Cannot find module" because the source doesn't exist yet. A test that has never failed has never proved anything.

## Phase 3: GREEN — write the minimum implementation

Create `src/commands/$ARGUMENTS.ts`:
- Import from `src/lib/` as needed (`Vault` from `vault.js`, `findTool` from `platform.js`, etc.). Import specifiers use `.js` extension even for TS source — NodeNext resolution rule.
- Define `<Name>Options extends RunOptions` (from `../types.js`) for any command-specific options.
- Export `async function run(params, options?: <Name>Options = {}): Promise<...>`.
- Throw `VaultkitError` (from `../lib/errors.js`) for known categories; `wrap()` in `bin/vaultkit.ts` maps each code to a distinct exit code.
- End the file with the type-sentinel: `const _module: CommandModule<...> = { run }; void _module;`

Run the test again. Iterate on the implementation until GREEN. **Do not write more implementation than the test requires.** New requirements get new tests.

## Phase 4: REFACTOR

Now that the test is green, look at the implementation for code-style cleanups: extract helpers if a block is reused, simplify naming, remove dead branches. Keep running the test to make sure nothing breaks. Stop when nothing more obvious remains — don't over-engineer.

## Phase 5: Wire & document

1. In `bin/vaultkit.ts`, add a `.command(...)` block:
   ```ts
   await wrap(async () => {
     const { run } = await import('../src/commands/$ARGUMENTS.js');
     await run(name);
   }, '$ARGUMENTS', [name]);
   ```
2. Add a row to the README.md command table.
3. Add an entry under `## [Unreleased]` in CHANGELOG.md.
4. Update the command-map table in [.claude/rules/architecture.md](../rules/architecture.md) per [.claude/rules/doc-sync.md](../rules/doc-sync.md).
5. Run the full suite: `npm run check && npm run build && npm test`. All three must pass before declaring done.

`package.json#files` is `["dist/"]` and `bin` points at `"dist/bin/vaultkit.js"` — no manifest change needed for new commands. The build compiles the new `.ts` automatically.

Show a summary of all changes when done.

## Anti-patterns this command refuses

- **Implement first, then test** — the implementation will pass tests written for it; the test never proved anything. Always RED first.
- **Vacuous tests** — the failing test must assert specific behavior (return value, log line, thrown code), not just "calling the function doesn't throw."
- **Over-implementing in GREEN** — write the minimum to make the test pass. New requirements call for new tests, not bigger implementations.
- **Skipping REFACTOR** — leaving the rough first-pass GREEN code in place compounds technical debt.
- **Mocking the function under test** — you're testing the mock, not the function.
