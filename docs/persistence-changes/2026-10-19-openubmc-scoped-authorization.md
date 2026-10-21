---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-19-openubmc-scoped-authorization

English | [中文](2026-10-19-openubmc-scoped-authorization.zh.md)

## Summary

Records human authorization for one exact openUBMC start and its returned Run.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-19-openubmc-scoped-authorization
baseline: false
changes:
  - root: "event:openubmc/authorization"
    previous: null
    after: "55ed7784f0210713e093a3f5d4baacb60b8a48cf5c7fbdb92604e6c587a481cf"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Adds a required log-only event without changing existing payloads or the writer format. Builds that do not recognize openubmc/authorization refuse affected Sessions. The authority projection rebuilds grants only from matching current-Session pending starts; fork inheritance does not confer execution rights. Projection caches are rebuildable.

<a id="verification"></a>
## Verification

Focused ownership, recovery, scopes and guidance tests pass, including restart with a changed caller wait limit. The real Loader composition reaches the native authorization and persists the decision using the pinned Python Runtime.

<a id="dev-note"></a>
## Dev Note

None.
