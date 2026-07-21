import type { NotebookAnnotation } from "./annotation-types";

export type NotebookCellKind = "markdown" | "code";
export type CellRunStatus = "idle" | "queued" | "running" | "passed" | "failed";

export interface CellOutput {
  runId: string;
  status: "passed" | "failed";
  stdout: string;
  stderr: string;
  durationMs: number;
  codeHash: string;
  imageDigest: string;
  createdAt: string;
  artifacts?: string[];
  backend?: "local" | "modal";
  runtime?: string;
}

export interface NotebookCell {
  id: string;
  kind: NotebookCellKind;
  source: string;
  executionCount: number | null;
  runStatus: CellRunStatus;
  output?: CellOutput;
}

export interface ThreadComment {
  id: string;
  cellId: string;
  author: "user" | "agent";
  body: string;
  createdAt: string;
  intent?: "question" | "explain-output" | "request-edit";
  status?: "open" | "resolved";
  replyTo?: string;
  annotation?: NotebookAnnotation;
  suggestion?: {
    title: string;
    replacement: string;
    status: "open" | "applied" | "dismissed";
  };
}

export interface NotebookRun {
  runId: string;
  parentRunId: string | null;
  targetCellId: string;
  status: "passed" | "failed";
  image: string;
  imageDigest: string;
  codeHash: string;
  createdAt: string;
  durationMs: number;
  artifacts: string[];
  artifactRecords: Record<string, { sha256?: string; sizeBytes?: number }>;
  cells: Array<{
    id: string;
    status: "passed" | "failed" | "skipped";
    stdout: string;
    stderr: string;
    durationMs: number;
    artifacts?: string[];
  }>;
}

export interface ProvenanceEvent {
  id: string;
  type: "notebook.created" | "notebook.placeholder" | "notebook.generated" | "notebook.smoke-tested" | "notebook.hardware-adapted" | "notebook.source-compacted" | "cell.added" | "cell.edited" | "cell.executed" | "comment.recorded" | "comment.classified" | "suggestion.applied" | "artifact.created" | "figure.authored" | "connector.applied" | "codex.model-routed";
  actor: "user" | "agent" | "runner";
  summary: string;
  createdAt: string;
  cellId?: string;
  runId?: string;
  parentId?: string;
  hash?: string;
  model?: string;
  modelFamily?: "sol" | "terra" | "luna";
  modelRoute?: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  policyVersion?: string;
  durationMs?: number;
  promptHash?: string;
  engine?: "codex-cli";
  cliVersion?: string;
  authMode?: "chatgpt" | "api-key";
}

export interface ResearchNotebook {
  id: string;
  title: string;
  paperUrl: string;
  repositoryUrl: string;
  image: string;
  cells: NotebookCell[];
  comments: ThreadComment[];
  provenance: ProvenanceEvent[];
  updatedAt: string;
}

export interface RunCellResponse {
  runId: string;
  targetCellId: string;
  status: "passed" | "failed";
  image: string;
  imageDigest: string;
  notebookHash: string;
  codeHash: string;
  parentRunId: string | null;
  createdAt: string;
  durationMs: number;
  cells: Array<{
    id: string;
    status: "passed" | "failed" | "skipped";
    stdout: string;
    stderr: string;
    durationMs: number;
    artifacts?: string[];
  }>;
  artifacts: string[];
}
