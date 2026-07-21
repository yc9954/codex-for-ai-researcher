import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.DEMO_URL || "http://127.0.0.1:4176";
const outputDir = resolve("artifacts/demo-video");
const outputPath = resolve(outputDir, "codex-for-ai-researcher.webm");
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
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: outputDir, size: { width: 1440, height: 900 } },
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
  await pause(1500);
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
  const row = page.locator(`[data-study-id="${preparedStudy.studyId}"] .project-row-main`);
  if (await row.count()) await click(row);
  await page.getByRole("heading", { name: preparedStudy.paper.title }).waitFor({ state: "visible" });
  await caption("Codex for AI researcher", "논문·저장소·실행 결과를 한 연구 세션에 고정합니다.");

  await click(page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Source map" }));
  await page.getByRole("heading", { name: "Retrieved evidence" }).waitFor({ state: "visible" });
  await caption("Pinned evidence", "원문 PDF, 추출 페이지, 저장소 commit과 의존성 근거가 재현 세션에 보존됩니다.");

  await click(page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Notebook" }), 900);
  await page.getByRole("region", { name: "Executable research notebook" }).waitFor({ state: "visible" });
  const guide = page.locator("[data-notebook-cell-id='paper-guide']");
  await focus(guide.getByRole("heading", { name: "Definitions you need" }));
  await caption("Compressed paper guide", "핵심 정의, 기여, 인과적 방법 순서, 평가 설계, 결정적 결과와 한계를 원문 근거로 연결합니다.");

  const original = page.locator(".paper-source-figure");
  await original.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector(".paper-source-figure")?.getAttribute("data-crop-status") === "ready");
  await focus(original);
  await caption("Original architecture", "캡션을 검출해 고정된 PDF 페이지에서 논문 원본 도식을 직접 복원합니다.");

  await caption("Page-level provenance", "도식과 캡션은 원문 PDF 페이지 링크를 그대로 유지합니다.");
  const architecture = page.locator("[data-notebook-cell-id='architecture-diagram']");
  await focus(architecture);
  await caption("Executable architecture map", "원본 도식과 별도로 tensor shape, trainability, baseline, loss 경로를 실행 가능한 계산 그래프로 보존합니다.");

  const showCode = architecture.getByRole("button", { name: "Show code" });
  if (await showCode.count()) {
    await click(showCode, 500);
    await caption("Inspect and edit", "다이어그램을 만든 Python 셀도 자동 구문 강조 상태로 직접 검토하고 수정할 수 있습니다.");
  }

  const mechanism = page.locator("[data-notebook-cell-id='code_mechanism']");
  if (await mechanism.count()) {
    await focus(mechanism);
    await caption("Claim-isolating probe", "작은 tensor로 low-rank 제약과 merged inference 동치성을 수치 assertion으로 확인합니다.");
    const run = mechanism.getByRole("button", { name: "Run code_mechanism" });
    if (await run.isEnabled()) {
      await click(run, 250);
      await mechanism.locator(".cell-status").filter({ hasText: "passed" }).waitFor({ state: "visible", timeout: 20000 });
      await caption("Isolated execution", "network-disabled Docker 결과와 code hash, image digest가 같은 셀에 기록됩니다.");
    }
  }

  await click(page.getByRole("tab", { name: "Artifact" }), 600);
  await caption("Result archive", "실행된 figure와 수치 결과만 run 단위로 모아 Jupyter-compatible bundle로 고정할 수 있습니다.");
  await page.evaluate(() => document.querySelector("[data-demo-caption]")?.remove());
  await pause(900);

  const video = page.video();
  await page.close();
  await video.saveAs(outputPath);
} finally {
  await context.close().catch(() => undefined);
  await browser.close();
}

console.log(outputPath);
