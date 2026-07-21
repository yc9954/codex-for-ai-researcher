# Claim Map Schema

```json
{
  "claim_id": "claim-3.1-low-rank-update",
  "claim": "A frozen base weight can adapt through a trainable low-rank update.",
  "type": "mechanism",
  "paper_evidence": [{"section": "3.1", "page": 4, "anchor": "equation-3"}],
  "repository_evidence": [{"commit": "...", "path": "...", "symbol": "..."}],
  "equations": [{"anchor": "equation-3", "latex": "", "symbols": {}}],
  "evidence_ledger": [{"proposition": "", "kind": "paper", "anchor": ""}],
  "mechanism": {"inputs": [], "transformation": "", "observable": "", "controls": []},
  "invariants": [],
  "necessity_map": [{"component": "", "role": "", "without_it": "", "observable": "", "controlled_contrast": ""}],
  "falsification": "",
  "uncertainties": [],
  "teachability": {"score": 0, "reasons": []}
}
```

Allowed `type` values: `contribution`, `mechanism`, `empirical`, `assumption`, `limitation`.

Never leave uncertainty implicit. Use `repository_evidence: []` plus an uncertainty entry when no implementation anchor exists.

`evidence_ledger` is the handoff for explanation authoring. Keep each proposition atomic and source-labeled; do not place generated narrative summaries in it.
