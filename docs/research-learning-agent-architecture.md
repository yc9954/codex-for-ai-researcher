# Research: learning-oriented paper agents and artifacts

## Evidence reviewed

- Chi et al. found that learners who generated self-explanations connected worked-example steps to principles and formed more example-independent knowledge. This supports an explicit `why this step` prompt instead of passive prose. Source: https://doi.org/10.1016/0364-0213(89)90002-5
- Worked-example research supports full examples for novices, self-explanation prompts, and guidance fading toward completion and independent problems as expertise grows. Source: https://link.springer.com/article/10.1007/s10648-019-09465-5
- Subgoal labels in programming instruction help learners articulate and apply the structural procedure instead of overfitting to surface syntax. Source: https://doi.org/10.1016/j.learninstruc.2015.12.002
- Retrieval practice improves delayed retention for learned material, but complex procedure learning still needs worked examples and feedback rather than recall alone. Source: https://pubmed.ncbi.nlm.nih.gov/16507066/
- The AAAI reproducibility checklist requires conceptual descriptions, fact/speculation separation, preprocessing code, seeds, infrastructure, metrics, run counts, variation, and hyperparameters. Source: https://aaai.org/conference/aaai/aaai-25/aaai-25-reproducibility-checklist/
- The NeurIPS reproducibility program treats code, checklist evidence, and independent reproduction as separate supports for reliable findings. Source: https://www.jmlr.org/papers/v22/20-303.html
- Deterministic method execution does not by itself establish that an empirical finding survives essential variation. Source: https://proceedings.mlr.press/v97/bouthillier19a.html
- W3C PROV separates entities, activities, and agents and records generation, usage, and derivation rather than presenting an unstructured event dump. Source: https://www.w3.org/TR/prov-o/
- Workflow Run RO-Crate links a workflow execution to inputs, outputs, tools, and step-level provenance; it distinguishes a planned workflow from what actually ran. Source: https://www.researchobject.org/workflow-run-crate/profiles/0.5/provenance_run_crate/
- MLflow makes a run the organizing unit for parameters, metrics, code versions, and output artifacts, and presents comparison/search rather than a raw filesystem tree. Source: https://mlflow.org/docs/latest/ml/tracking/
- Jupyter stores display and execution results as typed cell outputs with execution counts. Source: https://nbformat.readthedocs.io/en/5.2.0/format_description.html

## Product decisions

### Learning unit

Each selected paper claim becomes one learning unit with this progression:

1. Diagnose prerequisites and define the baseline.
2. State the claim, source evidence, assumptions, and falsifier.
3. Present a subgoal-labeled worked example.
4. Ask for a prediction before running the minimal mechanism probe.
5. Show the observed output and request a self-explanation that binds equation, code symbol, and observation.
6. Run a one-variable counterfactual or ablation.
7. Fade guidance with a completion task.
8. Test transfer on a nearby shape, dataset slice, or parameter regime.
9. End with retrieval questions and explicit remaining evidence gaps.

The learner level controls how much code and explanation is prefilled. A notebook is incomplete when it only contains a correct architecture implementation.

### Evidence ladder

Never collapse these states:

1. `source-mapped`: paper and repository evidence is pinned.
2. `mechanism-demonstrated`: a reduced assertion passed.
3. `reported-result-redrawn`: exact printed paper values were rendered again.
4. `partial-result-rerun`: part of the experimental protocol ran with declared deviations.
5. `result-reproduced`: the target metric and protocol were independently obtained with sufficient variation.

UI labels and agent language must use the highest state actually supported by retained evidence.

### Connector responsibilities

- **Skill:** an explicit `/command` that supplies a reusable workflow and output contract. It can be added, edited, enabled, disabled, deleted, and must never run unless explicitly selected.
- **Agent:** an explicit `/command` that supplies a role, decision policy, and review stance across a research request.
- **Hook:** an automatic invariant check bound to one lifecycle event. Hooks should be narrow gates, not broad personas.

All three must enter the real Codex prompt with visible invocation metadata and deterministic routing tests. User-authored instructions remain bounded preferences and cannot weaken evidence, execution, credential, or cost controls.

### Artifact workspace

The primary Artifact view is outcome-first:

- **Results:** previewable figures, tables, metric JSON, checkpoints, and reports grouped by producing run.
- **Run context:** status, target cell, parameters, environment digest, duration, parent run, and deviations.
- **Lineage:** result entity `wasGeneratedBy` run activity; run `used` notebook version, source claim, dataset revision, and environment; activity `wasAssociatedWith` user, agent, or runner.
- **Files:** raw bundle files remain downloadable but are secondary, searchable, and typed.

Do not show hashes, internal paths, or manifest filenames as the main information architecture. They belong in a provenance inspector.

### Threads and history

- A thread attaches to a cell, run, result, claim, or artifact, not merely the notebook as a whole.
- A thread records question, agent answer, proposed patch, decision (`open`, `applied`, `dismissed`, `resolved`), and the version or run produced after the decision.
- Applying a patch creates a notebook version and invalidates stale outputs until rerun.
- History groups human-meaningful events into `Sources`, `Notebook versions`, `Runs`, `Results`, and `Decisions`. Raw JSONL stays available only in the provenance inspector.
- The user can compare two notebook versions or two runs and restore a notebook version without rewriting prior history.

## Acceptance criteria

- Custom skills support CRUD, enable/disable, `/` discovery, command-conflict validation, persistence, and actual prompt injection.
- Default skills encode the learning-unit progression and evidence ladder, with contract tests for required stages.
- Each study row owns its own selection and delete menu; deleting a non-active row preserves the active conversation.
- A run-produced PNG is previewable from Results and linked to its run, cell, code hash, and environment digest.
- Metrics and tables are rendered as typed results rather than anonymous files.
- Threads identify their target and decision state; applied edits point to the resulting version and required rerun.
- History hides low-value persistence noise by default and supports version/run comparison-oriented navigation.
