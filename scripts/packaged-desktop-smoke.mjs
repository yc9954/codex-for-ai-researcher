import { access, constants } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const architecture = process.arch === "arm64" ? "arm64" : "x64";
const executable = process.platform === "darwin"
  ? join(process.cwd(), "release", `mac-${architecture}`, "Rosetta.app", "Contents", "MacOS", "Rosetta")
  : process.platform === "win32"
    ? join(process.cwd(), "release", "win-unpacked", "Rosetta.exe")
    : join(process.cwd(), "release", "linux-unpacked", "rosetta");

await new Promise((resolve, reject) => access(executable, constants.X_OK, (error) => error ? reject(error) : resolve()));
const resourcesRoot = process.platform === "darwin"
  ? join(process.cwd(), "release", `mac-${architecture}`, "Rosetta.app", "Contents", "Resources")
  : process.platform === "win32"
    ? join(process.cwd(), "release", "win-unpacked", "resources")
    : join(process.cwd(), "release", "linux-unpacked", "resources");
const requiredResources = [
  join(resourcesRoot, "app.asar"),
  join(resourcesRoot, "app-runtime", "scripts", "pdf-extractor-worker.mjs"),
  join(resourcesRoot, "app-runtime", "runtime", "Dockerfile"),
  join(resourcesRoot, "app-runtime", "skills", "orchestrate-paper-demo", "SKILL.md"),
];
await Promise.all(requiredResources.map((path) => new Promise((resolve, reject) => {
  access(path, constants.R_OK, (error) => error ? reject(error) : resolve());
})));
const dataRoot = await mkdtemp(join(tmpdir(), "rosetta-packaged-"));

try {
  const result = await new Promise((resolve) => {
    const child = spawn(executable, ["--desktop-smoke"], {
      env: {
        ...process.env,
        ROSETTA_AGENT_ENABLED: "0",
        ROSETTA_DATA_ROOT: dataRoot,
        ROSETTA_DESKTOP_SMOKE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  if (result.code !== 0 || !result.stdout.includes('"ready":true')) {
    process.stderr.write(result.stderr || result.stdout);
    process.exitCode = 1;
  } else {
    process.stdout.write(`[packaged-desktop-smoke] ${result.stdout.trim()}\n`);
  }
} finally {
  await rm(dataRoot, { recursive: true, force: true });
}
