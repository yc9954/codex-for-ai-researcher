---
name: explain-paper-mechanism
description: Synthesize a paper claim, equation, repository implementation, and executed snippet into a polished educational explanation with defined symbols, code mappings, counterfactuals, numeric evidence, and limitations. Use when creating or refining notebook prose, study reports, or paper-to-code lessons; do not copy source Markdown as the explanation.
---

# Explain Paper Mechanism

Create a new explanation from evidence records. Never treat extracted Markdown, a paper abstract, or repository comments as publishable prose.

## Inputs

Require a claim record, paper anchors, normalized equations, repository symbols or an explicit absence, demo code, and observed outputs. Mark missing inputs as uncertainty instead of filling them with plausible text.

## Workflow

1. Build an evidence ledger of atomic propositions. Label each as `paper`, `repository`, `execution`, or `inference`.
2. Normalize every equation and bind each symbol to meaning, shape, units where relevant, and its code symbol. Do not introduce a symbol that is absent from the binding table.
3. Plan the explanation without copying source sentences: plain-language claim, equation, mechanism steps, necessity, controlled counterfactual, observed evidence, and limitation.
4. Draft for a learner who will run the adjacent code. Put a prediction before output and explain the causal chain after output.
5. Reconcile all numeric statements with source tables or execution artifacts. Label estimates, derived values, and reduced-demo results distinctly.
6. Render inline math with `$...$` and display math with `$$...$$`; never emit `\\(...\\)` or `\\[...\\]`. Preserve code indentation, and use tables only when comparison is easier to scan than prose.
7. Emit the contract in [references/explanation-contract.md](references/explanation-contract.md), then run `scripts/validate_explanation.py` on it.

## Writing Standard

- Begin with the intellectual job of the structure, not a generic paper summary.
- Define the baseline before describing the modification.
- Follow each equation with a symbol explanation and a concrete substitution from the demo.
- Use the chain `structure -> mathematical consequence -> code location -> observable -> interpretation`.
- Separate prediction from observation. Never rewrite an expected value as if it were measured.
- Explain a controlled counterfactual that changes one structural choice while holding input, seed, and metric fixed.
- State what would falsify the explanation and what the reduced demo cannot establish.
- Prefer precise paragraphs of two to four sentences. Avoid filler transitions, praise, anthropomorphism, and claims that the model “understands.”
- Preserve native mathematical notation where it improves precision; explain it immediately in ordinary language.
- Keep code snippets minimal but syntactically complete. Never flatten indentation or omit a line required to reproduce the stated output.

## Grounding Rules

- Paper-reported numbers require a paper/table anchor.
- Repository behavior requires a commit, path, and symbol or line range.
- Demo-reported numbers require a run ID and code hash.
- Derived numbers must include the formula and substituted values.
- Interpretations must be labeled as inference when the paper or execution does not state them directly.
- Reject prose with long source overlap. Short technical phrases and equation names are allowed; source sentence reuse is not.

## Completion Check

The explanation is complete only when a learner can answer: what changed, why the structure causes that change, where it appears in code, what was observed, what alternative was controlled, and what remains unproven.
