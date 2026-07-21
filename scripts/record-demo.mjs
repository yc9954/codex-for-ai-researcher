import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.DEMO_URL || "http://127.0.0.1:4176";
const outputDir = resolve("artifacts/demo-video");
const outputPath = resolve(outputDir, "rosetta.webm");
await mkdir(outputDir, { recursive: true });

const studiesResponse = await fetch(`${baseUrl}/api/studies`);
if (!studiesResponse.ok) throw new Error(`Study list unavailable: ${studiesResponse.status}`);
const studies = (await studiesResponse.json()).studies || [];
let preparedStudy = null;
for (const study of studies) {
  const response = await fetch(`${baseUrl}/api/notebooks/${encodeURIComponent(`${study.studyId}-evidence-notebook`)}?optional=1`);
  if (!response.ok) continue;
  const record = await response.json();
  const generated = record?.notebook?.provenance?.some((event) => event.type === "notebook.generated");
  const hasOriginalFigure = record?.notebook?.cells?.some((cell) => cell.id === "architecture-overview" && cell.source.includes("/evidence/source-figure"));
  if (generated && hasOriginalFigure) {
    preparedStudy = study;
    break;
  }
}
if (!preparedStudy) throw new Error("No generated notebook with a pinned original architecture figure is available. Build one in the app first.");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  recordVideo: { dir: outputDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);

async function caption(title, detail) {
  await page.evaluate(({ title, detail }) => {
    document.querySelector("[data-demo-caption]")?.remove();
    const node = document.createElement("div");
    node.dataset.demoCaption = "true";
    node.replaceChildren(Object.assign(document.createElement("strong"), { textContent: title }), Object.assign(document.createElement("span"), { textContent: detail }));
    Object.assign(node.style, {
      position: "fixed", zIndex: "9999", left: "50%", bottom: "24px", display: "grid", gap: "2px",
      minWidth: "360px", maxWidth: "720px", padding: "11px 16px", border: "1px solid rgba(255,255,255,.18)",
      borderRadius: "6px", background: "rgba(13,13,13,.94)", color: "white", boxShadow: "0 10px 30px rgba(0,0,0,.24)",
      fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", transform: "translateX(-50%)", pointerEvents: "none",
    });
    node.querySelector("strong").style.fontSize = "13px";
    Object.assign(node.querySelector("span").style, { color: "#c9c9c9", fontSize: "11px" });
    document.body.append(node);
  }, { title, detail });
  await pause(1050);
}

async function focus(locator, wait = 500) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Demo target is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 });
  await pause(wait);
}

async function click(locator, settle = 700) {
  await focus(locator, 250);
  await locator.click();
  await pause(settle);
}

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const row = page.locator(`[data-study-id="${preparedStudy.studyId}"] .project-row`);
  if (await row.count()) await click(row);
  await page.getByRole("heading", { name: preparedStudy.paper.title }).waitFor({ state: "visible" });
  await caption("Decode the paper", "Rosetta turns pinned research evidence into a guided, executable lesson.");

  await click(page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }), 900);
  await page.getByRole("region", { name: "Executable research notebook" }).waitFor({ state: "visible" });
  const firstCitation = page.locator(".evidence-citation-link").first();
  await firstCitation.scrollIntoViewIfNeeded();
  await click(firstCitation, 750);
  await page.getByRole("heading", { name: "Retrieved evidence" }).waitFor({ state: "visible" });
  const evidence = page.locator(".pdf-evidence").first();
  await evidence.waitFor({ state: "visible" });
  await focus(evidence, 250);
  await caption("Read claims at the source", "Open the pinned PDF at the cited page and highlight the supporting passage.");

  await click(page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }), 900);
  await page.getByRole("region", { name: "Executable research notebook" }).waitFor({ state: "visible" });
  const guide = page.locator("[data-notebook-cell-id='paper-guide']");
  await focus(guide.getByRole("heading", { name: "Definitions you need" }));
  await caption("Learn in dependency order", "Definitions, equations, architecture, and evidence are organized before the code probe.");

  const original = page.locator(".paper-source-figure");
  await original.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector(".paper-source-figure")?.getAttribute("data-crop-status") === "ready");
  await focus(original, 250);
  await caption("Keep the original architecture", "Figures remain connected to their exact PDF page instead of becoming detached summaries.");

  const mechanism = page.locator("[data-notebook-cell-id='code_mechanism']");
  if (await mechanism.count()) {
    await focus(mechanism, 250);
    await caption("Learn by running", "Editable probes test the mechanism and retain observed outputs, hashes, and boundaries.");
  }

  await click(page.getByRole("tab", { name: "Artifact" }), 600);
  await caption("Inspect retained results", "Figures, metrics, and the Jupyter-compatible bundle stay attached to the run that produced them.");

  await click(page.getByRole("button", { name: "Connectors" }), 550);
  await page.getByRole("heading", { name: "GPT-5.6 routing" }).waitFor({ state: "visible" });
  await caption("Route work deliberately", "Sol, Terra, Luna, local skills, and deterministic gates each handle the work they fit.");
  await page.evaluate(() => document.querySelector("[data-demo-caption]")?.remove());
  await pause(650);

  const video = page.video();
  await page.close();
  await video.saveAs(outputPath);
} finally {
  await context.close().catch(() => undefined);
  await browser.close();
}

console.log(outputPath);
