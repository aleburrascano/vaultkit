# Troubleshooting

For the project overview, install instructions, and command reference, see the [README](../README.md). Run `vaultkit doctor` first — it catches most of the common conditions on this page automatically.

## `vaultkit init` fails with "gh: command not found" on Windows

Open a new Git Bash window after installing the GitHub CLI. Windows installers update PATH in the registry, but processes that started before the install (including your shell) won't see the change. Closing and reopening the terminal picks up the new PATH.

## "Launcher SHA-256 mismatch — refusing to start" when Claude Code launches

Either `.mcp-start.js` was modified locally or the vault was re-cloned without re-registering. Run:

```bash
vaultkit doctor                  # see which vault has drifted
vaultkit update <vault-name>     # re-pin the current SHA-256
```

If you didn't make the change yourself and don't recognize the diff, treat it as suspicious — `cd` into the vault and `git log -p -- .mcp-start.js` to inspect.

## "Vault has a new `.mcp-start.js` upstream — refusing to auto-update"

The vault owner pushed a new launcher. Inspect the change before re-trusting:

```bash
cd ~/vaults/<vault-name>
git diff HEAD..@{u} -- .mcp-start.js
```

If it looks legitimate (e.g., they ran `vaultkit update` against a new vaultkit version), run `vaultkit update <vault-name>` locally to re-pin.

## `vaultkit destroy` says "you don't own this repo"

You're a collaborator, not the owner. Only the GitHub repo's owner can delete it. The local clone and MCP registration are still removed — effectively a `disconnect`. To remove yourself from the repo's collaborators, do that manually on GitHub.

## `vaultkit destroy` opens a browser tab the first time you run it

vaultkit doesn't request the `delete_repo` GitHub scope at setup time — that's a deliberate choice so you're never asked up front to authorize a destructive permission you may never use. The trade-off is that your first `destroy` runs `gh auth refresh -s delete_repo` interactively, which opens a device-code browser flow. To pre-grant the scope (useful in CI or before scripted runs):

```bash
gh auth refresh -h github.com -s delete_repo
```

Subsequent `destroy` runs reuse the token and don't prompt. If you're authenticated via `GH_TOKEN` (a PAT, e.g. in CI), vaultkit skips the refresh — make sure the PAT was created with `delete_repo` already in its scopes.

## `vaultkit update` fails to push to `main`

Branch protection on `main` is rejecting the direct push. vaultkit automatically falls back to creating a feature branch and opening a pull request. Merge the PR (or have a maintainer merge it) and the launcher update will take effect.

## "Could not auto-enable GitHub Pages" during `init`

The Pages API call failed (often due to a brand-new repo where Pages isn't immediately ready). Enable manually at the URL printed in the warning, set Source to "GitHub Actions", and re-push to trigger the deploy workflow.
