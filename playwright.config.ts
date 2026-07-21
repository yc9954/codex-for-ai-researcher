import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: /(preview|agent-live)\.spec\.ts/,
  workers: 1,
  outputDir: "./artifacts/test-results",
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4275",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 4275 --strictPort",
    url: "http://127.0.0.1:4275",
    reuseExistingServer: false,
    env: { CODEX_LAB_DATA_ROOT: ".paperlab/e2e", CODEX_LAB_AGENT_ENABLED: "0" },
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup\.spec\.ts/,
    },
    {
      name: "desktop-chromium",
      testIgnore: /(setup|preview|agent-live)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      testIgnore: /(setup|preview|agent-live)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"] },
    },
  ],
});
