---
name: reproduce-paper-figure
description: Recreate an important paper table, ablation, or reported metric as an executable raster figure backed by exact PDF values, page citations, a machine-readable value ledger, and an isolated smoke test. Use for figure reproduction, numeric comparisons, paper tables, result plots, or ablation visualization; do not use pixel estimates as reported values.
---

# Reproduce Paper Figure

Produce an auditable redraw of a thesis-bearing numerical comparison. A redraw of paper-reported values is not a rerun of the paper experiment.

## Workflow

1. Locate the result table, caption, or result paragraph that supports a central conclusion or ablation. Prefer exact text/table values over a visually prominent but peripheral plot.
2. Create a value ledger containing the label, exact printed token, normalized numeric value, metric, unit, and PDF page for every point.
3. Reject the request when fewer than two compatible values are explicit, labels are ambiguous, or values require reading pixels. Never fill missing values or merge unlike metrics.
4. Preserve the recoverable original structure: grouped or stacked bars, multiple line series, scatter observations, error values, axis labels, and linear/log scales. Reject the redraw when the structure or values exist only as pixels.
5. Generate deterministic matplotlib code with the `Agg` backend. Serialize the ledger to JSON and save a PNG from those same values.
6. Assert the point count, label uniqueness, numeric finiteness, output existence, and nontrivial image size. Run in the pinned network-disabled container.
7. Retain the paper SHA-256, cited pages, code hash, run ID, image digest, PNG hash, and JSON ledger in provenance.

Read [references/figure-spec.md](references/figure-spec.md) for the ledger contract. Validate an extracted ledger with `python scripts/validate_figure_spec.py spec.json` before plotting when working outside the app endpoint.

## Evidence Labels

- **Reported redraw:** exact values printed by the paper, rendered into a new chart.
- **Derived analysis:** a deterministic transformation of reported values; show the formula and preserve inputs.
- **Measured reproduction:** values produced by rerunning a documented experimental protocol.
- **Pedagogical demo:** values from a reduced example that explain a mechanism but do not establish the paper result.

Never label a reported redraw or pedagogical demo as a measured reproduction.

## Completion Check

Completion requires a visible PNG, a matching JSON ledger, page-level citations, a passed isolated run, artifact hashes, and an explicit evidence label. If any are missing, report the figure as unverified.
