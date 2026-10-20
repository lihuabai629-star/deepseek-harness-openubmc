---
description: "Install packaged openUBMC workflows into a DSH profile."
kind: "tutorial"
---

# openUBMC plugin for DSH

English | [中文](README.zh.md)

Install `dsh-openubmc` into an existing Web or headless profile. The archive contains the native adapters, Python Runtime, knowledge MCP, and the full workflow Skill resources. Users do not need the workflow or DSH source checkouts. Node 24, Python 3.10 or later, pnpm, and Linux/WSL are required; target operations also need the transport tools selected by the workflow, such as OpenSSH and sshpass for password SSH.

## Install and start

Use the compatible openUBMC DSH build and a downloaded plugin archive. The official `0.2.0-rc.2` build lacks the required MCP authority and Session event support; the plugin reports an explicit startup error on that build. `release.json` records the source versions used to build the archive. Close the selected profile's Host before changing its packages.

```sh
dsh plugin --profile web add /absolute/path/dsh-openubmc-0.1.0.tgz
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
dsh plugin --profile headless add /absolute/path/dsh-openubmc-0.1.0.tgz
dsh --profile headless --patch /absolute/path/preflight.yml "Validate Agent preflight."
```

Success prints `OPENUBMC_OFFLINE_OK`. The check verifies tool discovery and structured failure retention without model or device credentials. It does not verify remote login or knowledge retrieval.

Install a newer archive with the same `add` command to update. Reinstall a retained compatible archive to restore its plugin code; keep a backup of the DSH home when changing software versions. Remove the bundle with `dsh plugin --profile web remove dsh-openubmc`. Removal retains sessions, target credentials and Runtime state. Required openUBMC Session events need a compatible Host reader even after removal.
