---
name: extract-paper-claims
description: Extract claims, mechanisms, assumptions, metrics, equations, and implementation evidence from an ML paper and linked repository. Use before designing a reduced reproduction, educational demo, compatibility patch, or paper-to-code explanation.
---

# Extract Paper Claims

Build a traceable claim graph, not a prose summary.

## Procedure

1. Pin the paper version and repository commit. Retain URLs and document hashes.
2. Prefer structured PDF extraction with GROBID or PaperMage when available. Preserve section, page, figure, table, equation, and bibliography anchors.
3. Identify contribution claims, causal/mechanistic claims, empirical claims, assumptions, and limitations. Normalize relevant equations into LaTeX and build a symbol table with meaning, shape, units, scope, and nearby textual definition.
4. For each candidate claim, locate implementation evidence through AST/import graphs and repository symbol search. Record exact paths and symbols; do not infer that the repository implements a claim merely from naming.
5. Decompose the claim into inputs, transformation, observable, controls, and falsifying result.
6. Score teachability by isolation cost, runtime, dataset cost, dependency risk, and whether a small assertion can expose the mechanism.
7. Mark conflicts between paper and code, missing evidence, and interpretation as uncertainty.

Use [references/claim-schema.md](references/claim-schema.md) for the output contract.

## Evidence Rules

- Paraphrase claims and attach precise anchors; keep short quotations only when wording itself matters.
- Distinguish paper evidence, repository evidence, and agent inference.
- An equation is not executable evidence until its variables map to code symbols or a standalone implementation.
- Preserve extracted prose as evidence only. Downstream explanation skills must receive atomic propositions, anchors, equations, and symbol bindings rather than a Markdown summary to paraphrase.
- Prefer program slicing around the selected output over copying a training script wholesale.

## Completion Check

At least one selected claim must have a paper anchor, code anchor or explicit absence, preserved invariants, a measurable observable, and a falsification condition.
