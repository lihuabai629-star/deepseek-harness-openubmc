---
description: "Create an isolated openUBMC development profile from a local workflow checkout."
kind: "tutorial"
---

# openUBMC development profile

English | [中文](README.zh.md)

This profile connects DSH to the Python Target Runtime and Node knowledge MCP in an existing `openubmc-agent-workflow` checkout. It requires Linux/WSL, Python 3, the workflow's Python dependencies, the KB's installed Node dependencies, and the DSH repository's supported Node and pnpm versions.

## Create and launch

Run from the DSH repository with a new home path:

```sh
python3 scripts/openubmc/init.py \
  --workflow /home/workspace/openubmc-agent-workflow \
  --home /tmp/dsh-openubmc-dev \
  --node /opt/node-v24.19.0/bin/node
export PATH=/opt/node-v24.19.0/bin:$PATH
export DSH_HOME=/tmp/dsh-openubmc-dev
corepack pnpm dsh --profile openubmc --dump-config
corepack pnpm dsh --profile openubmc "Read the openUBMC runtime status."
```

Configure the model through DSH's existing credential settings or environment before the last command. `--template web` selects the Web bundle; configure its listen port in the generated profile before launch when another Web host is running. Launch only through `dsh`; the initializer does not start a server or model request.

The initializer refuses an existing home. It creates `profiles/openubmc/cordis.patch.yml`, a private Runtime state directory location, and a Skill root containing the manifest's full profile. Skill names follow the manifest mappings; support files are symlinked to the checkout. Skill bodies replace known home-relative script paths with checkout paths. Recreate a fresh home to pick up changes to those bodies or the manifest. The workflow and DSH checkouts must remain available; the profile links the native Case package from this DSH checkout.

## Offline startup check

With the generated home selected, use the scripted model to require discovery from both MCP servers and call only `runtime_status`:

```sh
corepack pnpm dsh --profile openubmc \
  --patch scripts/openubmc/offline.patch.yml "Read runtime status."
```

A successful run prints `OPENUBMC_OFFLINE_OK` after receiving the structured completed status. This checks the source profile, MCP discovery and model-visible result projection without model credentials or device access; it does not test knowledge search or real-model decisions. Runtime and KB dependencies must already be installed in the workflow checkout.

## Identity and recovery

The MCP bridge injects the calling Session ID as `params._meta.taskId`. Resuming the same Session reuses that ID across Host and MCP restarts; a fork has a different ID. Calls without an Agent fail before dispatch. Model arguments cannot replace request metadata. Runtime owns task-to-Case associations, evidence and workflow state; DSH retains returned structured data both as text beside the summary and as durable metadata, including failures. The [Case plugin](../../packages/experimental/openubmc-cases/README.md) derives observations from that metadata. Use `/case` in a native command interface to view them; this query does not call Runtime or grant execution authority.

The profile gives Runtime calls 660 seconds, allowing the usual 600-second diagnostic deadline to finish. Adjust `toolCallTimeoutMs` for another domain deadline. Cancellation and timeout do not establish whether a device action stopped or rolled back. Read the Case and mutation records before retrying an uncertain action.

## Credentials and limitations

Runtime uses this home's `credentials.env` selector, initially absent, rather than the production credentials file. Configure it explicitly before device access. KB retains its existing login/configuration mechanism; creating the profile does not establish a KB login. The MCP client's environment scrubbing still applies.

The [Runtime adapter](../../packages/experimental/openubmc-runtime/README.md) enforces Session-derived Case ownership before dispatch. Device and workflow execution require current-session human grants through `/target-authorize`; resume retains them and fork excludes inherited grants. This protects the DSH bridge, not direct access to Python Runtime. Existing production configuration and systemd services are outside this initializer.

Authorize a specific operation in the same conversation with `corepack pnpm dsh --profile openubmc --session-id <id> "/target-authorize debug_run"`. This native command runs without model inference. Revoke with `/target-authorize revoke`.
