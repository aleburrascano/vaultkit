# FAQ

For the project overview, install instructions, and command reference, see the [README](../README.md).

## Can I use this without GitHub?

No. Every vault is a GitHub repo — there's no GitLab, self-hosted-git, or local-only mode. If GitHub isn't an option for you, vaultkit isn't the right tool.

## Does it cost money?

No for vaultkit itself. The auth-gated Pages mode (`vaultkit init` → `(a)`) requires GitHub Pro+ for the underlying Pages-private feature; everything else works on a free GitHub account.

## Does my data go anywhere I haven't approved?

vaultkit itself only makes the network calls you'd expect: `git fetch` / `git push` against GitHub, `gh` API calls during `init` / `destroy` / `visibility`. No telemetry. The MCP server runs locally and reads from your local clone — Claude Code's own data-handling rules apply to whatever Claude actually retrieves and includes in a response, see your Claude Code settings.

The one network call that doesn't fit that pattern is the once-per-24h npm-registry poll for newer vaultkit versions; suppress it with `VAULTKIT_NO_UPDATE_CHECK=1` if it's unwelcome.

## Can I use vaults with MCP clients other than Claude Code?

In principle yes — the per-vault `.mcp-start.js` is a generic MCP server launcher and will work with any client that can spawn an MCP server. vaultkit's automation only registers with Claude Code (it writes to `~/.claude.json`); for another client you'd point its MCP config at the launcher path manually. Get the path from `vaultkit status <name>`. There's no built-in helper for this — file an issue if you need one for a specific client.

## What's the difference between `disconnect` and `destroy`?

`disconnect` removes the local clone and the MCP registration; the GitHub repo and its commit history remain, and you can `connect` to it later. `destroy` does everything `disconnect` does *and* deletes the GitHub repo via `gh repo delete`. It only deletes the repo if you own it; collaborators get a `disconnect`-equivalent.

## Can I have many vaults connected at once?

Yes. Each vault registers under its own MCP namespace (`mcp__<name>__search_notes`, `mcp__<name>__get_note`, …), so connect as many as you want — Claude can query all of them simultaneously when answering a question.

## What's `_vault.json`?

A small Quartz config file in the vault root (`{ pageTitle, baseUrl }`). Quartz reads it when building the static site. vaultkit generates and updates it; you generally don't need to edit it by hand.

## Where do my vaults live on disk?

Default: `~/vaults/<name>` (`%USERPROFILE%\vaults\<name>` on Windows). Override with `VAULTKIT_HOME=<path>` in your shell profile.
