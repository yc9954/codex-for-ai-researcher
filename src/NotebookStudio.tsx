import {
  AlertCircle,
  Box,
  ChartNoAxesColumnIncreasing,
  Check,
  CheckCircle2,
  Cloud,
  Code2,
  Download,
  FileJson2,
  FileText,
  Highlighter,
  Image,
  LoaderCircle,
  MessageSquareText,
  NotebookTabs,
  PackageOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import type {
  NotebookCell,
  NotebookRun,
  ProvenanceEvent,
  ResearchNotebook,
  RunCellResponse,
  ThreadComment,
} from "./notebook-types";
import type { StudyInspection } from "./study-types";
import type { EvidenceCitation } from "./evidence-citation";
import type { NotebookAnnotation } from "./annotation-types";
import { notebookIdForStudy } from "./study-notebook";
import PythonCodeEditor from "./PythonCodeEditor";
import RichMarkdown from "./RichMarkdown";
import { latestRunArtifacts } from "./run-artifacts";
import { useDialogFocus } from "./use-dialog-focus";
import type { CodexModelRoute } from "./model-routing";

interface RuntimeStatus {
  ready: boolean;
  runtime: string;
  image: string;
  imageDigest?: string;
  message?: string;
}

interface AgentStatus {
  ready: boolean;
  version?: string;
  authMode?: "chatgpt" | "api-key";
  modelRouting?: CodexModelRoute[];
  message?: string;
}

interface ModalStatus {
  installed: boolean;
  authenticated: boolean;
  ready: boolean;
  version?: string;
  message?: string;
}

interface ModalPlan {
  planId: string;
  notebookId: string;
  gpu: string;
  selectionReason: string;
  timeoutSeconds: number;
  maximumGpuCostUsd: number;
  packages: string[];
  networkPolicy: "blocked";
  containerMemoryMiB: number;
  codeCellCount: number;
  planHash: string;
  appSha256: string;
}

interface ModalLaunchResponse {
  planId: string;
  status: "passed" | "failed";
  startedAt: string;
  endedAt: string;
  stderr: string;
  remoteResult: null | {
    status: "passed" | "failed";
    cells: Array<{ id: string; status: "passed" | "failed"; stdout: string; stderr: string; duration_ms: number }>;
    artifacts: Array<{ path: string; mimeType: string; sizeBytes: number; sha256: string }>;
    executionEnvironment?: { requestedDevice: string; resolvedDevice: string; torchVersion: string | null };
  };
}

interface ArtifactInfo {
  artifactId: string;
  scope: "concept-demo" | "user-notebook";
  path: string;
  files: string[];
  notebookHash: string;
  createdAt: string;
  runIds: string[];
  localRunIds?: string[];
  remoteRunIds?: string[];
  imageDigests: string[];
  deviations: string[];
}

interface StoredNotebook {
  notebook: ResearchNotebook;
  version: string;
  hash: string;
}

type NotebookGenerationPhase = "idle" | "collecting-evidence" | "drafting" | "repairing-structure" | "smoke-testing" | "repairing-runtime" | "saving" | "completed" | "failed" | "cancelled";

interface NotebookGenerationState {
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  phase: NotebookGenerationPhase;
  detail: string;
  startedAt: string | null;
  updatedAt: string;
  attempt: number;
  cancelable: boolean;
  modelRoute?: CodexModelRoute;
  error?: string;
}

interface AnnotationTarget {
  cellId: string;
  kind: "text" | "figure";
  excerpt: string;
  artifactPath?: string;
  runId?: string;
  runBackend?: "local" | "modal";
  anchor: Range | HTMLElement;
  x: number;
  y: number;
  editorY: number;
  editorPlacement: "above" | "below";
}

interface NotebookStudioProps {
  inspectorOpen: boolean;
  study: StudyInspection;
  onOpenEvidence: (citation: EvidenceCitation) => void;
  onSendAnnotation?: (annotation: NotebookAnnotation) => void;
  generationRequired?: boolean;
  autoGenerate?: boolean;
  embedded?: boolean;
  onOpenFull?: () => void;
  onClose?: () => void;
}

function genericNotebook(study: StudyInspection): ResearchNotebook {
  const title = study.paper?.title || study.repository?.fullName || "Research source";
  return {
    id: `${study.studyId}-evidence-notebook`,
    title: `${title.slice(0, 72)} learning notebook`,
    paperUrl: study.paper?.url || "",
    repositoryUrl: study.repository?.url || "",
    image: "rosetta-python:0.1",
    updatedAt: study.createdAt,
    cells: [{
      id: "notebook-pending",
      kind: "markdown",
      source: `# ${title}`,
      executionCount: null,
      runStatus: "idle",
    }],
    comments: [],
    provenance: [{
      id: `provenance-${study.studyId}`,
      type: "notebook.placeholder",
      actor: "agent",
      summary: "Reserved a notebook id until the grounded learning notebook is generated",
      createdAt: study.createdAt,
      hash: study.studyId,
    }],
  };
}

function notebookForStudy(study: StudyInspection): ResearchNotebook {
  return genericNotebook(study);
}

function eventId(): string {
  return globalThis.crypto?.randomUUID?.() || `event-${Date.now()}`;
}

function latestRunId(notebook: ResearchNotebook): string | null {
  return [...notebook.cells].reverse().find((cell) => cell.output)?.output?.runId || null;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function shortHash(value?: string): string {
  if (!value) return "pending";
  return value.replace(/^sha256:/, "").slice(0, 10);
}

function encodedArtifactPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function cellArtifactUrl(notebookId: string, runId: string, path: string, backend: "local" | "modal" = "local", download = false): string {
  if (backend === "modal") return `/api/notebooks/${encodeURIComponent(notebookId)}/modal/runs/${encodeURIComponent(runId)}/${download ? "files" : "artifacts"}/${encodedArtifactPath(path)}`;
  return `/api/runs/${encodeURIComponent(runId)}/${download ? "files" : "artifacts"}/${encodedArtifactPath(path)}`;
}

function annotationCenterX(value: number): number {
  const halfWidth = Math.min(210, (window.innerWidth - 24) / 2);
  return Math.min(window.innerWidth - 12 - halfWidth, Math.max(12 + halfWidth, value));
}

function annotationPosition(anchor: Range | HTMLElement, placement?: "above" | "below") {
  const rect = anchor.getBoundingClientRect();
  const editorPlacement = placement || (rect.top > window.innerHeight / 2 ? "above" : "below");
  return {
    x: annotationCenterX(rect.left + rect.width / 2),
    y: rect.top - 10,
    editorY: editorPlacement === "above" ? rect.top - 324 : rect.bottom + 12,
    editorPlacement,
  };
}

const generationPhaseLabels: Record<NotebookGenerationPhase, string> = {
  idle: "Preparing",
  "collecting-evidence": "Collecting evidence",
  drafting: "Building the learning path",
  "repairing-structure": "Repairing source grounding",
  "smoke-testing": "Running isolated checks",
  "repairing-runtime": "Repairing executable code",
  saving: "Saving verified notebook",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const generationPhases: NotebookGenerationPhase[] = ["collecting-evidence", "drafting", "smoke-testing", "saving"];

function generationElapsed(startedAt: string | null): string {
  if (!startedAt) return "Starting";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1_000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s elapsed` : `${seconds}s elapsed`;
}

export default function NotebookStudio({ inspectorOpen, study, onOpenEvidence, onSendAnnotation, generationRequired = true, autoGenerate = false, embedded = false, onOpenFull, onClose }: NotebookStudioProps) {
  const [notebook, setNotebook] = useState<ResearchNotebook>(() => notebookForStudy(study));
  const [selectedCellId, setSelectedCellId] = useState("notebook-pending");
  const [runtime, setRuntime] = useState<RuntimeStatus>({ ready: false, runtime: "docker", image: "rosetta-python:0.1" });
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ ready: false });
  const [modalStatus, setModalStatus] = useState<ModalStatus | null>(null);
  const [modalDialogOpen, setModalDialogOpen] = useState(false);
  const [modalPlanning, setModalPlanning] = useState(false);
  const [modalLaunching, setModalLaunching] = useState(false);
  const [modalPlan, setModalPlan] = useState<ModalPlan | null>(null);
  const [modalApprovalToken, setModalApprovalToken] = useState("");
  const [modalRunError, setModalRunError] = useState("");
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false);
  const [busyCellId, setBusyCellId] = useState<string | null>(null);
  const [runRequestError, setRunRequestError] = useState<{ cellId: string; message: string } | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationState, setGenerationState] = useState<NotebookGenerationState | null>(null);
  const [cancellingGeneration, setCancellingGeneration] = useState(false);
  const [generatingFigure, setGeneratingFigure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [artifact, setArtifact] = useState<ArtifactInfo | null>(null);
  const [runs, setRuns] = useState<NotebookRun[]>([]);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notebookLoading, setNotebookLoading] = useState(true);
  const [notebookLoadError, setNotebookLoadError] = useState("");
  const [notebookLoadRevision, setNotebookLoadRevision] = useState(0);
  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);
  const [annotationEditorOpen, setAnnotationEditorOpen] = useState(false);
  const [annotationAudience, setAnnotationAudience] = useState<"agent" | "me">("agent");
  const [annotationNote, setAnnotationNote] = useState("");
  const notebookScrollRef = useRef<HTMLDivElement>(null);
  const annotationEditorRef = useRef<HTMLFormElement>(null);
  const modalDialogRef = useRef<HTMLDivElement>(null);
  const savedHashRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const autoGenerationStudyRef = useRef("");
  useDialogFocus(annotationEditorRef, annotationEditorOpen);
  useDialogFocus(modalDialogRef, modalDialogOpen);

  useEffect(() => {
    fetch("/api/runtime/status")
      .then(async (response) => ({ response, body: await response.json() as RuntimeStatus }))
      .then(({ body }) => setRuntime(body))
      .catch(() => setRuntime({ ready: false, runtime: "docker", image: "rosetta-python:0.1", message: "Runner API is unavailable" }));
  }, []);

  useEffect(() => {
    fetch("/api/agent/status")
      .then(async (response) => {
        const body = await response.json() as AgentStatus;
        if (!response.ok) throw new Error("Agent status is unavailable");
        return body;
      })
      .then(setAgentStatus)
      .catch(() => setAgentStatus({ ready: false, message: "Local Codex agent is unavailable" }));
  }, []);

  useEffect(() => {
    fetch("/api/modal/status")
      .then(async (response) => {
        const body = await response.json() as ModalStatus;
        if (!response.ok) throw new Error(body.message || "Modal status is unavailable");
        return body;
      })
      .then(setModalStatus)
      .catch((error: unknown) => setModalStatus({ installed: false, authenticated: false, ready: false, message: error instanceof Error ? error.message : String(error) }));
  }, []);

  useEffect(() => {
    const seed = notebookForStudy(study);
    let active = true;
    fetch(`/api/notebooks/${encodeURIComponent(seed.id)}?optional=1`)
      .then(async (response) => {
        const body = await response.json() as (StoredNotebook & { error?: string }) | null;
        if (!response.ok) throw new Error(body?.error || "Stored notebook could not be loaded");
        return body;
      })
      .then((stored) => {
        if (!active) return;
        if (stored) {
          const restored = { ...stored.notebook, comments: stored.notebook.comments.filter((comment) => comment.id !== "comment-agent-1") };
          savedHashRef.current = stored.hash;
          setNotebook(restored);
          setSelectedCellId((current) => restored.cells.some((cell) => cell.id === current) ? current : restored.cells[0].id);
        } else {
          savedHashRef.current = null;
          setNotebook(seed);
        }
      })
      .catch((error: unknown) => {
        if (active) setNotebookLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setNotebookLoading(false);
      });
    return () => { active = false; };
  }, [notebookLoadRevision, study]);

  useEffect(() => {
    let active = true;
    fetch(`/api/studies/${encodeURIComponent(study.studyId)}/notebook/generation-status`)
      .then(async (response) => {
        const body = await response.json() as NotebookGenerationState & { error?: string };
        if (!response.ok) throw new Error(body.error || "Generation status could not be loaded");
        return body;
      })
      .then((body) => {
        if (!active) return;
        setGenerationState(body);
        setGenerating(body.status === "running");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [study.studyId]);

  useEffect(() => {
    if (!generating) return;
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/studies/${encodeURIComponent(study.studyId)}/notebook/generation-status`);
        const body = await response.json() as NotebookGenerationState & { error?: string };
        if (!response.ok) throw new Error(body.error || "Generation status could not be refreshed");
        if (!active) return;
        setGenerationState(body);
        if (body.status === "running") {
          timer = window.setTimeout(() => void poll(), 1_000);
          return;
        }
        if (body.status === "completed") {
          const seed = notebookForStudy(study);
          const storedResponse = await fetch(`/api/notebooks/${encodeURIComponent(seed.id)}?optional=1`);
          const stored = await storedResponse.json() as (StoredNotebook & { error?: string }) | null;
          if (!storedResponse.ok) throw new Error(stored?.error || "Generated notebook could not be loaded");
          if (active && stored) {
            savedHashRef.current = stored.hash;
            setNotebook(stored.notebook);
            setSelectedCellId(stored.notebook.cells[0].id);
            const runsResponse = await fetch(`/api/notebooks/${encodeURIComponent(stored.notebook.id)}/runs`);
            const runsBody = await runsResponse.json() as { runs?: NotebookRun[]; error?: string };
            if (!runsResponse.ok) throw new Error(runsBody.error || "Run results could not be refreshed");
            if (active) {
              setRuns(runsBody.runs || []);
              setNotice("Generated demo passed its server-side verification");
            }
          }
        } else if (body.status === "cancelled") {
          setNotice("Notebook generation cancelled before saving");
        } else if (body.status === "failed") {
          setNotice(body.error || "Notebook generation failed");
        }
        if (active) {
          setGenerating(false);
          setCancellingGeneration(false);
        }
      } catch (error) {
        if (active) {
          setGenerating(false);
          setCancellingGeneration(false);
          setNotice(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [generating, study]);

  useEffect(() => {
    let active = true;
    const notebookId = notebookIdForStudy(study);
    Promise.allSettled([
      fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/artifacts`).then(async (response) => {
        const body = await response.json() as { artifacts?: ArtifactInfo[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Stored artifacts could not be loaded");
        return body.artifacts || [];
      }),
      fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/runs`).then(async (response) => {
        const body = await response.json() as { runs?: NotebookRun[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Run results could not be loaded");
        return body.runs || [];
      }),
    ])
      .then(([artifactResult, runResult]) => {
        if (!active) return;
        if (artifactResult.status === "fulfilled") setArtifact(artifactResult.value[0] || null);
        if (runResult.status === "fulfilled") setRuns(runResult.value);
        const failures = [artifactResult, runResult]
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
        if (failures.length > 0) setNotice([...new Set(failures)].join(" · "));
      });
    return () => { active = false; };
  }, [study]);

  async function refreshRuns(notebookId = notebook.id): Promise<void> {
    const response = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/runs`);
    const body = await response.json() as { runs?: NotebookRun[]; error?: string };
    if (!response.ok) throw new Error(body.error || "Run results could not be refreshed");
    setRuns(body.runs || []);
  }

  function retryNotebookLoad(): void {
    setNotebookLoadError("");
    setNotebookLoading(true);
    setNotebookLoadRevision((current) => current + 1);
  }

  async function refreshLocalServices(): Promise<void> {
    if (runtimeRefreshing) return;
    setRuntimeRefreshing(true);
    try {
      const [runtimeResult, agentResult] = await Promise.allSettled([
        fetch("/api/runtime/status").then(async (response) => {
          const body = await response.json() as RuntimeStatus;
          if (!response.ok) throw new Error(body.message || "Runner status is unavailable");
          return body;
        }),
        fetch("/api/agent/status").then(async (response) => {
          const body = await response.json() as AgentStatus;
          if (!response.ok) throw new Error(body.message || "Agent status is unavailable");
          return body;
        }),
      ]);
      if (runtimeResult.status === "fulfilled") setRuntime(runtimeResult.value);
      else setRuntime({ ready: false, runtime: "docker", image: "rosetta-python:0.1", message: runtimeResult.reason instanceof Error ? runtimeResult.reason.message : String(runtimeResult.reason) });
      if (agentResult.status === "fulfilled") setAgentStatus(agentResult.value);
      else setAgentStatus({ ready: false, message: agentResult.reason instanceof Error ? agentResult.reason.message : String(agentResult.reason) });
      setNotice(runtimeResult.status === "fulfilled" && runtimeResult.value.ready ? "Local runtime status refreshed" : "Local runtime is not ready");
    } finally {
      setRuntimeRefreshing(false);
    }
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!saveError) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [saveError]);

  useEffect(() => {
    if (!annotationTarget) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAnnotationTarget(null);
        setAnnotationEditorOpen(false);
      }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [annotationTarget]);

  useEffect(() => {
    if (!annotationTarget || annotationEditorOpen) return;
    const dismissOutsideSelection = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".selection-annotate-button, .annotation-editor")) return;
      setAnnotationTarget(null);
      setAnnotationNote("");
      window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("pointerdown", dismissOutsideSelection, true);
    return () => document.removeEventListener("pointerdown", dismissOutsideSelection, true);
  }, [annotationEditorOpen, annotationTarget]);

  const annotationVisible = Boolean(annotationTarget);
  useEffect(() => {
    if (!annotationVisible) return;
    const scroller = notebookScrollRef.current;
    let frame = 0;
    const trackAnchor = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setAnnotationTarget((current) => current ? { ...current, ...annotationPosition(current.anchor, current.editorPlacement) } : null);
      });
    };
    scroller?.addEventListener("scroll", trackAnchor, { passive: true });
    window.addEventListener("resize", trackAnchor, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      scroller?.removeEventListener("scroll", trackAnchor);
      window.removeEventListener("resize", trackAnchor);
    };
  }, [annotationVisible]);

  const isGenerated = notebook.provenance.some((event) => event.type === "notebook.generated");
  const isPlaceholder = notebook.provenance.some((event) => event.type === "notebook.placeholder")
    || notebook.cells.some((cell) => cell.source.includes("source_fingerprint=") || cell.source.includes("architecture_demo_ready=False"));
  const hasNotebookContent = isGenerated || !isPlaceholder;
  const notebookExecutionAvailable = hasNotebookContent;
  const latestOutput = [...notebook.cells].reverse().find((cell) => cell.output)?.output;

  function appendLocalEvent(snapshot: ResearchNotebook, event: Omit<ProvenanceEvent, "id" | "createdAt">): ResearchNotebook {
    const createdAt = new Date().toISOString();
    return { ...snapshot, updatedAt: createdAt, provenance: [...snapshot.provenance, { ...event, id: eventId(), createdAt }] };
  }

  useEffect(() => {
    const scroller = notebookScrollRef.current;
    if (!scroller) return;
    const capture = (event: Event) => {
      if (annotationEditorOpen) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!scroller.contains(range.commonAncestorContainer)) return;
      const origin = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection.anchorNode?.parentElement;
      if (!origin || origin.closest("textarea, input, button, .annotation-editor")) return;
      const cell = origin.closest<HTMLElement>("[data-notebook-cell-id]");
      const excerpt = selection.toString().replace(/\s+/g, " ").trim().slice(0, 2_000);
      if (!cell || excerpt.length < 2) return;
      const anchor = range.cloneRange();
      setSelectedCellId(cell.dataset.notebookCellId || selectedCellId);
      setAnnotationTarget({
        cellId: cell.dataset.notebookCellId || selectedCellId,
        kind: "text",
        excerpt,
        anchor,
        ...annotationPosition(anchor),
      });
      setAnnotationEditorOpen(false);
      setAnnotationNote("");
      setAnnotationAudience("agent");
      event.stopPropagation();
    };
    scroller.addEventListener("mouseup", capture);
    scroller.addEventListener("keyup", capture);
    return () => {
      scroller.removeEventListener("mouseup", capture);
      scroller.removeEventListener("keyup", capture);
    };
  }, [annotationEditorOpen, notebookLoading, selectedCellId]);

  function captureFigure(cellId: string, path: string, runId: string, runBackend: "local" | "modal", anchor: HTMLElement): void {
    setSelectedCellId(cellId);
    setAnnotationTarget({
      cellId,
      kind: "figure",
      excerpt: `Generated figure from ${cellId}: ${path}`,
      artifactPath: path,
      runId,
      runBackend,
      anchor,
      ...annotationPosition(anchor),
    });
    setAnnotationEditorOpen(true);
    setAnnotationNote("");
    setAnnotationAudience("agent");
  }

  async function submitAnnotation(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!annotationTarget || !annotationNote.trim()) return;
    const createdAt = new Date().toISOString();
    const annotation: NotebookAnnotation = {
      id: eventId(),
      notebookId: notebook.id,
      cellId: annotationTarget.cellId,
      kind: annotationTarget.kind,
      excerpt: annotationTarget.excerpt,
      artifactPath: annotationTarget.artifactPath,
      runId: annotationTarget.runId,
      runBackend: annotationTarget.runBackend,
      note: annotationNote.trim(),
      createdAt,
    };
    const comment: ThreadComment = {
      id: eventId(),
      cellId: annotation.cellId,
      author: "user",
      body: annotation.note,
      status: "open",
      createdAt,
      annotation,
    };
    const next: ResearchNotebook = {
      ...notebook,
      comments: [...notebook.comments, comment],
      provenance: [...notebook.provenance, {
        id: eventId(), type: "comment.recorded", actor: "user", summary: `Annotated ${annotation.kind} in ${annotation.cellId}`, cellId: annotation.cellId, createdAt,
      }],
      updatedAt: createdAt,
    };
    setNotebook(next);
    setSelectedCellId(annotation.cellId);
    const saved = await persist(next, { type: "comment.recorded", actor: "user", summary: `Annotated ${annotation.kind} in ${annotation.cellId}`, cellId: annotation.cellId }, false);
    if (!saved) {
      setNotebook(notebook);
      return;
    }
    setAnnotationTarget(null);
    setAnnotationEditorOpen(false);
    setAnnotationNote("");
    window.getSelection()?.removeAllRanges();
    if (annotationAudience === "agent" && onSendAnnotation) onSendAnnotation(annotation);
    else setNotice("Annotation saved to notebook notes");
  }

  async function persist(snapshot: ResearchNotebook, event?: Record<string, unknown>, retainOnFailure = true): Promise<boolean> {
    pendingSavesRef.current += 1;
    setSaving(true);
    const operation = saveQueueRef.current.catch(() => undefined).then(async () => {
      const response = await fetch(`/api/notebooks/${snapshot.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebook: { ...snapshot, image: runtime.image }, event, expectedHash: savedHashRef.current }),
      });
      const body = await response.json() as { hash?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Save failed");
      if (!body.hash) throw new Error("Save response did not include a notebook hash");
      savedHashRef.current = body.hash;
      setSaveError("");
    });
    saveQueueRef.current = operation;
    try {
      await operation;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (retainOnFailure) setSaveError(message);
      setNotice(message);
      return false;
    } finally {
      pendingSavesRef.current -= 1;
      if (pendingSavesRef.current === 0) setSaving(false);
    }
  }

  function editCell(cellId: string, source: string): void {
    setNotebook((current) => ({
      ...current,
      cells: current.cells.map((cell, index) => {
        const editedIndex = current.cells.findIndex((candidate) => candidate.id === cellId);
        if (cell.id === cellId) return { ...cell, source, runStatus: "idle", executionCount: null, output: undefined };
        if (editedIndex >= 0 && current.cells[editedIndex].kind === "code" && index > editedIndex && cell.kind === "code") {
          return { ...cell, runStatus: "idle", executionCount: null, output: undefined };
        }
        return cell;
      }),
      updatedAt: new Date().toISOString(),
    }));
  }

  async function saveCellEdit(cellId: string): Promise<void> {
    const currentCell = notebook.cells.find((cell) => cell.id === cellId);
    if (!currentCell) return;
    const next = appendLocalEvent(notebook, {
      type: "cell.edited",
      actor: "user",
      summary: `Edited ${cellId}`,
      cellId,
    });
    setNotebook(next);
    if (await persist(next, { type: "cell.edited", actor: "user", summary: `Edited ${cellId}`, cellId })) setNotice("Notebook version saved");
  }

  async function executeCell(cellId: string, snapshot = notebook): Promise<ResearchNotebook> {
    const runnableSnapshot = { ...snapshot, image: runtime.image };
    const nextExecution = Math.max(0, ...snapshot.cells.map((cell) => cell.executionCount || 0)) + 1;
    setBusyCellId(cellId);
    setRunRequestError(null);
    setSelectedCellId(cellId);
    setNotebook((current) => ({ ...current, cells: current.cells.map((cell) => cell.id === cellId ? { ...cell, runStatus: "running", output: undefined } : cell) }));

    try {
      const response = await fetch(`/api/notebooks/${snapshot.id}/cells/${cellId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebook: runnableSnapshot, parentRunId: latestRunId(runnableSnapshot) }),
      });
      const body = await response.json() as RunCellResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Cell execution failed");

      const createdAt = body.createdAt;
      const updatedCells = snapshot.cells.map((cell) => {
        const result = body.cells.find((candidate) => candidate.id === cell.id);
        if (!result || result.status === "skipped") return cell;
        return {
          ...cell,
          executionCount: cell.id === cellId ? nextExecution : cell.executionCount,
          runStatus: result.status,
          output: {
            runId: body.runId,
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
            durationMs: result.durationMs,
            codeHash: body.codeHash,
            imageDigest: body.imageDigest,
            createdAt,
            artifacts: result.artifacts || [],
            backend: "local",
            runtime: runtime.image,
          },
        } satisfies NotebookCell;
      });
      const next = appendLocalEvent({ ...runnableSnapshot, cells: updatedCells }, {
        type: "cell.executed",
        actor: "runner",
        summary: `${cellId} ${body.status} in ${body.durationMs} ms`,
        cellId,
        runId: body.runId,
        parentId: body.parentRunId || undefined,
        hash: body.codeHash,
      });
      setNotebook(next);
      await persist(next);
      await refreshRuns(snapshot.id);
      setNotice(body.status === "passed" ? `${cellId} passed in an isolated container` : `${cellId} failed`);
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotebook(snapshot);
      setRunRequestError({ cellId, message });
      return snapshot;
    } finally {
      setBusyCellId(null);
    }
  }

  async function runAllLocally(): Promise<void> {
    const lastCodeCell = [...notebook.cells].reverse().find((cell) => cell.kind === "code");
    if (!lastCodeCell) return;
    setModalDialogOpen(false);
    setModalPlan(null);
    setModalApprovalToken("");
    setModalRunError("");
    setRunningAll(true);
    await executeCell(lastCodeCell.id, notebook);
    setRunningAll(false);
  }

  async function prepareModalRun(): Promise<void> {
    setModalDialogOpen(true);
    setModalPlanning(true);
    setModalPlan(null);
    setModalApprovalToken("");
    setModalRunError("");
    const saved = await persist(notebook, undefined, false);
    if (!saved) {
      setModalRunError("Save the current notebook version before creating a remote execution plan.");
      setModalPlanning(false);
      return;
    }
    try {
      const response = await fetch(`/api/notebooks/${encodeURIComponent(notebook.id)}/modal/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpu: "auto",
          timeoutSeconds: 300,
          executionReason: "The user selected the connected Modal accelerator for this one-time remote CUDA notebook execution.",
        }),
      });
      const body = await response.json() as { plan?: ModalPlan; approvalToken?: string; error?: string };
      if (!response.ok || !body.plan || !body.approvalToken) throw new Error(body.error || "Modal execution plan could not be created");
      setModalPlan(body.plan);
      setModalApprovalToken(body.approvalToken);
    } catch (error) {
      setModalRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setModalPlanning(false);
    }
  }

  async function runAll(): Promise<void> {
    if (modalStatus?.ready) {
      await prepareModalRun();
      return;
    }
    await runAllLocally();
  }

  async function launchModalNotebook(): Promise<void> {
    if (!modalPlan || !modalApprovalToken || modalLaunching) return;
    const snapshot = notebook;
    const codeCells = snapshot.cells.filter((cell) => cell.kind === "code");
    const firstExecution = Math.max(0, ...snapshot.cells.map((cell) => cell.executionCount || 0)) + 1;
    setModalLaunching(true);
    setRunningAll(true);
    setModalRunError("");
    setNotebook((current) => ({
      ...current,
      cells: current.cells.map((cell) => cell.kind === "code" ? { ...cell, runStatus: "running", output: undefined } : cell),
    }));
    try {
      const response = await fetch(`/api/notebooks/${encodeURIComponent(snapshot.id)}/modal/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: modalPlan.planId, approvalToken: modalApprovalToken }),
      });
      const body = await response.json() as ModalLaunchResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Modal notebook launch failed");
      if (!body.remoteResult) throw new Error(body.stderr || "Modal did not return structured notebook outputs");
      const resultById = new Map(body.remoteResult.cells.map((cell) => [cell.id, cell]));
      const lastResultId = body.remoteResult.cells.at(-1)?.id;
      const artifactPaths = body.remoteResult.artifacts.map((artifact) => artifact.path);
      const runtimeLabel = `${modalPlan.gpu}${body.remoteResult.executionEnvironment?.resolvedDevice ? ` · ${body.remoteResult.executionEnvironment.resolvedDevice}` : ""}`;
      const updatedCells = snapshot.cells.map((cell) => {
        const result = resultById.get(cell.id);
        if (!result) {
          return cell.kind === "code" ? { ...cell, runStatus: "idle" as const, output: undefined } : cell;
        }
        const resultIndex = codeCells.findIndex((candidate) => candidate.id === cell.id);
        return {
          ...cell,
          executionCount: firstExecution + Math.max(0, resultIndex),
          runStatus: result.status,
          output: {
            runId: body.planId,
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
            durationMs: result.duration_ms,
            codeHash: modalPlan.planHash,
            imageDigest: modalPlan.appSha256,
            createdAt: body.endedAt,
            artifacts: cell.id === lastResultId ? artifactPaths : [],
            backend: "modal",
            runtime: runtimeLabel,
          },
        } satisfies NotebookCell;
      });
      const next = appendLocalEvent({ ...snapshot, cells: updatedCells }, {
        type: "cell.executed",
        actor: "runner",
        summary: `Notebook ${body.status} on Modal ${modalPlan.gpu}`,
        cellId: lastResultId,
        runId: body.planId,
        hash: modalPlan.planHash,
      });
      setNotebook(next);
      setSelectedCellId(lastResultId || snapshot.cells[0].id);
      await persist(next);
      setModalDialogOpen(false);
      setModalPlan(null);
      setModalApprovalToken("");
      setNotice(body.status === "passed" ? `Notebook passed on Modal ${modalPlan.gpu}` : `Modal ${modalPlan.gpu} run retained a failed cell`);
    } catch (error) {
      setNotebook(snapshot);
      setModalApprovalToken("");
      setModalRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setModalLaunching(false);
      setRunningAll(false);
    }
  }

  async function generateDemo(): Promise<void> {
    if (!agentStatus.ready || !study.paperDocument || generating) return;
    setGenerating(true);
    setCancellingGeneration(false);
    setGenerationState({
      status: "running", phase: "collecting-evidence", detail: "Preparing source-grounded notebook generation",
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attempt: 1, cancelable: true,
    });
    setNotice("");
    try {
      const alreadyGenerated = notebook.provenance.some((event) => event.type === "notebook.generated");
      const response = await fetch(`/api/studies/${encodeURIComponent(study.studyId)}/notebook/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: alreadyGenerated }),
      });
      const body = await response.json() as StoredNotebook & { error?: string; smokeTest?: "passed" | "skipped" };
      if (!response.ok) throw new Error(body.error || "Paper demo generation failed");
      savedHashRef.current = body.hash;
      setNotebook(body.notebook);
      setSelectedCellId(body.notebook.cells[0].id);
      await refreshRuns(body.notebook.id);
      setNotice(body.smokeTest === "passed" ? "Generated demo passed its isolated smoke test" : "Generated demo saved; Docker smoke test was unavailable");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
      setCancellingGeneration(false);
    }
  }
  const generateDemoEffect = useEffectEvent(generateDemo);

  useEffect(() => {
    if (!autoGenerate || embedded || notebookLoading || notebookLoadError || generating || hasNotebookContent || !agentStatus.ready || !study.paperDocument) return;
    if (autoGenerationStudyRef.current === study.studyId) return;
    autoGenerationStudyRef.current = study.studyId;
    void generateDemoEffect();
  }, [agentStatus.ready, autoGenerate, embedded, generating, hasNotebookContent, notebookLoadError, notebookLoading, study.paperDocument, study.studyId]);

  async function cancelGeneration(): Promise<void> {
    if (!generating || cancellingGeneration) return;
    setCancellingGeneration(true);
    try {
      const response = await fetch(`/api/studies/${encodeURIComponent(study.studyId)}/notebook/generation-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json() as NotebookGenerationState & { error?: string };
      if (!response.ok) throw new Error(body.error || "Notebook generation could not be cancelled");
      setGenerationState(body);
      setNotice("Stopping notebook generation");
    } catch (error) {
      setCancellingGeneration(false);
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function generateFigure(): Promise<void> {
    if (!agentStatus.ready || !study.paperDocument || !runtime.ready || generatingFigure) return;
    setGeneratingFigure(true);
    setNotice("Extracting cited values and smoke-testing a paper figure");
    try {
      const response = await fetch(`/api/studies/${encodeURIComponent(study.studyId)}/notebook/figure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json() as StoredNotebook & { error?: string; figure?: { cellId: string; filename: string; runId: string } };
      if (!response.ok || !body.figure) throw new Error(body.error || "Paper figure generation failed");
      savedHashRef.current = body.hash;
      setNotebook(body.notebook);
      setSelectedCellId(body.figure.cellId);
      await refreshRuns(body.notebook.id);
      setNotice(`Verified ${body.figure.filename} from cited paper values`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratingFigure(false);
    }
  }

  async function addCell(kind: "code" | "markdown"): Promise<void> {
    const id = `${kind}-${eventId()}`;
    const newCell: NotebookCell = {
      id,
      kind,
      source: kind === "code" ? "# Test the mechanism here\n" : "## New note\n\nExplain what you observed.",
      executionCount: null,
      runStatus: "idle",
    };
    const next = appendLocalEvent({ ...notebook, cells: [...notebook.cells, newCell] }, {
      type: "cell.added",
      actor: "user",
      summary: `Added ${kind} cell ${id}`,
      cellId: id,
    });
    setNotebook(next);
    setSelectedCellId(id);
    const saved = await persist(next, { type: "cell.added", actor: "user", summary: `Added ${kind} cell ${id}`, cellId: id }, false);
    if (saved) setNotice(`${kind === "code" ? "Code" : "Markdown"} cell added and saved`);
    else {
      setNotebook(notebook);
      setSelectedCellId((current) => current === id ? notebook.cells[0].id : current);
    }
  }

  async function saveVersion(): Promise<void> {
    if (await persist(notebook, { type: "notebook.saved", actor: "user", summary: "Saved an immutable notebook version" })) setNotice("Immutable version saved");
  }

  async function buildArtifact(): Promise<void> {
    setSaving(true);
    try {
      const response = await fetch(`/api/notebooks/${notebook.id}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebook: { ...notebook, image: runtime.image }, expectedHash: savedHashRef.current }),
      });
      const body = await response.json() as ArtifactInfo & { error?: string };
      if (!response.ok) throw new Error(body.error || "Artifact build failed");
      savedHashRef.current = body.notebookHash;
      setArtifact(body);
      const next = appendLocalEvent(notebook, { type: "artifact.created", actor: "agent", summary: `Created ${body.artifactId}`, hash: body.notebookHash });
      setNotebook(next);
      const historySaved = await persist(next);
      setNotice(historySaved ? "Verified run results frozen with the notebook" : "Artifact created; notebook history is waiting to be saved");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  if (notebookLoading) {
    return <section className="primary-workspace notebook-workspace"><div className="study-empty-state"><LoaderCircle className="spin" size={22} /><strong>Loading saved notebook</strong></div></section>;
  }

  if (notebookLoadError) {
    return <section className={`primary-workspace notebook-workspace ${embedded ? "is-embedded" : ""}`}><div className="study-empty-state notebook-load-error"><AlertCircle size={22} /><h1>Notebook unavailable</h1><p>{notebookLoadError}. Existing saved content was not replaced or opened for editing.</p><div className="empty-state-actions"><button type="button" className="primary-command" onClick={retryNotebookLoad}><RefreshCw size={15} /> Retry notebook</button>{embedded && onClose && <button type="button" className="quiet-button" onClick={onClose}>Close artifact</button>}</div></div></section>;
  }

  return (
    <>
      <section className={`primary-workspace notebook-workspace ${embedded ? "is-embedded" : ""}`}>
        <header className="notebook-toolbar">
          <div className="notebook-title">
            <NotebookTabs size={18} />
            <span><strong>{notebook.title}</strong><small>Python 3.12 · {notebook.cells.length} cells</small></span>
          </div>
          {!embedded && <button type="button" className={`runtime-pill ${runtime.ready ? "is-ready" : ""}`} aria-label="Refresh local runtime status" title={runtime.message || runtime.imageDigest || "Refresh local runtime status"} onClick={() => void refreshLocalServices()} disabled={runtimeRefreshing}>
            <i />{runtime.ready ? "Docker ready" : "Runner offline"}<RefreshCw className={runtimeRefreshing ? "spin" : ""} size={12} />
          </button>}
          {!embedded ? <div className="notebook-actions">
            <button type="button" className="quiet-button" title="Generate a PDF-grounded learning notebook" onClick={() => void generateDemo()} disabled={!agentStatus.ready || !study.paperDocument || generating || saving || runningAll || Boolean(busyCellId)}>{generating ? <LoaderCircle className="spin" size={15} /> : <Code2 size={15} />} {isGenerated ? "Regenerate" : "Build notebook"}</button>
            {isGenerated && <button type="button" className="quiet-button" title="Redraw exact reported values while preserving their recoverable chart structure" onClick={() => void generateFigure()} disabled={!agentStatus.ready || !study.paperDocument || !runtime.ready || generatingFigure || generating || saving || runningAll || Boolean(busyCellId)}>{generatingFigure ? <LoaderCircle className="spin" size={15} /> : <ChartNoAxesColumnIncreasing size={15} />} Redraw values</button>}
            {notebookExecutionAvailable && <>
            <button type="button" className="quiet-button" title="Save version" onClick={saveVersion} disabled={saving || notebookLoading}><Save size={15} /> Save version</button>
            <button type="button" className="quiet-button" title="Freeze verified results with a Jupyter notebook" onClick={buildArtifact} disabled={saving}><PackageOpen size={15} /> Freeze results</button>
            <button type="button" className="primary-command" title={modalStatus?.ready ? "Review and approve a one-time Modal run" : "Run in the local isolated container"} onClick={() => void runAll()} disabled={(!runtime.ready && !modalStatus?.ready) || runningAll || Boolean(busyCellId)}>
              {runningAll ? <LoaderCircle className="spin" size={15} /> : <Play size={15} fill="currentColor" />} Run all
            </button></>}
          </div> : <div className="notebook-actions embedded-notebook-actions">
            {onOpenFull && <button type="button" className="quiet-button" onClick={onOpenFull}><NotebookTabs size={15} /> Open full</button>}
            {onClose && <button type="button" className="icon-button" aria-label="Close notebook artifact" title="Close notebook artifact" onClick={onClose}><X size={16} /></button>}
          </div>}
        </header>

        {generating && <div className="notebook-generation-progress" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={17} />
          <div className="generation-progress-copy">
            <strong>{generationPhaseLabels[generationState?.phase || "collecting-evidence"]}</strong>
            <span>{generationState?.detail || "Preparing source-grounded notebook generation"}</span>
            {generationState?.modelRoute && <small className="generation-model-route">{generationState.modelRoute.model} · {generationState.modelRoute.reasoningEffort} reasoning · {generationState.modelRoute.purpose}</small>}
          </div>
          <ol aria-label="Notebook generation phases">
            {generationPhases.map((phase) => {
              const currentPhase = generationState?.phase || "collecting-evidence";
              const activeIndex = currentPhase === "repairing-structure" ? 1 : currentPhase === "repairing-runtime" ? 2 : generationPhases.indexOf(currentPhase);
              const phaseIndex = generationPhases.indexOf(phase);
              return <li key={phase} aria-label={generationPhaseLabels[phase]} className={phaseIndex < activeIndex ? "is-complete" : phaseIndex === activeIndex ? "is-active" : ""}><span title={generationPhaseLabels[phase]} /></li>;
            })}
          </ol>
          <small>{generationElapsed(generationState?.startedAt || null)}{(generationState?.attempt || 1) > 1 ? ` · attempt ${generationState?.attempt}` : ""}</small>
          <button type="button" className="quiet-button" onClick={() => void cancelGeneration()} disabled={cancellingGeneration || generationState?.cancelable === false}>
            {cancellingGeneration ? <LoaderCircle className="spin" size={14} /> : <X size={14} />}{cancellingGeneration ? "Stopping" : "Cancel"}
          </button>
        </div>}
        {saveError && <div className="notebook-save-error" role="alert"><AlertCircle size={15} /><span><strong>Unsaved changes.</strong> {saveError}</span><button type="button" onClick={() => void saveVersion()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} Retry save</button></div>}

        <div className="notebook-scroll" role="region" aria-label="Executable research notebook" ref={notebookScrollRef}>
          {generationRequired && !hasNotebookContent ? <div className="learning-notebook-gate">
            {generating ? <LoaderCircle className="spin" size={22} /> : <Code2 size={22} />}
            <strong>{generating ? "Building the learning notebook" : "Learning notebook not built"}</strong>
            <span>{generating ? "Reading the paper and repository, mapping equations to code, and rendering the architecture." : agentStatus.ready ? "Build the evidence-grounded notebook to continue." : "Connect a local Codex agent to build the paper guide."}</span>
            {!generating && agentStatus.ready && <button type="button" className="primary-command" onClick={() => void generateDemo()}><Code2 size={15} /> Build notebook</button>}
          </div> : <>
          <div className="notebook-context">
            <span><ShieldCheck size={14} /> {latestOutput?.backend === "modal" ? `Modal ${latestOutput.runtime || "CUDA"} · network blocked · single-use container` : "Network disabled · 2 CPU · 2 GB · 20 s"}</span>
            <span>{latestOutput?.backend === "modal" ? <Cloud size={14} /> : <Box size={14} />} {latestOutput?.backend === "modal" ? "Remote outputs retained locally" : notebook.image}</span>
          </div>
          {notebook.cells.map((cell) => (
            <NotebookCellView
              studyId={study.studyId}
              key={cell.id}
              cell={cell}
              selected={cell.id === selectedCellId}
              busy={busyCellId === cell.id}
              requestError={runRequestError?.cellId === cell.id ? runRequestError.message : ""}
              executionLocked={Boolean(busyCellId)}
              onSelect={() => setSelectedCellId(cell.id)}
              onChange={(source) => editCell(cell.id, source)}
              onBlur={() => void saveCellEdit(cell.id)}
              onRun={() => void executeCell(cell.id)}
              onDismissRunError={() => setRunRequestError((current) => current?.cellId === cell.id ? null : current)}
              onOpenEvidence={onOpenEvidence}
              onAnnotateFigure={(path, runId, backend, anchor) => captureFigure(cell.id, path, runId, backend, anchor)}
            />
          ))}
          <div className="add-cell-row">
            <button type="button" onClick={() => void addCell("code")} disabled={saving}><Plus size={14} /> Code</button>
            <button type="button" onClick={() => void addCell("markdown")} disabled={saving}><Plus size={14} /> Markdown</button>
          </div>
          </>}
        </div>
        {annotationTarget && !annotationEditorOpen && <button type="button" className="selection-annotate-button" style={{ left: annotationTarget.x, top: annotationTarget.y }} onClick={() => setAnnotationEditorOpen(true)}><Highlighter size={15} /> Annotate</button>}
        {annotationTarget && annotationEditorOpen && <form ref={annotationEditorRef} className="annotation-editor" role="dialog" aria-label="Create annotation" style={{ left: annotationTarget.x, top: annotationTarget.editorY }} onSubmit={(event) => void submitAnnotation(event)}>
          <div className="annotation-audience" role="group" aria-label="Annotation destination">
            <button type="button" aria-pressed={annotationAudience === "agent"} onClick={() => setAnnotationAudience("agent")}><MessageSquareText size={14} /> To agent</button>
            <button type="button" aria-pressed={annotationAudience === "me"} onClick={() => setAnnotationAudience("me")}><Highlighter size={14} /> For me</button>
          </div>
          <blockquote>{annotationTarget.excerpt}</blockquote>
          <textarea data-dialog-initial-focus rows={4} aria-label="Annotation note" placeholder={annotationAudience === "agent" ? "Ask the agent about this selection" : "Write a note for yourself"} value={annotationNote} onChange={(event) => setAnnotationNote(event.target.value)} />
          <footer><button type="button" onClick={() => { setAnnotationTarget(null); setAnnotationEditorOpen(false); setAnnotationNote(""); }}>Cancel</button><button type="submit" disabled={!annotationNote.trim()}><Highlighter size={14} /> Annotate</button></footer>
        </form>}
        {notice && <div className="notebook-toast" role="status">{saving ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={14} />}{notice}</div>}
      </section>

      {modalDialogOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !modalPlanning && !modalLaunching && setModalDialogOpen(false)}>
        <div ref={modalDialogRef} tabIndex={-1} className="app-dialog approval-dialog modal-run-approval" role="dialog" aria-modal="true" aria-labelledby="modal-run-approval-title">
          <header><span className="approval-icon"><Cloud size={19} /></span><button type="button" className="icon-button" aria-label="Close Modal run approval" onClick={() => setModalDialogOpen(false)} disabled={modalPlanning || modalLaunching}><X size={17} /></button></header>
          <h1 id="modal-run-approval-title">Run this notebook on Modal?</h1>
          <p>This approval applies only to this execution. The generated app is bound to the current notebook version and cannot be launched again.</p>
          {modalPlanning && <div className="modal-plan-progress" role="status"><LoaderCircle className="spin" size={16} /><span><strong>Preparing the execution plan</strong><small>Resolving dependencies and selecting the smallest compatible GPU.</small></span></div>}
          {modalPlan && <dl>
            <div><dt>Compute</dt><dd>Modal {modalPlan.gpu} · {modalPlan.containerMemoryMiB / 1024} GB RAM</dd></div>
            <div><dt>Hard timeout</dt><dd>{Math.round(modalPlan.timeoutSeconds / 60)} minutes</dd></div>
            <div><dt>GPU-only ceiling</dt><dd>US${modalPlan.maximumGpuCostUsd.toFixed(4)}</dd></div>
            <div><dt>Notebook</dt><dd>{modalPlan.codeCellCount} code cells</dd></div>
            <div><dt>Dependencies</dt><dd>{modalPlan.packages.length ? modalPlan.packages.join(", ") : "Python standard library"}</dd></div>
            <div><dt>Network</dt><dd>{modalPlan.networkPolicy}</dd></div>
          </dl>}
          {modalPlan && <div className="approval-note"><ShieldCheck size={15} /><span>Code runs inside a fresh remote container. Only declared output files return to this device and are archived with the run.</span></div>}
          {modalRunError && <div className="dialog-error" role="alert"><AlertCircle size={15} /><span>{modalRunError}</span></div>}
          <footer>
            <button type="button" className="secondary-command" onClick={() => setModalDialogOpen(false)} disabled={modalPlanning || modalLaunching}>Cancel</button>
            {runtime.ready && <button type="button" className="secondary-command" onClick={() => void runAllLocally()} disabled={modalPlanning || modalLaunching}><Box size={14} /> Run locally</button>}
            <button type="button" className="primary-command" data-dialog-initial-focus onClick={() => void launchModalNotebook()} disabled={!modalPlan || !modalApprovalToken || modalPlanning || modalLaunching}>
              {modalLaunching ? <LoaderCircle className="spin" size={15} /> : <Cloud size={15} />}{modalLaunching ? "Running on Modal" : "Allow Modal run"}
            </button>
          </footer>
        </div>
      </div>}

      {inspectorOpen && !embedded && (!generationRequired || hasNotebookContent) && (
        <NotebookInspector
          notebook={notebook}
          artifact={artifact}
          runs={runs}
        />
      )}
    </>
  );
}

function NotebookCellView({ studyId, cell, selected, busy, requestError, executionLocked, onSelect, onChange, onBlur, onRun, onDismissRunError, onOpenEvidence, onAnnotateFigure }: {
  studyId: string;
  cell: NotebookCell;
  selected: boolean;
  busy: boolean;
  requestError: string;
  executionLocked: boolean;
  onSelect: () => void;
  onChange: (source: string) => void;
  onBlur: () => void;
  onRun: () => void;
  onDismissRunError: () => void;
  onOpenEvidence: (citation: EvidenceCitation) => void;
  onAnnotateFigure: (path: string, runId: string, backend: "local" | "modal", anchor: HTMLElement) => void;
}) {
  const [editingMarkdown, setEditingMarkdown] = useState(false);
  const [codeExpanded, setCodeExpanded] = useState(cell.id !== "architecture-diagram");
  const collapsibleCode = cell.id === "architecture-diagram";

  if (cell.kind === "markdown") {
    const rows = cell.source.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 44)), 0);
    return (
      <div className={`notebook-markdown-cell ${cell.id === "paper-guide" ? "is-paper-guide" : ""} ${selected ? "is-selected" : ""}`} data-notebook-cell-id={cell.id} onFocusCapture={onSelect}>
        <div className="markdown-cell-tools">
          <span>Explanation</span>
          <button
            type="button"
            aria-label={editingMarkdown ? `Close editor for ${cell.id}` : `Edit explanation ${cell.id}`}
            onClick={(event) => { event.stopPropagation(); setEditingMarkdown((value) => !value); }}
          >
            {editingMarkdown ? <X size={14} /> : <Pencil size={13} />}
          </button>
        </div>
        {editingMarkdown ? (
          <textarea wrap="soft" aria-label={`Edit markdown cell ${cell.id}`} value={cell.source} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} rows={Math.max(8, rows)} />
        ) : (
          <RichMarkdown source={cell.source} paperStudyId={studyId} onOpenEvidence={onOpenEvidence} variant={cell.id === "paper-guide" ? "paper-guide" : "default"} />
        )}
      </div>
    );
  }

  return (
    <div className={`notebook-code-cell ${selected ? "is-selected" : ""}`} data-notebook-cell-id={cell.id} onFocusCapture={onSelect}>
      <div className="execution-gutter">
        <button type="button" aria-label={`Run ${cell.id}`} title="Run cell" onClick={(event) => { event.stopPropagation(); onRun(); }} disabled={executionLocked}>
          {busy ? <LoaderCircle className="spin" size={15} /> : <Play size={14} fill="currentColor" />}
        </button>
        <span>[{busy ? "*" : cell.executionCount || " "}]</span>
      </div>
      <div className="cell-editor-shell">
        <header>
          <span><Code2 size={13} /> {cell.id}</span>
          <div>
            {collapsibleCode && <button type="button" className="cell-code-toggle" aria-expanded={codeExpanded} onClick={(event) => { event.stopPropagation(); setCodeExpanded((value) => !value); }}><Code2 size={12} /> {codeExpanded ? "Hide code" : "Show code"}</button>}
            <span className={`cell-status status-${cell.runStatus}`}>{cell.runStatus === "passed" && <Check size={12} />}{cell.runStatus}</span>
          </div>
        </header>
        {(!collapsibleCode || codeExpanded) && <PythonCodeEditor
          ariaLabel={`Edit code cell ${cell.id}`}
          value={cell.source}
          onChange={onChange}
          onBlur={onBlur}
        />}
        {requestError && <div className="cell-run-request-error" role="alert"><AlertCircle size={14} /><span><strong>Run not recorded.</strong> {requestError}. Existing verified output was retained.</span><button type="button" aria-label={`Dismiss run error for ${cell.id}`} onClick={onDismissRunError}><X size={14} /></button></div>}
        {cell.output && (
          <section className={`cell-output is-${cell.output.status}`} aria-label={`${cell.id} output`}>
            <header><span><Terminal size={13} /> Output</span><small>{cell.output.durationMs} ms · {shortHash(cell.output.codeHash)}</small></header>
            {cell.output.stdout && <pre>{cell.output.stdout}</pre>}
            {cell.output.stderr && <pre className="stderr">{cell.output.stderr}</pre>}
            {cell.output.artifacts?.filter((path) => /\.(?:png|jpe?g|webp)$/i.test(path)).map((path) => {
              const backend = cell.output!.backend || "local";
              const figureUrl = cellArtifactUrl(studyId + "-evidence-notebook", cell.output!.runId, path, backend);
              return <figure className="cell-figure" key={path}>
                <a className="cell-figure-open" href={figureUrl} target="_blank" rel="noreferrer" aria-label={`Open figure ${path} at full size`} title="Open full-size figure"><img src={figureUrl} alt={`${cell.id} generated figure`} loading="lazy" /></a>
                <figcaption><span><Image size={12} /> {path}</span><button type="button" aria-label={`Annotate figure ${path}`} onClick={(event) => { event.stopPropagation(); onAnnotateFigure(path, cell.output!.runId, backend, event.currentTarget); }}><Highlighter size={13} /> Annotate</button></figcaption>
              </figure>;
            })}
            <footer><span>{cell.output.runId}</span><span>{cell.output.backend === "modal" ? `Modal ${cell.output.runtime || "CUDA"}` : "local container"} · image {shortHash(cell.output.imageDigest)}</span></footer>
          </section>
        )}
      </div>
    </div>
  );
}

function NotebookInspector({ notebook, artifact, runs }: {
  notebook: ResearchNotebook;
  artifact: ArtifactInfo | null;
  runs: NotebookRun[];
}) {
  const tabId = useId();
  const outputFiles = useMemo(() => {
    const candidates = [
      ...latestRunArtifacts(runs).map(({ path, run, cellId }) => ({ path, runId: run.runId, cellId, backend: "local" as const, createdAt: run.createdAt })),
      ...notebook.cells.flatMap((cell) => cell.output?.backend === "modal"
        ? (cell.output.artifacts || []).map((path) => ({ path, runId: cell.output!.runId, cellId: cell.id, backend: "modal" as const, createdAt: cell.output!.createdAt }))
        : []),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      if (seen.has(candidate.path)) return false;
      seen.add(candidate.path);
      return true;
    });
  }, [notebook.cells, runs]);
  const figureOutputs = outputFiles.filter(({ path }) => /\.(?:png|jpe?g|webp)$/i.test(path));
  const downloadableOutputs = outputFiles.filter(({ path }) => !/\.(?:png|jpe?g|webp)$/i.test(path));
  const annotations = notebook.comments.filter((comment) => comment.annotation).slice().reverse();
  const retainedBundleFiles = artifact?.files.filter((file) => ["notebook.ipynb", "sources/paper.pdf", "README.md", "artifact-manifest.json", "provenance.jsonl"].includes(file)) || [];
  const primaryBundleFiles = retainedBundleFiles.filter((file) => file === "notebook.ipynb" || file === "sources/paper.pdf");
  const supportingBundleFiles = retainedBundleFiles.filter((file) => file !== "notebook.ipynb" && file !== "sources/paper.pdf");
  const bundledRunFiles = artifact?.files.filter((file) => file.startsWith("runs/")) || [];

  return (
    <aside className="study-inspector notebook-inspector" aria-label="Notebook collaboration and provenance">
      <div className="notebook-inspector-tabs" role="tablist" tabIndex={-1} aria-label="Notebook details">
        <button id={`${tabId}-tab-artifacts`} type="button" role="tab" aria-controls={`${tabId}-panel-artifacts`} aria-selected="true" tabIndex={0}><PackageOpen size={15} /><span>Artifact</span></button>
      </div>

      <div id={`${tabId}-panel-artifacts`} className="artifact-panel" role="tabpanel" aria-labelledby={`${tabId}-tab-artifacts`}>
          <header className="artifact-panel-summary">
            <div><span>Results</span><small>Verified notebook outputs</small></div>
            <p>{figureOutputs.length} figure{figureOutputs.length === 1 ? "" : "s"} · {downloadableOutputs.length} file{downloadableOutputs.length === 1 ? "" : "s"} · {annotations.length} note{annotations.length === 1 ? "" : "s"}</p>
          </header>
          {outputFiles.length === 0 && !artifact && <div className="artifact-empty"><PackageOpen size={24} /><strong>No generated files yet</strong><p>Figures and downloadable outputs appear here after a cell creates them.</p></div>}
          {figureOutputs.length > 0 && <section className="artifact-output-section">
            <header><h3>Figures</h3><span>{figureOutputs.length}</span></header>
            <div className="artifact-figure-grid">{figureOutputs.map(({ path, runId, cellId, backend }) => <figure key={`${runId}:${path}`}>
              <a href={cellArtifactUrl(notebook.id, runId, path, backend)} target="_blank" rel="noreferrer" aria-label={`Open result figure ${path}`}>
                <img src={cellArtifactUrl(notebook.id, runId, path, backend)} alt={`${cellId} result ${path}`} loading="lazy" />
              </a>
              <figcaption><Image size={12} /><span><strong>{path.split("/").at(-1)}</strong><small>{cellId} · {backend === "modal" ? "Modal" : "local"}</small></span></figcaption>
            </figure>)}</div>
          </section>}
          {downloadableOutputs.length > 0 && <section className="artifact-output-section">
            <header><h3>Data files</h3><span>{downloadableOutputs.length}</span></header>
            <div className="artifact-output-files">{downloadableOutputs.map(({ path, runId, cellId, backend }) => <a key={`${runId}:${path}`} href={cellArtifactUrl(notebook.id, runId, path, backend, true)} download>
              <FileJson2 size={13} /><span><strong>{path.split("/").at(-1)}</strong><small>{cellId} · {backend === "modal" ? "Modal" : "local"}</small></span><Download size={12} />
            </a>)}</div>
          </section>}
          {annotations.length > 0 && <section className="artifact-output-section notebook-annotation-notes">
            <header><h3>Notes</h3><span>{annotations.length}</span></header>
            {annotations.map((comment) => <article key={comment.id}>
              <header><span><Highlighter size={13} /> {comment.annotation?.kind === "figure" ? "Figure" : "Selection"} · {comment.cellId}</span><time>{formatTime(comment.createdAt)}</time></header>
              <p className="annotation-note">{comment.body}</p>
              <details><summary>Selected context</summary><blockquote>{comment.annotation?.excerpt}</blockquote></details>
            </article>)}
          </section>}
          {artifact && <section className="frozen-bundle">
            <header><div><span>Reproducible bundle</span><small>Notebook and pinned source</small></div><time>{formatTime(artifact.createdAt)}</time></header>
            <strong>{artifact.artifactId}</strong>
            <p>{artifact.scope.replaceAll("-", " ")} · {artifact.localRunIds?.length ?? artifact.runIds.length} local · {artifact.remoteRunIds?.length ?? 0} Modal · notebook {shortHash(artifact.notebookHash)}</p>
            <div className="bundle-primary-files">{primaryBundleFiles.map((file) => <a key={file} href={`/api/notebooks/${encodeURIComponent(notebook.id)}/artifacts/${encodeURIComponent(artifact.artifactId)}/files/${file.split("/").map(encodeURIComponent).join("/")}`} download={file.split("/").at(-1)}>{file.endsWith(".ipynb") ? <FileJson2 size={15} /> : <FileText size={15} />}<span><strong>{file.split("/").at(-1)}</strong><small>{file === "notebook.ipynb" ? "Editable notebook" : "Pinned paper"}</small></span><Download size={14} /></a>)}</div>
            {supportingBundleFiles.length > 0 && <details className="frozen-run-files"><summary>Supporting provenance files ({supportingBundleFiles.length})</summary><div>{supportingBundleFiles.map((file) => <a key={file} href={`/api/notebooks/${encodeURIComponent(notebook.id)}/artifacts/${encodeURIComponent(artifact.artifactId)}/files/${file.split("/").map(encodeURIComponent).join("/")}`} download={file.split("/").at(-1)}>{file.endsWith(".json") || file.endsWith(".jsonl") ? <FileJson2 size={13} /> : <FileText size={13} />}<span>{file}</span><Download size={12} /></a>)}</div></details>}
            {bundledRunFiles.length > 0 && <details className="frozen-run-files"><summary>Bundled run evidence ({bundledRunFiles.length})</summary><div>{bundledRunFiles.map((file) => <a key={file} href={`/api/notebooks/${encodeURIComponent(notebook.id)}/artifacts/${encodeURIComponent(artifact.artifactId)}/files/${file.split("/").map(encodeURIComponent).join("/")}`} download={file.split("/").at(-1)}>{file.match(/\.(png|jpe?g|webp)$/i) ? <Image size={13} /> : <FileJson2 size={13} />}<span>{file}</span><Download size={12} /></a>)}</div></details>}
            {(artifact.deviations.length > 0) && <details><summary>Evidence limits</summary>{artifact.deviations.map((deviation) => <p key={deviation}>{deviation}</p>)}</details>}
            <div className="artifact-contract"><ShieldCheck size={15} /><span>Outputs are linked to their code, run manifest, and execution image.</span></div>
          </section>}
      </div>
    </aside>
  );
}
