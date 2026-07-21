import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const failures = [];
const skillsRoot = join(process.cwd(), "skills");
for (const entry of readdirSync(skillsRoot, { withFileTypes: true }).filter((candidate) => candidate.isDirectory())) {
  const source = readFileSync(join(skillsRoot, entry.name, "SKILL.md"), "utf8");
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) failures.push(`${entry.name}: missing YAML frontmatter`);
  if (!new RegExp(`^name:\\s*${entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(frontmatter?.[1] || "")) failures.push(`${entry.name}: frontmatter name does not match its directory`);
  if (!/^description:\s*\S.+$/m.test(frontmatter?.[1] || "")) failures.push(`${entry.name}: missing description`);
}

const work = mkdtempSync(join(tmpdir(), "codex-figure-contract-"));
try {
  const validator = join(skillsRoot, "reproduce-paper-figure", "scripts", "validate_figure_spec.py");
  const quote = "The baseline obtained 81.2 accuracy while the proposed method obtained 84.6 accuracy.";
  const valid = {
    title: "Central comparison", sourceLabel: "Table 2", metric: "Accuracy", unit: "%", chart: "grouped-bar",
    xLabel: "Model", yLabel: "Accuracy", xScale: "linear", yScale: "linear", paperSha256: "a".repeat(64),
    series: [{ name: "Reported", values: [
      { label: "Baseline", xValue: null, value: 81.2, error: null, errorSourceValue: null, page: 7, sourceValue: "81.2", quote },
      { label: "Proposed", xValue: null, value: 84.6, error: null, errorSourceValue: null, page: 7, sourceValue: "84.6", quote },
    ] }],
  };
  const validPath = join(work, "valid.json");
  writeFileSync(validPath, JSON.stringify(valid), "utf8");
  if (spawnSync("python3", [validator, validPath], { stdio: "pipe" }).status !== 0) failures.push("figure validator rejected its current valid contract");
  const invalidPath = join(work, "invalid.json");
  writeFileSync(invalidPath, JSON.stringify({ ...valid, chart: "bar" }), "utf8");
  if (spawnSync("python3", [validator, invalidPath], { stdio: "pipe" }).status === 0) failures.push("figure validator accepted the retired generic bar contract");
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length) {
  failures.forEach((failure) => console.error(`[contracts] ${failure}`));
  process.exit(1);
}
console.log(`[contracts] ${readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length} skills and the figure ledger contract passed`);
