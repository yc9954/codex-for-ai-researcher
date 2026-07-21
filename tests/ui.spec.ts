import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async function pinLora(request: APIRequestContext, options: { withNotebook?: boolean } = {}) {
  const response = await request.post("/api/studies/inspect", {
    data: { paperUrl: "https://arxiv.org/abs/2106.09685", repositoryUrl: "https://github.com/microsoft/LoRA" },
  });
  expect(response.ok()).toBe(true);
  const study = await response.json() as { studyId: string; createdAt: string; paper: { url: string }; repository?: { url: string } };
  if (options.withNotebook !== false) {
    const notebook = {
    id: `${study.studyId}-evidence-notebook`,
    title: "LoRA mechanism test notebook",
    paperUrl: study.paper.url,
    repositoryUrl: study.repository?.url || "",
    image: "codex-lab-python:0.1",
    cells: [
      { id: "source-overview", kind: "markdown", source: "# LoRA mechanism\n\nThe low-rank residual is added to the frozen projection and can be merged into one dense weight.", executionCount: null, runStatus: "idle" },
      { id: "source-pin", kind: "code", source: `import numpy as np\n\nW0 = np.arange(12, dtype=float).reshape(3, 4) / 10\nA = np.array([[1., 0., -1., 0.]])\nB = np.array([[1.], [0.5], [-1.]])\nx = np.array([1., 2., -1., 0.5])\nunmerged = W0 @ x + B @ (A @ x)\nmerged = (W0 + B @ A) @ x\nmerge_error = float(np.max(np.abs(unmerged - merged)))\nprint(f"merge_error={merge_error:.3g}")\nassert np.allclose(unmerged, merged)`, executionCount: null, runStatus: "idle" },
    ],
    comments: [],
    provenance: [{ id: `test-notebook-${study.studyId}`, type: "notebook.created", actor: "user", summary: "Created executable test fixture", createdAt: study.createdAt }],
    updatedAt: study.createdAt,
  };
    const saved = await request.post(`/api/notebooks/${notebook.id}/save`, { data: { notebook, expectedHash: null } });
    expect(saved.ok()).toBe(true);
  }
  return study;
}

test("desktop renders pinned live evidence in the dark-only workbench", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only assertions");
  await pinLora(request);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "LoRA: Low-Rank Adaptation of Large Language Models" })).toBeVisible();
  const productBrand = page.getByRole("button", { name: "Codex for AI researcher home" });
  await expect(productBrand).toContainText("Codex for AI researcher");
  await expect(productBrand.locator("img")).toHaveAttribute("src", "/brand-logo.png");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(page.getByRole("complementary", { name: "Study details" }).getByText("microsoft/LoRA", { exact: true })).toBeVisible();
  await expect(page.locator(".chatgpt-composer")).toHaveCSS("height", "52px");
  await expect(page.locator(".chatgpt-composer")).toHaveCSS("width", "768px");

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("complementary", { name: "Research navigation" })).toHaveCSS("width", "52px");
  await expect(page.getByRole("button", { name: "Codex for AI researcher home" })).toBeHidden();
  await page.getByRole("button", { name: "Expand sidebar" }).click();

  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Source map" }).click();
  await expect(page.getByRole("heading", { name: "Retrieved evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "setup.py", exact: true })).toBeVisible();
  await expect(page.getByText("Dependency evidence", { exact: true })).toBeVisible();
  await expect(page.locator(".source-evidence-section code").filter({ hasText: /^[a-f0-9]{40}$/ })).toBeVisible();
  await expect(page.getByText(/26 \/ 26 pages/)).toBeVisible();
  await expect(page.getByText(/unpdf-pdfjs/)).toBeVisible();
  await expect(page.getByText("No top-level symbols detected", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Pinned implementation symbols", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "examples/NLU/tests/test_modeling_blenderbot.py", exact: true })).toHaveCount(0);
  const readme = page.locator(".readme-digest:not(.dependency-evidence)");
  await expect(readme).toContainText("This repo contains the source code");
  await expect(readme).not.toContainText("<br>");
  await expect(readme).not.toContainText("# LoRA");
  await page.screenshot({ path: "artifacts/codex-lab-live-source-map.png", fullPage: true });
});

test("paper guide uses a scannable hierarchy and embeds legacy evidence links in prose", async ({ page, request }, testInfo) => {
  const mobile = testInfo.project.name.includes("mobile");
  const study = await pinLora(request, { withNotebook: false });
  const quote = "We hypothesize that the change in weights during model adaptation also has a low intrinsic rank";
  const href = `/evidence/pdf?page=2&quote=${encodeURIComponent(quote)}`;
  const notebook = {
    id: `${study.studyId}-evidence-notebook`,
    title: "Scannable LoRA paper guide",
    paperUrl: study.paper.url,
    repositoryUrl: study.repository?.url || "",
    image: "codex-lab-python:0.1",
    cells: [{
      id: "paper-guide",
      kind: "markdown",
      source: `# Paper guide

## Central thesis

The paper asks whether adaptation requires a full model-sized update. LoRA instead learns a compact low-rank update.

**Why it matters.** Task storage scales with the update rather than the whole model.

[The paper asks whether adaptation requires a full model-sized update...](${href}); [Additional source for LoRA instead learns a compact low-rank update...](${href})

## Definitions you need

### Low-rank update

*Paper-defined term.* For W0∈R^(d×k), LoRA learns B∈R^(d×r) and A∈R^(r×k), instead of an unrestricted d×k update.

**Why it matters here.** It constrains the task-specific update.

[For W0, LoRA learns two smaller trainable matrices instead of an unrestricted update.](${href})`,
      executionCount: null,
      runStatus: "idle",
    }],
    comments: [],
    provenance: [{ id: "paper-guide-generated", type: "notebook.generated", actor: "agent", summary: "Created paper guide fixture", createdAt: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  };
  const saved = await request.post(`/api/notebooks/${notebook.id}/save`, { data: { notebook, expectedHash: null } });
  expect(saved.ok()).toBe(true);

  await page.goto("/");
  if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  const guide = page.locator(".notebook-markdown-cell.is-paper-guide");
  await expect(guide).toBeVisible();
  await expect(guide.getByText("Additional source for", { exact: false })).toHaveCount(0);
  await expect(guide.locator(".paper-guide-section")).toHaveCount(2);
  await expect(guide.locator(".paper-guide-subsection")).toHaveCount(1);
  await expect(guide.locator(".paper-guide-heading-icon")).toHaveCount(2);
  await expect(guide.locator(".paper-guide-definition-heading svg")).toHaveCount(0);
  await expect(guide.locator(".paper-guide-subsection")).toHaveCSS("border-left-style", "solid");
  await expect(guide.locator(".paper-guide-subsection")).toHaveCSS("background-color", "rgb(24, 24, 24)");
  await expect(guide.locator(".katex")).toHaveCount(4);
  await expect(guide).not.toContainText("R^(d×k)");
  await expect(guide.getByRole("link", { name: "The paper asks whether adaptation requires a full model-sized update." })).toBeVisible();
  await expect(guide.getByRole("link", { name: "LoRA instead learns a compact low-rank update." })).toBeVisible();
  await expect(guide.locator("blockquote")).toHaveCount(2);
  await guide.screenshot({ path: mobile ? "artifacts/codex-paper-guide-hierarchy-mobile.png" : "artifacts/codex-paper-guide-hierarchy.png" });
});

test("new study dialog performs a real URL inspection and records messages", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only live intake assertion");
  await page.goto("/");
  await page.getByRole("button", { name: "New study" }).click();
  await page.getByLabel("Paper URL or DOI").fill("https://arxiv.org/abs/2106.09685");
  await page.getByLabel("GitHub repository").fill("https://github.com/microsoft/LoRA");
  await page.getByRole("button", { name: "Start inspection" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "LoRA: Low-Rank Adaptation of Large Language Models" })).toBeVisible();
  const sourceState = page.locator(".inspector-state");
  await expect(sourceState.locator("svg")).toBeVisible();
  await expect(sourceState.locator("i")).toHaveCount(0);
  const inspectStep = page.getByRole("region", { name: "Research workflow" }).locator(".workflow-row").filter({ hasText: "Inspect" });
  await expect(inspectStep).toContainText("locally pinned");

  const framingMarker = "Trace the repository entry points before proposing changes.";
  const longFramingRequest = `${framingMarker}\n\n${"Retain this detail as part of the framing check. ".repeat(180)}`;
  const chatScroll = page.locator(".chat-scroll");
  await chatScroll.evaluate((element) => { element.scrollTop = 0; });
  await page.getByLabel("Message the research workspace").fill(longFramingRequest);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Recorded in study-.* provenance/)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".chat-message.is-user").filter({ hasText: framingMarker })).toBeVisible();
  await expect.poll(() => chatScroll.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(4);
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-chat-autoscroll.png" });
});

test("automatic agent routing streams verifiable activity and retains it with the answer", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop activity trace assertion");
  await pinLora(request);
  const systemProfile = await request.get("/api/system/profile").then((response) => response.json());
  await page.route("**/api/system/profile", (route) => route.fulfill({ json: {
    ...systemProfile,
    codexAgent: { enabled: true, ready: true, version: "test", authMode: "chatgpt", message: "Ready" },
  } }));

  let releaseAgent!: () => void;
  let signalAgentStarted!: () => void;
  let running = true;
  const agentStarted = new Promise<void>((resolve) => { signalAgentStarted = resolve; });
  const agentRelease = new Promise<void>((resolve) => { releaseAgent = resolve; });
  const activityFor = (requestId: string) => ({
    requestId,
    status: running ? "running" : "completed",
    startedAt: "2026-07-21T04:00:00.000Z",
    updatedAt: running ? "2026-07-21T04:00:01.000Z" : "2026-07-21T04:00:02.000Z",
    events: [
      { id: "route", kind: "agent", label: "Selecting the research mediator", detail: "Auto selected the evidence-grounded mediator", status: "completed", createdAt: "2026-07-21T04:00:00.000Z", completedAt: "2026-07-21T04:00:00.100Z" },
      { id: "skill", kind: "skill", label: "Loaded /extract-paper-claims", status: "completed", createdAt: "2026-07-21T04:00:00.100Z", completedAt: "2026-07-21T04:00:00.200Z" },
      { id: "hook", kind: "hook", label: "Applied hook: Evidence boundary guard", status: "completed", createdAt: "2026-07-21T04:00:00.200Z", completedAt: "2026-07-21T04:00:00.300Z" },
      { id: "tool", kind: "tool", label: "Searching pinned paper evidence", detail: running ? undefined : "Retrieved 5 question-relevant PDF pages", status: running ? "running" : "completed", createdAt: "2026-07-21T04:00:00.300Z", ...(running ? {} : { completedAt: "2026-07-21T04:00:01.000Z" }) },
      ...(running ? [] : [{ id: "answer", kind: "answer", label: "Prepared the evidence-grounded response", status: "completed", createdAt: "2026-07-21T04:00:01.000Z", completedAt: "2026-07-21T04:00:02.000Z" }]),
    ],
  });
  await page.route("**/api/studies/*/agent/activity/*", (route) => {
    const requestId = route.request().url().split("/").at(-1) || "missing";
    return route.fulfill({ json: activityFor(requestId) });
  });
  await page.route("**/api/studies/*/agent/respond", async (route) => {
    const request = route.request().postDataJSON() as { activityId: string };
    signalAgentStarted();
    await agentRelease;
    running = false;
    const activity = activityFor(request.activityId);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      analysisExecuted: true,
      engine: "codex-cli",
      activity,
      message: { id: "agent-response", role: "agent", content: "Pinned evidence supports the reported low-rank update; no benchmark was reproduced.", activity },
    }) });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Select research agent" })).toContainText("Auto");
  const composer = page.getByLabel("Message the research workspace");
  await composer.fill("/extract-paper-claims Separate the paper claim from reproduced evidence.");
  await page.getByRole("button", { name: "Send message" }).click();
  await agentStarted;
  const liveActivity = page.getByRole("status", { name: "Agent activity" });
  await expect(liveActivity).toContainText("Loaded /extract-paper-claims");
  await expect(liveActivity).toContainText("Applied hook: Evidence boundary guard");
  await expect(liveActivity).toContainText("Searching pinned paper evidence");
  await page.screenshot({ path: "artifacts/codex-agent-live-activity.png" });

  releaseAgent();
  await expect(page.getByText("Pinned evidence supports the reported low-rank update; no benchmark was reproduced.")).toBeVisible();
  await expect(page.getByRole("status", { name: "Agent activity" })).toHaveCount(0);
  const retainedActivity = page.locator(".chat-message.is-assistant").filter({ hasText: "Pinned evidence supports" }).getByRole("region", { name: "Agent activity" });
  await expect(retainedActivity).toContainText("Research activity completed");
  await expect(retainedActivity.locator("details")).not.toHaveAttribute("open", "");
  await page.screenshot({ path: "artifacts/codex-agent-completed-collapsed.png" });
  await retainedActivity.locator("summary").click();
  await expect(retainedActivity).toContainText("Prepared the evidence-grounded response");
  await expect(retainedActivity.locator('.agent-activity-event.is-completed')).toHaveCount(5);
});

test("dialogs move focus inside and restore it to their launcher", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop keyboard focus assertion");
  await page.goto("/");
  const launcher = page.getByRole("button", { name: "New study" });
  await launcher.click();
  await expect(page.getByLabel("Paper URL or DOI")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(launcher).toBeFocused();

  await page.getByRole("button", { name: "Connectors" }).click();
  const agentLauncher = page.getByRole("button", { name: "New agent" });
  await agentLauncher.click();
  await expect(page.getByLabel("Agent name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New agent" })).toBeHidden();
  await expect(agentLauncher).toBeFocused();
});

test("notebook generation exposes real phases and can be cancelled", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop generation control assertion");
  await pinLora(request);
  let status: "idle" | "running" | "cancelled" = "idle";
  let phase = "idle";
  let releaseGeneration: (() => void) | undefined;
  await page.route("**/api/agent/status", (route) => route.fulfill({ json: { ready: true, version: "test", authMode: "chatgpt" } }));
  await page.route("**/api/studies/*/notebook/generation-status", (route) => route.fulfill({ json: {
    status,
    phase,
    detail: phase === "smoke-testing" ? "Running the generated code cells in the isolated Docker runtime" : "Preparing source-grounded notebook generation",
    startedAt: status === "idle" ? null : new Date(Date.now() - 2_000).toISOString(),
    updatedAt: new Date().toISOString(),
    attempt: 1,
    cancelable: status === "running",
  } }));
  await page.route("**/api/studies/*/notebook/generate", async (route) => {
    status = "running";
    phase = "collecting-evidence";
    await new Promise<void>((resolve) => { releaseGeneration = resolve; });
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Notebook generation was cancelled" }) });
  });
  await page.route("**/api/studies/*/notebook/generation-cancel", async (route) => {
    status = "cancelled";
    phase = "cancelled";
    releaseGeneration?.();
    await route.fulfill({ status: 202, json: {
      status, phase, detail: "Stopping the active generation process", startedAt: new Date(Date.now() - 2_000).toISOString(),
      updatedAt: new Date().toISOString(), attempt: 1, cancelable: false,
    } });
  });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await page.getByRole("button", { name: "Build notebook" }).first().click();
  const progress = page.locator(".notebook-generation-progress");
  await expect(progress.locator(".generation-progress-copy strong")).toHaveText("Collecting evidence");
  phase = "smoke-testing";
  await expect(progress.locator(".generation-progress-copy strong")).toHaveText("Running isolated checks", { timeout: 3_000 });
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-generation-progress.png", fullPage: true });
  await progress.getByRole("button", { name: "Cancel" }).click();
  await expect(progress).toBeHidden();
  await expect(page.getByRole("status")).toContainText("cancelled");
});

test("notebook generation reconnects after reload and restores the completed notebook", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop generation reconnection assertion");
  const study = await pinLora(request);
  let status: "running" | "completed" = "running";
  let notebookReads = 0;
  const notebookId = `${study.studyId}-evidence-notebook`;
  await page.route("**/api/studies/*/notebook/generation-status", (route) => route.fulfill({ json: {
    status,
    phase: status === "running" ? "drafting" : "completed",
    detail: status === "running" ? "Structuring the source-grounded lesson" : "Notebook generation completed",
    startedAt: new Date(Date.now() - 3_000).toISOString(), updatedAt: new Date().toISOString(), attempt: 1, cancelable: status === "running",
  } }));
  await page.route(/\/api\/notebooks\/.*\?optional=1$/, async (route) => {
    notebookReads += 1;
    if (notebookReads === 1) {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { hash: "reconnected-hash", version: "reconnected-version", notebook: {
      id: notebookId,
      title: "Reconnected verified notebook",
      paperUrl: "https://arxiv.org/abs/2106.09685",
      repositoryUrl: "https://github.com/microsoft/LoRA",
      image: "codex-lab-python:0.1",
      cells: [{ id: "reconnected-cell", kind: "code", source: "print('reconnected')", executionCount: null, runStatus: "idle" }],
      comments: [], provenance: [{ id: "generated", type: "notebook.generated", actor: "agent", summary: "Restored completed notebook", createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString(),
    } } });
  });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await expect(page.locator(".notebook-generation-progress .generation-progress-copy strong")).toHaveText("Building the learning path");
  status = "completed";
  await expect(page.locator("[data-notebook-cell-id='reconnected-cell']")).toBeVisible({ timeout: 4_000 });
  await expect(page.locator(".notebook-generation-progress")).toBeHidden();
  expect(notebookReads).toBeGreaterThanOrEqual(2);
});

test("paper-only studies skip repository adaptation and expose actionable next steps", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only workflow assertion");
  const response = await request.post("/api/studies/inspect", { data: { paperUrl: "https://arxiv.org/abs/1706.03762" } });
  expect(response.ok()).toBe(true);
  await page.goto("/");

  const workflow = page.locator(".chat-tool-block");
  await expect(workflow.locator(".workflow-row").filter({ hasText: "Adapt" })).toContainText("Skipped because no repository was attached");
  await expect(workflow.locator(".workflow-row").filter({ hasText: "Build" })).toContainText("A signed-in local Codex agent is required");
  await expect(workflow.getByRole("button", { name: "Open builder" })).toBeEnabled();
  await page.screenshot({ path: "artifacts/codex-lab-workflow-actions.png", fullPage: true });
  await workflow.getByRole("button", { name: "Plan" }).click();
  await expect(page.getByRole("heading", { name: "Resource-fit dataset evidence" })).toBeVisible();
});

test("slash command menu filters project skills and inserts the selected command", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop keyboard assertion");
  await pinLora(request);
  await page.goto("/");
  const composer = page.getByLabel("Message the research workspace");
  await composer.fill("/");
  const menu = page.getByRole("listbox", { name: "Project skills" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(10);
  const menuId = await menu.getAttribute("id");
  const firstOptionId = await menu.getByRole("option").first().getAttribute("id");
  expect(menuId).toBeTruthy();
  expect(firstOptionId).toBeTruthy();
  await expect(composer).toHaveAttribute("aria-expanded", "true");
  await expect(composer).toHaveAttribute("aria-controls", menuId!);
  await expect(composer).toHaveAttribute("aria-activedescendant", firstOptionId!);
  await page.screenshot({ path: "artifacts/codex-lab-skill-menu.png", fullPage: true });
  await composer.press("ArrowDown");
  await composer.press("Enter");
  await expect(composer).toHaveValue("/explain-paper-mechanism ");
  const highlightedCommand = page.locator(".composer-skill-highlight.is-exact");
  await expect(highlightedCommand).toHaveText("/explain-paper-mechanism");
  await expect(highlightedCommand).toHaveCSS("color", "rgb(126, 182, 255)");
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-skill-highlight.png" });
  await composer.fill("/dataset");
  await expect(menu.getByRole("option")).toHaveCount(1);
  await expect(menu).toContainText("/plan-resource-fit-dataset");
  await expect(page.locator(".composer-skill-highlight.is-query")).toHaveText("/dataset");
});

test("Connectors selects agents from the composer, invokes skills with slash, and retains automatic hooks", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop connector authoring assertion");
  await pinLora(request);
  await page.goto("/");
  await page.getByRole("button", { name: "Connectors" }).click();
  await expect(page.getByRole("heading", { name: "Connectors" })).toBeVisible();
  const routing = page.getByRole("region", { name: "GPT-5.6 routing" });
  await expect(routing).toContainText("gpt-5.6-sol");
  await expect(routing).toContainText("gpt-5.6-terra");
  await expect(routing).toContainText("gpt-5.6-luna");
  await expect(routing).toContainText("Deterministic harness");
  const command = `architecture-tutor-${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "New agent" }).click();
  await page.getByLabel("Agent name").fill("Architecture tutor");
  await page.getByLabel("Agent handle").fill(command);
  await page.getByLabel("Agent description").fill("Explains why each paper component is necessary.");
  await page.getByLabel("Agent instructions").fill("Explain each mechanism through necessity, counterfactual removal, source evidence, and a minimal executable probe.");
  await page.getByRole("dialog", { name: "New agent" }).getByRole("button", { name: "Create agent" }).click();
  const agentRow = page.getByRole("region", { name: "Custom agents" }).locator("article").filter({ hasText: "Architecture tutor" });
  await expect(agentRow).toContainText(command);
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-connectors.png" });

  await page.getByRole("button", { name: "Study", exact: true }).click();
  const composer = page.getByLabel("Message the research workspace");
  const agentTrigger = page.getByRole("button", { name: "Select research agent" });
  await agentTrigger.focus();
  await agentTrigger.press("ArrowDown");
  const agentMenu = page.getByRole("listbox", { name: "Research agents" });
  await expect(agentMenu.getByRole("option").filter({ hasText: "Architecture tutor" })).toBeVisible();
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-agent-selector.png", fullPage: true });
  await expect(agentMenu.getByRole("option").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(agentMenu.getByRole("option").filter({ hasText: "Architecture tutor" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(agentTrigger).toBeFocused();
  await expect(agentTrigger).toContainText("Architecture tutor");
  await composer.fill("/");
  await expect(page.getByRole("listbox", { name: "Project skills" }).getByRole("option")).toHaveCount(10);

  await page.getByRole("button", { name: "Connectors" }).click();
  await page.getByRole("button", { name: "Delete Architecture tutor" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("region", { name: "Custom agents" }).getByText("Architecture tutor")).toHaveCount(0);

  await page.getByRole("tab", { name: /Hooks/ }).click();
  await page.getByRole("button", { name: "New hook" }).click();
  await page.getByLabel("Hook name").fill("Figure evidence gate");
  await page.getByLabel("Hook event").selectOption("figure.generate.before");
  await page.getByLabel("Hook instructions").fill("Preserve printed numeric tokens and cite every source PDF page before generating a figure.");
  await page.getByRole("dialog", { name: "New hook" }).getByRole("button", { name: "Create hook" }).click();
  const hookRow = page.getByRole("region", { name: "Prompt hooks" }).locator("article").filter({ hasText: "Figure evidence gate" });
  await expect(hookRow).toContainText("Before figure generation");
  await hookRow.getByRole("checkbox").uncheck();
  await expect(hookRow.getByRole("checkbox")).not.toBeChecked();
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-hooks.png" });
  await page.getByRole("button", { name: "Delete Figure evidence gate" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  const skillCommand = `learning-pass-${Date.now().toString(36)}`;
  await page.getByRole("tab", { name: /Skills/ }).click();
  await page.getByRole("button", { name: "New skill" }).click();
  await page.getByLabel("Skill name").fill("Mechanism learning pass");
  await page.getByLabel("Skill slash command").fill(skillCommand);
  await page.getByLabel("Skill description").fill("Builds a guided mechanism lesson with retrieval practice.");
  await page.getByLabel("Skill instructions").fill("Diagnose prerequisites, preserve stable subgoals, require a prediction before execution, bind the observation to equation and code, fade one step, and end with retrieval and transfer questions.");
  await page.getByRole("dialog", { name: "New skill" }).getByRole("button", { name: "Create skill" }).click();
  const skillRow = page.getByRole("region", { name: "Custom skills" }).locator("article").filter({ hasText: "Mechanism learning pass" });
  await expect(skillRow).toContainText(`/${skillCommand}`);

  await page.getByRole("button", { name: "Study", exact: true }).click();
  await composer.fill(`/${skillCommand}`);
  await expect(page.getByRole("listbox", { name: "Project skills" }).getByRole("option").filter({ hasText: `/${skillCommand}` })).toBeVisible();
  await composer.press("Enter");
  await expect(composer).toHaveValue(`/${skillCommand} `);
  await expect(page.locator(`.composer-skill-highlight[data-skill-command="${skillCommand}"]`)).toHaveCSS("color", "rgb(126, 182, 255)");

  await page.getByRole("button", { name: "Connectors" }).click();
  await page.getByRole("tab", { name: /Skills/ }).click();
  await page.getByRole("button", { name: "Delete Mechanism learning pass" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
});

test("workspace keeps usable studies when one startup service fails and retries in place", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop resilience assertion");
  await pinLora(request);
  let profileCalls = 0;
  await page.route("**/api/system/profile", async (route) => {
    profileCalls += 1;
    if (profileCalls <= 2) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "profile temporarily unavailable" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LoRA: Low-Rank Adaptation of Large Language Models" })).toBeVisible();
  const warning = page.getByRole("alert").filter({ hasText: "Could not profile this computer" });
  await expect(warning).toContainText("Available local data remains usable");
  await warning.getByRole("button", { name: "Retry" }).click();
  await expect(warning).toBeHidden();
  expect(profileCalls).toBeGreaterThanOrEqual(3);
});

test("notebook load failure blocks editing until an explicit retry succeeds", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop data-safety assertion");
  await pinLora(request);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LoRA: Low-Rank Adaptation of Large Language Models" })).toBeVisible();

  let notebookReads = 0;
  await page.route(/\/api\/notebooks\/.*\?optional=1$/, async (route) => {
    notebookReads += 1;
    if (notebookReads <= 2) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "saved notebook temporarily unavailable" }) });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Notebook unavailable" })).toBeVisible();
  await expect(page.getByText("Existing saved content was not replaced or opened for editing.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Executable research notebook" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save version" })).toHaveCount(0);

  await page.getByRole("button", { name: "Retry notebook" }).click();
  await expect(page.getByRole("region", { name: "Executable research notebook" })).toBeVisible();
  expect(notebookReads).toBeGreaterThanOrEqual(3);
});

test("conversation history failure is separate from agent messages and can be retried", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop conversation recovery assertion");
  await pinLora(request);
  let messageReads = 0;
  let messagesUnavailable = true;
  await page.route(/\/api\/studies\/[^/]+\/messages$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    messageReads += 1;
    if (messagesUnavailable) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "conversation store temporarily unavailable" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  const alert = page.getByRole("alert").filter({ hasText: "conversation store temporarily unavailable" });
  await expect(alert).toContainText("No stored message was replaced");
  await expect(page.locator(".chat-message.is-assistant").filter({ hasText: "conversation store temporarily unavailable" })).toHaveCount(0);
  messagesUnavailable = false;
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toBeHidden();
  expect(messageReads).toBeGreaterThanOrEqual(2);
});

test("message send failure restores the draft instead of impersonating an agent response", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop message recovery assertion");
  await pinLora(request);
  let rejectWrite = true;
  await page.route(/\/api\/studies\/[^/]+\/messages$/, async (route) => {
    if (route.request().method() !== "POST" || !rejectWrite) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "message write temporarily unavailable" }) });
  });

  await page.goto("/");
  const composer = page.getByLabel("Message the research workspace");
  const draft = `Retain this unsent research question ${Date.now()}`;
  await composer.fill(draft);
  await page.getByRole("button", { name: "Send message" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "message write temporarily unavailable" });
  await expect(alert).toContainText("The unsent draft was restored");
  await expect(composer).toHaveValue(draft);
  await expect(page.locator(".chat-message.is-assistant").filter({ hasText: "message write temporarily unavailable" })).toHaveCount(0);

  rejectWrite = false;
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(composer).toHaveValue("");
  await expect(page.getByText(/Recorded in study-.* provenance/)).toBeVisible();
});

test("a late message response never leaks into a different study", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop message race assertion");
  const firstStudy = await pinLora(request);
  const secondResponse = await request.post("/api/studies/inspect", { data: { paperUrl: "https://arxiv.org/abs/1706.03762" } });
  expect(secondResponse.ok()).toBe(true);

  let signalStarted!: () => void;
  let releaseResponse!: () => void;
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(/\/api\/studies\/[^/]+\/messages$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    signalStarted();
    await release;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ recordedAt: new Date().toISOString() }) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Attention Is All You Need" })).toBeVisible();
  const oldStudyQuestion = `Question for the old study ${Date.now()}`;
  await page.getByLabel("Message the research workspace").fill(oldStudyQuestion);
  await page.getByRole("button", { name: "Send message" }).click();
  await started;
  await page.locator(`.project-row-shell[data-study-id="${firstStudy.studyId}"] .project-row`).click();
  await expect(page.getByRole("heading", { name: "LoRA: Low-Rank Adaptation of Large Language Models" })).toBeVisible();
  releaseResponse();
  await expect(page.getByRole("button", { name: "Select research agent" })).toBeEnabled();
  await expect(page.getByText(oldStudyQuestion, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Recorded in study-.* provenance/)).toHaveCount(0);
});

test("dataset load failure blocks an empty-plan overwrite and retries", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop dataset recovery assertion");
  await pinLora(request);
  let unavailable = true;
  await page.route(/\/api\/studies\/[^/]+\/datasets$/, async (route) => {
    if (route.request().method() !== "GET" || !unavailable) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "dataset store temporarily unavailable" }) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Datasets" }).click();
  await expect(page.getByRole("heading", { name: "Dataset evidence unavailable" })).toBeVisible();
  await expect(page.getByText("No saved plan was replaced.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find datasets" })).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Dataset evidence unavailable" })).toBeHidden();
  await expect(page.locator(".dataset-table, .execution-empty")).toBeVisible();
});

test("remote planning remains blocked when saved notebook status cannot be verified", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop remote gate recovery assertion");
  await pinLora(request);
  await page.goto("/");
  let unavailable = true;
  await page.route(/\/api\/notebooks\/.*\?optional=1$/, async (route) => {
    if (!unavailable) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "saved notebook status temporarily unavailable" }) });
  });

  await page.getByRole("button", { name: "Remote" }).click();
  const gate = page.getByRole("alert").filter({ hasText: "saved notebook status temporarily unavailable" });
  await expect(gate).toContainText("Remote planning remains blocked");
  await expect(page.getByRole("button", { name: "Create plan" })).toBeDisabled();
  unavailable = false;
  await gate.getByRole("button", { name: "Retry" }).click();
  await expect(gate).toBeHidden();
  await expect(page.getByText(/Saved notebook ready|Save required/)).toBeVisible();
});

test("connector configuration failure disables mutation until retry", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop connector recovery assertion");
  await pinLora(request);
  let connectorReads = 0;
  await page.route("**/api/connectors", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    connectorReads += 1;
    if (connectorReads <= 2) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "connector configuration temporarily unavailable" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Connectors" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "connector configuration temporarily unavailable" });
  await expect(alert).toBeVisible();
  await expect(page.getByRole("button", { name: "New agent" })).toBeDisabled();
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toBeHidden();
  await expect(page.getByRole("region", { name: "Custom agents" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New agent" })).toBeEnabled();
  expect(connectorReads).toBeGreaterThanOrEqual(3);
});

test("runs retain successful local manifests when Modal history fails", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop partial run-history assertion");
  await pinLora(request);
  const localRun = {
    runId: "run-partial-evidence",
    targetCellId: "mechanism-check",
    status: "passed",
    imageDigest: "sha256:runner-image",
    codeHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    createdAt: new Date().toISOString(),
    durationMs: 42,
    artifacts: ["mechanism.png"],
  };
  let remoteReads = 0;
  await page.route(/\/api\/notebooks\/[^/]+\/runs$/, (route) => route.fulfill({ json: { runs: [localRun] } }));
  await page.route(/\/api\/notebooks\/[^/]+\/modal\/runs$/, async (route) => {
    remoteReads += 1;
    if (remoteReads <= 2) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Modal history temporarily unavailable" }) });
      return;
    }
    await route.fulfill({ json: { runs: [] } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Runs" }).click();
  await expect(page.getByRole("region", { name: "Stored run manifests" })).toContainText("1 retained run · 1 local · 0 Modal");
  await expect(page.getByText("mechanism-check", { exact: true })).toBeVisible();
  const warning = page.getByRole("alert").filter({ hasText: "Modal history temporarily unavailable" });
  await expect(warning).toContainText("Available run manifests remain visible");
  await warning.getByRole("button", { name: "Retry" }).click();
  await expect(warning).toBeHidden();
  await expect(page.getByRole("region", { name: "Stored run manifests" })).toContainText("1 retained run · 1 local · 0 Modal");
  expect(remoteReads).toBeGreaterThanOrEqual(3);
});

test("notebook runtime status is a working refresh control", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop notebook control assertion");
  await pinLora(request);
  let runtimeCalls = 0;
  await page.route("**/api/runtime/status", async (route) => {
    runtimeCalls += 1;
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  const refresh = page.getByRole("button", { name: "Refresh local runtime status" });
  await expect(refresh).toBeVisible();
  await refresh.click();
  await expect.poll(() => runtimeCalls).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".notebook-toast")).toContainText(/Local runtime (status refreshed|is not ready)/);
});

test("runner transport failure never fabricates a run manifest or provenance", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop runner provenance assertion");
  const study = await pinLora(request);
  const notebookId = `${study.studyId}-evidence-notebook`;
  const before = await request.get(`/api/notebooks/${notebookId}/runs`).then((response) => response.json()) as { runs: unknown[] };
  await page.route(/\/api\/notebooks\/[^/]+\/cells\/[^/]+\/run$/, (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "runner transport temporarily unavailable" }),
  }));

  await page.goto("/");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  const cell = page.locator("[data-notebook-cell-id='source-pin']");
  await cell.getByRole("button", { name: "Run source-pin" }).click();
  const alert = cell.getByRole("alert");
  await expect(alert).toContainText("Run not recorded");
  await expect(alert).toContainText("Existing verified output was retained");
  await expect(cell.locator(".cell-status")).toHaveText("idle");
  await expect(cell.locator(".cell-output")).toHaveCount(0);
  await expect(page.getByText(/client-/)).toHaveCount(0);

  const after = await request.get(`/api/notebooks/${notebookId}/runs`).then((response) => response.json()) as { runs: unknown[] };
  expect(after.runs).toHaveLength(before.runs.length);
});

test("notebook collaboration uses chat annotations without a thread tab", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop notebook inspector assertion");
  await pinLora(request);
  await page.goto("/");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Threads" })).toHaveCount(0);
  await expect(page.getByLabel("Add a note about this cell")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Artifact" })).toHaveAttribute("aria-selected", "true");
});

test("unsaved code edits remain visible and expose an explicit retry", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop notebook save recovery assertion");
  await pinLora(request);
  await page.goto("/");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  let rejectSave = true;
  await page.route(/\/api\/notebooks\/[^/]+\/save$/, async (route) => {
    if (!rejectSave) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "notebook storage temporarily unavailable" }) });
  });

  const editor = page.getByLabel("Edit code cell source-pin");
  const marker = `# retained-unsaved-edit-${Date.now()}`;
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(`\n${marker}`);
  await page.getByRole("button", { name: "Save version" }).focus();
  const alert = page.getByRole("alert").filter({ hasText: "Unsaved changes" });
  await expect(alert).toContainText("notebook storage temporarily unavailable");
  await expect(editor).toContainText(marker);

  rejectSave = false;
  await alert.getByRole("button", { name: "Retry save" }).click();
  await expect(alert).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(page.getByLabel("Edit code cell source-pin")).toContainText(marker);
});

test("new study dialog accepts a local PDF without a paper URL", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only PDF upload assertion");
  await pinLora(request);
  const sourceUrl = "https://arxiv.org/pdf/2106.09685";
  const cacheKey = createHash("sha256").update(sourceUrl).digest("hex");
  const pdfPath = resolve(".paperlab/e2e/sources/papers", cacheKey, "source.pdf");
  await page.goto("/");
  await page.getByRole("button", { name: "New study" }).click();
  await page.getByLabel("Paper PDF").setInputFiles(pdfPath);
  await expect(page.getByLabel("Paper URL or DOI")).toBeDisabled();
  await page.getByRole("button", { name: "Start inspection" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("complementary", { name: "Study details" }).getByText(/upload ·/)).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Source map" }).click();
  await expect(page.getByText(/26 \/ 26 pages/)).toBeVisible();
  await expect(page.getByText(/unpdf-pdfjs · upload/)).toBeVisible();
});

test("invalid source hosts are blocked without closing the dialog", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only validation assertion");
  await pinLora(request);
  await page.goto("/");
  await page.getByRole("button", { name: "New study" }).click();
  await page.getByLabel("Paper URL or DOI").fill("http://127.0.0.1/private-paper");
  await page.getByRole("button", { name: "Start inspection" }).click();
  await expect(page.getByRole("alert")).toContainText("Unsupported paper host");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("execution view reports only detected runtime state", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only runtime assertion");
  await pinLora(request);
  await page.goto("/");
  await page.getByRole("button", { name: "Runs" }).click();
  await expect(page.getByRole("heading", { name: "Runtime evidence" })).toBeVisible();
  await expect(page.locator(".execution-run-list, .execution-empty")).toBeVisible();
  await expect(page.getByText(/logical cores/)).toBeVisible();
  await expect(page.getByText(/Docker connected|Docker not connected|Runner image/).first()).toBeVisible();
});

test("dataset view exposes the real planning gate without placeholder recommendations", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only dataset gate assertion");
  await pinLora(request);
  await page.goto("/");
  await page.getByRole("button", { name: "Datasets" }).click();
  await expect(page.getByRole("heading", { name: "Resource-fit dataset evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No dataset plan has run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find datasets" })).toBeDisabled();
  await expect(page.locator(".dataset-table")).toHaveCount(0);
});

test("remote view separates local planning from explicit external launch approval", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only remote execution assertion");
  const { studyId } = await pinLora(request);
  await page.goto("/");
  await page.getByRole("button", { name: "Remote" }).click();
  await expect(page.getByRole("heading", { name: "Bounded Modal execution" })).toBeVisible();
  const gpuSelect = page.getByRole("region", { name: "Modal execution plan" }).getByLabel("GPU");
  await expect(gpuSelect).toHaveValue("auto");
  await expect(gpuSelect).toContainText("Auto (recommended)");
  await expect(page.getByRole("region", { name: "Modal execution plan" }).getByLabel("Timeout (seconds)")).toHaveValue("300");
  await expect(page.getByRole("button", { name: "Launch approved run" })).toHaveCount(0);
  await expect(page.getByText("Saved notebook ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create plan" })).toBeEnabled();
  await expect(page.getByText(/Modal is not connected|Enter a valid Modal API token|Connected/)).toBeVisible();
  const modalStatus = await page.request.get("/api/modal/status").then((response) => response.json());
  if (!modalStatus.ready) {
    const authentication = page.getByRole("region", { name: "Modal authentication setup" });
    await expect(authentication.getByRole("link", { name: "Create token" })).toHaveAttribute("href", "https://modal.com/settings/tokens");
    await expect(authentication.getByLabel("Token Secret")).toHaveAttribute("type", "password");
    await expect(authentication.getByLabel("Remember on this device")).toBeChecked();
    await authentication.getByLabel("Token ID").fill("ak-playwright-example");
    await authentication.getByLabel("Token Secret").fill("as-playwright-secret");
    await expect(authentication.getByRole("button", { name: "Connect Modal" })).toBeEnabled();
    await page.screenshot({ path: "artifacts/codex-lab-modal-auth.png", fullPage: true });
  }

  const notebookId = `${studyId}-evidence-notebook`;
  const planned = await request.post(`/api/notebooks/${notebookId}/modal/plan`, { data: { gpu: "L4", timeoutSeconds: 60, localBlocker: "The UI archive fixture intentionally documents a local execution blocker." } });
  expect(planned.status()).toBe(201);
  const plannedBody = await planned.json();
  const planPath = resolve(dirname(resolve(plannedBody.plan.appPath)), "plan.json");
  const launchPath = resolve(dirname(resolve(plannedBody.plan.appPath)), "launch.json");
  const remoteFigure = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const remoteFigureHash = createHash("sha256").update(remoteFigure).digest("hex");
  await mkdir(resolve(dirname(resolve(plannedBody.plan.appPath)), "files"), { recursive: true });
  await writeFile(resolve(dirname(resolve(plannedBody.plan.appPath)), "files", "remote-result.png"), remoteFigure);
  const storedPlan = JSON.parse(await readFile(planPath, "utf8"));
  await writeFile(planPath, JSON.stringify({ ...storedPlan, status: "consumed", consumedAt: "2026-07-21T01:00:01.000Z" }));
  await writeFile(launchPath, JSON.stringify({
    schemaVersion: "1.0", planId: plannedBody.plan.planId, notebookId, planHash: plannedBody.plan.planHash,
    notebookHash: plannedBody.plan.notebookHash, notebookContentHash: plannedBody.plan.notebookContentHash, appSha256: plannedBody.plan.appSha256, status: "passed",
    startedAt: "2026-07-21T01:00:00.000Z", endedAt: "2026-07-21T01:00:01.000Z", stdout: "[source-pin]\nbranch=main\n", stderr: "",
    remoteResult: { status: "passed", cells: [{ id: "source-pin", status: "passed", stdout: "branch=main\n", stderr: "", duration_ms: 12.5 }], artifacts: [{ path: "remote-result.png", mimeType: "image/png", sizeBytes: remoteFigure.byteLength, sha256: remoteFigureHash }] },
  }));
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Runs" }).click();
  const retained = page.getByRole("region", { name: "Stored run manifests" });
  await expect(retained).toContainText("1 retained run · 0 local · 1 Modal");
  await expect(retained).toContainText("L4 Modal run");
  await retained.getByText("Cell output and artifacts", { exact: true }).click();
  await expect(retained).toContainText("branch=main");
  await expect(retained.getByRole("img", { name: "Modal output remote-result.png" })).toBeVisible();
  await expect(retained.getByRole("link", { name: "Download Modal artifact remote-result.png" })).toHaveAttribute("href", new RegExp(`/api/notebooks/${notebookId}/modal/runs/.+/files/remote-result.png`));
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await page.getByRole("button", { name: "Freeze results" }).click();
  await page.getByRole("tab", { name: "Artifact" }).click();
  const frozen = page.locator(".frozen-bundle");
  await expect(frozen).toContainText("0 local · 1 Modal");
  await frozen.getByText("Bundled run evidence", { exact: false }).click();
  await expect(frozen.getByRole("link", { name: /runs\/modal\/.+\/launch\.json/ })).toBeVisible();
  await expect(frozen.getByRole("link", { name: /runs\/modal\/.+\/files\/remote-result\.png/ })).toBeVisible();
});

test("Modal connection keeps an unready response visible instead of silently clearing the form", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only connection regression assertion");
  await pinLora(request);
  await page.route("**/api/modal/connect", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ installed: true, authenticated: false, ready: false, message: "Saved Modal credentials could not be verified" }),
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Remote" }).click();
  const authentication = page.getByRole("region", { name: "Modal authentication setup" });
  await authentication.getByLabel("Token ID").fill("ak-playwright-example");
  await authentication.getByLabel("Token Secret").fill("as-playwright-secret");
  await authentication.getByRole("button", { name: "Connect Modal" }).click();
  await expect(authentication.getByRole("alert")).toHaveText("Saved Modal credentials could not be verified");
  await expect(authentication.getByLabel("Token ID")).toHaveValue("ak-playwright-example");
  await expect(authentication.getByLabel("Token Secret")).toHaveValue("");
});

test("Run all requires one-time Modal approval and returns remote outputs to the notebook", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only Modal approval workflow assertion");
  await pinLora(request);
  const planHash = "1".repeat(64);
  const appSha256 = "2".repeat(64);
  let localRunRequests = 0;
  await page.route("**/api/modal/status", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ installed: true, authenticated: true, ready: true, version: "1.5.2" }),
  }));
  await page.route(/\/api\/notebooks\/[^/]+\/cells\/[^/]+\/run$/, async (route) => {
    localRunRequests += 1;
    await route.abort();
  });
  await page.route(/\/api\/notebooks\/[^/]+\/modal\/plan$/, async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ gpu: "auto", timeoutSeconds: 300 });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        approvalToken: "approval-token-for-this-single-modal-run",
        plan: {
          planId: "modal-ui-test",
          notebookId: "modal-ui-notebook",
          gpu: "T4",
          selectionReason: "Smallest compatible GPU",
          timeoutSeconds: 300,
          maximumGpuCostUsd: 0.0492,
          packages: ["numpy==2.4.1"],
          networkPolicy: "blocked",
          containerMemoryMiB: 8192,
          codeCellCount: 1,
          planHash,
          appSha256,
        },
      }),
    });
  });
  await page.route(/\/api\/notebooks\/[^/]+\/modal\/launch$/, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ planId: "modal-ui-test", approvalToken: "approval-token-for-this-single-modal-run" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        planId: "modal-ui-test",
        status: "passed",
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        endedAt: new Date().toISOString(),
        stdout: "[source-pin]\nmodal-pass",
        stderr: "",
        remoteResult: {
          status: "passed",
          cells: [{ id: "source-pin", status: "passed", stdout: "modal-pass\ndevice=cuda:0", stderr: "", duration_ms: 412 }],
          artifacts: [{ path: "modal-figure.png", mimeType: "image/png", sizeBytes: 68, sha256: "3".repeat(64) }],
          executionEnvironment: { requestedDevice: "cuda", resolvedDevice: "cuda:0", torchVersion: "2.13.0+cu130" },
        },
      }),
    });
  });
  await page.route("**/modal/runs/modal-ui-test/artifacts/modal-figure.png", async (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  }));

  await page.goto("/");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await page.getByRole("button", { name: "Run all" }).click();
  const approval = page.getByRole("dialog", { name: "Run this notebook on Modal?" });
  await expect(approval).toBeVisible();
  await expect(approval).toContainText("Modal T4");
  await expect(approval).toContainText("US$0.0492");
  await expect(approval).toContainText("numpy==2.4.1");
  await page.screenshot({ path: "artifacts/codex-modal-notebook-approval.png", fullPage: true });
  expect(localRunRequests).toBe(0);

  await approval.getByRole("button", { name: "Allow Modal run" }).click();
  await expect(approval).toBeHidden();
  const output = page.getByRole("region", { name: "source-pin output" });
  await expect(output).toContainText("modal-pass");
  await expect(output).toContainText("Modal T4 · cuda:0");
  await expect(page.getByText("Remote outputs retained locally")).toBeVisible();
  await expect(page.getByRole("img", { name: "source-pin generated figure" })).toHaveAttribute("src", /\/modal\/runs\/modal-ui-test\/artifacts\/modal-figure\.png$/);
  await expect(page.getByRole("complementary", { name: "Notebook collaboration and provenance" })).toContainText("modal-figure.png");
  expect(localRunRequests).toBe(0);

  await page.reload();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await expect(page.getByRole("region", { name: "source-pin output" })).toContainText("modal-pass");
});

test("verified notebook produces a real isolated cell result when Docker is ready", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only container assertion");
  await pinLora(request);
  const profileResponse = await page.request.get("/api/system/profile");
  const profile = await profileResponse.json();
  test.skip(!profile.runnerImageReady, "The optional Docker runner image is not built on this computer");

  await page.goto("/");
  await page.getByRole("button", { name: "Notebook" }).click();
  await expect(page.getByText("Docker ready")).toBeVisible({ timeout: 10_000 });
  const codeEditor = page.getByLabel("Edit code cell source-pin");
  await expect(codeEditor).toBeVisible();
  const highlightedColors = await page.locator(".python-code-editor .cm-content span").evaluateAll((spans) => [...new Set(spans.map((span) => getComputedStyle(span).color))]);
  expect(highlightedColors.length).toBeGreaterThan(2);
  await page.locator(".notebook-code-cell").filter({ has: codeEditor }).screenshot({ path: "artifacts/codex-lab-syntax-editor.png" });
  const outputRun = page.locator("[aria-label='source-pin output'] footer span").first();
  const previousRunId = await outputRun.count() ? await outputRun.textContent() : "";
  await page.getByRole("button", { name: "Run source-pin" }).click();
  await expect.poll(async () => await outputRun.count() ? await outputRun.textContent() : "", { timeout: 20_000 }).not.toBe(previousRunId);
  await expect(page.locator(".cell-output pre").filter({ hasText: "merge_error=" })).toBeVisible({ timeout: 20_000 });
  const runId = (await outputRun.textContent()) || "";
  await page.reload();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await expect(page.locator(".cell-output pre").filter({ hasText: "merge_error=" })).toBeVisible();
  await expect(page.locator("[aria-label='source-pin output'] footer")).toContainText(runId);
  await page.getByRole("button", { name: "Freeze results" }).click();
  await expect(page.getByText("notebook.ipynb", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "paper.pdf Pinned paper" })).toHaveAttribute("href", /\/files\/sources\/paper\.pdf$/);
  await expect(page.locator(".run-result")).toHaveCount(0);
  await expect(page.locator(".frozen-bundle")).toContainText("artifact-");
  const artifactId = (await page.locator(".frozen-bundle > strong").textContent()) || "";
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-run-results.png", fullPage: true });

  await page.reload();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await page.getByRole("tab", { name: "Artifact" }).click();
  await expect(page.locator(".frozen-bundle > strong")).toHaveText(artifactId);
  await expect(page.locator(".run-result")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Runs" }).click();
  await expect(page.getByRole("region", { name: "Stored run manifests" })).toContainText(runId);
});

test("markdown editor controls keep a dedicated row above the editor", async ({ page, request }, testInfo) => {
  await pinLora(request);
  await page.goto("/");
  if (testInfo.project.name.includes("mobile")) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();

  const editButton = page.getByRole("button", { name: "Edit explanation source-overview" });
  await editButton.click();
  const closeButton = page.getByRole("button", { name: "Close editor for source-overview" });
  const toolbar = closeButton.locator("xpath=..");
  const editor = page.getByLabel("Edit markdown cell source-overview");
  await expect(editor).toBeVisible();
  await expect(closeButton).not.toHaveAttribute("title", /.+/);

  const toolbarBox = await toolbar.boundingBox();
  const editorBox = await editor.boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(editorBox).not.toBeNull();
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(editorBox!.y);

  await closeButton.click();
  const beforeCells = await page.locator("[data-notebook-cell-id]").count();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Code cell added and saved");
  const addedCell = page.locator("[data-notebook-cell-id]").last();
  const addedCellId = await addedCell.getAttribute("data-notebook-cell-id");
  expect(addedCellId).toMatch(/^code-[0-9a-f-]+$/);
  await expect(page.locator("[data-notebook-cell-id]")).toHaveCount(beforeCells + 1);
  await page.reload();
  if (testInfo.project.name.includes("mobile")) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await expect(page.locator(`[data-notebook-cell-id="${addedCellId}"]`)).toBeVisible();
});

test("notebook selections track scrolling and become notes or agent context", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop annotation workspace assertion");
  await pinLora(request);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  const sourceCell = page.locator("[data-notebook-cell-id='source-overview']");
  await expect(sourceCell).toBeVisible();

  const selectRenderedText = async () => {
    await sourceCell.locator(".rich-markdown").evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();
      while (textNode && (textNode.textContent || "").trim().length < 24) textNode = walker.nextNode();
      if (!textNode) throw new Error("No annotatable text node was found");
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(48, textNode.textContent?.length || 0));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  };

  const codeCell = page.locator("[data-notebook-cell-id='source-pin']");
  const selectCodeText = async () => {
    await codeCell.locator(".cm-line").first().evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();
      while (textNode && (textNode.textContent || "").length < 3) textNode = walker.nextNode();
      if (!textNode?.textContent) throw new Error("No annotatable code text was found");
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(36, textNode.textContent.length));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  };

  await selectRenderedText();
  const quickAnnotate = page.getByRole("button", { name: "Annotate", exact: true });
  await expect(quickAnnotate).toBeVisible();
  const annotateBeforeScroll = await quickAnnotate.boundingBox();
  expect(annotateBeforeScroll).not.toBeNull();
  const notebookScroller = page.locator(".notebook-scroll");
  await notebookScroller.evaluate((element) => { element.style.paddingBottom = "1000px"; });
  await notebookScroller.evaluate((element) => { element.scrollTop += 48; });
  await expect.poll(async () => Math.round((await quickAnnotate.boundingBox())?.y || 0)).toBeLessThan(Math.round(annotateBeforeScroll!.y - 30));
  await notebookScroller.evaluate((element) => { element.scrollTop -= 48; });
  await page.locator(".notebook-context").click();
  await expect(quickAnnotate).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.isCollapsed ?? true)).toBe(true);

  await selectRenderedText();
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  const editor = page.locator(".annotation-editor");
  await editor.getByRole("button", { name: "For me" }).click();
  const personalNote = `Remember this mechanism ${Date.now()}`;
  await editor.getByLabel("Annotation note").fill(personalNote);
  await editor.getByRole("button", { name: "Annotate", exact: true }).click();
  const savedPersonalNote = page.locator(".notebook-annotation-notes").filter({ hasText: personalNote });
  await expect(savedPersonalNote).toContainText("Selection");
  await expect(savedPersonalNote.locator(".annotation-note")).toHaveCSS("font-size", "13px");
  await expect(savedPersonalNote.getByText("Selected context", { exact: true })).toBeVisible();
  await expect(savedPersonalNote.locator("blockquote")).toBeHidden();
  await savedPersonalNote.getByText("Selected context", { exact: true }).click();
  await expect(savedPersonalNote.locator("blockquote")).toBeVisible();
  await expect(page.locator(".notebook-inspector")).toHaveCSS("width", "380px");

  await selectCodeText();
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  const agentNote = `Explain this selected passage ${Date.now()}`;
  await editor.getByLabel("Annotation note").fill(agentNote);
  await editor.getByRole("button", { name: "Annotate", exact: true }).click();

  await expect(page.getByRole("heading", { name: "LoRA: Low-Rank Adaptation of Large Language Models" })).toBeVisible();
  await expect(page.locator(".chat-composer-dock .chat-annotation-context")).toContainText("Selection · source-pin");
  await expect(page.getByLabel("Message the research workspace")).toHaveValue(agentNote);
  await expect(page.getByRole("complementary", { name: "Referenced notebook artifact" })).toBeVisible();
  await expect(page.locator(".artifact-side-pane .notebook-title")).toContainText("LoRA");
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-annotation-artifact-pane.png", fullPage: true });

  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".chat-message.is-user").filter({ hasText: agentNote }).locator(".chat-annotation-context")).toContainText("Selection");
  await expect(page.getByText(/Recorded in study-.* provenance/)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Referenced notebook artifact" })).toBeVisible();
  await page.reload();
  await expect(page.locator(".chat-message.is-user").filter({ hasText: agentNote }).locator(".chat-annotation-context")).toContainText("source-pin");
});

test("paper math and generated figures render as notebook-native outputs", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only notebook rendering assertion");
  const profile = await request.get("/api/system/profile").then((response) => response.json());
  test.skip(!profile.runnerImageReady, "The optional Docker runner image is not built on this computer");
  const inspection = await request.post("/api/studies/inspect", { data: { paperUrl: "https://arxiv.org/abs/1706.03762" } });
  expect(inspection.ok()).toBe(true);
  const study = await inspection.json();
  const notebookId = `${study.studyId}-evidence-notebook`;
  const fixture = {
    id: notebookId,
    title: "Paper rendering contract",
    paperUrl: study.paper.url,
    image: "codex-lab-python:0.1",
    cells: [
      {
        id: "math-explanation",
        kind: "markdown",
        source: String.raw`## Normalization mechanism

Inline notation \(\hat{x}_i=(x_i-\mu_B)/\sqrt{\sigma_B^2+\varepsilon}\) must render as math.

\[
y_i=\gamma\hat{x}_i+\beta
\]`,
        executionCount: null,
        runStatus: "idle",
      },
      {
        id: "paper-figure",
        kind: "code",
        source: `from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

labels = ["Baseline", "Proposed"]
values = [81.2, 84.6]
fig, ax = plt.subplots(figsize=(4.8, 3.2), constrained_layout=True)
ax.bar(labels, values, color=["#555555", "#176b4d"])
ax.set_ylabel("Accuracy (%)")
fig.savefig("paper-figure.png", dpi=140, facecolor="white")
assert Path("paper-figure.png").stat().st_size > 1000
print("verified_points=2")`,
        executionCount: null,
        runStatus: "idle",
      },
    ],
    comments: [],
    provenance: [{ id: "rendering-contract", type: "notebook.created", actor: "user", summary: "Created rendering contract", createdAt: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  };
  const saved = await request.post(`/api/notebooks/${notebookId}/save`, { data: { notebook: fixture, expectedHash: null } });
  expect(saved.ok()).toBe(true);

  await page.goto("/");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await expect(page.locator(".katex-display")).toBeVisible();
  await expect(page.locator(".notebook-markdown-cell")).not.toContainText(String.raw`\[`);
  await page.getByRole("button", { name: "Run paper-figure" }).click();
  const figure = page.locator("[aria-label='paper-figure output'] .cell-figure img");
  await expect(figure).toBeVisible({ timeout: 20_000 });
  expect(await figure.evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight }))).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
  expect(await figure.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(200);
  const renderedFigure = await figure.evaluate((image: HTMLImageElement) => ({ width: image.getBoundingClientRect().width, outputWidth: image.closest(".cell-output")!.getBoundingClientRect().width }));
  expect(renderedFigure.width).toBeLessThanOrEqual(562);
  expect(renderedFigure.width).toBeLessThan(renderedFigure.outputWidth * 0.85);
  await page.getByRole("button", { name: "Annotate figure paper-figure.png" }).click();
  const figureAnnotation = page.locator(".annotation-editor");
  await expect(figureAnnotation).toContainText("Generated figure from paper-figure: paper-figure.png");
  await figureAnnotation.getByRole("button", { name: "For me" }).click();
  await figureAnnotation.getByLabel("Annotation note").fill("Compare this rendered figure with the cited values.");
  await figureAnnotation.getByRole("button", { name: "Annotate", exact: true }).click();
  const savedFigureAnnotation = page.locator(".notebook-annotation-notes").filter({ hasText: "Compare this rendered figure" });
  await expect(savedFigureAnnotation).toContainText("Figure · paper-figure");
  await page.screenshot({ path: "artifacts/codex-lab-paper-figure.png", fullPage: true });
});

test("descriptive paper citations open and highlight the pinned PDF passage", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only evidence navigation assertion");
  await page.addInitScript(() => {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value: undefined, configurable: true });
  });
  const sourceUrl = "https://arxiv.org/pdf/2106.09685";
  const cacheKey = createHash("sha256").update(sourceUrl).digest("hex");
  const source = await readFile(resolve(".paperlab/e2e/sources/papers", cacheKey, "source.pdf"));
  const upload = await request.post("/api/papers/upload", {
    headers: { "Content-Type": "application/pdf", "X-Paper-Filename": encodeURIComponent("evidence-navigation.pdf") },
    data: source,
    timeout: 90_000,
  });
  expect(upload.ok()).toBe(true);
  const uploaded = await upload.json();
  const inspection = await request.post("/api/studies/inspect", { data: { uploadedPaperId: uploaded.uploadId } });
  expect(inspection.ok()).toBe(true);
  const study = await inspection.json();
  const pageResponse = await request.get(`/api/studies/${study.studyId}/paper/pages/1`);
  expect(pageResponse.ok()).toBe(true);
  const paperPage = await pageResponse.json() as { text: string };
  const quote = "We propose Low-Rank Adaptation, or LoRA, which freezes the pre- trained model weights and injects trainable rank decomposition matrices into each layer";
  expect(paperPage.text.replace(/\s+/g, " ")).toContain(quote);
  const label = "LoRA freezes pretrained weights and adds trainable low-rank matrices to Transformer layers";
  const sourceCaption = "Figure 1: Our reparametriza- tion.";
  expect(paperPage.text.replace(/\s+/g, " ")).toContain(sourceCaption);
  const notebookId = `${study.studyId}-evidence-notebook`;
  const fixture = {
    id: notebookId,
    title: "LoRA evidence navigation notebook",
    paperUrl: study.paper.url,
    image: "codex-lab-python:0.1",
    cells: [{
      id: "lora-evidence",
      kind: "markdown",
      source: `## Why low-rank adaptation matters

$$
\\mu_B^{(k)}=\\frac{1}{m}\\sum_{i=1}^{m}x_i^{(k)}
$$

$$
\\sigma_B^{2(k)}=\\frac{1}{m}\\sum_{i=1}^{m}\\left(x_i^{(k)}-\\mu_B^{(k)}\\right)^2
$$

$$
\\hat{x}_i^{(k)}=\\frac{x_i^{(k)}-\\mu_B^{(k)}}{\\sqrt{\\sigma_B^{2(k)}+\\varepsilon}},\\qquad y_i^{(k)}=\\gamma^{(k)}\\hat{x}_i^{(k)}+\\beta^{(k)}
$$

![${sourceCaption}](/evidence/source-figure?page=1&caption=${encodeURIComponent(sourceCaption)}&label=Figure%201)

[${label}](/evidence/pdf?page=1&quote=${encodeURIComponent(quote)})`,
      executionCount: null,
      runStatus: "idle",
    }],
    comments: [],
    provenance: [{ id: "evidence-navigation", type: "notebook.created", actor: "user", summary: "Created evidence navigation contract", createdAt: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  };
  const saved = await request.post(`/api/notebooks/${notebookId}/save`, { data: { notebook: fixture, expectedHash: null } });
  expect(saved.ok()).toBe(true);

  await page.goto("/");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  const sourceFigure = page.locator(".paper-source-figure");
  await expect(sourceFigure).toHaveAttribute("data-crop-status", "ready", { timeout: 15_000 });
  const sourceImage = sourceFigure.locator("img");
  const sourcePixels = await sourceImage.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return { width: 0, height: 0, nonWhite: 0 };
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhite = 0;
    const stride = Math.max(4, Math.floor(pixels.length / 12_000 / 4) * 4);
    for (let index = 0; index < pixels.length; index += stride) {
      if (pixels[index] < 242 || pixels[index + 1] < 242 || pixels[index + 2] < 242) nonWhite += 1;
    }
    return { width: canvas.width, height: canvas.height, nonWhite };
  });
  expect(sourcePixels.width).toBeGreaterThan(150);
  expect(sourcePixels.height).toBeGreaterThan(100);
  expect(sourcePixels.nonWhite).toBeGreaterThan(80);
  const cachedFigureSrc = await sourceImage.getAttribute("src");
  expect(cachedFigureSrc).toMatch(/^data:image\/png;base64,/);
  await sourceFigure.screenshot({ path: "artifacts/codex-for-ai-researcher-original-paper-figure.png" });
  await sourceFigure.getByRole("button", { name: "Open Figure 1 on PDF page 1" }).click();
  await expect(page.getByRole("region", { name: "Cited evidence on PDF page 1" })).toContainText("Figure 1");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await expect(sourceFigure).toHaveAttribute("data-crop-status", "ready");
  await expect(sourceFigure.locator(".paper-source-figure-state")).toHaveCount(0);
  await expect(sourceFigure.locator("img")).toHaveAttribute("src", cachedFigureSrc || "");
  const citation = page.getByRole("link", { name: label });
  await expect(citation).toBeVisible();
  const mathBoxes = await page.locator(".katex-display").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, height: box.height, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
  }));
  expect(mathBoxes).toHaveLength(3);
  expect(mathBoxes.every((box) => box.height > 45 && box.scrollHeight <= box.clientHeight + 2)).toBe(true);
  expect(mathBoxes.slice(1).every((box, index) => box.top >= mathBoxes[index].bottom)).toBe(true);
  await citation.click();

  await expect(page.getByRole("heading", { name: "Retrieved evidence" })).toBeVisible();
  const evidence = page.getByRole("region", { name: "Cited evidence on PDF page 1" });
  await expect(evidence).toContainText(label);
  await expect(evidence.getByText("PDF page 1", { exact: false })).toBeVisible();
  const pdfPage = evidence.locator(".pdf-page-stage");
  await expect(pdfPage).toBeVisible();
  await expect.poll(async () => Number(await pdfPage.getAttribute("data-highlight-count")), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await evidence.locator(".pdf-text-layer .citation-highlight").count()).toBeGreaterThan(0);
  const canvasEvidence = await pdfPage.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    if (!context) return { width: 0, height: 0, nonWhite: 0 };
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhite = 0;
    const stride = Math.max(4, Math.floor(pixels.length / 20_000 / 4) * 4);
    for (let index = 0; index < pixels.length; index += stride) {
      if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) nonWhite += 1;
    }
    return { width: canvas.width, height: canvas.height, nonWhite };
  });
  expect(canvasEvidence.width).toBeGreaterThan(600);
  expect(canvasEvidence.height).toBeGreaterThan(700);
  expect(canvasEvidence.nonWhite).toBeGreaterThan(100);
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-evidence-highlight.png", fullPage: true });
});

test("a wide original architecture figure is recovered from the pinned Transformer PDF", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop source-figure framing assertion");
  const inspection = await request.post("/api/studies/inspect", {
    data: { paperUrl: "https://arxiv.org/abs/1706.03762" },
    timeout: 90_000,
  });
  expect(inspection.ok()).toBe(true);
  const study = await inspection.json();
  const caption = "Figure 1: The Transformer - model architecture.";
  const notebookId = `${study.studyId}-evidence-notebook`;
  const notebook = {
    id: notebookId,
    title: "Transformer architecture source figure",
    paperUrl: study.paper.url,
    image: "codex-lab-python:0.1",
    cells: [{
      id: "architecture-overview",
      kind: "markdown",
      source: `# Architecture\n\n## Original paper figure\n\n![${caption}](/evidence/source-figure?page=3&caption=${encodeURIComponent(caption)}&label=Figure%201)`,
      executionCount: null,
      runStatus: "idle",
    }],
    comments: [],
    provenance: [{ id: "transformer-source-figure", type: "notebook.created", actor: "agent", summary: "Created Transformer source figure contract", createdAt: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  };
  expect((await request.post(`/api/notebooks/${notebookId}/save`, { data: { notebook, expectedHash: null } })).ok()).toBe(true);

  await page.goto("/");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  const sourceFigure = page.locator(".paper-source-figure");
  await expect(sourceFigure).toHaveAttribute("data-crop-status", "ready", { timeout: 15_000 });
  const dimensions = await sourceFigure.locator("img").evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight }));
  expect(dimensions.width).toBeGreaterThan(400);
  expect(dimensions.height).toBeGreaterThan(500);
  await sourceFigure.screenshot({ path: "artifacts/codex-for-ai-researcher-transformer-original-architecture.png" });
});

test("a paper without a generated lesson shows an honest notebook gate", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only notebook gate assertion");
  await page.goto("/");
  await page.getByRole("button", { name: "New study" }).click();
  await page.getByLabel("Paper URL or DOI").fill("https://arxiv.org/abs/1706.03762");
  await page.getByRole("button", { name: "Start inspection" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Attention Is All You Need" })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await expect(page.getByText("Learning notebook not built", { exact: true })).toBeVisible();
  await expect(page.getByText("Connect a local Codex agent to build the paper guide.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-notebook-cell-id]")).toHaveCount(0);
  await expect(page.getByText("architecture_demo_ready=False")).toHaveCount(0);
});

test("each study row selectively deletes its own conversation without changing the active study", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only destructive menu assertion");
  const study = await pinLora(request);
  const marker = `Delete this conversation ${Date.now()}`;
  expect((await request.post(`/api/studies/${study.studyId}/messages`, { data: { content: marker } })).status()).toBe(201);
  const activeResponse = await request.post("/api/studies/inspect", { data: { paperUrl: "https://arxiv.org/abs/1706.03762" } });
  expect(activeResponse.ok()).toBe(true);
  const activeStudy = await activeResponse.json();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Attention Is All You Need" })).toBeVisible();
  const studyList = page.getByRole("region", { name: "Local studies" });
  await page.getByLabel("Filter local studies").fill("2106.09685");
  await expect(studyList.locator(`.project-row-shell[data-study-id="${study.studyId}"]`)).toBeVisible();
  await expect(studyList.locator(`.project-row-shell[data-study-id="${activeStudy.studyId}"]`)).toHaveCount(0);
  await page.getByLabel("Filter local studies").fill("");
  const row = page.locator(`.project-row-shell[data-study-id="${study.studyId}"]`);
  await expect(row.locator("time")).toHaveAttribute("datetime", study.createdAt);
  await row.getByRole("button", { name: /Open menu for/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Delete conversation" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Delete conversation" }).click();

  const dialog = page.getByRole("dialog", { name: "Delete this study?" });
  await expect(dialog).toContainText("messages, pinned study copy, dataset plan, notebook, runs, artifacts, and remote plans");
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-delete-study.png", fullPage: true });
  await dialog.getByRole("button", { name: "Delete study" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await request.get(`/api/studies/${study.studyId}/messages`)).status()).toBe(404);
  const latest = await request.get("/api/studies/latest").then((response) => response.json());
  expect(latest?.studyId).toBe(activeStudy.studyId);
  await expect(page.getByRole("heading", { name: "Attention Is All You Need" })).toBeVisible();
  await expect(page.locator(`.project-row-shell[data-study-id="${activeStudy.studyId}"]`)).toBeVisible();
});

test("mobile navigation remains usable without horizontal overflow", async ({ page, request }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile-only assertions");
  await pinLora(request);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "LoRA: Low-Rank Adaptation of Large Language Models" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const sidebar = page.getByRole("complementary", { name: "Research navigation" });
  await expect(sidebar).toHaveClass(/is-mobile-open/);
  await expect.poll(() => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().x))).toBe(0);
  await expect.poll(() => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeGreaterThanOrEqual(300);
  await expect(page.getByRole("button", { name: "New study" })).toBeVisible();
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-mobile-navigation.png", fullPage: true });
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Source map" }).click();
  await expect(sidebar).not.toHaveClass(/is-mobile-open/);
  await page.waitForTimeout(250);
  await expect(page.getByRole("heading", { name: "Retrieved evidence" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await expect.poll(() => page.locator(".source-evidence-section, .source-evidence-section *").evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
  await page.screenshot({ path: "artifacts/codex-lab-live-mobile.png", fullPage: true });
});

test("the original paper figure remains bounded in the mobile notebook", async ({ page, request }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile-only source figure assertion");
  const study = await pinLora(request, { withNotebook: false }) as { studyId: string } & Record<string, unknown>;
  const caption = "Figure 1: Our reparametriza- tion.";
  const notebookId = `${study.studyId}-evidence-notebook`;
  const notebook = {
    id: notebookId,
    title: "LoRA original architecture figure",
    paperUrl: "https://arxiv.org/abs/2106.09685",
    image: "codex-lab-python:0.1",
    cells: [{ id: "architecture-overview", kind: "markdown", source: `# Architecture\n\n![${caption}](/evidence/source-figure?page=1&caption=${encodeURIComponent(caption)}&label=Figure%201)`, executionCount: null, runStatus: "idle" }],
    comments: [],
    provenance: [{ id: "mobile-source-figure", type: "notebook.created", actor: "agent", summary: "Created mobile source figure contract", createdAt: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  };
  expect((await request.post(`/api/notebooks/${notebookId}/save`, { data: { notebook, expectedHash: null } })).ok()).toBe(true);
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  const sourceFigure = page.locator(".paper-source-figure");
  await expect(sourceFigure).toHaveAttribute("data-crop-status", "ready", { timeout: 15_000 });
  const fit = await sourceFigure.evaluate((element) => {
    const imageElement = element.querySelector("img")!;
    const figure = element.getBoundingClientRect();
    const image = imageElement.getBoundingClientRect();
    return { figureRight: figure.right, imageRight: image.right, viewport: window.innerWidth, overflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  expect(fit.figureRight).toBeLessThanOrEqual(fit.viewport + 1);
  expect(fit.imageRight).toBeLessThanOrEqual(fit.viewport + 1);
  expect(fit.overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-mobile-original-figure.png", fullPage: true });
});

test("every workspace tab has a direct return to the active study", async ({ page, request }, testInfo) => {
  await pinLora(request);
  await page.goto("/");
  const mobile = testInfo.project.name.includes("mobile");
  const navigation = page.getByRole("navigation", { name: "Workspace" });
  for (const label of ["Source map", "Datasets", "Notebook", "Runs", "Remote", "Connectors"]) {
    if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
    const destination = label === "Connectors" ? page.getByRole("button", { name: label, exact: true }) : navigation.getByRole("button", { name: label, exact: true });
    await destination.click();
    const back = page.getByRole("button", { name: "Back to study" });
    await expect(back).toBeVisible();
    await back.click();
    const heading = page.getByRole("heading", { name: "LoRA: Low-Rank Adaptation of Large Language Models" });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(navigation.getByRole("button", { name: "Study", exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test("mobile annotations return to chat with a full-width notebook artifact", async ({ page, request }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile-only annotation assertion");
  await pinLora(request);
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  const sourceCell = page.locator("[data-notebook-cell-id='source-overview']");
  await expect(sourceCell).toBeVisible();
  await sourceCell.locator(".rich-markdown").evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode && (textNode.textContent || "").trim().length < 24) textNode = walker.nextNode();
    if (!textNode) throw new Error("No annotatable text node was found");
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(40, textNode.textContent?.length || 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create annotation" });
  await expect(dialog.getByLabel("Annotation note")).toBeFocused();
  await dialog.getByLabel("Annotation note").fill("Explain how this mechanism changes the optimization path.");
  await dialog.getByRole("button", { name: "Annotate", exact: true }).click();
  const artifactPane = page.getByRole("complementary", { name: "Referenced notebook artifact" });
  await expect(artifactPane).toBeVisible();
  await expect(artifactPane).toHaveCSS("width", `${await page.evaluate(() => window.innerWidth)}px`);
  await expect(page.getByLabel("Message the research workspace")).toHaveValue("Explain how this mechanism changes the optimization path.");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await page.screenshot({ path: "artifacts/codex-for-ai-researcher-mobile-annotation-pane.png", fullPage: true });
});

test("desktop package onboarding exposes real local prerequisites without blocking source tools", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "codexDesktop", { value: {
      getInfo: () => Promise.resolve({ appName: "Codex for AI researcher", version: "0.1.0", platform: "darwin", dataPath: "/Users/researcher/Library/Application Support/Codex for AI researcher/workspace" }),
      signInCodex: () => Promise.resolve({ ok: true, message: "Codex sign-in completed" }),
      buildRunner: () => Promise.resolve({ ok: true, message: "Built codex-lab-python:0.1" }),
      showDataFolder: () => Promise.resolve({ ok: true, message: "Opened local data folder" }),
    } });
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Prepare this computer" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Codex agent", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Local isolated execution", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Modal GPU", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Local workspace data", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await page.screenshot({ path: testInfo.project.name.includes("mobile") ? "artifacts/desktop-onboarding-mobile.png" : "artifacts/desktop-onboarding.png", fullPage: true });
  await dialog.getByRole("button", { name: "Continue with available tools" }).click();
  await expect(dialog).toBeHidden();
  if (testInfo.project.name.includes("mobile")) await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: "Setup", exact: true })).toBeVisible();
});

test("design system reference is dark-only", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { name: "ChatGPT design system" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
