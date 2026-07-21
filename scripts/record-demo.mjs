import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { resolve } from "node:path";

const run = promisify(execFile);
const baseUrl = process.env.DEMO_URL || "http://127.0.0.1:4176";
const outputDir = resolve("artifacts/demo-video");
const assetDir = resolve("docs/assets");
await Promise.all([mkdir(outputDir, { recursive: true }), mkdir(assetDir, { recursive: true })]);

const studiesResponse = await fetch(`${baseUrl}/api/studies`);
if (!studiesResponse.ok) throw new Error(`Study list unavailable: ${studiesResponse.status}`);
const studies = (await studiesResponse.json()).studies || [];
let preparedStudy = null;
for (const study of studies) {
  const notebookId = `${study.studyId}-evidence-notebook`;
  const response = await fetch(`${baseUrl}/api/notebooks/${encodeURIComponent(notebookId)}?optional=1`);
  if (!response.ok) continue;
  const record = await response.json();
  const generated = record?.notebook?.provenance?.some((event) => event.type === "notebook.generated");
  const hasOriginalFigure = record?.notebook?.cells?.some((cell) => cell.id === "architecture-overview" && cell.source.includes("/evidence/source-figure"));
  const hasRunFigure = record?.notebook?.cells?.some((cell) => cell.output?.artifacts?.some((path) => /\.(?:png|jpe?g|webp)$/i.test(path)));
  if (generated && hasOriginalFigure && hasRunFigure) {
    preparedStudy = study;
    break;
  }
}
if (!preparedStudy) throw new Error("No generated notebook with original and executed figures is available. Build and run the LoRA sample first.");

const browser = await chromium.launch({ headless: true });
const pause = (page, ms) => page.waitForTimeout(ms);

async function scrubNotebookComments(context) {
  await context.route("**/api/notebooks/*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || !/^\/api\/notebooks\/[^/]+$/.test(url.pathname)) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    if (body?.notebook && Array.isArray(body.notebook.comments)) body.notebook.comments = [];
    await route.fulfill({ response, json: body });
  });
}

async function selectPreparedStudy(page) {
  const row = page.locator(`[data-study-id="${preparedStudy.studyId}"] .project-row`);
  if (await row.count()) await row.click();
  await page.getByRole("heading", { name: preparedStudy.paper.title }).waitFor({ state: "visible" });
}

async function openNotebook(page) {
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }).click();
  await page.getByRole("region", { name: "Executable research notebook" }).waitFor({ state: "visible" });
  await page.locator("[data-notebook-cell-id='paper-guide']").waitFor({ state: "visible" });
}

async function scrollTo(locator, page, wait = 1300) {
  await locator.evaluate((element) => element.scrollIntoView({ behavior: "smooth", block: "center" }));
  await pause(page, wait);
}

async function encodeGif(rawPath, gifPath, startSeconds, durationSeconds) {
  const filter = [
    "fps=8",
    "scale=900:-1:flags=lanczos",
    "split[s0][s1]",
    "[s0]palettegen=max_colors=112:stats_mode=diff[p]",
    "[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
  ].join(",");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", rawPath,
    "-ss", startSeconds.toFixed(3),
    "-t", durationSeconds.toFixed(3),
    "-filter_complex", filter,
    "-loop", "0",
    gifPath,
  ]);
}

async function recordFeature(name, prepare, demonstrate) {
  const rawPath = resolve(outputDir, `${name}.webm`);
  const gifPath = resolve(assetDir, `${name}.gif`);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    recordVideo: { dir: outputDir, size: { width: 1280, height: 800 } },
  });
  await scrubNotebookComments(context);
  const page = await context.newPage();
  const videoStartedAt = Date.now();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await selectPreparedStudy(page);
  await page.addStyleTag({ content: ".selection-annotate-button,.annotation-editor,.notebook-annotation-notes{display:none!important}" });
  await prepare(page);
  await pause(page, 350);

  const clipStart = Math.max(0, (Date.now() - videoStartedAt) / 1000 - 0.2);
  await demonstrate(page);
  await pause(page, 550);
  const clipDuration = Math.max(2, (Date.now() - videoStartedAt) / 1000 - clipStart);

  const video = page.video();
  await page.close();
  if (!video) throw new Error(`Video recording did not start for ${name}`);
  await video.saveAs(rawPath);
  await context.close();
  await encodeGif(rawPath, gifPath, clipStart, clipDuration);
  console.log(`${name}: ${gifPath}`);
}

try {
  await recordFeature(
    "feature-source-evidence",
    async (page) => {
      await openNotebook(page);
      const citation = page.locator(".evidence-citation-link").first();
      await scrollTo(citation, page, 500);
    },
    async (page) => {
      await pause(page, 650);
      await page.locator(".evidence-citation-link").first().click();
      await page.getByRole("heading", { name: "Retrieved evidence" }).waitFor({ state: "visible" });
      const pdf = page.locator(".pdf-evidence");
      await pdf.waitFor({ state: "visible" });
      await page.waitForFunction(() => Number(document.querySelector(".pdf-page-stage")?.getAttribute("data-highlight-count") || 0) > 0);
      await pause(page, 1900);
      await page.getByRole("button", { name: "Zoom in PDF" }).click();
      await page.waitForFunction(() => Number(document.querySelector(".pdf-page-stage")?.getAttribute("data-highlight-count") || 0) > 0);
      await pause(page, 900);
    },
  );

  await recordFeature(
    "feature-learning-notebook",
    async (page) => {
      await openNotebook(page);
      await page.locator(".notebook-scroll").evaluate((element) => { element.scrollTop = 0; });
    },
    async (page) => {
      await pause(page, 700);
      await scrollTo(page.getByRole("heading", { name: "Definitions you need" }), page, 1500);
      const originalFigure = page.locator(".paper-source-figure");
      await originalFigure.waitFor({ state: "visible" });
      await page.waitForFunction(() => document.querySelector(".paper-source-figure")?.getAttribute("data-crop-status") === "ready");
      await scrollTo(originalFigure, page, 1700);
      const mechanism = page.locator("[data-notebook-cell-id='code_mechanism']");
      if (await mechanism.count()) await scrollTo(mechanism, page, 1500);
    },
  );

  await recordFeature(
    "feature-run-outputs",
    async (page) => {
      await openNotebook(page);
      await page.locator(".artifact-panel-summary").waitFor({ state: "visible" });
      await page.locator(".artifact-panel").evaluate((element) => { element.scrollTop = 0; });
    },
    async (page) => {
      await pause(page, 800);
      const figures = page.locator(".artifact-output-section").filter({ has: page.getByRole("heading", { name: "Figures" }) });
      if (await figures.count()) await scrollTo(figures, page, 1500);
      const files = page.locator(".artifact-output-section").filter({ has: page.getByRole("heading", { name: "Data files" }) });
      if (await files.count()) await scrollTo(files, page, 1300);
      const bundle = page.locator(".frozen-bundle");
      if (await bundle.count()) await scrollTo(bundle, page, 1500);
    },
  );

  await recordFeature(
    "feature-model-routing",
    async () => undefined,
    async (page) => {
      await pause(page, 550);
      await page.getByRole("button", { name: "Connectors" }).click();
      await page.getByRole("heading", { name: "GPT-5.6 routing" }).waitFor({ state: "visible" });
      await pause(page, 1450);
      await page.getByRole("tab", { name: /^Hooks/ }).click();
      await pause(page, 1100);
      await page.getByRole("tab", { name: /^Skills/ }).click();
      await pause(page, 1100);
      await page.getByRole("tab", { name: /^Agents/ }).click();
      await pause(page, 700);
    },
  );
} finally {
  await browser.close();
}
