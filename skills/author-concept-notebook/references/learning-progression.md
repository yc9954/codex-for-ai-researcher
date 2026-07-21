# Learning Progression Contract

Use this contract to turn a paper mechanism into an executable lesson instead of a compressed summary.

## Unit State

Persist these fields for each taught claim:

- `claim_id`, exact evidence anchors, assumptions, and falsifier
- `prerequisites` with a diagnostic prompt and observed learner response
- `subgoals` in causal order, with equation terms and repository symbols
- `prediction` recorded before execution
- `run_id`, `code_hash`, `image_digest`, stdout, figures, and measured values
- `self_explanation` that binds equation, code, and observation
- `counterfactual` with one changed variable and all controls named
- `completion_step` removed from the worked example and its answer contract
- `transfer_task` and `retrieval_queue`
- one `evidence_level` from the fixed evidence ladder

## Guidance Policy

Start with a complete worked example when prerequisites are weak or the mechanism has high element interactivity. Retain stable subgoal labels across explanation, code, and tests. After the learner explains the observed mechanism correctly, remove one substantive step and ask them to complete it. Do not fade syntax and conceptual reasoning simultaneously.

## Feedback Policy

Feedback identifies the first violated invariant and points to the smallest relevant evidence anchor. It does not replace the learner's answer immediately. After one targeted hint, allow another attempt; show the completed step only after the second failed attempt or an explicit request.

## Evidence Ladder

1. `source-mapped`: a claim is mapped to exact paper and repository evidence.
2. `mechanism-demonstrated`: a reduced local probe passed and isolates the intended mechanism.
3. `reported-result-redrawn`: exact cited paper values were redrawn without rerunning the experiment.
4. `partial-result-rerun`: part of the paper protocol ran with declared deviations.
5. `result-reproduced`: the original protocol, metric, and comparison were rerun within declared tolerance.

Never infer a higher level from a lower one.
