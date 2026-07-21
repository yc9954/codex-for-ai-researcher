# Run Manifest

Required fields:

```json
{
  "schemaVersion": "1.0",
  "runId": "run-...",
  "parentRunId": null,
  "notebookId": "...",
  "targetCellId": "...",
  "status": "passed",
  "image": "repository/name:tag",
  "imageDigest": "sha256:...",
  "notebookHash": "...",
  "codeHash": "...",
  "startedAt": "...",
  "endedAt": "...",
  "policy": {"network": "none", "cpus": 2, "memory": "2g", "pids": 64, "timeoutSeconds": 20},
  "cells": [],
  "artifacts": []
}
```

Keep stdout/stderr bounded but never replace the manifest. Hash every exported artifact larger than a trivial display-only file.
