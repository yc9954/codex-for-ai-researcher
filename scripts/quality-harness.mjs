import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const profileArg = process.argv.find((argument) => argument.startsWith("--profile="));
const profile = profileArg?.split("=")[1] || "core";
if (!new Set(["core", "full"]).has(profile)) throw new Error(`Unknown harness profile: ${profile}`);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const outputDirectory = join(process.cwd(), ".paperlab", "harness");
const runId = `harness-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
const resultPath = join(outputDirectory, `${runId}.json`);
const startedAt = new Date();
const stages = [
  { name: "doctor", command: process.execPath, args: ["scripts/environment-doctor.mjs", ...(profile === "full" ? ["--full"] : [])] },
  { name: "lint", command: npm, args: ["run", "lint"] },
  { name: "unit", command: npm, args: ["run", "test:unit"] },
  { name: "contracts", command: npm, args: ["run", "test:contracts"] },
  { name: "typecheck", command: npm, args: ["run", "typecheck"] },
  { name: "build", command: npm, args: ["run", "build"] },
  { name: "desktop-compile", command: npm, args: ["run", "desktop:compile"] },
  { name: "desktop-smoke", command: process.execPath, args: ["scripts/desktop-smoke.mjs"] },
  { name: "preview-smoke", command: npm, args: ["run", "test:preview"] },
  ...(profile === "full" ? [{ name: "runtime-build", command: npm, args: ["run", "runtime:build"] }] : []),
  { name: "playwright", command: npm, args: ["run", "test:e2e"] },
  ...(profile === "full" ? [{ name: "runtime-smoke", command: npm, args: ["run", "runtime:smoke"] }] : []),
];

mkdirSync(outputDirectory, { recursive: true });
const results = [];
let status = "passed";

for (const stage of stages) {
  const stageStarted = Date.now();
  console.log(`\n[harness] ${stage.name}`);
  const childEnvironment = { ...process.env };
  delete childEnvironment.FORCE_COLOR;
  const child = spawnSync(stage.command, stage.args, {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const stageResult = {
    name: stage.name,
    status: child.status === 0 ? "passed" : "failed",
    exitCode: child.status ?? 1,
    durationMs: Date.now() - stageStarted,
  };
  results.push(stageResult);
  if (stageResult.status === "failed") {
    status = "failed";
    break;
  }
}

const report = {
  schemaVersion: "1.0",
  runId,
  profile,
  status,
  startedAt: startedAt.toISOString(),
  endedAt: new Date().toISOString(),
  environment: { node: process.versions.node, platform: process.platform, arch: process.arch },
  stages: results,
};
writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(join(outputDirectory, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`\n[harness] ${status} · ${resultPath}`);
process.exit(status === "passed" ? 0 : 1);
