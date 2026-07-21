export interface NotebookAnnotation {
  id: string;
  notebookId: string;
  cellId: string;
  kind: "text" | "figure";
  excerpt: string;
  artifactPath?: string;
  runId?: string;
  runBackend?: "local" | "modal";
  note: string;
  createdAt: string;
}
