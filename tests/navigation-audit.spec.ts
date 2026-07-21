import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openWorkspaceView(page: Page, label: string, mobile: boolean): Promise<void> {
  if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("navigation", { name: "Workspace" });
  await navigation.getByRole("button", { name: label, exact: true }).click();
  await expect(navigation.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  if (mobile) {
    await expect.poll(() => page.locator(".workbench-sidebar").evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
  }
}

async function expectViewportFit(page: Page, view: string): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.body, `${view} body overflows horizontally`).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.document, `${view} document overflows horizontally`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectAccessibleSurface(page: Page, view: string): Promise<void> {
  const audit = await page.evaluate(() => {
    const visible = (element: Element) => {
      const node = element as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element: Element) => {
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      if (ariaLabel) return ariaLabel;
      const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() || "").join(" ").trim();
      if (labelledBy) return labelledBy;
      const labels = "labels" in element ? Array.from((element as HTMLInputElement).labels || []).map((label) => label.textContent?.trim() || "").join(" ").trim() : "";
      if (labels) return labels;
      const title = element.getAttribute("title")?.trim();
      if (title) return title;
      return element.textContent?.trim() || "";
    };
    const unnamed = Array.from(document.querySelectorAll("button, a[href], input:not([type='hidden']), select, textarea"))
      .filter(visible)
      .filter((element) => !labelFor(element))
      .map((element) => element.outerHTML.slice(0, 180));
    const imagesWithoutAlt = Array.from(document.querySelectorAll("img"))
      .filter(visible)
      .filter((image) => !image.hasAttribute("alt"))
      .map((image) => image.outerHTML.slice(0, 180));
    const ids = Array.from(document.querySelectorAll("[id]")).map((element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    return { unnamed, imagesWithoutAlt, duplicateIds };
  });
  expect(audit.unnamed, `${view} has unnamed visible controls`).toEqual([]);
  expect(audit.imagesWithoutAlt, `${view} has visible images without alt text`).toEqual([]);
  expect(audit.duplicateIds, `${view} has duplicate DOM ids`).toEqual([]);
}

test("primary workspace views remain reachable, bounded, and free of runtime errors", async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  const inspection = await request.post("/api/studies/inspect", {
    data: { paperUrl: "https://arxiv.org/abs/2106.09685", repositoryUrl: "https://github.com/microsoft/LoRA" },
  });
  expect(inspection.ok()).toBe(true);
  const study = await inspection.json() as { studyId: string; createdAt: string; paper: { url: string }; repository?: { url: string } };
  const notebook = {
    id: `${study.studyId}-evidence-notebook`,
    title: "LoRA navigation audit notebook",
    paperUrl: study.paper.url,
    repositoryUrl: study.repository?.url || "",
    image: "codex-lab-python:0.1",
    cells: [
      { id: "mechanism", kind: "markdown", source: "# LoRA mechanism\n\nThe frozen projection and trainable low-rank residual remain inspectable as separate paths.", executionCount: null, runStatus: "idle" },
      { id: "merge-check", kind: "code", source: "import numpy as np\nW0 = np.eye(2)\nA = np.ones((1, 2))\nB = np.ones((2, 1))\nx = np.array([1., 2.])\nassert np.allclose(W0 @ x + B @ (A @ x), (W0 + B @ A) @ x)", executionCount: null, runStatus: "idle" },
    ],
    comments: [],
    provenance: [{ id: `navigation-${study.studyId}`, type: "notebook.created", actor: "user", summary: "Created executable navigation fixture", createdAt: study.createdAt }],
    updatedAt: study.createdAt,
  };
  const saved = await request.post(`/api/notebooks/${notebook.id}/save`, { data: { notebook, expectedHash: null } });
  expect(saved.ok()).toBe(true);

  const runtimeErrors: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`${message.text()} ${message.location().url}`.trim());
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`));
  page.on("response", (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });

  const mobile = testInfo.project.name.includes("mobile");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LoRA: Low-Rank Adaptation of Large Language Models" })).toBeVisible();
  await expectViewportFit(page, "Study");
  await expectAccessibleSurface(page, "Study");

  await openWorkspaceView(page, "Source map", mobile);
  await expect(page.getByRole("heading", { name: "Retrieved evidence" })).toBeVisible();
  await expectViewportFit(page, "Source map");
  await expectAccessibleSurface(page, "Source map");

  await openWorkspaceView(page, "Datasets", mobile);
  await expect(page.getByRole("heading", { name: "Resource-fit dataset evidence" })).toBeVisible();
  await expectViewportFit(page, "Datasets");
  await expectAccessibleSurface(page, "Datasets");

  await openWorkspaceView(page, "Notebook", mobile);
  await expect(page.getByRole("region", { name: "Executable research notebook" })).toBeVisible();
  await expectViewportFit(page, "Notebook");
  await expectAccessibleSurface(page, "Notebook");
  if (!mobile) {
    const notebookTabs = page.getByRole("tablist", { name: "Notebook details" });
    const artifactTab = notebookTabs.getByRole("tab", { name: "Artifact" });
    await expect(notebookTabs.getByRole("tab", { name: "Threads" })).toHaveCount(0);
    await artifactTab.focus();
    await artifactTab.press("ArrowRight");
    await expect(artifactTab).toBeFocused();
    await expect(artifactTab).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(artifactTab).toBeFocused();
  }

  await openWorkspaceView(page, "Runs", mobile);
  await expect(page.getByRole("heading", { name: "Runtime evidence" })).toBeVisible();
  await expectViewportFit(page, "Runs");
  await expectAccessibleSurface(page, "Runs");

  await openWorkspaceView(page, "Remote", mobile);
  await expect(page.getByRole("heading", { name: "Bounded Modal execution" })).toBeVisible();
  await expectViewportFit(page, "Remote");
  await expectAccessibleSurface(page, "Remote");

  if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Connectors", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connectors" })).toBeVisible();
  await expectViewportFit(page, "Connectors");
  await expectAccessibleSurface(page, "Connectors");
  const connectorTabs = page.getByRole("tablist", { name: "Connector types" });
  const agentsTab = connectorTabs.getByRole("tab", { name: /Agents/ });
  await agentsTab.focus();
  await agentsTab.press("ArrowRight");
  await expect(connectorTabs.getByRole("tab", { name: /Hooks/ })).toBeFocused();
  await expect(connectorTabs.getByRole("tab", { name: /Hooks/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(connectorTabs.getByRole("tab", { name: /Skills/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(connectorTabs.getByRole("tab", { name: /Agents/ })).toBeFocused();

  await page.getByRole("button", { name: "New agent" }).click();
  await expect(page.getByRole("dialog", { name: "New agent" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New agent" })).toBeHidden();

  await openWorkspaceView(page, "Study", mobile);
  await page.getByRole("button", { name: "Select research agent" }).click();
  await expect(page.getByRole("listbox", { name: "Research agents" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Research agents" })).toBeHidden();
  await expectViewportFit(page, "Study after menus");

  await page.screenshot({ path: `artifacts/workspace-audit-${testInfo.project.name}.png`, fullPage: true });
  expect(httpErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
