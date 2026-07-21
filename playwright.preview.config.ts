import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/preview",
  outputDir: "./artifacts/preview-test-results",
  reporter: "line",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4376",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 4376 --strictPort",
    url: "http://127.0.0.1:4376",
    reuseExistingServer: false,
    env: { ROSETTA_DATA_ROOT: ".rosetta/preview-smoke", ROSETTA_AGENT_ENABLED: "0" },
  },
  projects: [{ name: "preview-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
});
