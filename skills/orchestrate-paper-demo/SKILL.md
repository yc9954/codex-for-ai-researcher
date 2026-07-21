---
name: orchestrate-paper-demo
description: Coordinate a paper and GitHub repository into a hardware-fit concept demo, calling extraction, compatibility, dataset, notebook, sandbox, and provenance skills. Use when a user wants to understand or partially reproduce ML research on local hardware or Modal.
---

# Orchestrate Paper Demo

Own the end-to-end research state. Never describe a reduced concept demo as a paper reproduction.

## Workflow

1. Record the paper URL/PDF, repository URL and commit, available hardware, budget, time limit, and learner goal.
2. Invoke `extract-paper-claims` and select one claim that can be made observable with an executable invariant. Build a necessity map for the structures involved: role, removal/change, predicted effect, and controlled observable.
3. Invoke `adapt-reproduction-environment` on commit-pinned manifest contents, imports, native extensions, device calls, checkpoints, and licenses. Separate install-only patches from semantic changes.
4. Invoke `plan-resource-fit-dataset`. Choose the smallest evidence-backed candidate and mode that preserves the selected mechanism, while retaining any unresolved identity or license gate. Prefer a local CPU smoke test; use host-native MPS only for trusted code.
5. Invoke `author-concept-notebook`, which invokes `explain-paper-mechanism` for each taught claim. Require a prerequisite diagnostic, stable subgoal map, worked example, prediction, runnable mechanism, recorded observation, self-explanation, one-variable contrast, faded completion, transfer task, and retrieval queue.
6. Invoke `run-isolated-snippets` for every code cell and stop at the first failed dependency.
7. Ask the learner to review semantic deviations. Apply approved agent suggestions as versioned patches, never silent mutations.
8. Invoke `launch-modal-reproduction` only for a documented local resource blocker and only after explicit cost approval. Never retry a paid run automatically.
9. Invoke `package-research-provenance` only after cells pass or failures are deliberately retained as evidence.

Use the handoff contracts in [references/handoff-contracts.md](references/handoff-contracts.md).

## State Model

Move through `intake -> source-mapped -> mechanism-demonstrated -> reported-result-redrawn | partial-result-rerun -> result-reproduced`. Packaging is orthogonal: any evidence level can be frozen, but a package never upgrades its evidence level. A state advances only when its evidence exists. Preserve failed runs, rejected suggestions, learner responses, and prior notebook versions.

## Required Report

Return:

- selected claim, why it is teachable on this hardware, and why each retained structure is necessary
- preserved invariants and explicit deviations
- dataset and runtime rationale
- tested cells with run IDs
- artifact path and provenance root hash
- unresolved gaps between the demo and the paper
- explanation validation results and the hashes of evidence ledgers used to produce learner-facing prose

## Guardrails

- Do not execute an untrusted repository on the host.
- Do not expose secrets to notebook code or agent context.
- Do not change metrics, rank, target modules, or baselines without recording a semantic deviation.
- Do not claim success from an import-only smoke test; require a mechanism-level assertion and at least one controlled structural contrast.
