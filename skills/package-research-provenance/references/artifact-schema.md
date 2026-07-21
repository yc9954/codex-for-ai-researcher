# Artifact Bundle

Required files:

- `notebook.ipynb`: portable Jupyter representation
- `notebook.json`: native cells, threads, suggestions, and local provenance
- `provenance.jsonl`: append-only event ledger
- `artifact-manifest.json`: lineage root
- `README.md`: scope, sources, environment, and limitations

Run material:

- Local: `runs/<run-id>.json` plus `runs/<run-id>/files/**`
- Modal: `runs/modal/<plan-id>/plan.json`, `launch.json`, and `files/**`

Modal plans must be consumed and match the notebook's stable code-cell source hash. Exported plans must omit `approvalTokenHash` and all credential material. Every retained output must pass path, size, and SHA-256 verification before packaging.

The artifact manifest must include `artifactId`, `createdAt`, `notebookId`, `notebookHash`, `notebookVersion`, `runIds`, `localRunIds`, `remoteRunIds`, `bundledRuns`, `imageDigests`, `remoteAppHashes`, `sources`, `deviations`, and a `files` map of relative path to SHA-256. Dataset identifiers, licenses, and hashes are required when a run consumes external data.

Classify scope conservatively:

- **Concept demo:** mechanism isolated on changed data, scale, or task.
- **Partial reproduction:** at least one paper experiment and metric reproduced with declared deviations.
- **Reproduction:** claimed experimental conditions and evaluation substantially match the paper.
