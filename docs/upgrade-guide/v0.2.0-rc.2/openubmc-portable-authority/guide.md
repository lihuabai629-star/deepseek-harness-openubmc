---
kind: upgrade-guide
description: Installable openUBMC bundles keep Session authority outside the package and use official Host APIs.
---
# Portable openUBMC authority

English | [中文](guide.zh.md)

## Change

The `dsh-openubmc` bundle uses its own MCP provider and private Session association records on qualified official Hosts. Earlier `0.1.0` bundles require custom Host events. The two authority stores are not interchangeable; removing a plugin does not convert its Sessions.

## Migration

1. Retain the earlier compatible Host and home for existing custom-event Sessions. Back up their Runtime state and credentials. Start a fresh Session for the portable bundle.
2. Select an official Host version listed in the [installation instructions](../../../../scripts/openubmc/distribution/README.md), stop the selected profile, and install the new archive with `dsh plugin --profile web add /absolute/path/dsh-openubmc-0.2.0.tgz`. Preserve existing model settings and unrelated MCP entries.
3. Keep `stateDir/dsh-sessions` with the Runtime state and DSH Sessions in every backup. Missing or corrupt authority after execution blocks further dispatch; restore the matching record rather than removing it or inventing a Run binding. Forks need independent Runs and permissions.
4. Run the documented keyless preflight in an isolated profile. Verify `OPENUBMC_OFFLINE_OK`, then use normal scoped authorization in the new Session. An uncertain call still requires reconciliation with its original identity before another effect.
