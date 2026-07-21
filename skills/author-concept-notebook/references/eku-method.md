# Executable Knowledge Unit Method

An EKU binds four layers:

1. **Source:** paper claim and repository evidence.
2. **Model:** a concise explanation of the mechanism and assumptions.
3. **Execution:** minimal code, environment, data, assertion, and observed output.
4. **Necessity:** why each structure exists and what observable changes without it.
5. **Learning:** prediction, self-explanation, modification, retrieval, and transfer.

The explanation layer must be synthesized from the source and execution layers. Do not display extracted Markdown as lesson prose. Retain it as evidence, then author a separate explanation unit whose claims bind to equations, code symbols, and run artifacts.

Use the loop `orient -> predict -> worked example -> run -> self-explain -> modify -> retrieve -> transfer`.

## Structural necessity loop

For each important component, build a compact loop:

1. Name the job the component performs.
2. Predict behavior if it is removed or altered.
3. Change only that component.
4. Measure a visible difference with the same inputs and controls.
5. Explain why the observation supports, weakens, or fails to test the paper claim.

Examples include zero initialization versus random initialization, frozen versus trainable base weights, normalization present versus bypassed, residual path present versus removed, and attention rank changed with parameter count held visible.

## Reduction test

A reduction is acceptable when it preserves the mechanism and its observable while explicitly listing changed scale, data, architecture, schedule, and metric. It is unacceptable when the reduced task can pass without exercising the claimed mechanism.

## Cell metadata

Store `cell_id`, `claim_ids`, `source_hash`, `explanation_contract_hash`, `dependencies`, `expected_assertions`, `last_run_id`, and `author`. Retain extracted source, explanation Markdown, editable source, and output separately so editing invalidates evidence instead of silently reusing it.
