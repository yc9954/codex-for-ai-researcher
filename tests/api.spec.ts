import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ResearchNotebook } from "../src/notebook-types";

function notebook(id: string, title = "Concurrency baseline", image = "rosetta-python:0.1"): ResearchNotebook {
  return {
    id,
    title,
    paperUrl: "https://arxiv.org/abs/2106.09685",
    repositoryUrl: "https://github.com/microsoft/LoRA",
    image,
    cells: [{ id: "probe", kind: "code", source: "print('ok')", executionCount: null, runStatus: "idle" }],
    comments: [],
    provenance: [{
      id: `created-${id}`,
      type: "notebook.created",
      actor: "user",
      summary: "Created API contract fixture",
      createdAt: new Date().toISOString(),
    }],
    updatedAt: new Date().toISOString(),
  };
}

test("API rejects malformed, oversized, cross-origin, and non-JSON mutations", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const malformed = await request.post("/api/studies/inspect", {
    headers: { "Content-Type": "application/json" },
    data: Buffer.from("{invalid"),
  });
  expect(malformed.status()).toBe(400);
  await expect(malformed.json()).resolves.toMatchObject({ error: "Request body must contain valid JSON" });

  const wrongType = await request.post("/api/studies/inspect", {
    headers: { "Content-Type": "text/plain" },
    data: "{}",
  });
  expect(wrongType.status()).toBe(415);

  const crossOrigin = await request.post("/api/studies/inspect", {
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);

  const oversized = await request.post("/api/studies/inspect", {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ paperUrl: `https://arxiv.org/${"x".repeat(2_100_000)}` }),
  });
  expect(oversized.status()).toBe(413);

  const rejectedSecret = "as-this-value-must-never-be-reflected";
  const invalidModalCredentials = await request.post("/api/modal/connect", {
    data: { tokenId: "bad", tokenSecret: rejectedSecret, remember: false },
  });
  expect(invalidModalCredentials.status()).toBe(400);
  expect(JSON.stringify(await invalidModalCredentials.json())).not.toContain(rejectedSecret);
});

test("API exposes hardened response headers and bounded schema failures", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const status = await request.get("/api/system/profile");
  expect(status.headers()["x-content-type-options"]).toBe("nosniff");
  expect(status.headers()["x-frame-options"]).toBe("DENY");
  expect(status.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  const system = await status.json();
  expect(system.codexAgent).toMatchObject({ enabled: false, ready: false });
  expect(system).toMatchObject({
    freeDiskBytes: expect.any(Number),
    accelerators: expect.any(Array),
    localRuntime: { backend: "cpu", cpus: expect.any(Number), memoryBytes: expect.any(Number), timeoutSeconds: 20, portable: true },
  });
  expect(system.localRuntime.memoryBytes).toBeGreaterThanOrEqual(768 * 1024 ** 2);
  const runtimeStatus = await request.get("/api/runtime/status");
  expect(runtimeStatus.status()).toBe(200);
  await expect(runtimeStatus.json()).resolves.toMatchObject({ ready: expect.any(Boolean), runtime: "docker", image: "rosetta-python:0.1" });
  const latestStudy = await request.get("/api/studies/latest").then((response) => response.json());
  const activityId = `disabled-agent-${Date.now()}`;
  const disabledAgent = await request.post(`/api/studies/${latestStudy.studyId}/agent/respond`, { data: { content: "This must not execute in deterministic tests.", activityId } });
  expect(disabledAgent.status()).toBe(503);
  const failedActivity = await request.get(`/api/studies/${latestStudy.studyId}/agent/activity/${activityId}`);
  expect(failedActivity.status()).toBe(200);
  await expect(failedActivity.json()).resolves.toMatchObject({
    requestId: activityId,
    status: "failed",
    events: expect.arrayContaining([
      expect.objectContaining({ kind: "agent", status: "completed" }),
      expect.objectContaining({ kind: "tool", label: "Searching pinned paper evidence", status: "completed" }),
      expect.objectContaining({ kind: "thinking", status: "failed" }),
    ]),
  });
  const disabledGenerator = await request.post(`/api/studies/${latestStudy.studyId}/notebook/generate`, { data: { regenerate: true } });
  expect(disabledGenerator.status()).toBe(503);
  const generationStatus = await request.get(`/api/studies/${latestStudy.studyId}/notebook/generation-status`);
  expect(generationStatus.status()).toBe(200);
  await expect(generationStatus.json()).resolves.toMatchObject({ status: "failed", phase: "failed", cancelable: false });
  const cancelIdleGeneration = await request.post(`/api/studies/${latestStudy.studyId}/notebook/generation-cancel`, { data: {} });
  expect(cancelIdleGeneration.status()).toBe(409);
  const disabledDatasetAgent = await request.post(`/api/studies/${latestStudy.studyId}/datasets`, { data: { regenerate: true } });
  expect(disabledDatasetAgent.status()).toBe(503);

  const invalidImage = await request.post("/api/notebooks/image-policy/save", {
    data: { notebook: notebook("image-policy", "Blocked image", "malicious-local-image:latest"), expectedHash: null },
  });
  expect(invalidImage.status()).toBe(400);
  await expect(invalidImage.json()).resolves.toMatchObject({ error: expect.stringContaining("runner image is not allowed") });
});

test("a failed paper intake recovers text from its locally cached PDF", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const latest = await request.get("/api/studies/latest").then((response) => response.json()) as { studyId: string };
  const intakePath = resolve(".rosetta/e2e/studies", latest.studyId, "intake.json");
  const latestPath = resolve(".rosetta/e2e/studies/latest.json");
  const original = JSON.parse(await readFile(intakePath, "utf8")) as { paperDocument?: { sourceUrl: string }; warnings: string[] } & Record<string, unknown>;
  expect(original.paperDocument?.sourceUrl).toBe("https://arxiv.org/pdf/2106.09685");
  const cacheKey = createHash("sha256").update(original.paperDocument!.sourceUrl).digest("hex");
  const cacheDir = resolve(".rosetta/e2e/sources/papers", cacheKey);
  await Promise.all([
    rm(resolve(cacheDir, "document.json"), { force: true }),
    rm(resolve(cacheDir, "pages.json"), { force: true }),
    rm(resolve(".rosetta/e2e/studies", latest.studyId, "paper-pages.json"), { force: true }),
  ]);
  const failed = { ...original, paperDocument: undefined, warnings: [...original.warnings, "Full paper text could not be extracted: packaged worker was unavailable"] };
  await Promise.all([
    writeFile(intakePath, `${JSON.stringify(failed)}\n`, "utf8"),
    writeFile(latestPath, `${JSON.stringify(failed)}\n`, "utf8"),
  ]);

  const recovered = await request.post(`/api/studies/${latest.studyId}/paper/extract`, { data: {} });
  expect(recovered.status()).toBe(200);
  await expect(recovered.json()).resolves.toMatchObject({
    studyId: latest.studyId,
    paperDocument: { retrievalMode: "cache", totalPages: 26, retainedPages: 26, extractor: "unpdf-pdfjs" },
  });
  const persisted = JSON.parse(await readFile(intakePath, "utf8")) as { paperDocument?: { characterCount: number }; warnings: string[] };
  expect(persisted.paperDocument?.characterCount).toBeGreaterThan(10_000);
  expect(persisted.warnings).not.toEqual(expect.arrayContaining([expect.stringContaining("Full paper text could not be extracted")]));
});

test("connector agents, skills, and hooks persist, validate their namespaces, and remain reversible", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const suffix = Date.now().toString(36);
  const command = `evidence-${suffix}`;
  const createdAgent = await request.post("/api/connectors/agents", { data: {
    name: "Evidence critic",
    command,
    description: "Checks whether explanations distinguish claims from observations.",
    instructions: "Require an explicit paper claim, observed evidence, inference, and missing-evidence boundary.",
    enabled: true,
  } });
  expect(createdAgent.status()).toBe(201);
  const agentConfig = await createdAgent.json();
  const agent = agentConfig.agents.find((candidate: { command: string }) => candidate.command === command);
  expect(agent).toMatchObject({ name: "Evidence critic", enabled: true });

  const persisted = await request.get("/api/connectors");
  expect((await persisted.json()).agents).toEqual(expect.arrayContaining([expect.objectContaining({ id: agent.id, command })]));

  const disabled = await request.patch(`/api/connectors/agents/${agent.id}`, { data: { enabled: false } });
  expect(disabled.status()).toBe(200);
  expect((await disabled.json()).agents).toEqual(expect.arrayContaining([expect.objectContaining({ id: agent.id, enabled: false })]));

  const createdSkill = await request.post("/api/connectors/skills", { data: {
    name: "Learning pass",
    command,
    description: "Turns a mechanism into a prediction, probe, and transfer task.",
    instructions: "Require a prerequisite diagnostic, stable subgoals, a prediction before execution, a one-variable contrast, self-explanation, and a transfer question.",
    enabled: true,
  } });
  expect(createdSkill.status()).toBe(201);
  const skill = (await createdSkill.json()).skills.find((candidate: { command: string }) => candidate.command === command);
  expect(skill).toMatchObject({ name: "Learning pass", enabled: true });

  const conflict = await request.post("/api/connectors/skills", { data: {
    name: "Conflicting skill command",
    command: "extract-paper-claims",
    description: "Must be rejected because the command is built in.",
    instructions: "This instruction should never be retained by the connector configuration.",
    enabled: true,
  } });
  expect(conflict.status()).toBe(409);

  const createdHook = await request.post("/api/connectors/hooks", { data: {
    name: "Citation gate",
    event: "chat.before",
    instructions: "Cite a pinned PDF page for every numeric claim in the response.",
    enabled: true,
  } });
  expect(createdHook.status()).toBe(201);
  const hook = (await createdHook.json()).hooks.find((candidate: { name: string }) => candidate.name === "Citation gate");
  expect(hook).toMatchObject({ event: "chat.before", enabled: true });

  expect((await request.delete(`/api/connectors/agents/${agent.id}`, { data: {} })).status()).toBe(200);
  expect((await request.delete(`/api/connectors/skills/${skill.id}`, { data: {} })).status()).toBe(200);
  const cleaned = await request.delete(`/api/connectors/hooks/${hook.id}`, { data: {} });
  expect(cleaned.status()).toBe(200);
  expect((await cleaned.json()).hooks).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: hook.id })]));
});

test("local PDF uploads enter the same hashed page-evidence pipeline", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const sourceUrl = "https://arxiv.org/pdf/2106.09685";
  const cacheKey = createHash("sha256").update(sourceUrl).digest("hex");
  const source = await readFile(resolve(".rosetta/e2e/sources/papers", cacheKey, "source.pdf"));
  const uploadResponse = await request.post("/api/papers/upload", {
    headers: { "Content-Type": "application/pdf", "X-Paper-Filename": encodeURIComponent("local-lora.pdf") },
    data: source,
    timeout: 90_000,
  });
  expect(uploadResponse.status()).toBe(201);
  const uploaded = await uploadResponse.json();
  expect(uploaded).toMatchObject({ filename: "local-lora.pdf", paper: { source: "upload" }, document: { retrievalMode: "upload", retainedPages: 26 } });
  expect(uploaded.document.sha256).toMatch(/^[a-f0-9]{64}$/);

  const inspection = await request.post("/api/studies/inspect", { data: { uploadedPaperId: uploaded.uploadId } });
  expect(inspection.status()).toBe(200);
  await expect(inspection.json()).resolves.toMatchObject({
    paper: { source: "upload", identifier: uploaded.document.sha256 },
    paperDocument: { sha256: uploaded.document.sha256, retrievalMode: "upload", retainedPages: 26 },
  });
  const download = await request.get(`/api/papers/uploads/${uploaded.uploadId}`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("application/pdf");
  expect((await download.body()).byteLength).toBe(source.byteLength);
});

test("notebook snapshots reload and stale writers receive a conflict", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const id = `concurrency-${Date.now()}`;
  const first = await request.post(`/api/notebooks/${id}/save`, {
    data: { notebook: notebook(id), expectedHash: null },
  });
  expect(first.status()).toBe(200);
  const firstRecord = await first.json() as { hash: string };

  const loaded = await request.get(`/api/notebooks/${id}`);
  expect(loaded.status()).toBe(200);
  await expect(loaded.json()).resolves.toMatchObject({ hash: firstRecord.hash, notebook: { title: "Concurrency baseline" } });

  const winner = await request.post(`/api/notebooks/${id}/save`, {
    data: { notebook: notebook(id, "Winning version"), expectedHash: firstRecord.hash },
  });
  expect(winner.status()).toBe(200);

  const stale = await request.post(`/api/notebooks/${id}/save`, {
    data: { notebook: notebook(id, "Stale overwrite"), expectedHash: firstRecord.hash },
  });
  expect(stale.status()).toBe(409);
  await expect(stale.json()).resolves.toMatchObject({ error: expect.stringContaining("Reload before saving") });

  const afterConflict = await request.get(`/api/notebooks/${id}`).then((response) => response.json());
  expect(afterConflict.notebook.title).toBe("Winning version");
});

test("artifact creation rejects client-asserted runs without verified manifests", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const id = `forged-artifact-${Date.now()}`;
  const baseline = notebook(id, "Artifact baseline");
  const saved = await request.post(`/api/notebooks/${id}/save`, {
    data: { notebook: baseline, expectedHash: null },
  });
  expect(saved.status()).toBe(200);
  const savedRecord = await saved.json() as { hash: string; version: number };
  const forged = notebook(id);
  forged.cells[0] = {
    ...forged.cells[0],
    runStatus: "passed",
    executionCount: 1,
    output: {
      runId: "run-forged",
      status: "passed",
      stdout: "claimed",
      stderr: "",
      durationMs: 1,
      codeHash: "fake",
      imageDigest: "fake",
      createdAt: new Date().toISOString(),
    },
  };
  const response = await request.post(`/api/notebooks/${id}/artifacts`, {
    data: { notebook: forged, expectedHash: savedRecord.hash },
  });
  expect(response.status()).toBe(422);
  await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Run manifest is missing") });

  const afterFailure = await request.get(`/api/notebooks/${id}`);
  expect(afterFailure.status()).toBe(200);
  const afterFailureRecord = await afterFailure.json();
  expect(afterFailureRecord).toMatchObject({
    hash: savedRecord.hash,
    version: savedRecord.version,
    notebook: { title: "Artifact baseline", cells: [{ runStatus: "idle" }] },
  });
  expect(afterFailureRecord.notebook.cells[0].output).toBeUndefined();
});

test("Modal planning creates a bounded syntax-valid app without launching or persisting the approval secret", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const id = `modal-plan-${Date.now()}`;
  const saved = await request.post(`/api/notebooks/${id}/save`, { data: { notebook: notebook(id, "Modal boundary"), expectedHash: null } });
  expect(saved.status()).toBe(200);
  const savedBody = await saved.json();

  const planned = await request.post(`/api/notebooks/${id}/modal/plan`, { data: { gpu: "T4", timeoutSeconds: 60, localBlocker: "This contract fixture intentionally has no local container run." } });
  expect(planned.status()).toBe(201);
  const body = await planned.json();
  expect(body.plan).toMatchObject({ notebookId: id, requestedGpu: "T4", gpu: "T4", minimumGpuMemoryGiB: 16, timeoutSeconds: 60, maximumGpuCostUsd: 0.0098, codeCellCount: 1, status: "planned", networkPolicy: "blocked", deviceEnvironment: "cuda", containerMemoryMiB: 8192, artifactPolicy: { maxFiles: 20, maxFileBytes: 1048576, maxTotalBytes: 2097152 } });
  expect(body.plan.selectionReason).toContain("Explicit user selection");
  expect(body.approvalToken).toHaveLength(72);
  const source = await readFile(resolve(body.plan.appPath), "utf8");
  execFileSync(process.env.PYTHON || "python3", ["-m", "py_compile", resolve(body.plan.appPath)], { stdio: "pipe" });
  expect(source).toContain('@app.function(image=image, gpu="T4", timeout=60, memory=8192, restrict_modal_access=True, block_network=True, single_use_containers=True)');
  expect(source).toContain('.env({"CODEX_RESEARCH_DEVICE": "cuda"})');
  expect(source).toContain('torch_version = str(torch.__version__)');
  expect(source).toContain('return json.dumps({"status":');
  expect(source).toContain('print("CODEX_RESULT=" + execute_notebook.remote())');
  expect(source).toContain('"artifacts": artifacts');
  expect(source).toContain("<cell:{cell['id']}>");
  expect(source).not.toContain(body.approvalToken);
  expect(body.plan.appSha256).toBe(createHash("sha256").update(source).digest("hex"));
  expect(body.plan.localEvidence).toMatchObject({ mode: "documented-blocker" });

  const userSelected = await request.post(`/api/notebooks/${id}/modal/plan`, { data: { gpu: "auto", timeoutSeconds: 300, executionReason: "The user selected the connected Modal accelerator for this one-time notebook run." } });
  expect(userSelected.status()).toBe(201);
  await expect(userSelected.json()).resolves.toMatchObject({
    plan: { localEvidence: { mode: "user-selected-remote", runIds: [], blocker: null, reason: expect.stringContaining("user selected") } },
    approvalToken: expect.any(String),
  });

  const rejected = await request.post(`/api/notebooks/${id}/modal/launch`, { data: { planId: body.plan.planId, approvalToken: "x".repeat(32) } });
  expect(rejected.status()).toBe(403);

  const planPath = resolve(dirname(resolve(body.plan.appPath)), "plan.json");
  const launchPath = resolve(dirname(resolve(body.plan.appPath)), "launch.json");
  const remoteFigure = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const remoteFigureHash = createHash("sha256").update(remoteFigure).digest("hex");
  await mkdir(resolve(dirname(resolve(body.plan.appPath)), "files"), { recursive: true });
  await writeFile(resolve(dirname(resolve(body.plan.appPath)), "files", "result.png"), remoteFigure);
  const storedPlan = JSON.parse(await readFile(planPath, "utf8"));
  await writeFile(planPath, JSON.stringify({ ...storedPlan, status: "consumed", consumedAt: "2026-07-21T00:00:01.234Z" }));
  await writeFile(launchPath, JSON.stringify({
    schemaVersion: "1.0",
    planId: body.plan.planId,
    notebookId: id,
    planHash: body.plan.planHash,
    notebookHash: body.plan.notebookHash,
    notebookContentHash: body.plan.notebookContentHash,
    appSha256: body.plan.appSha256,
    status: "passed",
    startedAt: "2026-07-21T00:00:00.000Z",
    endedAt: "2026-07-21T00:00:01.234Z",
    stdout: "[probe]\nok\n",
    stderr: "",
    remoteResult: { status: "passed", cells: [{ id: "probe", status: "passed", stdout: "ok\n", stderr: "", duration_ms: 4.25 }], artifacts: [{ path: "result.png", mimeType: "image/png", sizeBytes: remoteFigure.byteLength, sha256: remoteFigureHash }] },
  }));
  const archived = await request.get(`/api/notebooks/${id}/modal/runs`);
  expect(archived.status()).toBe(200);
  const archivedBody = await archived.json();
  expect(archivedBody.runs).toEqual([expect.objectContaining({ runId: body.plan.planId, source: "modal", status: "passed", gpu: "T4", durationMs: 1234, cells: [expect.objectContaining({ id: "probe", stdout: "ok\n" })], artifacts: [expect.objectContaining({ path: "result.png", sha256: remoteFigureHash })] })]);
  expect(JSON.stringify(archivedBody)).not.toContain(body.approvalToken);
  const remoteFigureResponse = await request.get(`/api/notebooks/${id}/modal/runs/${body.plan.planId}/artifacts/result.png`);
  expect(remoteFigureResponse.status()).toBe(200);
  expect(remoteFigureResponse.headers()["content-type"]).toBe("image/png");
  expect(await remoteFigureResponse.body()).toEqual(remoteFigure);
  const remoteFigureDownload = await request.get(`/api/notebooks/${id}/modal/runs/${body.plan.planId}/files/result.png`);
  expect(remoteFigureDownload.status()).toBe(200);
  expect(remoteFigureDownload.headers()["content-disposition"]).toContain("attachment");

  const frozenResponse = await request.post(`/api/notebooks/${id}/artifacts`, { data: { notebook: savedBody.notebook, expectedHash: savedBody.hash } });
  expect(frozenResponse.status()).toBe(200);
  const frozen = await frozenResponse.json();
  expect(frozen).toMatchObject({ localRunIds: [], remoteRunIds: [body.plan.planId] });
  expect(frozen.bundledRuns).toEqual(expect.arrayContaining([
    `runs/modal/${body.plan.planId}/plan.json`,
    `runs/modal/${body.plan.planId}/launch.json`,
    `runs/modal/${body.plan.planId}/files/result.png`,
  ]));
  const publicPlan = JSON.parse(await readFile(resolve(frozen.path, "runs", "modal", body.plan.planId, "plan.json"), "utf8"));
  expect(publicPlan).not.toHaveProperty("approvalTokenHash");
});

test("isolated runs collect bounded regular files and produce verified artifact bundles", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const profile = await request.get("/api/system/profile").then((response) => response.json());
  test.skip(!profile.runnerImageReady, "The optional Docker runner image is not built on this computer");

  const id = `artifact-contract-${Date.now()}`;
  const source = notebook(id, "Artifact contract");
  source.cells[0].source = `from pathlib import Path
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

values = {"Baseline": 81.2, "Proposed": 84.6}
Path("metrics.json").write_text(json.dumps(values, sort_keys=True))
fig, ax = plt.subplots(figsize=(4, 3))
ax.bar(list(values), list(values.values()))
fig.savefig("paper-values.png", dpi=120)
assert Path("paper-values.png").stat().st_size > 1000
Path("host-link").symlink_to("/etc/passwd")
print("artifact-ready")`;
  const runResponse = await request.post(`/api/notebooks/${id}/cells/probe/run`, {
    data: { notebook: source, parentRunId: null },
  });
  expect(runResponse.status()).toBe(200);
  const run = await runResponse.json();
  expect(run.status).toBe("passed");
  expect(run.artifacts).toContain("metrics.json");
  expect(run.artifacts).toContain("paper-values.png");
  expect(run.artifacts).not.toContain("host-link");
  expect(run.artifactRecords).toMatchObject({
    "paper-values.png": { sha256: expect.stringMatching(/^[a-f0-9]{64}$/), sizeBytes: expect.any(Number) },
  });

  const figureResponse = await request.get(`/api/runs/${run.runId}/artifacts/paper-values.png`);
  expect(figureResponse.status()).toBe(200);
  expect(figureResponse.headers()["content-type"]).toBe("image/png");
  expect((await figureResponse.body()).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect((await request.get(`/api/runs/${run.runId}/artifacts/metrics.json`)).status()).toBe(415);
  const metricsDownload = await request.get(`/api/runs/${run.runId}/files/metrics.json`);
  expect(metricsDownload.status()).toBe(200);
  expect(metricsDownload.headers()["content-disposition"]).toContain("attachment");
  expect(JSON.parse((await metricsDownload.body()).toString("utf8"))).toEqual({ Baseline: 81.2, Proposed: 84.6 });
  expect((await request.get(`/api/runs/${run.runId}/files/../manifest.json`)).status()).toBe(404);

  const result = run.cells.find((cell: { id: string }) => cell.id === "probe");
  source.cells[0] = {
    ...source.cells[0],
    executionCount: 1,
    runStatus: "passed",
    output: {
      runId: run.runId,
      status: "passed",
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      codeHash: run.codeHash,
      imageDigest: run.imageDigest,
      createdAt: run.createdAt,
      artifacts: result.artifacts,
    },
  };
  const artifactResponse = await request.post(`/api/notebooks/${id}/artifacts`, {
    data: { notebook: source, expectedHash: null },
  });
  expect(artifactResponse.status()).toBe(200);
  const artifact = await artifactResponse.json();
  expect(artifact).toMatchObject({
    runIds: [run.runId],
    bundledRuns: expect.arrayContaining([`runs/${run.runId}.json`, `runs/${run.runId}/files/paper-values.png`, `runs/${run.runId}/files/metrics.json`]),
    files: expect.arrayContaining(["notebook.ipynb", "artifact-manifest.json"]),
  });
  const exportedNotebook = JSON.parse(await readFile(resolve(artifact.path, "notebook.ipynb"), "utf8"));
  expect(exportedNotebook.cells[0].outputs).toEqual(expect.arrayContaining([
    expect.objectContaining({ output_type: "display_data", data: expect.objectContaining({ "image/png": expect.any(String) }) }),
  ]));
  const storedRuns = await request.get(`/api/notebooks/${id}/runs`).then((response) => response.json());
  expect(storedRuns.runs).toEqual(expect.arrayContaining([expect.objectContaining({ runId: run.runId, status: "passed" })]));
  const storedArtifacts = await request.get(`/api/notebooks/${id}/artifacts`).then((response) => response.json());
  expect(storedArtifacts.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ runIds: [run.runId] })]));
  const downloadedNotebook = await request.get(`/api/notebooks/${id}/artifacts/${artifact.artifactId}/files/notebook.ipynb`);
  expect(downloadedNotebook.status()).toBe(200);
  expect(downloadedNotebook.headers()["content-type"]).toContain("application/x-ipynb+json");
  expect(JSON.parse((await downloadedNotebook.body()).toString("utf8"))).toMatchObject({ nbformat: 4 });
});

test("study messages survive reload without claiming agent analysis", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const study = await request.get("/api/studies/latest").then((response) => response.json());
  const content = `Persistence check ${Date.now()}`;
  const annotation = {
    id: `annotation-${Date.now()}`,
    notebookId: `${study.studyId}-evidence-notebook`,
    cellId: "source-overview",
    kind: "text",
    excerpt: "A selected notebook mechanism passage retained as message context.",
    note: "Explain why this step is necessary.",
    createdAt: new Date().toISOString(),
  };
  const recorded = await request.post(`/api/studies/${study.studyId}/messages`, { data: { content, annotation } });
  expect(recorded.status()).toBe(201);
  await expect(recorded.json()).resolves.toMatchObject({ analysisExecuted: false });

  const history = await request.get(`/api/studies/${study.studyId}/messages`);
  expect(history.status()).toBe(200);
  expect((await history.json()).messages).toEqual(expect.arrayContaining([expect.objectContaining({ content, annotation })]));
});

test("a citation can retrieve one exact page from the pinned paper", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "API contracts run once in the desktop project");
  const study = await request.get("/api/studies/latest").then((response) => response.json());
  const page = await request.get(`/api/studies/${study.studyId}/paper/pages/6`);
  expect(page.status()).toBe(200);
  await expect(page.json()).resolves.toMatchObject({
    page: 6,
    totalPages: expect.any(Number),
    text: expect.stringMatching(/\S.{100}/s),
    sourceUrl: expect.any(String),
    paperSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  const document = await request.get(`/api/studies/${study.studyId}/paper/document`);
  expect(document.status()).toBe(200);
  expect(document.headers()["content-type"]).toBe("application/pdf");
  expect(document.headers().etag).toMatch(/^"[a-f0-9]{64}"$/);
  expect((await document.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await request.get(`/api/studies/${study.studyId}/paper/pages/9999`)).status()).toBe(404);
});
