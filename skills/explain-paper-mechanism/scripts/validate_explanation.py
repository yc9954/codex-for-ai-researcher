#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path


REQUIRED_FIELDS = (
    "schema_version",
    "claim_id",
    "title",
    "plain_claim",
    "source_anchors",
    "equations",
    "mechanism_steps",
    "necessity",
    "code_bindings",
    "numeric_claims",
    "prediction",
    "observation",
    "interpretation",
    "limitations",
    "explanation_markdown",
)


def word_ngrams(value: str, size: int = 12) -> set[tuple[str, ...]]:
    words = re.findall(r"[a-z0-9_]+", value.lower())
    return {tuple(words[index:index + size]) for index in range(max(0, len(words) - size + 1))}


def validate(payload: dict, source_text: str | None) -> list[str]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if field not in payload or payload[field] in (None, "", []):
            errors.append(f"missing required field: {field}")

    anchors = payload.get("source_anchors", [])
    if not all(isinstance(item, dict) and item.get("kind") for item in anchors):
        errors.append("each source anchor needs a kind")

    equations = payload.get("equations", [])
    for index, equation in enumerate(equations):
        if not equation.get("latex") or not equation.get("symbols"):
            errors.append(f"equation {index} needs latex and symbol bindings")
            continue
        for symbol, binding in equation["symbols"].items():
            if not symbol or not isinstance(binding, dict) or not binding.get("meaning"):
                errors.append(f"equation {index} has an undefined symbol")

    necessity = payload.get("necessity", {})
    for field in ("component", "without_it", "controlled_change", "predicted_observable"):
        if not necessity.get(field):
            errors.append(f"necessity missing: {field}")

    for index, claim in enumerate(payload.get("numeric_claims", [])):
        if "value" not in claim or not claim.get("evidence_kind") or not claim.get("anchor"):
            errors.append(f"numeric claim {index} lacks value, evidence_kind, or anchor")

    markdown = payload.get("explanation_markdown", "")
    if "$$" not in markdown and "\\[" not in markdown:
        errors.append("explanation_markdown needs a display equation")
    if len(markdown.split()) < 120:
        errors.append("explanation_markdown is too short for a complete mechanism explanation")

    if source_text:
        overlap = word_ngrams(markdown) & word_ngrams(source_text)
        if overlap:
            errors.append("explanation reuses a source sequence of 12 or more normalized words")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a structured paper-mechanism explanation.")
    parser.add_argument("document", type=Path)
    parser.add_argument("--source", type=Path, help="Optional extracted source text used for overlap checks")
    args = parser.parse_args()

    payload = json.loads(args.document.read_text(encoding="utf-8"))
    source_text = args.source.read_text(encoding="utf-8") if args.source else None
    errors = validate(payload, source_text)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Explanation contract: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
