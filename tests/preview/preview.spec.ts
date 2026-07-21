import { expect, test } from "@playwright/test";

test("production preview serves the application within the interaction budget", async ({ page, request }, testInfo) => {
  const profile = await request.get("/api/system/profile");
  expect(profile.status()).toBe(200);
  expect(profile.headers()["x-content-type-options"]).toBe("nosniff");
  const apiCsp = profile.headers()["content-security-policy"];
  expect(apiCsp).toContain("frame-ancestors 'none'");
  expect(apiCsp).not.toContain("script-src 'self' 'unsafe-inline'");

  const rejected = await request.post("/api/studies/inspect", {
    headers: { "Content-Type": "text/plain" },
    data: "{}",
  });
  expect(rejected.status()).toBe(415);

  const study = await request.post("/api/studies/inspect", {
    data: { repositoryUrl: "https://github.com/microsoft/LoRA" },
  });
  expect(study.status()).toBe(200);

  const assetBodies: Array<Promise<{ url: string; bytes: number }>> = [];
  page.on("response", (assetResponse) => {
    if (!["script", "stylesheet"].includes(assetResponse.request().resourceType())) return;
    assetBodies.push(assetResponse.body()
      .then((body) => ({ url: new URL(assetResponse.url()).pathname, bytes: body.byteLength }))
      .catch(() => ({ url: new URL(assetResponse.url()).pathname, bytes: 0 })));
  });

  const initialStartedAt = performance.now();
  const response = await page.goto("/");
  await page.waitForLoadState("networkidle");
  const initialReadyMs = Math.round(performance.now() - initialStartedAt);
  const initialAssetCount = assetBodies.length;
  const initialAssets = await Promise.all(assetBodies.slice(0, initialAssetCount));
  const initialBytes = initialAssets.reduce((total, asset) => total + asset.bytes, 0);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toContain("script-src 'self'; style-src");
  await expect(page).toHaveTitle("Codex for AI researcher");
  await expect(page.locator("link[rel='icon']")).toHaveAttribute("href", "/brand-logo.png");
  await expect(page.getByRole("complementary", { name: "Research navigation" }).getByRole("button", { name: "New study" })).toBeVisible();
  expect(initialBytes).toBeLessThanOrEqual(800_000);
  expect(initialReadyMs).toBeLessThanOrEqual(3_000);

  const notebookStartedAt = performance.now();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(page.getByRole("region", { name: "Executable research notebook" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const notebookReadyMs = Math.round(performance.now() - notebookStartedAt);
  const allAssets = await Promise.all(assetBodies);
  const notebookBytes = allAssets.slice(initialAssetCount).reduce((total, asset) => total + asset.bytes, 0);
  expect(notebookBytes).toBeLessThanOrEqual(1_500_000);
  expect(notebookReadyMs).toBeLessThanOrEqual(3_000);
  await testInfo.attach("performance-budget.json", {
    body: JSON.stringify({ initialReadyMs, initialBytes, notebookReadyMs, notebookBytes, assets: allAssets }, null, 2),
    contentType: "application/json",
  });

  await page.goto("/design-system");
  await expect(page.getByRole("heading", { name: "ChatGPT design system" })).toBeVisible();
});
