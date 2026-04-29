# Testing Rules

Test runner: `npm test` (runs vitest in single-pass mode)
Watch mode: `npm run test:watch`

Test files live in `tests/` and mirror the source tree:
- `tests/lib/` — unit tests for `src/lib/*.js` modules
- `tests/commands/` — integration tests for `src/commands/*.js`

## Testing discipline

- After any file edit: run `npm test` before committing.
- Syntax errors in `bin/vaultkit.js` are caught by `npm run check` (`node --check`).
- Template files (`.tmpl`) must parse as valid JavaScript — verified by the check script.
- Use vitest's built-in mocking (`vi.mock`, `vi.spyOn`) for external dependencies (git, gh, fs).

## Sacred tests rule

Test files are read-only unless explicitly instructed. If a test is failing, fix the implementation, not the test. "The test was wrong" requires explicit human confirmation.
