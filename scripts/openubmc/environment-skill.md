---
name: openubmc-environment-setup
description: "Configure, check, update or remove the openUBMC DSH plugin on Linux/WSL. Use for interpreter paths, private target or knowledge credentials, MCP startup failures and plugin compatibility."
---

# openUBMC environment in DSH

Manage this integration through DSH's native plugin manager. The package contains the Runtime, KB and Skill resources. Keep credentials, Session files and Run history outside the installed package. Do not use the workflow install, repair, update or uninstall commands: those commands manage a separate Codex installation.

## Inspect and repair

Read the selected profile's `package.json` and `cordis.patch.yml` without displaying secret values. The selected bundle is `dsh-openubmc`, its configuration entry is `openubmc`, and its `release.json` records source versions. The package supports qualified official DSH releases `0.1.7-rc.2`, `0.2.0-rc.2` and `0.2.1-rc.2`. Use the exact complete version; other versions need qualification before use. Its own bridge and private Session authority preserve execution permissions without custom Host events.

Check the configured Python and Node executable paths and the initial MCP error. Python must be 3.10 or later; use the supported standalone Node version. Linux/WSL is supported. Device transports need their own tools, such as OpenSSH and sshpass for password SSH. Configuration and dependency checks do not establish a device login.

Run `/openubmc-doctor` in the existing conversation for package integrity, local dependency imports, transport availability and activated configuration metadata. Import readiness does not prove a connected MCP provider or remote login. `/openubmc-repair runtime`, `/openubmc-repair kb` or `/openubmc-repair all` repairs only owned dependencies and retries unavailable providers. Existing providers and Runs are retained. If Python itself cannot start, correct the configured interpreter through DSH's plugin settings and restart the profile. A modified package must be reinstalled from a verified archive; do not bypass its integrity check. Keep setup tools available when Runtime or KB is unavailable.

The `python`, `node`, `credentialsFile`, `stateDir` and `kbEnabled` fields are overridden under `id: openubmc` in the profile patch. Read the current values before changing them. Defaults select `python3`, the standalone Host Node, `$DSH_HOME/credentials.env` and `$DSH_HOME/openubmc-agent-state`. Preserve existing model settings, unrelated MCP entries and any explicit Runtime state location.

## Private credentials

Reuse the configured private selector. Never print credential-file contents or place passwords in chat, shell arguments, profiles or logs. A missing account differs from rejected authentication, a network failure or a trust failure; inspect the actual error first.

Open DSH Settings → Plugins → dsh-openubmc for device, knowledge and Conan accounts. These pages use the existing authenticated Web address. In a local Web conversation, run `/openubmc-configure targets`, `/openubmc-configure kb` or `/openubmc-configure conan`, and present the returned URL with its fragment intact. In headless mode, use the setup tools; older official headless runners do not dispatch slash commands. A loopback URL opens on the Host machine; remote users use the Web settings entry or a private tunnel. Do not expose an unauthenticated configuration port.

For a task waiting on configuration, use `openubmc_setup_open_configuration` with the required `kind`, optional `focusTarget` and `waitForSave: true`. Keep the owning Host running. The secret-free activation event continues the existing task at its next Runtime request without granting device permission. Closing or expiration is not success; do not reopen automatically. Saving activates a private revision without a device probe. A connection check, KB login or Conan login remains an explicit page action; do not reinterpret TLS or host-identity failures as a missing password. Follow [credential exposure response](references/credential-exposure-response.md) if a secret appeared in chat.

Knowledge configuration defaults to `~/.config/openubmc/kb-mcp.json` or the corresponding `XDG_CONFIG_HOME` directory. A local configuration check does not verify KB login or retrieval. No shared account or OAuth secret is supplied by the plugin.

## Workspace and delivery records

Before a new Run, the Host captures the trusted Session working directory. Runtime freezes the selected repository identity; model metadata cannot replace it. `/openubmc-records` reads the current Session handoff. `/openubmc-records export` writes a private, content-addressed, redacted document; `/openubmc-records verify <filename>` checks it. These operations dispatch no target requests. Session usage observations are partial, exclude inherited fork requests and do not establish complete provider usage or automatic Run attribution.

In headless mode or during a model turn, use `openubmc_records` with `command: handoff|export|verify|answer|test`. Its Session identity comes from the Host. `verify` takes `file`, `answer` takes `runId`, and `test` takes the same test request under `test`. Do not invent another task ID or edit the shared records directly.

For a test required by a returned Gate, use `/openubmc-records test <JSON>` with `runId`, `repoRef`, `commandRef`, `argv` and optional `timeout`. It runs the actual command only against the frozen clean repository and records its receipt; source drift or foreign Run ownership is rejected. A test record does not itself satisfy a Gate. Use `/openubmc-records answer <run-id>` for Runtime's prepared terminal answer. Only an exact committed final message confirms delivery; reading or preparing an answer does not.

## Update and remove

Close the selected profile's Host before package changes. Use `dsh plugin --profile <profile> add <archive-or-package-spec>` to install or update, and `dsh plugin --profile <profile> remove dsh-openubmc` to remove. Use only the user-selected package source. A retained compatible archive restores plugin code; back up private data when changing Host versions. Uninstall retains credentials, Sessions and Runtime state. Back up `stateDir/dsh-sessions` with Runtime state and Sessions; missing or corrupt authority fails closed after prior execution. Never remove those directories as part of plugin repair.

For an offline check, use the package's `preflight` provider in a separate headless profile, as documented in its README. It submits an invalid observation without model or device credentials. A successful check does not authorize target execution. For target work, load the current stage owner's Skill, use observe/execute, and preserve the existing Run and authorization.
