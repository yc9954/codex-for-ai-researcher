---
name: package-research-provenance
description: Preserve notebook versions, agent suggestions, container runs, source anchors, and lineage in a Jupyter-compatible research artifact. Use when exporting, sharing, auditing, or resuming a paper-derived concept demo.
---

# Package Research Provenance

Produce an inspectable artifact whose claims can be traced to sources, code, environment, and run evidence.

## Procedure

1. Save the notebook as an immutable version before packaging. Hash normalized cell source and metadata.
2. Export standard `notebook.ipynb` with execution counts and outputs. Also export the native notebook JSON so comments and suggestions are not flattened away.
3. Copy the append-only provenance JSONL ledger, verified local run manifests and files, and matching consumed Modal plans, launch manifests, and verified remote files.
4. Remove `approvalTokenHash`, credentials, and other launch secrets from every exported Modal plan. Preserve the Modal app hash, GPU, timeout, cost bound, network policy, source hash, timestamps, status, logs, and output digests.
5. Write an artifact manifest containing source URLs and versions, notebook hash, stable code-cell source hash, local and Modal run IDs, image and app digests, run parents, data identifiers/hashes, licenses, deviations, and generated file hashes.
6. Include a concise README that labels the result as `concept demo`, `partial reproduction`, or `reproduction` according to evidence.
7. Verify that every successful assertion references an existing run and every run references the exact source hash plus its local image digest or Modal app hash.

Use [references/artifact-schema.md](references/artifact-schema.md) for required lineage.

## Event Rules

- Events are append-only and ordered by timestamp plus ID.
- Record actor as `user`, `agent`, or `runner`.
- An applied suggestion creates a new cell version and links to the suggestion; dismissal remains in history.
- An edit invalidates prior output for that cell until rerun.
- Never delete failed runs from lineage. Mark superseding runs with `parentRunId`.

## Completion Check

Open the exported `.ipynb`, parse every JSON file, recompute all bundled file hashes, confirm that no approval token material is present, and verify that the bundle can explain who changed what, why, from which source, in which local or Modal environment, and with what observed result.
