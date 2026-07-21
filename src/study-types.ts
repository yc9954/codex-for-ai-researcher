export interface PaperInspection {
  url: string;
  source: "arxiv" | "openreview" | "pmlr" | "acl" | "doi" | "upload";
  title: string;
  authors: string[];
  abstract?: string;
  pdfUrl?: string;
  identifier?: string;
}

export interface RepositoryInspection {
  url: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  defaultBranch: string;
  commitSha?: string;
  language?: string;
  license?: string;
  readmeSections: Array<{ title: string; paragraphs: string[]; bullets: string[] }>;
  manifests: string[];
  dependencyManifests?: Array<{
    path: string;
    sha256: string;
    format: "requirements" | "toml" | "json" | "yaml" | "ini" | "python" | "docker" | "text";
    dependencies: string[];
    content: string;
    truncated: boolean;
  }>;
  sourceFiles?: Array<{
    path: string;
    sha256: string;
    language: string;
    content: string;
    truncated: boolean;
    symbols: string[];
    imports: string[];
    deviceAssumptions: string[];
  }>;
  compatibility?: {
    status: "analyzed" | "blocked";
    sourceFileCount: number;
    symbolCount: number;
    issues: Array<{ kind: "dependency" | "device" | "runtime" | "source"; severity: "info" | "warning" | "blocker"; evidence: string; path?: string }>;
  };
}

export interface StudyInspection {
  studyId: string;
  createdAt: string;
  paper?: PaperInspection;
  repository?: RepositoryInspection;
  paperDocument?: {
    sourceUrl: string;
    sha256: string;
    pagesSha256: string;
    totalPages: number;
    retainedPages: number;
    characterCount: number;
    extractedAt: string;
    extractor: "unpdf-pdfjs";
    retrievalMode: "live" | "cache" | "upload";
    textPath: string;
  };
  warnings: string[];
}

export interface SystemProfile {
  platform: string;
  release: string;
  arch: string;
  cpu: string;
  logicalCores: number;
  memoryBytes: number;
  freeMemoryBytes: number;
  freeDiskBytes: number;
  accelerators: Array<{
    backend: "cuda" | "mps" | "rocm" | "directml" | "unknown";
    name: string;
    memoryBytes: number | null;
    memoryKind: "dedicated" | "unified" | "unknown";
    driver: string | null;
    detectedBy: string;
    localRunnerAccess: boolean;
  }>;
  dockerReady: boolean;
  runnerImageReady: boolean;
  runnerImage: string;
  runnerPlatform: { os: string; arch: string; digest: string } | null;
  localRuntime: {
    backend: "cpu";
    cpus: number;
    memoryBytes: number;
    memoryDockerValue: string;
    timeoutSeconds: number;
    workspaceBytes: number;
    image: string;
    portable: boolean;
  };
  codexAgent: {
    enabled: boolean;
    installed: boolean;
    authenticated: boolean;
    ready: boolean;
    version?: string;
    authMode?: "chatgpt" | "api-key";
    modelRouting: CodexModelRoute[];
    message?: string;
  };
}
import type { CodexModelRoute } from "./model-routing";
