---
name: openubmc-environment-setup
description: "Configure, check, update or remove the openUBMC DSH plugin on Linux/WSL. Use for interpreter paths, private target or knowledge credentials, MCP startup failures and plugin compatibility."
---

# openUBMC environment in DSH

Manage this integration through DSH's native plugin manager. The package contains the Runtime, KB and Skill resources. Keep credentials, Session files and Run history outside the installed package. Do not use the workflow install, repair, update or uninstall commands: those commands manage a separate Codex installation.

## Inspect and repair

Read the selected profile's `package.json` and `cordis.patch.yml` without displaying secret values. The selected bundle is `dsh-openubmc`, its configuration entry is `openubmc`, and its `release.json` records source versions. The package requires a compatible DSH Host with native MCP authority and openUBMC Session event support; the official `0.2.0-rc.2` Host does not provide those capabilities. An unsupported Host needs the compatible DSH build; a version exemption cannot add missing capabilities.

Check the configured Python and Node executable paths and the initial MCP error. Python must be 3.10 or later; use the supported standalone Node version. Linux/WSL is supported. Device transports need their own tools, such as OpenSSH and sshpass for password SSH. Configuration and dependency checks do not establish a device login.

The `python`, `node`, `credentialsFile`, `stateDir` and `kbEnabled` fields are overridden under `id: openubmc` in the profile patch. Read the current values before changing them. Defaults select `python3`, the standalone Host Node, `$DSH_HOME/credentials.env` and `$DSH_HOME/openubmc-agent-state`. Preserve existing model settings, unrelated MCP entries and any explicit Runtime state location.

## Private credentials

Reuse the configured private selector. Never print credential-file contents or place passwords in chat, shell arguments, profiles or logs. A missing account differs from rejected authentication, a network failure or a trust failure; inspect the actual error first.

For a new local account, the packaged `openubmc-environment-setup/scripts/install_environment.py` supports a credentials-only hidden TTY command. Run it from the Skill's resource directory as `python3 scripts/install_environment.py credentials`; it writes the per-user openUBMC private file. Set the DSH entry's `credentialsFile` to that file explicitly. The `credentials --kb` variant configures the user's knowledge account independently. These subcommands do not install Skills or register client MCP entries. Use a terminal in which the user can enter hidden input; do not request secrets in conversation.

Knowledge configuration defaults to `~/.config/openubmc/kb-mcp.json` or the corresponding `XDG_CONFIG_HOME` directory. A local configuration check does not verify KB login or retrieval. No shared account or OAuth secret is supplied by the plugin.

## Update and remove

Close the selected profile's Host before package changes. Use `dsh plugin --profile <profile> add <archive-or-package-spec>` to install or update, and `dsh plugin --profile <profile> remove dsh-openubmc` to remove. Use only the user-selected package source. A retained compatible archive restores plugin code; back up private data when changing Host versions. Uninstall retains credentials, Sessions and Runtime state. Never remove those directories as part of plugin repair.

For an offline check, use the package's `preflight` provider in a separate headless profile, as documented in its README. It submits an invalid observation without model or device credentials. A successful check does not authorize target execution. For target work, load the current stage owner's Skill, use observe/execute, and preserve the existing Run and authorization.
