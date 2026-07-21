# Handoff Contracts

Each stage emits a JSON-serializable record with `schema_version`, `created_at`, `actor`, and `parent_id`.

## Study brief

Required: `paper`, `repository`, `commit`, `hardware`, `budget`, `time_limit`, `learner_goal`.

## Claim selection

Required: `claim_id`, `claim`, `paper_evidence`, `repository_evidence`, `mechanism`, `invariants`, `uncertainties`.

## Adaptation plan

Required: `environment_lock`, `dataset`, `runtime`, `patches`, `semantic_deviations`, `approval_required`.

## Notebook handoff

Required: `notebook_id`, ordered `cells`, `claim_ids`, `explanation_units`, `explanation_validation`, `expected_assertions`, `image_digest`.

## Verification handoff

Required: `run_ids`, `parent_run_ids`, `cell_hashes`, `statuses`, `outputs`, `artifacts`, `policy`.

Reject a handoff that lacks source anchors, hashes, or an explicit uncertainty/deviation list.
