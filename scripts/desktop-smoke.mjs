import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import electron from "electron";

const dataRoot = await mkdtemp(join(tmpdir(), "codex-researcher-desktop-"));

try {
  const result = await new Promise((resolve) => {
    const electronArgs = process.env.CI && process.platform === "linux"
      ? ["--no-sandbox", "dist-electron/main.cjs", "--desktop-smoke"]
      : ["dist-electron/main.cjs", "--desktop-smoke"];
    const child = spawn(electron, electronArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODEX_LAB_AGENT_ENABLED: "0",
        CODEX_LAB_DATA_ROOT: dataRoot,
        CODEX_LAB_DESKTOP_SMOKE: "1",
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
    process.stdout.write(`[desktop-smoke] ${result.stdout.trim()}\n`);
  }
} finally {
  await rm(dataRoot, { recursive: true, force: true });
}
