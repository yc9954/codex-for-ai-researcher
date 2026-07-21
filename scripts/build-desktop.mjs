import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist-electron", { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  packages: "external",
  external: ["electron"],
  logLevel: "info",
};

await Promise.all([
  build({ ...shared, entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.cjs" }),
  build({ ...shared, entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.cjs" }),
  build({ ...shared, entryPoints: ["electron/desktop-api.ts"], outfile: "dist-electron/desktop-api.cjs" }),
]);
