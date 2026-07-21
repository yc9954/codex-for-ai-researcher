---
name: plan-resource-fit-dataset
description: Extract paper-referenced datasets, verify current Hugging Face Hub identity and size metadata, and choose a deterministic full, subset, streaming, or synthetic-proxy plan for the user's RAM, disk, runtime, and learning goal. Use before downloading data or authoring a reduced ML reproduction.
---

# Plan Resource Fit Dataset

Separate paper evidence, registry evidence, resource calculations, and recommendation. Never invent a dataset URL or treat a community mirror as the paper's original preprocessing.

## Procedure

1. Extract only dataset, corpus, split, preprocessing, task, and metric names supported by pinned PDF pages. Preserve page numbers and the paper PDF hash.
2. Search a live dataset registry with the canonical name and normalized aliases. Pin the selected repository revision.
3. Record access state, license tag, dataset-card URL, downloads, row count, original bytes, parquet bytes, and reported in-memory bytes. Mark missing fields `unknown`.
4. Compare reported bytes against current free RAM and disk. Keep a working budget rather than consuming all available resources.
5. Choose `full` only when reported source and memory sizes fit. Otherwise compute a deterministic row cap from bytes per row and recommend subset or streaming.
6. Preserve the paper's split and preprocessing when possible. If a mirror or subset changes either, record a semantic deviation.
7. Prefer a tiny licensed subset for metric and pipeline checks. Use synthetic data only to isolate a mechanism, never to claim paper-level quality.
8. Do not download gated data, accept a license, send credentials, or start paid compute without explicit user approval.

## Verification Rules

- Hub search proves that a repository exists, not that it matches the original data.
- A license tag of `unknown` blocks automatic download.
- Viewer size metadata may be absent or stale; return `inspect` instead of guessing.
- Keep selection seeds, row indices or shard ranges, split names, preprocessing versions, and registry revision in provenance.

## Completion Check

Return exact paper anchors, canonical-name match evidence, registry revision, license/access state, byte and row evidence, local budget snapshot, selected mode, deterministic subset contract, preprocessing deviations, and unresolved risks. Registry existence and name similarity do not prove that a candidate is identical to the paper dataset; keep that identity unverified until a stronger fingerprint or official mapping is available.
