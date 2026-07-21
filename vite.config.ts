import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { notebookApiPlugin } from "./scripts/notebook-api";

export default defineConfig({
  plugins: [react(), notebookApiPlugin()],
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
  server: {
    port: 4173,
  },
});
