import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.unit.ts"],
    coverage: { reporter: ["text", "json-summary"] },
  },
});
