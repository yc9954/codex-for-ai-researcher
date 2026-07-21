import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const profile = process.argv.find((argument) => argument.startsWith("--profile="))?.split("=")[1] || "core";
const requestedMax = Number(process.argv.find((argument) => argument.startsWith("--max="))?.split("=")[1] || "2");
const maxAttempts = Number.isInteger(requestedMax) && requestedMax > 0 && requestedMax <= 5 ? requestedMax : 2;
const outputDirectory = join(process.cwd(), ".rosetta", "harness");
const loopId = `loop-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
const attempts = [];
const transientStages = new Set(["doctor", "preview-smoke", "playwright", "runtime-build", "runtime-smoke"]);
let stopReason = null;

mkdirSync(outputDirectory, { recursive: true });
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`\n[quality-loop] attempt ${attempt}/${maxAttempts} · profile=${profile}`);
  const child = spawnSync(process.execPath, ["scripts/quality-harness.mjs", `--profile=${profile}`], { cwd: process.cwd(), stdio: "inherit" });
  const harness = JSON.parse(readFileSync(join(outputDirectory, "latest.json"), "utf8"));
  const failedStage = harness.stages.find((stage) => stage.status === "failed")?.name || null;
  attempts.push({ attempt, harnessRunId: harness.runId, status: harness.status, failedStage, stages: harness.stages });
  if (child.status === 0) break;
  if (!failedStage || !transientStages.has(failedStage)) {
    stopReason = `Suppressed an unchanged retry for deterministic stage ${failedStage || "unknown"}; fix its recorded failure before rerunning the loop.`;
    console.error(`[quality-loop] ${stopReason}`);
    break;
  }
  if (attempt < maxAttempts) console.log(`[quality-loop] retrying transient stage failure: ${failedStage}`);
}

const passed = attempts.at(-1)?.status === "passed";
const report = { schemaVersion: "1.1", loopId, profile, status: passed ? "passed" : "failed", maxAttempts, stopReason, attempts, endedAt: new Date().toISOString() };
const reportPath = join(outputDirectory, `${loopId}.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`\n[quality-loop] ${report.status} after ${attempts.length} attempt(s) · ${reportPath}`);
process.exit(passed ? 0 : 1);
