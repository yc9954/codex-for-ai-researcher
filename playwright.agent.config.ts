import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/agent-live",
  outputDir: "./artifacts/agent-live-test-results",
  reporter: "line",
  workers: 1,
  timeout: 900_000,
  use: { baseURL: "http://127.0.0.1:4475" },
  webServer: {
    command: "npm run dev -- --port 4475 --strictPort",
    url: "http://127.0.0.1:4475",
    reuseExistingServer: false,
    timeout: 30_000,
    env: { ROSETTA_DATA_ROOT: ".rosetta/agent-live", ROSETTA_AGENT_ENABLED: "1" },
  },
});
