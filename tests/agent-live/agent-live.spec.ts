import { expect, test } from "@playwright/test";

test("authenticated local Codex produces and persists a grounded response", async ({ request }) => {
  const status = await request.get("/api/agent/status").then((response) => response.json());
  test.skip(!status.ready, status.message || "Local Codex is not authenticated");

  const inspection = await request.post("/api/studies/inspect", {
    data: { paperUrl: "https://arxiv.org/abs/2106.09685", repositoryUrl: "https://github.com/microsoft/LoRA" },
  });
  expect(inspection.status()).toBe(200);
  const study = await inspection.json();

  const activityId = `live-agent-${Date.now()}`;
  const response = await request.post(`/api/studies/${study.studyId}/agent/respond`, {
    data: { content: "/extract-paper-claims In one sentence, separate the pinned evidence from what has not been reproduced.", activityId },
    timeout: 130_000,
  });
  expect(response.status()).toBe(200);
  const answer = await response.json();
  expect(answer).toMatchObject({ analysisExecuted: true, engine: "codex-cli", message: { role: "agent" } });
  expect(answer.activity).toMatchObject({ requestId: activityId, status: "completed" });
  expect(answer.activity.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "agent", status: "completed" }),
    expect.objectContaining({ kind: "tool", status: "completed" }),
    expect.objectContaining({ kind: "thinking", status: "completed" }),
    expect.objectContaining({ kind: "answer", status: "completed" }),
  ]));
  expect(answer.message.content.length).toBeGreaterThan(40);

  const history = await request.get(`/api/studies/${study.studyId}/messages`).then((historyResponse) => historyResponse.json());
  expect(history.messages.slice(-2).map((message: { role: string }) => message.role)).toEqual(["user", "agent"]);
  expect(history.messages.at(-1).content).toBe(answer.message.content);
  expect(history.messages.at(-1).activity).toMatchObject({ requestId: activityId, status: "completed" });
});

test("authenticated notebook generation can be cancelled without persisting a generated notebook", async ({ request }) => {
  test.setTimeout(120_000);
  const status = await request.get("/api/agent/status").then((response) => response.json());
  test.skip(!status.ready, status.message || "Local Codex is not authenticated");
  const inspection = await request.post("/api/studies/inspect", {
    data: { paperUrl: "https://arxiv.org/abs/2106.09685" },
    timeout: 90_000,
  });
  expect(inspection.status()).toBe(200);
  const study = await inspection.json();

  const generation = request.post(`/api/studies/${study.studyId}/notebook/generate`, {
    data: { regenerate: true },
    timeout: 90_000,
  });
  await expect.poll(async () => {
    const current = await request.get(`/api/studies/${study.studyId}/notebook/generation-status`).then((response) => response.json());
    return current.status === "running" ? current.phase : current.status;
  }, { timeout: 30_000 }).toMatch(/collecting-evidence|drafting|repairing-structure/);

  const cancelled = await request.post(`/api/studies/${study.studyId}/notebook/generation-cancel`, { data: {} });
  expect(cancelled.status()).toBe(202);
  const result = await generation;
  expect(result.status()).toBe(409);
  await expect(result.json()).resolves.toMatchObject({ error: "Notebook generation was cancelled" });
  const finalStatus = await request.get(`/api/studies/${study.studyId}/notebook/generation-status`).then((response) => response.json());
  expect(finalStatus).toMatchObject({ status: "cancelled", phase: "cancelled", cancelable: false });
  const notebook = await request.get(`/api/notebooks/${study.studyId}-evidence-notebook?optional=1`).then((response) => response.json());
  expect(notebook).toBeNull();
});

test("authenticated local Codex generates a non-template notebook that passes the isolated smoke test", async ({ request }) => {
  test.setTimeout(900_000);
  const status = await request.get("/api/agent/status").then((response) => response.json());
  test.skip(!status.ready, status.message || "Local Codex is not authenticated");
  const profile = await request.get("/api/system/profile").then((response) => response.json());
  test.skip(!profile.runnerImageReady, "The isolated runner image is not built");

  const inspection = await request.post("/api/studies/inspect", {
    data: { paperUrl: "https://arxiv.org/abs/1706.03762" },
    timeout: 90_000,
  });
  expect(inspection.status()).toBe(200);
  const study = await inspection.json();
  expect(study.paperDocument).toMatchObject({ retainedPages: 15, extractor: "unpdf-pdfjs" });

  const generated = await request.post(`/api/studies/${study.studyId}/notebook/generate`, {
    data: { regenerate: true },
    timeout: 840_000,
  });
  const result = await generated.json();
  expect(generated.status(), result.error || JSON.stringify(result)).toBe(201);
  expect(result).toMatchObject({ cached: false, smokeTest: "passed" });
  expect(result.notebook.title).not.toContain("evidence lab");
  expect(result.notebook.cells[0]).toMatchObject({ id: "paper-guide", kind: "markdown" });
  expect(result.notebook.cells[0].source).toContain("Paper guide");
  expect(result.notebook.cells[0].source).toContain("Definitions you need");
  expect(result.notebook.cells[0].source).toContain("Decisive results and their meaning");
  expect(result.notebook.cells[0].source).toContain("/evidence/pdf?page=");
  expect(result.notebook.cells[1]).toMatchObject({ id: "architecture-overview", kind: "markdown" });
  expect(result.notebook.cells[2]).toMatchObject({ id: "architecture-diagram", kind: "code", runStatus: "passed" });
  expect(result.notebook.cells[2].source).toContain("paper-architecture.png");
  expect(result.notebook.cells[3]).toMatchObject({ id: "architecture-components", kind: "markdown" });
  expect(result.notebook.cells[3].source).toContain("Equation and shape");
  expect(result.notebook.cells[3].source).toContain("Parameters:");
  expect(result.notebook.cells[2].output.artifacts).toEqual(expect.arrayContaining([
    "paper-architecture.png",
    "paper-architecture.json",
  ]));
  expect(result.notebook.cells.filter((cell: { kind: string }) => cell.kind === "code").length).toBeGreaterThanOrEqual(2);
  expect(result.notebook.cells.filter((cell: { runStatus: string }) => cell.runStatus === "passed").length).toBeGreaterThanOrEqual(2);
  expect(result.notebook.provenance).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "notebook.generated", hash: study.paperDocument.sha256 }),
    expect.objectContaining({ type: "notebook.smoke-tested" }),
  ]));
  const generationStatus = await request.get(`/api/studies/${study.studyId}/notebook/generation-status`).then((response) => response.json());
  expect(generationStatus).toMatchObject({ status: "completed", phase: "completed", cancelable: false });
});
