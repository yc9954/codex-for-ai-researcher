import { describe, expect, it, vi } from "vitest";
import { architectureEquation, chooseDatasetPartition, codeLearningContextGaps, codexModelRoute, compactSymbolImplemented, connectorPromptInstructions, defaultConnectorConfig, downloadDatasetViewerRows, encodeEvidenceQuote, ensurePaperCitation, executionTargetCandidates, findArchitectureFigureCandidate, groundEvidenceQuote, groundEvidenceQuoteForClaim, groundEvidenceQuoteOnPages, hardwareAdaptationPlan, hasExecutableBaseline, hasGeneratedNotebookProvenance, hasUnsafeAutogradScalarWarning, isAllowedCompactScaleDimension, loadRequestedSkillInstructions, localRunnerPolicy, modalProfileContents, normalizeCitationPdfUrl, normalizePaperUrl, normalizeStoredDatasetPlan, paperGuideMarkdown, parseAppleDisplayProfile, parseDependencyManifest, parseDoi, parseGithubTreePage, parseLinuxMemAvailable, parseNvidiaSmiOutput, parseOpenReviewResponse, parseVmStatAvailableMemory, pdfExtractorWorkerPath, requestedSkillNames, resolveTargetDependencies, resourceAdaptationGaps, resourceFitRecommendation, selectModalGpu, selectPaperCoveragePages, selectRelevantPaperPages, selectedDatasetContractSource, selectedDatasetFit, structureReadme, trainingLifecycleGaps, validateRemoteUrl } from "../scripts/notebook-api";
import type { ConnectorConfig } from "../scripts/notebook-api";
import { normalizeLatexDelimiters, normalizePaperGuideMath } from "../src/markdown-math";
import { markdownImageUrl } from "../src/markdown-assets";
import { evidencePassageRange, normalizeLegacyEvidenceCitations, parseEvidenceCitation } from "../src/evidence-citation";
import { latestRunArtifacts } from "../src/run-artifacts";
import type { NotebookRun } from "../src/notebook-types";
import { readPdfTextContent } from "../src/pdf-text-content";
import type { PdfTextContent } from "../src/pdf-text-content";
import { normalizePaperGuideCitations } from "../src/paper-guide-markdown";

describe("GPT-5.6 model routing", () => {
  it("assigns quality-critical, interactive, and verified extraction workloads to distinct family members", () => {
    expect(codexModelRoute("notebook-authoring", {})).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "high" });
    expect(codexModelRoute("notebook-runtime-repair", {})).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "max" });
    expect(codexModelRoute("research-chat", {})).toMatchObject({ model: "gpt-5.6-terra", reasoningEffort: "medium" });
    expect(codexModelRoute("dataset-discovery", {})).toMatchObject({ model: "gpt-5.6-luna", reasoningEffort: "low" });
  });

  it("supports explicit family overrides without accepting shell-like model values", () => {
    expect(codexModelRoute("figure-reproduction", { ROSETTA_MODEL_SOL: "gpt-5.6-sol-snapshot" })).toMatchObject({ model: "gpt-5.6-sol-snapshot" });
    expect(codexModelRoute("figure-reproduction", { ROSETTA_MODEL_SOL: "gpt-5.6-sol; rm -rf /" })).toMatchObject({ model: "gpt-5.6-sol" });
  });
});

describe("PDF text stream compatibility", () => {
  it("reads PDF.js text chunks without requiring a ReadableStream async iterator", async () => {
    const chunks = [
      { items: [{ str: "first" }], styles: { f1: { fontFamily: "sans-serif", ascent: 0.8, descent: -0.2, vertical: false } }, lang: "en" },
      { items: [{ str: "second" }], styles: { f2: { fontFamily: "serif", ascent: 0.7, descent: -0.3, vertical: false } }, lang: null },
    ];
    let index = 0;
    let released = false;
    const page = {
      streamTextContent: () => ({
        getReader: () => ({
          read: async () => index < chunks.length ? { done: false as const, value: chunks[index++] } : { done: true as const, value: undefined },
          releaseLock: () => { released = true; },
        }),
      }) as unknown as ReadableStream<PdfTextContent>,
    };

    const content = await readPdfTextContent(page);
    expect(content.items).toHaveLength(2);
    expect(content.styles).toMatchObject({ f1: { fontFamily: "sans-serif" }, f2: { fontFamily: "serif" } });
    expect(content.lang).toBe("en");
    expect(released).toBe(true);
  });
});

describe("executable training lifecycle", () => {
  it("distinguishes unsafe autograd scalar conversion warnings from ordinary stderr", () => {
    expect(hasUnsafeAutogradScalarWarning("UserWarning: Converting a tensor with requires_grad=True to a scalar may lead to unexpected behavior.")).toBe(true);
    expect(hasUnsafeAutogradScalarWarning("Matplotlib is building the font cache")).toBe(false);
  });

  it("accepts ordinary and snake-case executable baseline identifiers", () => {
    expect(hasExecutableBaseline("baseline_model = DenseReference()")).toBe(true);
    expect(hasExecutableBaseline("baseline = DenseReference()")).toBe(true);
    expect(hasExecutableBaseline("reference_model = DenseReference()")).toBe(false);
  });

  it("accepts a bounded optimizer run with retained inference and merge evidence", () => {
    const source = `
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
training_loss_history = []
for step in range(40):
    optimizer.zero_grad()
    loss = model.loss(x, target)
    loss.backward()
    optimizer.step()
    training_loss_history.append(loss.item())
initial_train_loss = training_loss_history[0]
final_train_loss = training_loss_history[-1]
assert final_train_loss < initial_train_loss
model.eval()
with torch.no_grad():
    inference_output = model(x)
    merged_inference_output = model.merged(x)
assert torch.allclose(inference_output, merged_inference_output)
plt.savefig("training-curve.png")
Path("training-metrics.json").write_text(json.dumps({"loss": final_train_loss}))`;
    expect(trainingLifecycleGaps(source, true)).toEqual([]);
  });

  it("accepts a real optimizer imported directly from torch.optim", () => {
    const source = `from torch.optim import AdamW
optimizer = AdamW(model.parameters(), lr=0.01)
training_loss_history = []
for step in range(20):
    optimizer.zero_grad()
    loss = model.loss(x, target)
    loss.backward()
    optimizer.step()
    training_loss_history.append(loss.detach().item())
initial_train_loss = training_loss_history[0]
final_train_loss = training_loss_history[-1]
assert final_train_loss < initial_train_loss
with torch.no_grad():
    inference_output = model(x)
merged_inference_output = inference_output
assert torch.allclose(inference_output, merged_inference_output)
plt.savefig("training-curve.png")
Path("training-metrics.json").write_text(json.dumps({"loss": final_train_loss}))`;
    expect(trainingLifecycleGaps(source, true)).toEqual([]);
  });

  it("rejects a backward-only probe without optimization or inference", () => {
    const gaps = trainingLifecycleGaps("loss.backward()\nassert gradients_are_nonzero", true);
    expect(gaps).toContain("optimizer step");
    expect(gaps).toContain("inference_output");
    expect(gaps).toContain("merged_inference_output");
  });
});

describe("code-adjacent learning context", () => {
  const before = `## Learning objective\nUnderstand the low-rank update.\n\n## Paper-to-code map\nThe paper update maps to model.lora_A.\n\n## Prediction\nmerge_error should remain small.\n\n## Demo boundary\nThis uses a synthetic matrix instead of a Transformer benchmark.`;
  const after = `## How to read the result\nRead merge_error as the distance between paths.\n\n## What this establishes\nA small merge_error verifies local equivalence.\n\n## What this does not establish\nIt does not reproduce paper benchmark quality.\n\n## Takeaway\nA validated local invariant can isolate the mechanism.\n\n## Synthesis\nThe update is learned separately and can be merged.\n\n### Mental model\nTreat LoRA as a constrained weight update.\n\n### Practical use\nUse it when task-specific storage matters.\n\n### Failure modes\nInsufficient rank can underfit.\n\n### Scale-up checklist\nReplace synthetic data, model, metric, and compute budget.`;

  it("accepts explanation cells that frame and interpret a code probe", () => {
    expect(codeLearningContextGaps([
      { id: "before", kind: "markdown", source: before },
      { id: "probe", kind: "code", source: "merge_error = 0.0" },
      { id: "after", kind: "markdown", source: after },
    ], [{ cellId: "probe", codeSymbols: ["model.lora_A"], measuredValues: ["merge_error"] }])).toEqual([]);
  });

  it("rejects an isolated snippet and a generic explanation that names no result", () => {
    const gaps = codeLearningContextGaps([
      { id: "probe", kind: "code", source: "value = 1" },
      { id: "after", kind: "markdown", source: "## Takeaway\nIt worked." },
    ], [{ cellId: "probe", codeSymbols: ["value"], measuredValues: ["measured_value"] }]);
    expect(gaps).toContain("probe: preceding learning context");
    expect(gaps).toContain("probe: What this does not establish");
    expect(gaps).toContain("probe: result interpretation names no measured value");
    expect(gaps).toContain("notebook: Scale-up checklist");
  });
});

describe("hardware-aware compactification", () => {
  it("parses Apple and NVIDIA observations without claiming local-runner access", () => {
    expect(parseAppleDisplayProfile({ SPDisplaysDataType: [{ _name: "Apple M5", spdisplays_mtlgpufamilysupport: "metal4" }] }, "arm64")).toEqual([
      expect.objectContaining({ backend: "mps", name: "Apple M5", memoryKind: "unified", localRunnerAccess: false, detectedBy: "system_profiler" }),
    ]);
    expect(parseNvidiaSmiOutput("NVIDIA A100-SXM4-40GB, 40960, 590.12\n")).toEqual([
      expect.objectContaining({ backend: "cuda", name: "NVIDIA A100-SXM4-40GB", memoryBytes: 40960 * 1024 ** 2, driver: "590.12", localRunnerAccess: false }),
    ]);
  });

  it("derives conservative runner limits from both large and constrained machines", () => {
    const standard = localRunnerPolicy({ logicalCores: 12, memoryBytes: 32 * 1024 ** 3, freeMemoryBytes: 20 * 1024 ** 3 });
    expect(standard).toMatchObject({ backend: "cpu", cpus: 2, memoryDockerValue: "2048m", timeoutSeconds: 20 });
    const constrained = localRunnerPolicy({ logicalCores: 2, memoryBytes: 4 * 1024 ** 3, freeMemoryBytes: 2 * 1024 ** 3 });
    expect(constrained).toMatchObject({ cpus: 1, memoryDockerValue: "1024m" });
  });

  it("uses platform available-memory signals instead of macOS free pages alone", () => {
    const vmStat = `Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100.\nPages active: 900.\nPages inactive: 200.\nPages speculative: 50.`;
    expect(parseVmStatAvailableMemory(vmStat)).toBe(350 * 16384);
    expect(parseLinuxMemAvailable("MemTotal: 16000000 kB\nMemAvailable: 8000000 kB\n")).toBe(8000000 * 1024);
  });

  it("keeps a detected host GPU outside the CPU sandbox and carries dataset and repository constraints", () => {
    const accelerator = parseNvidiaSmiOutput("NVIDIA T4, 15360, 590.12");
    const plan = hardwareAdaptationPlan({
      platform: "linux", arch: "x64", logicalCores: 8, memoryBytes: 16 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3,
      freeDiskBytes: 100 * 1024 ** 3, accelerators: accelerator,
    }, {
      status: "analyzed", sourceFileCount: 2, symbolCount: 4,
      issues: [{ kind: "device", severity: "warning", evidence: "torch.cuda assumption", path: "train.py" }],
    }, {
      candidates: [{ fit: { mode: "subset", recommendedRows: 1200, rationale: "Full data exceeds the memory budget." } }],
    });
    expect(plan).toMatchObject({
      tier: "standard",
      executionTarget: { backend: "cpu", cpus: 2 },
      dataset: { mode: "synthetic-proxy", recommendedRows: null, source: "dataset-plan" },
      repositoryRisks: [{ kind: "device", path: "train.py" }],
    });
    expect(plan.executionTarget.reason).toContain("CPU-only");
  });

  it("reports local accelerator and Modal readiness separately", () => {
    const accelerator = parseAppleDisplayProfile({ SPDisplaysDataType: [{ _name: "Apple M5", spdisplays_mtlgpufamilysupport: "metal4" }] });
    expect(executionTargetCandidates({ accelerators: accelerator, runnerImageReady: true }, true)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "local-cpu", status: "ready", validation: true }),
      expect.objectContaining({ id: "local-mps", status: "runtime-required", validation: false }),
      expect.objectContaining({ id: "modal-auto", status: "ready", backend: "cuda" }),
    ]));
  });

  it("resolves repository constraints independently for CPU, MPS, and Modal", () => {
    expect(resolveTargetDependencies(["torch==1.7.0", "numpy", "apex==0.1"], "mps")).toEqual(expect.arrayContaining([
      expect.objectContaining({ dependency: "torch", localCpu: expect.objectContaining({ decision: "replace", resolved: "torch==2.13.0" }), localAccelerator: expect.objectContaining({ backend: "mps", decision: "replace" }), modalCuda: expect.objectContaining({ decision: "replace", resolved: "torch==2.13.0" }) }),
      expect.objectContaining({ dependency: "numpy", localCpu: expect.objectContaining({ decision: "keep" }), modalCuda: expect.objectContaining({ decision: "keep" }) }),
      expect.objectContaining({ dependency: "apex", localCpu: expect.objectContaining({ decision: "blocked" }), modalCuda: expect.objectContaining({ decision: "blocked" }) }),
    ]));
  });

  it("rejects generated code that exceeds the plan or silently targets a host accelerator", () => {
    const plan = hardwareAdaptationPlan({ platform: "darwin", arch: "arm64", logicalCores: 2, memoryBytes: 4 * 1024 ** 3, freeMemoryBytes: 2 * 1024 ** 3 });
    const boundary = "## Learning objective\nTest the update.\n## Paper-to-code map\nMap the update.\n## Prediction\nLoss falls.\n## Demo boundary\nRun a synthetic batch on CPU with reduced optimizer steps.";
    expect(resourceAdaptationGaps([
      { id: "boundary", kind: "markdown", source: boundary },
      { id: "probe", kind: "code", source: "batch_size = 64\nnum_steps = 400\ndevice = 'cuda'" },
    ], plan)).toEqual(expect.arrayContaining([
      expect.stringContaining("accelerator"),
      expect.stringContaining("batch size 64"),
      expect.stringContaining("optimizer steps 400"),
    ]));
  });

  it("accepts one guarded PyTorch program across CPU, MPS, and CUDA targets", () => {
    const plan = hardwareAdaptationPlan({ platform: "darwin", arch: "arm64", logicalCores: 10, memoryBytes: 16 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3 });
    const boundary = "## Demo boundary\nRun a synthetic tensor with a reduced batch and optimizer-step count.";
    const source = `import os\nimport torch\nrequested = os.environ.get("CODEX_RESEARCH_DEVICE", "cpu")\nif requested == "cuda" and torch.cuda.is_available():\n    execution_device = torch.device("cuda")\nelif requested == "mps" and torch.backends.mps.is_available():\n    execution_device = torch.device("mps")\nelse:\n    execution_device = torch.device("cpu")\nx = torch.ones(4, device=execution_device)\nassert x.sum().item() == 4`;
    expect(resourceAdaptationGaps([{ id: "boundary", kind: "markdown", source: boundary }, { id: "probe", kind: "code", source }], plan)).toEqual([]);
  });

  it("installs a deterministic read-only data contract for an attached dataset", () => {
    const basePlan = hardwareAdaptationPlan({ platform: "darwin", arch: "arm64", logicalCores: 10, memoryBytes: 16 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3 });
    const plan = {
      ...basePlan,
      dataset: {
        ...basePlan.dataset,
        mode: "subset" as const,
        recommendedRows: 24,
        hubId: "org/example-data",
        revision: "a".repeat(40),
        localPath: "datasets/study/data.jsonl",
        sha256: "b".repeat(64),
      },
    };
    const source = selectedDatasetContractSource(plan);
    expect(source).toContain('os.environ["ROSETTA_DATASET_PATH"]');
    expect(source).toContain("json.loads(line)");
    expect(source).toContain("hashlib.sha256");
    expect(resourceAdaptationGaps([
      { id: "boundary", kind: "markdown", source: "## Demo boundary\nUse a bounded dataset subset." },
      { id: "dataset-contract", kind: "code", source: source! },
    ], plan)).not.toContain("selected dataset is not loaded from the read-only ROSETTA_DATASET_PATH JSONL contract");
  });

  it("recognizes scale-only shape aliases without admitting semantic changes", () => {
    const allowed = ["dataset rows", "batch size", "tensor width", "layer count", "optimizer steps", "rank"];
    expect(isAllowedCompactScaleDimension("dense-layer shape", allowed)).toBe(true);
    expect(isAllowedCompactScaleDimension("hidden dimension", allowed)).toBe(true);
    expect(isAllowedCompactScaleDimension("optimization duration", allowed)).toBe(true);
    expect(isAllowedCompactScaleDimension("attention operation", allowed)).toBe(false);
    expect(isAllowedCompactScaleDimension("loss definition", allowed)).toBe(false);
  });

  it("accepts a qualified compact symbol when its class and method are both executable", () => {
    const source = "class CompactLoRALinear:\n    def merged_weight(self):\n        return self.weight";
    expect(compactSymbolImplemented("CompactLoRALinear.merged_weight", source)).toBe(true);
    expect(compactSymbolImplemented("CompactLoRALinear.not_present", source)).toBe(false);
  });
});

describe("Modal target selection", () => {
  const notebook = (source: string) => ({ cells: [{ id: "probe", kind: "code" as const, source, executionCount: null, runStatus: "idle" as const }] });

  it("selects the lowest-rate compatible GPU for an ordinary compact demo", () => {
    expect(selectModalGpu(notebook("import torch\nx = torch.ones(4)"), "auto")).toMatchObject({ requestedGpu: "auto", gpu: "T4", minimumGpuMemoryGiB: 1 });
  });

  it("avoids T4 for modern dtypes and honors a declared memory estimate", () => {
    expect(selectModalGpu(notebook("import torch\nx = torch.ones(4, dtype=torch.bfloat16)"), "auto")).toMatchObject({ gpu: "L4", minimumGpuMemoryGiB: 17 });
    expect(selectModalGpu(notebook("required_gpu_memory_gib = 70"), "auto")).toMatchObject({ gpu: "A100-80GB", minimumGpuMemoryGiB: 70 });
  });
});

describe("run artifact retention", () => {
  it("keeps the newest file once and attributes it to the cell that changed it", () => {
    const run = (runId: string, createdAt: string, targetCellId: string, sha256: string): NotebookRun => ({
      runId, parentRunId: null, targetCellId, status: "passed", image: "runner", imageDigest: "image", codeHash: "code", createdAt, durationMs: 1,
      artifacts: ["paper-architecture.png", "paper-architecture.json"],
      artifactRecords: { "paper-architecture.png": { sha256 }, "paper-architecture.json": { sha256: `${sha256}-json` } },
      cells: [
        { id: "architecture-diagram", status: "passed", stdout: "", stderr: "", durationMs: 1, artifacts: ["paper-architecture.png", "paper-architecture.json"] },
        { id: targetCellId, status: "passed", stdout: "", stderr: "", durationMs: 1, artifacts: [] },
      ],
    });
    const retained = latestRunArtifacts([
      run("older", "2026-07-21T01:00:00.000Z", "code-mechanism", "old"),
      run("newer", "2026-07-21T02:00:00.000Z", "code-faded", "new"),
    ]);
    expect(retained).toHaveLength(2);
    expect(retained.map(({ path, run: ownerRun, cellId }) => ({ path, runId: ownerRun.runId, cellId }))).toEqual([
      { path: "paper-architecture.png", runId: "newer", cellId: "architecture-diagram" },
      { path: "paper-architecture.json", runId: "newer", cellId: "architecture-diagram" },
    ]);
  });
});

describe("paper intake boundaries", () => {
  it("selects original architecture figures without misclassifying result plots", () => {
    expect(findArchitectureFigureCandidate([
      "Figure 1: Our reparametriza- tion. We only train A and B. Main text follows.",
      "Figure 2: Validation accuracy vs. training steps.",
    ])).toMatchObject({ page: 1, figureNumber: "1", kind: "mechanism", caption: "Figure 1: Our reparametriza- tion." });
    expect(findArchitectureFigureCandidate([
      "Cover",
      "Background",
      "Figure 1: The Transformer - model architecture. The Transformer follows this overall architecture using stacked self-attention.",
    ])).toMatchObject({ page: 3, figureNumber: "1", kind: "architecture" });
    expect(findArchitectureFigureCandidate([
      "Figure 1. The test accuracy of the network trained with and without Batch Normalization, vs. the number of training steps.",
      "Figure 2. Single crop validation accuracy of Inception and its batch-normalized variants.",
    ])).toBeNull();
    expect(findArchitectureFigureCandidate([
      "Figure 1: A schematic comparison of BART with BERT and GPT.",
    ])).toMatchObject({ page: 1, figureNumber: "1", kind: "architecture" });
  });

  it("turns legacy page labels into descriptive evidence links and locates their passages", () => {
    const legacy = `## Core mechanism

Low-rank factors preserve a small trainable update while the pretrained matrix stays frozen.

- **Paper evidence:** PDF p. 6, PDF p. 8`;
    const normalized = normalizeLegacyEvidenceCitations(legacy);
    expect(normalized).not.toContain("PDF p.");
    expect(normalized).toContain("[Low-rank factors preserve a small trainable update while the pretrained matrix stays frozen.](/evidence/pdf?page=6");
    expect(normalized).toContain("Additional evidence for Low-rank factors");

    const parsed = parseEvidenceCitation("/evidence/pdf?page=6&quote=the%20pretrained%20weight%20is%20frozen", "The pretrained weight remains frozen");
    expect(parsed).toEqual({ page: 6, label: "The pretrained weight remains frozen", quote: "the pretrained weight is frozen" });

    const pageText = "The pretrained weight is\nfrozen while the low-rank factors receive gradients. A separate result follows.";
    const exact = evidencePassageRange(pageText, "the pretrained weight is frozen");
    expect(exact && pageText.slice(exact.start, exact.end).replace(/\s+/g, " ")).toBe("The pretrained weight is frozen");
    const inferred = evidencePassageRange(pageText, undefined, "low-rank factors receive gradients");
    expect(inferred && pageText.slice(inferred.start, inferred.end)).toContain("low-rank factors receive gradients");
  });

  it("canonicalizes only high-confidence PDF extraction variants to exact source text", () => {
    const page = "The training process can be paral- lelized significantly because self attention removes sequential recurrence. A different claim follows later.";
    expect(groundEvidenceQuote(page, "The training process can be parallelized significantly because self-attention removes sequential recurrence.")).toBe(
      "The training process can be paral- lelized significantly because self attention removes sequential recurrence.",
    );
    expect(groundEvidenceQuote(page, "The model always improves accuracy on every benchmark without additional computation or memory cost.")).toBeNull();
    expect(groundEvidenceQuoteOnPages(["Cover page", page, "References"], 3, "The training process can be parallelized significantly because self-attention removes sequential recurrence.")).toEqual({
      page: 2,
      quote: "The training process can be paral- lelized significantly because self attention removes sequential recurrence.",
    });
    expect(groundEvidenceQuote(page, "self attention removes sequential recurrence.")).toBe("because self attention removes sequential recurrence. A different");
    const longPage = Array.from({ length: 40 }, (_, index) => `word${index + 1}`).join(" ");
    expect(groundEvidenceQuote(longPage, longPage)?.split(" ")).toHaveLength(30);
  });

  it("recovers a nearby exact passage for a grounded paraphrase but rejects unrelated or numerically different evidence", () => {
    const pages = [
      "Background material with no discussion of normalization parameters.",
      "The normalized activations are subsequently transformed by learned scale and shift parameters before they are supplied as inputs to the next network layer. The transformation preserves representation capacity.",
    ];
    expect(groundEvidenceQuoteForClaim(
      pages,
      2,
      "The scaled and shifted values are passed to other network layers.",
      "Learned scale and shift parameters transform normalized activations before the next layer.",
    )).toMatchObject({ page: 2, quote: expect.stringContaining("learned scale and shift parameters") });
    expect(groundEvidenceQuoteForClaim(pages, 2, "The optimizer uses a momentum schedule for every parameter.", "Momentum optimization schedule")).toBeNull();
    expect(groundEvidenceQuoteForClaim(pages, 2, "The method uses exactly 64 learned scale parameters.", "64 parameters")).toBeNull();
  });

  it("adds a missing flow-grounded citation once and encodes Markdown-sensitive quote characters", () => {
    const quote = "scaled attention (with masking) preserves the paper's autoregressive training constraint across every decoder position";
    const encoded = encodeEvidenceQuote(quote);
    expect(encoded).not.toMatch(/[()']/);
    const source = "## Faded completion\n\nFill in the masked attention term, then explain its effect.";
    const grounded = ensurePaperCitation(source, { page: 5, quote }, "Grounding for mechanism: masked self-attention");
    expect(grounded).toContain("**Paper grounding.**");
    expect(grounded).toContain(`/evidence/pdf?page=5&quote=${encoded}`);
    expect(ensurePaperCitation(grounded, { page: 6, quote: "a different exact source passage with enough words for an evidence citation" }, "Other")).toBe(grounded);
  });

  it("normalizes raw and URL DOI values without following publisher redirects", () => {
    expect(parseDoi("10.1145/3292500.3330701")).toBe("10.1145/3292500.3330701");
    expect(parseDoi("https://doi.org/10.1145%2F3292500.3330701")).toBe("10.1145/3292500.3330701");
    expect(parseDoi("not-a-doi")).toBeNull();
  });

  it("turns arXiv PDF links into inspectable abstract pages", () => {
    expect(normalizePaperUrl("http://arxiv.org/pdf/2106.09685.pdf#page=2").toString()).toBe("https://arxiv.org/abs/2106.09685");
  });

  it("upgrades legacy HTTP citation PDF metadata only inside the paper allowlist", () => {
    expect(normalizeCitationPdfUrl("http://proceedings.mlr.press/v37/ioffe15.pdf", new URL("https://proceedings.mlr.press/v37/ioffe15.html"))).toBe("https://proceedings.mlr.press/v37/ioffe15.pdf");
    expect(normalizeCitationPdfUrl("http://example.com/paper.pdf", new URL("https://proceedings.mlr.press/v37/ioffe15.html"))).toBe("http://example.com/paper.pdf");
  });

  it("rejects arbitrary and local paper hosts", () => {
    expect(() => normalizePaperUrl("https://example.com/paper")).toThrow("Unsupported paper host");
    expect(() => normalizePaperUrl("http://127.0.0.1/paper")).toThrow("Unsupported paper host");
    expect(() => normalizePaperUrl("file:///tmp/paper.pdf")).toThrow("Paper links must use HTTP or HTTPS");
  });

  it("parses current and legacy OpenReview note content without scraping forum HTML", () => {
    const url = new URL("https://openreview.net/forum?id=Paper_123");
    expect(parseOpenReviewResponse({ notes: [{
      id: "Paper_123",
      forum: "Paper_123",
      content: {
        title: { value: "A Grounded Paper" },
        authors: { value: ["Ada Researcher", "Lin Engineer"] },
        abstract: { value: "A testable abstract." },
        pdf: { value: "/pdf?id=Paper_123" },
      },
    }] }, url, "Paper_123")).toMatchObject({
      source: "openreview",
      identifier: "Paper_123",
      title: "A Grounded Paper",
      authors: ["Ada Researcher", "Lin Engineer"],
      abstract: "A testable abstract.",
      pdfUrl: "https://openreview.net/pdf?id=Paper_123",
    });
    expect(parseOpenReviewResponse([{ id: "Paper_123", forum: "Paper_123", content: { title: "Legacy title", authors: ["A. Author"] } }], url, "Paper_123")?.title).toBe("Legacy title");
  });

  it("does not treat an OpenReview verification page as paper metadata", () => {
    const url = new URL("https://openreview.net/forum?id=Paper_123");
    expect(parseOpenReviewResponse({ notes: [{ id: "Paper_123", forum: "Paper_123", content: { title: { value: "Verifying your browser | OpenReview" } } }] }, url, "Paper_123")).toBeNull();
  });

  it("keeps redirects inside an explicit HTTPS host boundary", () => {
    const githubOnly = new Set(["api.github.com"]);
    expect(validateRemoteUrl("https://api.github.com/repos/openai/openai-python", githubOnly).hostname).toBe("api.github.com");
    expect(() => validateRemoteUrl("https://example.com/redirect", githubOnly)).toThrow("redirect host is not allowed");
    expect(() => validateRemoteUrl("http://api.github.com/redirect", githubOnly)).toThrow("credential-free HTTPS");
    expect(() => validateRemoteUrl("https://token@api.github.com/redirect", githubOnly)).toThrow("credential-free HTTPS");
    expect(() => validateRemoteUrl("https://api.github.com:444/redirect", githubOnly)).toThrow("standard ports");
  });

  it("turns README markdown into bounded semantic sections", () => {
    const sections = structureReadme(`# Example project\n\n[![build](badge.svg)](ci.example)\n\nThis **repository** contains the reference implementation.<br>Paper: https://arxiv.org/abs/1234.5678\n\n## Install\n\n- Create an environment\n- Run \`pip install -e .\``);
    expect(sections).toEqual([
      {
        title: "Example project",
        paragraphs: ["This repository contains the reference implementation.", "Paper: https://arxiv.org/abs/1234.5678"],
        bullets: [],
      },
      {
        title: "Install",
        paragraphs: [],
        bullets: ["Create an environment", "Run pip install -e ."],
      },
    ]);
  });

  it("selects the first page plus pages grounded in the research question", () => {
    const selected = selectRelevantPaperPages([
      "Title and abstract for an unrelated method.",
      "Optimization details and learning-rate schedule.",
      "Low-rank matrices use rank decomposition for adaptation.",
      "Ablation results compare rank values and parameter counts.",
    ], "How does rank decomposition affect the parameter count?", 3);
    expect(selected.map(({ page }) => page)).toEqual([1, 3, 4]);
    expect(selected[1].text).toContain("rank decomposition");
  });

  it("covers definitions, method, evaluation, results, and conclusions across a paper", () => {
    const selected = selectPaperCoveragePages([
      "Abstract and introduction: the central research problem.",
      "Background and definitions introduce the latent variable notation.",
      "Method and algorithm specify the training objective.",
      "Implementation details continue the method.",
      "Experiments describe datasets, baselines, and evaluation metrics.",
      "Results and ablation analysis compare model variants.",
      "Discussion, limitations, and conclusion delimit the findings.",
    ], "central objective model results", 6);
    expect(selected.map(({ page }) => page)).toEqual(expect.arrayContaining([1, 2, 3, 5, 6, 7]));
  });

  it("renders a self-contained paper guide with exact navigable evidence", () => {
    const evidence = [{ page: 2, quote: "the method freezes the original parameters and trains only compact low rank factors" }];
    const markdown = paperGuideMarkdown({
      thesis: { summary: "The method constrains task adaptation to a compact update.", significance: "It lowers the trainable parameter and storage cost.", evidence },
      definitions: [
        { term: "Rank", kind: "prerequisite", definition: "The dimension of the update subspace.", whyItMatters: "It controls adaptation capacity.", evidence },
        { term: "Frozen weight", kind: "paper-defined", definition: "A pretrained matrix excluded from optimization.", whyItMatters: "It preserves the base model.", evidence },
        { term: "Low-rank update", kind: "paper-defined", definition: "A product of two smaller trainable matrices.", whyItMatters: "It replaces a dense update.", evidence },
      ],
      contributions: [
        { title: "Compact parameterization", explanation: "The paper changes which parameters are optimized.", evidence },
        { title: "Deployment reuse", explanation: "The paper separates reusable base weights from task updates.", evidence },
      ],
      method: [
        { step: "Freeze", explanation: "Keep the pretrained matrix constant.", evidence },
        { step: "Factor", explanation: "Represent the update with two small matrices.", evidence },
        { step: "Merge", explanation: "Add the learned update for inference.", evidence },
      ],
      evaluation: { setup: "Compare adaptation strategies under matched models.", datasetsAndBaselines: "Use reported tasks and full fine-tuning baselines.", metrics: "Compare task quality and parameter counts.", evidence },
      keyResults: [
        { result: "Task quality remains competitive.", interpretation: "The constrained update retains useful adaptation capacity.", evidence },
        { result: "Trainable parameters decrease.", interpretation: "The factorization changes resource requirements.", evidence },
      ],
      limitations: [{ limitation: "The compact demo does not rerun full benchmarks.", consequence: "It verifies the mechanism but not the reported metric.", basis: "inferred", evidence }],
      practicalLessons: [
        { lesson: "Constrain the update when task storage dominates.", application: "Use compact updates for many task variants.", boundary: "Validate rank sufficiency on the real task.", basis: "inferred", evidence },
        { lesson: "Test merge equivalence before deployment.", application: "Compare merged and unmerged outputs numerically.", boundary: "A toy matrix does not establish production quality.", basis: "inferred", evidence },
      ],
    });
    expect(markdown).toContain("# Paper guide");
    expect(markdown).toContain("## Definitions you need");
    expect(markdown).toContain("## Decisive results and their meaning");
    expect(markdown).toContain("## Practical lessons");
    expect(markdown).toContain("/evidence/pdf?page=2&quote=");
    expect(markdown).toContain("> **Prerequisite**");
    expect(markdown).toContain("- **Reported result**");
    expect(markdown).not.toContain("Additional source for");
    expect(markdown).not.toMatch(/\n\n\[[^\]]+\]\(\/evidence\/pdf[^\n]+\)(?:;|\n|$)/);
    expect(markdown).not.toContain("PDF p.");
  });

  it("moves legacy standalone guide citations onto the supported prose", () => {
    const href = "/evidence/pdf?page=2&quote=the%20method%20freezes%20the%20original%20parameters%20and%20trains%20compact%20factors";
    const normalized = normalizePaperGuideCitations(`# Paper guide

## Central thesis

The method freezes the base model. It learns a compact task update.

**Why it matters.** Storage scales with the update rather than the model.

[The method freezes the base model...](${href}); [Additional source for The method learns a compact update...](${href})`);
    expect(normalized).not.toContain("Additional source for");
    expect(normalized).toContain(`[The method freezes the base model.](${href})`);
    expect(normalized).toContain(`[It learns a compact task update.](${href})`);
    expect(normalized).toContain("> **Thesis**");
    expect(normalized).toContain("> **Why it matters**");
    expect(normalized).toContain("> Storage scales with the update rather than the model.");
  });

  it("parses structured dependency manifests without executing repository code", () => {
    expect(parseDependencyManifest("pyproject.toml", `[project]\ndependencies = ["torch>=2", "numpy"]\n[project.optional-dependencies]\ntest = ["pytest"]`).dependencies).toEqual(["torch>=2", "numpy", "pytest"]);
    expect(parseDependencyManifest("environment.yml", `dependencies:\n  - python=3.11\n  - pip:\n      - transformers==4.40`).dependencies).toEqual(["python=3.11", "pip:transformers==4.40"]);
    expect(parseDependencyManifest("package.json", JSON.stringify({ dependencies: { react: "19.0.0" } })).dependencies).toEqual(["react@19.0.0"]);
  });

  it("selects full or bounded-subset dataset modes from measured byte budgets", () => {
    const budget = { freeMemoryBytes: 16 * 1024 ** 3, freeDiskBytes: 100 * 1024 ** 3 };
    expect(resourceFitRecommendation({ originalBytes: 32 * 1024 ** 2, memoryBytes: 64 * 1024 ** 2, rows: 800 }, budget)).toMatchObject({ mode: "full", recommendedRows: 800 });
    expect(resourceFitRecommendation({ originalBytes: 1024 ** 3, memoryBytes: 2 * 1024 ** 3, rows: 10_000 }, budget)).toMatchObject({ mode: "subset", recommendedRows: 1_000 });
    const subset = resourceFitRecommendation({ originalBytes: 80 * 1024 ** 3, memoryBytes: 32 * 1024 ** 3, rows: 1_000_000 }, budget);
    expect(subset.mode).toBe("subset");
    expect(subset.recommendedRows).toBeGreaterThan(0);
    expect(subset.recommendedRows).toBeLessThan(1_000_000);
  });

  it("opens legacy dataset plans without claiming missing evidence or identity scores", () => {
    const normalized = normalizeStoredDatasetPlan({
      schemaVersion: "1.0",
      studyId: "study-legacy",
      hardware: { freeMemoryBytes: 1024, freeDiskBytes: 2048, logicalCores: 8, platform: "darwin", arch: "arm64" },
      candidates: [{
        name: "ILSVRC2012",
        searchQuery: "ILSVRC2012",
        role: "Evaluation benchmark",
        paperPages: [1, 6],
        verification: "huggingface-live",
        hub: { id: "mirror/ILSVRC2012", url: "https://huggingface.co/datasets/mirror/ILSVRC2012", revision: "abc", size: null },
        fit: { mode: "inspect", recommendedRows: null, rationale: "Size unavailable" },
      }],
    });
    const candidate = (normalized.candidates as Array<Record<string, unknown>>)[0];
    expect(normalized).toMatchObject({ schemaVersion: "1.2", stale: true });
    expect(candidate).toMatchObject({
      evidence: [],
      split: "Not retained in this legacy plan",
      preprocessing: "Not retained in this legacy plan",
      verification: "registry-name-match",
    });
    expect(candidate.hub).toMatchObject({ identityScore: null });
  });

  it("extracts repository paths from a public GitHub tree page without trusting unrelated links", () => {
    const parsed = parseGithubTreePage(`
      <a href="/microsoft/LoRA/tree/abc123/loralib">library</a>
      <a href="/microsoft/LoRA/blob/abc123/loralib/layers.py">layers</a>
      <a href="/other/repo/blob/abc123/steal.py">other</a>
      <a href="https://example.com/microsoft/LoRA/blob/abc123/no.py">external</a>
    `, "microsoft", "LoRA", "abc123");
    expect(parsed).toEqual({ directories: ["loralib"], files: ["loralib/layers.py"] });
  });

  it("resolves the PDF worker from the active Rosetta runtime root", () => {
    expect(pdfExtractorWorkerPath("/Applications/Rosetta.app/Contents/Resources/app-runtime")).toBe("/Applications/Rosetta.app/Contents/Resources/app-runtime/scripts/pdf-extractor-worker.mjs");
  });

  it("chooses the paper split and default config for a viewer-backed dataset", () => {
    expect(chooseDatasetPartition([
      { config: "alternate", split: "train" },
      { config: "default", split: "train" },
      { config: "default", split: "validation" },
    ], "training split")).toEqual({ config: "default", split: "train" });
  });

  it("uses an attached dataset instead of silently falling back to synthetic data", () => {
    expect(selectedDatasetFit({ selection: {
      status: "ready", hubId: "owner/data", revision: "abc", config: "default", split: "train", mode: "subset",
      rowCount: 128, sizeBytes: 4096, sha256: "a".repeat(64), localPath: "datasets/study/key/data.jsonl",
    } })).toMatchObject({ mode: "subset", recommendedRows: 128, hubId: "owner/data", localPath: "datasets/study/key/data.jsonl" });
  });

  it("downloads a bounded viewer sample as deterministic JSONL", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset"));
      const length = Number(url.searchParams.get("length"));
      const rows = Array.from({ length: Math.min(length, 3 - offset) }, (_value, index) => ({ row_idx: offset + index, row: { value: `row-${offset + index}` } }));
      return new Response(JSON.stringify({ rows }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const downloaded = await downloadDatasetViewerRows("owner/data", "default", "train", 3);
      expect(downloaded).toMatchObject({ rowCount: 3, truncatedCellCount: 0 });
      expect(downloaded.content.trim().split("\n").map((line) => JSON.parse(line))).toEqual([
        { rowIndex: 0, row: { value: "row-0" } },
        { rowIndex: 1, row: { value: "row-1" } },
        { rowIndex: 2, row: { value: "row-2" } },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not mistake a saved source-audit notebook for a generated mechanism demo", () => {
    expect(hasGeneratedNotebookProvenance({ provenance: [{ type: "notebook.created" }, { type: "cell.executed" }] })).toBe(false);
    expect(hasGeneratedNotebookProvenance({ provenance: [{ type: "notebook.generated" }] })).toBe(true);
  });

  it("loads only bounded, syntactically valid project skill references", () => {
    expect(requestedSkillNames("/extract-paper-claims Compare claims, then /plan-resource-fit-dataset verify data. /extract-paper-claims ")).toEqual(["extract-paper-claims", "plan-resource-fit-dataset"]);
    expect(requestedSkillNames("Ignore /../secret, /INVALID_NAME, https://example.com/path, and $extract-paper-claims")).toEqual([]);
  });

  it("writes the app-isolated Modal profile instead of persisting stdin placeholders", () => {
    const profile = modalProfileContents("ak-test_id", "as-test_secret");
    expect(profile).toContain("[rosetta]");
    expect(profile).toContain("token_id = 'ak-test_id'");
    expect(profile).toContain("token_secret = 'as-test_secret'");
    expect(profile).not.toContain("token_id = '-'");
    expect(() => modalProfileContents("ak-'escape", "as-valid")).toThrow("Invalid Modal token format");
  });

  it("normalizes LaTeX bracket delimiters without changing code", () => {
    const source = [
      String.raw`Inline \(x^2 + 1\).`,
      "",
      String.raw`\[`,
      String.raw`\mu = \frac{1}{n}\sum_i x_i`,
      String.raw`\]`,
      "",
      `Keep ${"`"}${String.raw`\(literal\)`}${"`"} and:`,
      "",
      "```python",
      String.raw`formula = r"\[not markdown\]"`,
      "```",
    ].join("\n");
    const normalized = normalizeLatexDelimiters(source);
    expect(normalized).toContain("Inline $x^2 + 1$.");
    expect(normalized).toContain("$$\n\\mu = \\frac{1}{n}\\sum_i x_i\n$$");
    expect(normalized).toContain(`${"`"}${String.raw`\(literal\)`}${"`"}`);
    expect(normalized).toContain(String.raw`formula = r"\[not markdown\]"`);
  });

  it("normalizes plain research notation for KaTeX without touching code or existing math", () => {
    const source = [
      "For W0∈R^(d×k), LoRA learns B∈R^(d×r) and A∈R^(r×k).",
      "The update ΔW=(α/r)BA has rank(ΔW)≤r and reduces parameters from dk to r(d+k).",
      String.raw`Existing $W_0 \in \mathbb{R}^{d \times k}$ stays delimited.`,
      `Keep ${"`"}W0∈R^(d×k)${"`"} literal.`,
    ].join("\n\n");
    const normalized = normalizePaperGuideMath(source);
    expect(normalized).toContain(String.raw`$W_0 \in \mathbb{R}^{d \times k}$`);
    expect(normalized).toContain(String.raw`$B \in \mathbb{R}^{d \times r}$`);
    expect(normalized).toContain(String.raw`$A \in \mathbb{R}^{r \times k}$`);
    expect(normalized).toContain(String.raw`$\Delta W = \frac{\alpha}{r}BA$`);
    expect(normalized).toContain(String.raw`$\operatorname{rank}(\Delta W) \le r$`);
    expect(normalized).toContain(String.raw`from $dk$ to $r(d+k)$`);
    expect(normalized.match(/\$W_0 \\in \\mathbb\{R\}\^\{d \\times k\}\$/g)).toHaveLength(2);
    expect(normalized).toContain(`${"`"}W0∈R^(d×k)${"`"}`);
  });

  it("normalizes generated architecture notation into KaTeX-safe equations", () => {
    expect(architectureEquation("ŷ = W0x + (α/r)BAx, W0 in R^(d×k)")).toBe("\\hat{y} = W_{0}x + (\\alpha /r)BAx, W_{0} \\in \\mathbb{R}^{d\\times k}");
    expect(architectureEquation("rank(ΔWfull) ≤ r")).toBe("\\operatorname{rank}(\\Delta W_{\\mathrm{full}}) \\le r");
    expect(architectureEquation("ε > 0")).toBe("\\varepsilon > 0");
    expect(architectureEquation("σ_B² = (1/m) sum_i (x_i - μ_B)^2")).toBe("\\sigma _{B}^{2} = (1/m) \\sum_{i} (x_{i} - \\mu _{B})^2");
    expect(architectureEquation("y = γ (x - μ_pop)/sqrt(σ_pop² + ε) + β")).toBe("y = \\gamma (x - \\mu _{\\mathrm{pop}})/\\sqrt{\\sigma _{\\mathrm{pop}}^{2} + \\varepsilon } + \\beta");
  });

  it("maps persisted local run figures to the manifest-checked HTTP endpoint", () => {
    expect(markdownImageUrl("/Users/research/.rosetta/runs/run-20260720-abc123/paper-values.png")).toBe("/api/runs/run-20260720-abc123/artifacts/paper-values.png");
    expect(markdownImageUrl("/tmp/runs/run-safe/../secret.png")).toBe("/tmp/runs/run-safe/../secret.png");
    expect(markdownImageUrl("/tmp/runs/run-safe/metrics.json")).toBe("/tmp/runs/run-safe/metrics.json");
  });

  it("injects an explicitly requested trusted skill and ignores missing skills", async () => {
    const instructions = await loadRequestedSkillInstructions("/extract-paper-claims use this evidence. /does-not-exist ignore this.");
    expect(instructions).toContain("Trusted project skill: extract-paper-claims");
    expect(instructions).toContain("Build a traceable claim graph");
    expect(instructions).not.toContain("does-not-exist ---");
  });

  it("selects enabled custom agents and only hooks for the active Codex surface", () => {
    const createdAt = new Date().toISOString();
    const config: ConnectorConfig = {
      schemaVersion: "1.0",
      updatedAt: createdAt,
      agents: [{ id: "agent-reviewer", name: "Evidence reviewer", command: "evidence-reviewer", description: "Reviews evidence", instructions: "Separate paper claims from measured local observations.", enabled: true, createdAt, updatedAt: createdAt }],
      skills: [{ id: "skill-learning-pass", name: "Learning pass", command: "learning-pass", description: "Structures a learning pass", instructions: "Require a prediction, a minimal probe, a self-explanation, and a transfer question.", enabled: true, createdAt, updatedAt: createdAt }],
      hooks: [
        { id: "hook-chat", name: "Chat citation gate", event: "chat.before", instructions: "Require PDF page citations for numeric claims.", enabled: true, createdAt, updatedAt: createdAt },
        { id: "hook-figure", name: "Figure gate", event: "figure.generate.before", instructions: "Preserve every printed numeric token.", enabled: true, createdAt, updatedAt: createdAt },
      ],
    };
    const instructions = connectorPromptInstructions(config, "/learning-pass inspect this result", "chat.before", "agent-reviewer");
    expect(instructions).toContain("Local custom agent: evidence-reviewer");
    expect(instructions).toContain("Local custom skill: /learning-pass");
    expect(instructions).toContain("Chat citation gate");
    expect(instructions).not.toContain("Figure gate");
    expect(connectorPromptInstructions(config, "ordinary question", "notebook.review.before")).toContain("No enabled local connector");
  });

  it("installs default research agents and routes each automatic hook to its own surface", () => {
    const defaults = defaultConnectorConfig();
    expect(defaults.agents.map((agent) => agent.command)).toEqual([
      "mechanism-tutor",
      "repro-auditor",
      "results-analyst",
    ]);
    expect(defaults.hooks.map((hook) => hook.event)).toEqual([
      "chat.before",
      "notebook.generate.before",
      "notebook.review.before",
      "figure.generate.before",
      "dataset.plan.before",
    ]);

    const chat = connectorPromptInstructions(defaults, "explain this layer", "chat.before", "agent-default-mechanism-tutor");
    expect(chat).toContain("Local custom agent: mechanism-tutor");
    expect(chat).toContain("Local chat.before hook: Evidence boundary");
    expect(chat).not.toContain("Figure fidelity gate");

    const figure = connectorPromptInstructions(defaults, "", "figure.generate.before");
    expect(figure).toContain("Local figure.generate.before hook: Figure fidelity gate");
    expect(figure).not.toContain("Mechanism tutor");
  });
});
