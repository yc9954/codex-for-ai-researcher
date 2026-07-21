import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const context = await chromium.launchPersistentContext(".playwright/chatgpt-inspector", {
  channel: "chrome",
  headless: false,
  viewport: null,
  args: [
    "--remote-debugging-port=9223",
    "--start-maximized",
  ],
});

const pages = context.pages();
const page = pages[0] ?? await context.newPage();
await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });

console.log("Inspector browser ready. Complete the human verification in the Chrome window.");

const composerSelector = '[data-testid="prompt-textarea"], #prompt-textarea, textarea, [contenteditable="true"]';

while (await page.locator(composerSelector).count() === 0) {
  await page.waitForTimeout(1000);
}

await page.waitForTimeout(1200);
await mkdir("artifacts", { recursive: true });

for (const label of ["비필수사항 거부", "Reject non-essential"]) {
  const consentButton = page.getByRole("button", { name: label, exact: true });
  if (await consentButton.count() === 1) {
    await consentButton.click();
    await page.waitForTimeout(400);
    break;
  }
}

async function capture(label, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
  const selectedProperties = [
    "display",
    "position",
    "inset",
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "max-height",
    "padding",
    "margin",
    "gap",
    "align-items",
    "justify-content",
    "flex",
    "flex-basis",
    "flex-direction",
    "grid-template-columns",
    "grid-template-rows",
    "overflow",
    "background-color",
    "color",
    "border",
    "border-color",
    "border-radius",
    "box-shadow",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-align",
    "white-space",
    "opacity",
    "z-index",
    "cursor",
    "outline",
    "backdrop-filter",
    "transition",
    "transform",
  ];

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function stylesFor(element, pseudo = null) {
    const style = getComputedStyle(element, pseudo);
    return Object.fromEntries(selectedProperties.map((property) => [property, style.getPropertyValue(property)]));
  }

  function describe(element) {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      role: element.getAttribute("role"),
      ariaLabel: element.getAttribute("aria-label"),
      placeholder: element.getAttribute("placeholder"),
      testId: element.getAttribute("data-testid"),
      className: typeof element.className === "string" ? element.className.slice(0, 500) : null,
      text: (element.innerText || "").trim().replace(/\s+/g, " ").slice(0, 120) || null,
      rect: {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      },
      styles: stylesFor(element),
      pseudo: {
        before: stylesFor(element, "::before"),
        after: stylesFor(element, "::after"),
      },
    };
  }

  const rootStyle = getComputedStyle(document.documentElement);
  const customProperties = {};
  for (let index = 0; index < rootStyle.length; index += 1) {
    const property = rootStyle.item(index);
    if (property.startsWith("--")) customProperties[property] = rootStyle.getPropertyValue(property).trim();
  }

  const frequencies = {};
  const frequencyProperties = [
    "background-color",
    "color",
    "border-radius",
    "box-shadow",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "padding",
    "gap",
  ];

  const visibleElements = [...document.querySelectorAll("*")].filter(isVisible);
  for (const element of visibleElements) {
    const style = getComputedStyle(element);
    for (const property of frequencyProperties) {
      const value = style.getPropertyValue(property).trim();
      if (!value || value === "none" || value === "normal" || value === "0px") continue;
      const key = `${property}::${value}`;
      frequencies[key] = (frequencies[key] ?? 0) + 1;
    }
  }

  const semanticSelector = [
    "header",
    "nav",
    "aside",
    "main",
    "form",
    "h1",
    "h2",
    "h3",
    "button",
    "textarea",
    "input",
    "[contenteditable='true']",
    "[role]",
    "[data-testid]",
    "[class*='composer']",
  ].join(",");

  const semanticSet = new Set([...document.querySelectorAll(semanticSelector)]);
  const composer = document.querySelector('[data-testid="prompt-textarea"], #prompt-textarea, textarea, [contenteditable="true"]');
  let ancestor = composer;
  for (let depth = 0; ancestor && depth < 10; depth += 1) {
    semanticSet.add(ancestor);
    ancestor = ancestor.parentElement;
  }

  const semanticElements = [...semanticSet]
    .filter(isVisible)
    .slice(0, 800)
    .map(describe);

  const mediaQueries = [];
  for (const sheet of [...document.styleSheets]) {
    try {
      for (const rule of [...(sheet.cssRules ?? [])]) {
        if (rule instanceof CSSMediaRule) mediaQueries.push(rule.conditionText);
      }
    } catch {
      // Cross-origin sheets still appear in stylesheetAssets below.
    }
  }

    return {
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    viewport: {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
    },
    document: describe(document.documentElement),
    body: describe(document.body),
    customProperties,
    fonts: [...document.fonts].map((font) => ({
      family: font.family,
      style: font.style,
      weight: font.weight,
      status: font.status,
    })),
    stylesheetAssets: [...document.styleSheets].map((sheet) => sheet.href).filter(Boolean),
    mediaQueries: [...new Set(mediaQueries)].sort(),
    commonValues: Object.entries(frequencies)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 160)
      .map(([key, count]) => {
        const [property, value] = key.split("::");
        return { property, value, count };
      }),
      semanticElements,
    };
  });

  await writeFile(`artifacts/chatgpt-live-styles-${label}.json`, `${JSON.stringify(result, null, 2)}\n`);
  await page.screenshot({ path: `artifacts/chatgpt-live-reference-${label}.png`, fullPage: true });
  return result;
}

const desktop = await capture("desktop", { width: 1512, height: 900 });
await writeFile("artifacts/chatgpt-live-styles.json", `${JSON.stringify(desktop, null, 2)}\n`);
await capture("mobile", { width: 390, height: 844 });
await page.emulateMedia({ colorScheme: "dark" });
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(composerSelector).first().waitFor({ state: "visible" });
await capture("dark-desktop", { width: 1512, height: 900 });
await page.emulateMedia({ colorScheme: "light" });
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(composerSelector).first().waitFor({ state: "visible" });
await page.setViewportSize({ width: 1512, height: 900 });
console.log("Live ChatGPT light desktop/mobile and dark desktop styles captured in artifacts/.");
await new Promise(() => {});
