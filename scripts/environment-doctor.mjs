import { accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";

const profile = process.argv.includes("--full") ? "full" : "core";
const nodeMajor = Number(process.versions.node.split(".")[0]);
const failures = [];

if (nodeMajor < 22) failures.push(`Node.js 22 or newer is required; found ${process.versions.node}`);
for (const path of ["package-lock.json", "playwright.config.ts", "runtime/Dockerfile", "electron/main.ts", "electron/preload.ts"]) {
  try {
    accessSync(path, constants.R_OK);
  } catch {
    failures.push(`Required file is missing: ${path}`);
  }
}

let docker = "optional";
if (profile === "full") {
  const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
  if (result.status !== 0) failures.push("Full profile requires a reachable Docker daemon");
  else docker = result.stdout.trim();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[doctor] ${failure}`);
  process.exit(1);
}

console.log(`[doctor] node=${process.versions.node} platform=${process.platform}/${process.arch} profile=${profile} docker=${docker}`);
