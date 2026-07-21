---
name: author-concept-notebook
description: Turn one research claim into a minimal Jupyter-compatible executable knowledge unit with editable cells, assertions, explanations, and transfer tasks. Use when teaching an ML paper through a small runnable demo rather than full reproduction.
---

# Author Concept Notebook

Create an Executable Knowledge Unit (EKU): one claim, one mechanism, one observable, and one learner modification. Architecture reconstruction alone is incomplete.

## Cell Sequence

1. **Diagnose:** ask one prerequisite question and run one baseline probe before introducing the paper mechanism. Record the learner's answer as a knowledge gap, not a score.
2. **Orient:** state one paper claim, its exact source anchors, assumptions, a falsifier, demo scope, and deviations.
3. **Subgoal map:** name the few conceptual subgoals that transform the baseline into the mechanism. Bind each subgoal to an equation fragment and repository symbol when available.
4. **Worked example:** show one complete, small example with shapes and substituted values. Keep the explanation adjacent to the code it explains.
5. **Predict:** ask for the expected direction, shape, count, or invariant before showing output.
6. **Setup:** import only required packages, set seeds, and report runtime/device versions.
7. **Mechanism:** implement the smallest readable slice. Prefer maintained public APIs; copy repository code only when essential to fidelity and retain its license/source.
8. **Observe and self-explain:** show the recorded output, then require the learner to connect one equation term, one code symbol, and one observed value in their own words.
9. **Contrast:** add a one-variable ablation or counterfactual. Keep data, seed, metric, and all other controls fixed. Ask for a prediction before it runs.
10. **Verify:** assert both the intended invariant and the contrast. Include a failure message that explains what changed.
11. **Fade guidance:** provide a partially completed variant with one meaningful step removed rather than repeating the full solution.
12. **Transfer and retrieve:** ask the learner to complete the faded step, test a nearby case, and answer two delayed-recall questions without looking at the worked example.

Read [references/eku-method.md](references/eku-method.md) before authoring a multi-cell lesson.
Read [references/learning-progression.md](references/learning-progression.md) when deciding the order and amount of guidance.

## Authoring Rules

- Keep hidden setup minimal; a target cell must be reproducible by executing all prior code cells in order.
- Code cells must be editable and independently runnable through an ordered shared Python scope.
- Use assertions for semantic claims, not just `print` statements.
- Every architecturally important component needs a necessity record: `component`, `role`, `without_it`, `observable`, `controlled_contrast`, and `claim_id`.
- Markdown cells are reading artifacts, not extraction dumps. Store extracted source separately, synthesize an explanation unit, validate it, and render the final Markdown with KaTeX or MathJax. Keep source editing available as an explicit mode rather than the default learner view.
- A complete explanation defines every displayed symbol, substitutes demo values into at least one formula, binds prose to a cell or code symbol, distinguishes prediction from observation, and names the evidence boundary.
- Prefer one-variable contrasts. A large ablation grid is less useful than a small experiment whose causal difference can be explained.
- Do not reveal an observed output before the prediction prompt unless the learner explicitly skips prediction.
- Fade only one meaningful scaffold at a time. Preserve the same subgoal labels between the worked example and completion problem.
- Keep a retrieval queue with `question`, `answer_contract`, `source_claim_id`, `due_after_stage`, and `learner_status`.
- Tag every result with exactly one evidence level: `source-mapped`, `mechanism-demonstrated`, `reported-result-redrawn`, `partial-result-rerun`, or `result-reproduced`.
- Keep original and agent-proposed source separately until the learner applies the suggestion.
- Attach `claim_id`, source hash, environment image, and expected assertion metadata to each relevant cell.
- Avoid full-scale data or training when a synthetic tensor or small licensed subset exposes the mechanism.

## Completion Check

Run every code cell in the target environment. A notebook is complete only when every explanation contract passes validation, the learner can explain at least one observed failure or changed behavior after removing a structure, the faded completion has a checkable answer contract, the retrieval queue contains at least two items, and the final transfer task changes a small, named surface.
