# Numeric Evidence Architecture for Paper-Derived Demos

## Executive decision

Build a numeric evidence system, not a PDF question-answering feature.

The system must connect every reported value to:

1. the exact paper location,
2. the metric definition,
3. the experiment conditions,
4. the repository code and configuration,
5. the raw or reproduced run that produced it,
6. the transformation used to compare or summarize it.

An LLM may propose semantic links and explanations. It must not be the authority for OCR, arithmetic, unit conversion, confidence intervals, table aggregation, or final reproduction judgments.

## Research basis

- GROBID converts scientific PDFs to structured TEI, retains PDF coordinates, and recognizes document structures such as sections, figures and tables: <https://grobid.readthedocs.io/en/latest/Introduction/>
- PaperMage represents scientific documents as multimodal entities with text spans and visual bounding boxes, and composes multiple predictors through recipes: <https://aclanthology.org/2023.emnlp-demo.45/>
- PubTables-1M and Table Transformer address table detection, structure recognition, header roles, and cell coordinates rather than treating a table as plain text: <https://arxiv.org/abs/2110.00061>
- DePlot demonstrates the useful intermediate operation of translating plots into linearized tables before reasoning: <https://arxiv.org/abs/2212.10505>
- Nougat targets scientific document OCR into markup, including mathematical expressions and tables, but should remain a fallback behind author-provided structured sources: <https://arxiv.org/abs/2308.13418>
- The ML reproducibility checklist requires exact run counts, metric/statistic definitions, central tendency, variation, runtime or energy, infrastructure, and hyperparameter selection details: <https://www.cs.mcgill.ca/~jpineau/ReproducibilityChecklist-v2.0.pdf>
- Few-run ML evaluation can reverse conclusions when point estimates ignore uncertainty; stratified bootstrap intervals, performance profiles, and robust aggregates such as IQM are useful for appropriate multi-task settings: <https://arxiv.org/abs/2108.13264>
- W3C PROV provides an interoperable provenance model, while Workflow Run RO-Crate packages workflow inputs, outputs, code, and execution provenance: <https://www.w3.org/TR/prov-o/> and <https://arxiv.org/abs/2312.07852>
- MLflow's run model links parameters, metrics, code versions, datasets, and artifacts, but it does not supply paper-specific metric semantics or evidence linking by itself: <https://mlflow.org/docs/latest/tracking>
- MLCommons demonstrates that valid numerical comparison needs a fixed dataset, metric/quality target, allowed-change policy, repeated measurements, and a declared system context: <https://mlcommons.org/benchmarks/training/>

## Source precedence

Use the least lossy source available.

1. Author-provided raw CSV/JSON logs and evaluation outputs
2. Repository configs, checkpoints, and metric code at a pinned commit
3. arXiv LaTeX source or publisher XML/HTML
4. Digitally generated PDF text and vector geometry
5. Rendered table or chart images
6. OCR or vision-language reconstruction

Never replace a structured source with a lower-precedence extraction without recording why.

## System architecture

```text
Paper / LaTeX / PDF / Repository / Raw Logs
                    |
          [1. Source Registry]
                    |
       [2. Multimodal Document IR]
          /         |          \
      text       tables       charts/math
     GROBID     TATR+cells    DePlot/Nougat
          \         |          /
        [3. Numeric Evidence Extractor]
                    |
         [4. Experiment Semantic Graph]
            /                 \
 [5. Code + Config Trace]   [6. Metric Registry]
            \                 /
          [7. Deterministic Audit Engine]
                    |
     [8. Reproduction Comparison Engine]
                    |
       Notebook / Report / Review UI
                    |
       W3C PROV + Workflow RO-Crate
```

### 1. Source Registry

Pin every input before extraction:

- paper identifier, version, URL, SHA-256
- repository URL, commit, submodules, dirty patch
- supplementary files and license
- dataset identifier, revision, split, and content hash
- checkpoint identifier and hash
- parser name, version, image digest, and configuration

### 2. Multimodal Document IR

Do not flatten the paper into Markdown. Preserve:

- page, bounding box, reading order, and text span
- section, paragraph, caption, footnote, and citation identity
- table row, column, spanning cell, header hierarchy, and cell role
- chart legend, axis, scale, series, marker, and source crop
- equation markup, equation number, surrounding definitions, and symbols

PaperMage's document/layer/entity abstraction is a useful conceptual model. GROBID is the primary full-text structure parser. Table Transformer handles table topology. DePlot and Nougat are fallback modality converters, not final evidence authorities.

### 3. Numeric Evidence Extractor

Extract numbers as typed observations, never bare strings.

```json
{
  "observation_id": "obs-table3-r4-c7",
  "raw": "87.4 +/- 0.6",
  "value": 87.4,
  "scale": 0.01,
  "unit": "fraction",
  "statistic": "mean",
  "uncertainty": {"kind": "stddev", "value": 0.6, "scale": 0.01},
  "sample_count": null,
  "seed_count": 5,
  "metric_id": "metric-top1-accuracy-v1",
  "dataset_id": "imagenet-1k-val",
  "model_variant_id": "model-base-r8",
  "source_anchor": {"page": 7, "table": "3", "row": 4, "column": 7},
  "extraction": {"method": "pdf-text+tatr", "confidence": 0.97},
  "source_hash": "sha256:..."
}
```

Required parsers:

- integers, decimals, scientific notation, intervals, inequalities
- percentage versus percentage point
- mean plus/minus SD, SE, CI, or unspecified error
- ranges, ranks, ratios, speedups, throughput, latency, memory, FLOPs
- arrows and bold/underline conventions indicating metric direction or best result
- missing, not applicable, out-of-memory, and censored values

### 4. Experiment Semantic Graph

Use a graph because a table cell is not meaningful without several surrounding definitions.

Core nodes:

- `PaperVersion`
- `SourceAnchor`
- `Claim`
- `Experiment`
- `ModelVariant`
- `DatasetSlice`
- `MetricDefinition`
- `Measurement`
- `Statistic`
- `CodeSymbol`
- `ConfigValue`
- `Run`
- `ComputeContext`
- `Transformation`
- `ReviewDecision`

Core edges:

- `extractedFrom`
- `defines`
- `measuredOn`
- `producedBy`
- `configuredBy`
- `implementedBy`
- `derivedFrom`
- `comparedWith`
- `supports`
- `contradicts`
- `supersedes`

For the prototype, store canonical records in DuckDB/Parquet and adjacency records in JSONL or SQLite. Do not add a graph database until graph traversal or concurrent authoring requires one.

### 5. Code and Config Trace

Map reported values to executable definitions:

1. Search table/plot labels and metric names in README files, scripts, configs, and log keys.
2. Trace evaluation entrypoints with AST and import graphs.
3. Resolve the metric implementation, aggregation axes, preprocessing, checkpoint selection, and dataset split.
4. Capture defaults that are absent from command lines.
5. Compare paper conditions against code conditions and emit a typed mismatch.

Do not accept a filename match as proof. A link becomes verified only when the call path reaches the metric calculation or the raw result artifact.

### 6. Metric Registry

Metric names are insufficient. Each metric definition needs:

```json
{
  "metric_id": "metric-f1-macro-v1",
  "display_name": "Macro F1",
  "formula": "mean_c(2 * precision_c * recall_c / (precision_c + recall_c))",
  "aggregation_axes": ["class"],
  "higher_is_better": true,
  "range": [0, 1],
  "unit": "fraction",
  "preprocessing": "...",
  "thresholding": "...",
  "reference_implementation": {"path": "eval.py", "symbol": "macro_f1"}
}
```

Version the definition whenever preprocessing, averaging, normalization, thresholding, or aggregation changes.

### 7. Deterministic Audit Engine

Run rules before any narrative generation.

#### Extraction checks

- header-span consistency
- row/column count and merged-cell topology
- numeric parse round-trip against the source crop
- dual-parser disagreement
- chart axis type, truncated axis, log scale, and legend mapping

#### Arithmetic checks

- recompute mean, delta, ratio, relative improvement, and speedup
- distinguish `%` from percentage points
- verify totals and subtotals
- check rounding tolerance before declaring inconsistency
- verify that bolded or claimed best results follow the declared direction

#### Comparability checks

The minimum comparison key is:

```text
dataset revision + split + preprocessing
+ metric definition + aggregation
+ evaluation protocol + checkpoint selection
+ model scale / budget
+ hardware context for system metrics
```

If any field differs, label the comparison `conditional`, not `matched`.

#### Statistical checks

- exact train/evaluation run count
- independence and pairing of runs
- central tendency and variation type
- confidence interval method and confidence level
- hyperparameter and checkpoint selection leakage
- multiple comparisons when many variants are searched
- practical effect size versus statistical significance
- distribution or interval evidence when a point estimate is unreliable

Statistical policies must be domain profiles. RL, supervised learning, generative evaluation, and systems benchmarks should not share one hard-coded test.

### 8. Reproduction Comparison

Never reduce reproduction to `reported == observed`.

Produce five separate judgments:

1. `protocol_match`: conditions and metric semantics match
2. `numeric_match`: observed interval falls within declared tolerance
3. `directional_match`: ordering or ablation effect has the same direction
4. `statistical_support`: available runs support the conclusion
5. `scope`: concept demo, partial reproduction, or reproduction

Different hardware may prevent identical runtime while preserving the conclusion. The system should therefore compare accuracy-like metrics, efficiency metrics, and structural invariants under separate tolerance policies.

## Confidence and review gates

Calculate confidence from independent components:

- source fidelity
- layout/table reconstruction
- numeric parsing
- semantic linkage
- code linkage
- cross-source agreement

Suggested gates:

- `>= 0.95`: auto-accept deterministic extraction
- `0.80-0.95`: require a second parser or redundant source
- `< 0.80`: require user confirmation using the source crop
- any metric-definition ambiguity: block numeric comparison regardless of score

The review UI must show the paper crop, reconstructed table/chart, normalized record, code/config link, and agent explanation side by side.

## Skill architecture

### `orchestrate-numeric-evidence`

Trigger: a user asks whether paper results are correct, reproducible, comparable, or supported by code.

Owns the evidence state machine and blocks downstream comparison until metric identity and experimental conditions are resolved.

### `acquire-paper-sources`

Input: paper URL/PDF and supplementary links.

Output: pinned source registry and chosen extraction route. Prefer LaTeX/XML/HTML and raw result files over PDF OCR.

### `extract-paper-measurements`

Input: pinned sources.

Output: document IR, reconstructed tables/charts, typed numeric observations, bounding boxes, and confidence records.

Must not interpret whether a result is good or reproduced.

### `model-experiment-semantics`

Input: observations and nearby paper context.

Output: experiment graph, model/dataset/metric identities, claim links, and unresolved ambiguities.

This is the main constrained-LLM skill. Every proposed link needs source anchors and confidence.

### `trace-results-to-code`

Input: experiment graph and pinned repository.

Output: metric implementation, evaluation call path, config values, log keys, dataset loader, and paper-versus-code mismatch ledger.

### `audit-statistical-evidence`

Input: normalized observations, raw runs when available, and a domain policy.

Output: deterministic arithmetic checks, uncertainty audit, selection-bias warnings, recomputed intervals, and evidence sufficiency.

### `compare-reproduction-results`

Input: reported evidence plus locally or remotely reproduced runs.

Output: protocol, numeric, directional, statistical, and scope judgments with tolerance explanations.

### `package-numeric-provenance`

Input: all accepted and rejected extraction decisions, code links, runs, and comparisons.

Output: JSONL ledger, Parquet tables, notebook/report, W3C PROV mapping, and Workflow Run RO-Crate-compatible bundle.

## Skill handoff contract

Every skill output includes:

- `schema_version`
- `artifact_id`
- `created_at`
- `actor`
- `parent_ids`
- `input_hashes`
- `tool_versions`
- `records`
- `warnings`
- `unresolved`
- `output_hash`

Reject a handoff when it contains a numeric conclusion without a metric definition and source anchor.

## UI surfaces

Add a `Numbers` workspace with four synchronized views:

1. **Evidence table:** reported values, uncertainty, confidence, and source crop
2. **Comparison matrix:** paper versus repository defaults versus reproduced runs
3. **Audit findings:** arithmetic, comparability, and statistical issues
4. **Lineage:** paper cell -> metric code -> config -> run -> normalized result -> claim

In the notebook, a number should open its evidence drawer. Agent comments may propose a corrected extraction or comparison, but applying it creates a new immutable version.

## MVP sequence

### Phase 1: reliable tables

- GROBID plus Table Transformer
- typed measurement schema
- metric registry
- deterministic arithmetic and comparison rules
- manual source-crop review

### Phase 2: repository and run linking

- AST/config/log trace
- result ingestion from JSON, CSV, TensorBoard, and MLflow
- paper/code/run comparison matrix

### Phase 3: charts, equations, and statistics

- DePlot/Nougat fallback
- chart-to-table confidence review
- domain statistical policies
- bootstrap intervals and robust aggregates where appropriate

### Phase 4: autonomous reproduction

- hardware-fit run planner
- local container and Modal execution
- tolerance-based reproduction judgment
- RO-Crate-compatible export

## Evaluation plan

Create a golden set of papers with author-provided raw tables and logs.

Measure independently:

- numeric cell exact accuracy
- table topology accuracy
- header-to-value relation accuracy
- metric identity accuracy
- paper-to-code link precision
- arithmetic issue precision/recall
- reproduction judgment agreement with expert review
- percentage of conclusions blocked correctly due to missing evidence

The last metric is important: a trustworthy system must be rewarded for refusing unsupported comparisons.
