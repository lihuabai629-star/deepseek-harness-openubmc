---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-11-openubmc-inspection

English | [中文](2026-10-11-openubmc-inspection.zh.md)

## Summary

Adds the required openubmc/inspection Session event for native Case and evidence reads.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-11-openubmc-inspection
baseline: false
changes:
  - root: "event:openubmc/inspection"
    previous: null
    after: "b5c198b8330ec00a6febc83b94c3b93313125266da8d5a8596f008e25d33aa46"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing logs remain readable. Logs with this event require a build that recognizes it; older readers reject it as required-on-read. It adds a declared event without changing the Session envelope or format version.

<a id="verification"></a>
## Verification

Native Case inspection, cancellation and teardown tests pass. TypeScript and Python SDK notification snapshots retain the inspection metadata outside the model transcript.

<a id="dev-note"></a>
## Dev Note

None.
