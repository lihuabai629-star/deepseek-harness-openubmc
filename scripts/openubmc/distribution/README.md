---
description: "Install packaged openUBMC workflows into a DSH profile."
kind: "tutorial"
---

# openUBMC plugin for DSH

English | [中文](README.zh.md)

Install `dsh-openubmc` into an existing Web or headless profile. The archive contains the native adapters, Python Runtime, knowledge MCP, and the full workflow Skill resources. Users do not need the workflow or DSH source checkouts. Node 24, Python 3.10 or later, pnpm, and Linux/WSL are required; target operations also need the transport tools selected by the workflow, such as OpenSSH and sshpass for password SSH.

## Install and start

Use an official DSH `0.1.7-rc.2`, `0.2.0-rc.2` or `0.2.1-rc.2` installation and the downloaded plugin archive. These exact releases are qualified; other versions fail at startup until qualified. A custom Host is unnecessary. `release.json` records the source versions used to build the archive. Close the selected profile's Host before changing its packages.

```sh
dsh plugin --profile web add /absolute/path/dsh-openubmc-0.3.1.tgz
dsh --profile web --no-open --host 127.0.0.1 --port 3080
```

Open the authenticated URL printed by DSH. Configure your own model through DSH's existing settings. Target credentials and Runtime history live under the selected `DSH_HOME`, outside the plugin; knowledge credentials use the existing per-user openUBMC configuration. The archive carries no account, model key or device authorization. Loading a profile does not send a device operation. The Web Plugins page can install the same archive through its package specification field.

## Local configuration

The bundle adds a single `openubmc` entry. Override its interpreter paths or private data locations in the profile's `cordis.patch.yml`:

```yaml
- id: openubmc
  config:
    python: /absolute/path/venv/bin/python3
    node: /absolute/path/node
    credentialsFile: /private/path/credentials.env
    stateDir: /private/path/openubmc-agent-state
    kbEnabled: true
```

Without overrides, Python resolves as `python3`, Node uses the Host's standalone executable, and credentials and Runtime state use `credentials.env` and `openubmc-agent-state` under the selected DSH home. Packaged Electron or single-executable hosts require an explicit standalone Node path. Native `/run`, `/case`, execution authorization and recovery commands remain available in conversations. The bundle uses the native conversation view; its environment Skill manages DSH packages and private configuration.

Open Settings → Plugins → dsh-openubmc to configure device, knowledge or Conan accounts through the current authenticated Web address. For a local or headless Host, `/openubmc-configure [targets|kb|conan]` opens a private loopback page on that Host. Saving activates a private revision without connecting to a device; connection and login checks are explicit page actions. `/openubmc-doctor` checks package integrity, local imports and configuration metadata. `/openubmc-repair [runtime|kb|all]` repairs owned dependencies and retries unavailable providers. Setup remains available when a provider fails; a missing Python executable requires correcting the plugin configuration. Repair retains Runs and user settings.

The Developer Skill includes pinned community source checks and interface documentation coverage resources from openUBMC plugin 2.1.9, with their source identity in `release.json`. They provide local advisory checks; Runtime Gates still require actual evidence.

## Workspace and records

The Host selects the Session working directory before a Run starts; Runtime freezes its repository identity. `/openubmc-records` reads the Session handoff, `export` writes a private redacted document and `verify <filename>` checks its digest. `test <JSON>` runs a command against the frozen clean repository and records a test receipt; source drift and another Session's Run are rejected. Its fields are `runId`, `repoRef`, `commandRef`, `argv` and optional `timeout` in seconds. `answer <run-id>` reads Runtime's prepared final answer; only matching committed final text confirms delivery. Session usage is partial and does not establish a complete provider inventory or automatic Run attribution.

Older official headless runners do not dispatch slash commands. Ask the agent to use `openubmc_setup_status`, `openubmc_setup_prepare`, `openubmc_setup_open_configuration` and the Session-bound `openubmc_records` tool instead. The Web conversation supports the native commands above.

## Session authority and recovery

The plugin owns the observe/execute bridge and injects the trusted Session and operation identities. Full structured results survive both success and failure in native tool logs. Runtime remains the authority for Runs, Gates, Incidents and device effects.

Execution permissions, Run associations and unsettled calls live in `stateDir/dsh-sessions`, outside the installed package. Back up this directory together with the Runtime state and DSH Sessions. Records are validated, written with owner-only permissions and synced before dispatch; cross-process locks prevent overlapping execution in one Session. Missing or corrupt authority after a recorded execution fails closed. Keep writers on one host and filesystem; shared data across PID namespaces or network hosts is unsupported.

Resume keeps the same Session association. Fork starts with separate authority and cannot continue the parent's Runs. Native `/target-authorize` grants and revokes execution scope; exact Run approval uses the native question service. A timeout, cancellation or disconnect leaves execution uncertain until the same Run is reconciled. An unacknowledged start uses `/target-reconcile <original-call-id>` followed by exact replay with the original operation identity. Reconnection never retries an effect automatically.

The earlier `0.1.0` plugin uses required custom Session events. Keep those Sessions with their compatible Host and home; start a fresh Session for this plugin. Reinstalling the older archive restores its code but does not convert newer authority or Session data.

## Check, update and remove

Install into a separate headless profile for the keyless preflight. Create `preflight.yml` with the following contents; the scripted provider sends only an invalid observation and contacts no target:

```yaml
- id: llm-deepseek
  disabled: true
- insert:
    - id: openubmc-offline-model
      name: dsh-openubmc/preflight
```

```sh
dsh plugin --profile headless add /absolute/path/dsh-openubmc-0.3.1.tgz
dsh --profile headless --patch /absolute/path/preflight.yml "Validate Agent preflight."
```

Success prints `OPENUBMC_OFFLINE_OK`. The check verifies tool discovery and structured failure retention without model or device credentials. It does not verify remote login or knowledge retrieval.

Install a newer archive with the same `add` command to update. Reinstall a retained compatible archive to restore its plugin code; keep a backup of the DSH home when changing software versions. Remove the bundle with `dsh plugin --profile web remove dsh-openubmc`. Removal retains sessions, target credentials and Runtime state. New plugin Sessions use standard Host events and remain readable after removal. Host Session-format downgrade rules still apply.
