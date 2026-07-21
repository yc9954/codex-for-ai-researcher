import type { NotebookRun } from "./notebook-types";

export interface RetainedRunArtifact {
  path: string;
  run: NotebookRun;
  cellId: string;
}

export function latestRunArtifacts(runs: NotebookRun[]): RetainedRunArtifact[] {
  const seenPaths = new Set<string>();
  const retained: RetainedRunArtifact[] = [];
  const newestFirst = [...runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  for (const run of newestFirst) {
    for (const path of run.artifacts) {
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      const owner = run.cells.find((cell) => cell.artifacts?.includes(path));
      retained.push({ path, run, cellId: owner?.id || run.targetCellId });
    }
  }
  return retained;
}
