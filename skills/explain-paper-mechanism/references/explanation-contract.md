# Explanation Unit Contract

Emit one JSON object per taught claim.

```json
{
  "schema_version": "1.0",
  "claim_id": "claim-3.1-low-rank-update",
  "title": "Why factorize the update?",
  "plain_claim": "A frozen dense weight can be adapted through a smaller trainable update.",
  "source_anchors": [
    {"kind": "paper", "document_hash": "...", "section": "3.1", "page": 4, "anchor": "equation-3"},
    {"kind": "repository", "commit": "...", "path": "loralib/layers.py", "symbol": "Linear.forward"}
  ],
  "equations": [
    {
      "latex": "h = W_0 x + BAx",
      "symbols": {
        "h": {"meaning": "layer output", "shape": "d_out"},
        "W_0": {"meaning": "frozen base weight", "shape": "d_out x d_in", "code_symbol": "layer.weight"},
        "A": {"meaning": "down projection", "shape": "r x d_in", "code_symbol": "layer.A"},
        "B": {"meaning": "up projection", "shape": "d_out x r", "code_symbol": "layer.B"}
      }
    }
  ],
  "mechanism_steps": ["..."],
  "necessity": {
    "component": "rank-r factorization",
    "without_it": "the update returns to a dense parameter budget",
    "controlled_change": "replace BA with a dense trainable matrix",
    "predicted_observable": "trainable values rise from 32 to 64"
  },
  "code_bindings": [
    {"path": "notebook.ipynb", "cell_id": "parameter-budget", "symbol": "low_rank_update", "role": "computes the derived parameter count"}
  ],
  "numeric_claims": [
    {"statement": "The demo uses 32 trainable adapter values.", "value": 32, "evidence_kind": "execution", "anchor": "run-id/code-hash"}
  ],
  "prediction": "The factorized budget is half the dense budget.",
  "observation": "The isolated run printed fraction=0.50 and passed the assertion.",
  "interpretation": "The result supports the parameter-budget consequence, not downstream task quality.",
  "limitations": ["Tensor-scale demonstration", "No benchmark accuracy claim"],
  "explanation_markdown": "## Why factorize the update?\n\n..."
}
```

## Validation invariants

- Every equation symbol has a binding; every code symbol used in prose has a code binding.
- Every number in `numeric_claims` has an evidence kind and anchor.
- `prediction` describes an expectation; `observation` contains only recorded output.
- `interpretation` is no broader than the controlled observable.
- `limitations` includes scale, data, metric, or architecture deviations relevant to the claim.
- `explanation_markdown` contains a display equation, a concrete demo substitution, the controlled counterfactual, and an evidence boundary.
