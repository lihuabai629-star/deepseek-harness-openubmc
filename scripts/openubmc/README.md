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
corepack pnpm dsh --profile openubmc "Inspect the openUBMC Agent tool schemas."
```

Configure the model through DSH's existing credential settings or environment before the last command. `--template web` selects the Web bundle; launch with `corepack pnpm dsh --profile openubmc --no-open --port 0` to allocate a separate loopback port. Launch only through `dsh`; the initializer does not start a server or model request.

The initializer refuses an existing home. It creates `profiles/openubmc/cordis.patch.yml`, a private Runtime state directory location, and a Skill root containing the manifest's full profile. Skill names follow the manifest mappings; support files are symlinked to the checkout. Skill bodies replace known home-relative script paths with checkout paths. Recreate a fresh home to pick up changes to those bodies or the manifest. The workflow and DSH checkouts must remain available; the profile links the native Case package from this DSH checkout.

## Offline startup check

With the generated home selected, use the scripted model to require discovery from both MCP servers and submit an empty `observe` query that Runtime must reject before device access:

```sh
corepack pnpm dsh --profile openubmc \
  --patch scripts/openubmc/offline.patch.yml "Validate Agent preflight."
```

A successful run prints `OPENUBMC_OFFLINE_OK` after receiving a structured Agent preflight error. This checks the source profile, MCP discovery and model-visible result projection without model credentials or device access; it does not test knowledge search or real-model decisions. Runtime and KB dependencies must already be installed in the workflow checkout.

The [openUBMC CI workflow](../../.github/workflows/openubmc.yml) runs on a GitHub-hosted Linux runner in this integration repository. It builds DSH, checks native MCP/Case/authority/recovery behavior against pinned Python Runtime source, replays recorded Session and SDK output, and verifies managed profiles and Web inspection. It uses no model, KB or device credentials and does not qualify live providers or firmware compatibility. Local Python SDK checks resolve the supported Node executable from `PATH`.

## Identity and recovery

The MCP bridge injects the calling Session ID as `params._meta.taskId`. Resuming the same Session reuses that ID across Host and MCP restarts; a fork has a different ID. Calls without an Agent fail before dispatch. Model arguments cannot replace request metadata. Runtime owns Run identities, workflow state and evidence. The MCP bridge retains complete structured results in text and durable metadata, including failures. The [observation plugin](../../packages/experimental/openubmc-cases/README.md) exposes read-only `/run` and historical `/case` queries; neither contacts a device or resumes execution.

The profile selects the native Agent interface and an independent `openubmc-agent-state` directory. It allows execute caller waits up to 120 seconds and observe waits up to 180 seconds, with a 190-second MCP budget. Runtime owns long-running continuations. Use the returned Run id and Gate bindings for subsequent execute actions; recover unknown effects through Runtime reconciliation. Cancellation does not establish rollback.

## Credentials and limitations

Runtime uses this home's `credentials.env` selector, initially absent, rather than the production credentials file. Configure it explicitly before device access. KB retains its existing login/configuration mechanism; creating the profile does not establish a KB login. The MCP client's environment scrubbing still applies.

The [Runtime adapter](../../packages/experimental/openubmc-runtime/README.md) binds Runtime-issued Runs to the starting Session before dispatch. Device and workflow execution require current-session human grants through `/target-authorize`; resume retains them and fork excludes inherited grants. This protects the DSH bridge, not direct access to Python Runtime. Existing production configuration and systemd services are outside this initializer.

In a headless profile, authorize execute in the same conversation with `corepack pnpm dsh --profile openubmc --session-id <id> "/target-authorize execute"`. In Web, enter the native command in that conversation's input; Web startup does not accept headless Session flags. Native commands run without model inference. Revoke with `/target-authorize revoke`.
## Managed profile lifecycle

The manager owns only `@local/dsh-openubmc`, its profile dependency and bundle-list entry, and its recorded links. User model settings, MCP configuration and `cordis.patch.yml` remain user-owned. All actions use the same profile writer lock as the DSH plugin manager; a live or unverified owner fails with its lock path; a verified exited PID is recovered using the native claim protocol. Use a separate home and stop its Host before lifecycle changes so each process observes one configuration generation.

```sh
python3 scripts/openubmc/manage.py install --home /tmp/dsh-openubmc-managed \
  --workflow /home/workspace/openubmc-agent-workflow \
  --node /opt/node-v24.19.0/bin/node
python3 scripts/openubmc/manage.py check --home /tmp/dsh-openubmc-managed
python3 scripts/openubmc/manage.py update --home /tmp/dsh-openubmc-managed
python3 scripts/openubmc/manage.py rollback --home /tmp/dsh-openubmc-managed
python3 scripts/openubmc/manage.py repair --home /tmp/dsh-openubmc-managed
python3 scripts/openubmc/manage.py uninstall --home /tmp/dsh-openubmc-managed
```

`--template web` adds native Run, receipt and historical Case cards. Each generation copies the full manifest Skill selection, scripts and references, dereferences support symlinks, and rewrites known Skill paths to owned copies. Update preserves the selected Node/Python paths and credential selector unless explicitly replaced. Missing owned entries are repairable; foreign dependency values, files or links fail before profile mutation. Each generation records its interpreter paths and credential selector. Rollback restores those selections. Activation journals ownership before publishing links and compensates a failed profile write; repair can reconstruct an entirely missing generation from the ownership record.

Repair also verifies the selected generation’s workflow manifest and Skill source digests before rebuilding missing content; if those sources changed, restore that checkout or explicitly update.

Rollback restores profile/Skill configuration, not executable software. Runtime, KB and DSH code stay in their checkouts; stored digests pin adapter and Runtime/KB launch files, native package sources/artifacts and dependency locks. `check`, repair and rollback reject changed pinned files. Use update to select changed executable code, or restore the intended checkout before rollback. The check does not qualify a model endpoint, KB login or device connection. Uninstall retains sessions, Runtime state, credentials, user configuration and generations.

The following records cover the legacy Runtime interface; they do not qualify the Agent interface. The [provider qualification record](qualification/2026-10-11.json) reports live model and KB retrieval, durable Runtime phase/artifact observations, and continuation after process restart with an offline device backend. The separate [real-target record](qualification/2026-10-11-real-target.json) covers diagnosis, MDB identity, a temporary file Apply, DSH restart, and checksum-guarded rollback on an A860 A5. Neither record establishes business acceptance or firmware-upgrade compatibility; both omit credentials and raw device logs.

## Service staging

A source CLI wrapper that preserves the caller’s working directory must set `TSX_TSCONFIG_PATH` to the snapshot’s `tsconfig.json` and load the snapshot’s `tsx/esm` hook. Workspace imports depend on those source mappings; an absolute CLI path alone does not select them.

Use a separate systemd unit, private home and loopback port for a source deployment. Keep authentication URLs and service logs private. Stop that unit before profile lifecycle changes. The install-time template selects its application carrier; update retains that carrier. Use another headless profile to inspect a private Case snapshot from the CLI rather than passing headless flags to the Web carrier.

A software rollback selects the previous executable and its compatible home. Builds without the required `openubmc/inspection` event refuse the new Session logs; retain the candidate home for recovery rather than opening it with the older build. A consistent state snapshot uses SQLite backup and excludes copied process locks. The [deployment record](qualification/2026-10-11-deployment.json) reports hosted CI, isolated service restart, native Case continuity, old-runtime startup and restoration of the source runtime. The production service is outside that rehearsal.

The [production deployment record](qualification/2026-10-11-production.json) covers an independently rebuilt software snapshot with verified files and resolver links, the installed loopback service, native Case refresh/reload, live model/KB calls and old-runtime rollback. Software rollback selects the retained older runtime and its separate home; it preserves the newer Session files for restoration. Existing credentials, the original Web profile and the other user MCP entries remain available.

The [component qualification record](qualification/2026-10-11-component.json) reports selected NC-SI unit tests and the local component integration entry using a repaired development dependency graph. The [business live-patch record](qualification/2026-10-11-business.json) covers checksum-matched collector, caller and I350 configuration, temporary collector replacement, four-channel query coverage, and restoration of the original file through the same DSH Session and Runtime Case. These records do not establish complete firmware/source equivalence or qualify a firmware upgrade.
