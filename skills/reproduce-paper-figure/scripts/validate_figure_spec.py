#!/usr/bin/env python3
"""Validate the structural contract used by exact-source paper redraws."""

import json
import math
import re
import sys
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"invalid figure spec: {message}")


def finite_number(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_figure_spec.py SPEC.json")
    document = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    required = {"title", "sourceLabel", "metric", "unit", "chart", "xLabel", "yLabel", "xScale", "yScale", "paperSha256", "series"}
    if not isinstance(document, dict) or not required.issubset(document):
        fail("root is missing required fields")
    if document["chart"] not in {"grouped-bar", "stacked-bar", "line", "scatter"}:
        fail("unsupported chart")
    if document["xScale"] not in {"linear", "log"} or document["yScale"] not in {"linear", "log"}:
        fail("scales must be linear or log")
    if not re.fullmatch(r"[a-f0-9]{64}", document["paperSha256"]):
        fail("paperSha256 must be a lowercase SHA-256")
    series = document["series"]
    if not isinstance(series, list) or not 1 <= len(series) <= 8:
        fail("series must contain 1 to 8 groups")
    names = [group.get("name") for group in series if isinstance(group, dict)]
    if len(names) != len(series) or len(set(names)) != len(names) or any(not isinstance(name, str) or not name.strip() for name in names):
        fail("series names must be nonempty and unique")
    expected_labels = None
    point_count = 0
    point_fields = {"label", "xValue", "value", "error", "errorSourceValue", "page", "sourceValue", "quote"}
    for group_index, group in enumerate(series):
        values = group.get("values")
        if not isinstance(values, list) or not 1 <= len(values) <= 30:
            fail(f"series {group_index} must contain 1 to 30 values")
        labels = []
        for point_index, point in enumerate(values):
            if not isinstance(point, dict) or set(point) != point_fields:
                fail(f"point {group_index}:{point_index} has missing or unknown fields")
            label = point["label"]
            if not isinstance(label, str) or not label.strip() or label in labels:
                fail(f"point {group_index}:{point_index} label is empty or duplicated")
            labels.append(label)
            if not finite_number(point["value"]):
                fail(f"point {group_index}:{point_index} value must be finite")
            if document["chart"] in {"line", "scatter"} and not finite_number(point["xValue"]):
                fail(f"point {group_index}:{point_index} requires a finite xValue")
            if document["chart"].endswith("bar") and point["xValue"] is not None:
                fail(f"point {group_index}:{point_index} bar xValue must be null")
            error, error_token = point["error"], point["errorSourceValue"]
            if (error is None) != (error_token is None) or (error is not None and (not finite_number(error) or error < 0)):
                fail(f"point {group_index}:{point_index} uncertainty pair is invalid")
            if isinstance(point["page"], bool) or not isinstance(point["page"], int) or point["page"] < 1:
                fail(f"point {group_index}:{point_index} page must be positive")
            if not isinstance(point["sourceValue"], str) or not point["sourceValue"].strip():
                fail(f"point {group_index}:{point_index} sourceValue is missing")
            if not isinstance(point["quote"], str) or not 8 <= len(point["quote"].split()) <= 30 or point["sourceValue"] not in point["quote"]:
                fail(f"point {group_index}:{point_index} quote must contain the source token and 8 to 30 words")
            if error_token is not None and (not isinstance(error_token, str) or error_token not in point["quote"]):
                fail(f"point {group_index}:{point_index} quote must contain the uncertainty token")
            if document["yScale"] == "log" and point["value"] <= 0:
                fail("log y values must be positive")
            if document["xScale"] == "log" and (point["xValue"] is None or point["xValue"] <= 0):
                fail("log x values must be positive")
            point_count += 1
        if document["chart"].endswith("bar"):
            if document["xScale"] != "linear":
                fail("categorical bar charts require a linear x scale")
            if expected_labels is not None and labels != expected_labels:
                fail("bar series must share ordered labels")
            expected_labels = labels
    if point_count < 2:
        fail("at least two total points are required")
    print(f"valid figure spec: {point_count} points in {len(series)} series")


if __name__ == "__main__":
    main()
