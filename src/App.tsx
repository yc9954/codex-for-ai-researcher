import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  Cable,
  Check,
  CheckCircle2,
  ChevronRight,
  CircuitBoard,
  Cloud,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  GitBranch,
  HardDrive,
  KeyRound,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Minus,
  MoreHorizontal,
  NotebookTabs,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, lazy, Suspense, useEffect, useRef, useState } from "react";
import ChatComposer from "./ChatComposer";
import type { SkillCommand } from "./ChatComposer";
import ConnectorsView from "./ConnectorsView";
import type { ConnectorConfig } from "./connector-types";
import type { NotebookAnnotation } from "./annotation-types";
import { evidencePassageRange } from "./evidence-citation";
import type { EvidenceCitation } from "./evidence-citation";
import type { RepositoryInspection, StudyInspection, SystemProfile } from "./study-types";
import { notebookIdForStudy } from "./study-notebook";
import { useDialogFocus } from "./use-dialog-focus";

const NotebookStudio = lazy(() => import("./NotebookStudio"));
const RichMarkdown = lazy(() => import("./RichMarkdown"));
const PdfEvidencePage = lazy(() => import("./PdfEvidencePage"));
const DesktopOnboarding = lazy(() => import("./DesktopOnboarding"));

type View = "agent" | "sources" | "datasets" | "notebook" | "runs" | "remote" | "connectors";

const VIEW_LABELS: Record<View, string> = {
  agent: "Study",
  sources: "Source map",
  datasets: "Datasets",
  notebook: "Notebook",
  runs: "Runs",
  remote: "Remote",
  connectors: "Connectors",
};

type AgentActivityKind = "agent" | "skill" | "hook" | "tool" | "thinking" | "answer";

interface AgentActivityEvent {
  id: string;
  kind: AgentActivityKind;
  label: string;
  detail?: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
}

interface AgentActivityState {
  requestId: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  updatedAt: string;
  events: AgentActivityEvent[];
}

interface ThreadMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  annotation?: NotebookAnnotation;
  activity?: AgentActivityState;
}

interface RunSummary {
  runId: string;
  targetCellId: string;
  status: "passed" | "failed";
  imageDigest: string;
  codeHash: string;
  createdAt: string;
  durationMs: number;
  artifacts: string[];
}

interface RemoteRunSummary {
  runId: string;
  source: "modal";
  status: "passed" | "failed";
  createdAt: string;
  startedAt: string;
  durationMs: number;
  gpu: string;
  timeoutSeconds: number;
  maximumGpuCostUsd: number;
  planHash: string;
  notebookHash: string;
  appSha256: string;
  stdout: string;
  stderr: string;
  cells: Array<{ id: string; status: "passed" | "failed"; stdout: string; stderr: string; duration_ms: number }>;
  artifacts: Array<{ path: string; mimeType: string; sizeBytes: number; sha256: string }>;
  executionEnvironment?: { requestedDevice: "cpu" | "cuda" | "mps" | "rocm"; resolvedDevice: string; torchVersion: string | null };
}

interface DatasetPlan {
  schemaVersion: string;
  studyId: string;
  paperSha256: string;
  createdAt: string;
  stale?: boolean;
  migrationNotes?: string[];
  hardware: { freeMemoryBytes: number; freeDiskBytes: number; logicalCores: number; platform: string; arch: string };
  candidates: Array<{
    name: string;
    searchQuery: string;
    role: string;
    split: string;
    preprocessing: string;
    evidence: Array<{ page: number; quote: string }>;
    verification: "registry-name-match" | "not-found";
    hub: null | {
      id: string;
      url: string;
      revision: string | null;
      downloads: number;
      likes: number;
      gated: boolean | string;
      license: string;
      identityScore: number | null;
      identityEvidence: string;
      size: null | { originalBytes: number | null; parquetBytes: number | null; memoryBytes: number | null; rows: number | null };
    };
    fit: { mode: "full" | "subset" | "streaming" | "inspect"; recommendedRows: number | null; rationale: string };
    subsetContract: null | { method: string; offset?: number; seed?: number; rows: number; split: string; registryRevision: string | null };
  }>;
  selection: null | {
    status: "ready";
    hubId: string;
    revision: string;
    config: string;
    split: string;
    mode: "full" | "subset";
    rowCount: number;
    requestedRows: number;
    sizeBytes: number;
    sha256: string;
    localPath: string;
    mountPath: string;
    createdAt: string;
    truncatedCellCount: number;
    limitations: string;
  };
  limitations: string;
}

interface ModalPlan {
  planId: string;
  notebookId: string;
  notebookHash: string;
  requestedGpu: string;
  gpu: string;
  minimumGpuMemoryGiB: number;
  selectionReason: string;
  timeoutSeconds: number;
  gpuRateUsdPerSecond: number;
  maximumGpuCostUsd: number;
  pricingAsOf: string;
  pricingSource: string;
  createdAt: string;
  expiresAt: string;
  appPath: string;
  appSha256: string;
  packages: string[];
  dependencyResolutions: Array<{ package: string; resolved: string; target: "modal-cuda"; decision: "pinned" }>;
  deviceEnvironment: "cuda";
  containerMemoryMiB: number;
  networkPolicy: "blocked";
  artifactPolicy: { maxFiles: number; maxFileBytes: number; maxTotalBytes: number };
  localEvidence: { mode: "verified-run" | "documented-blocker" | "user-selected-remote"; runIds: string[]; blocker: string | null; reason?: string };
  codeCellCount: number;
  status: "planned";
  planHash: string;
}

interface WorkflowEvidence {
  datasetCandidates: number | null;
  datasetMatches: number | null;
  notebookReady: boolean;
  runCount: number;
}

function clientMessageId(): string {
  return globalThis.crypto?.randomUUID?.() || `message-${Date.now()}`;
}

const skillCatalog: SkillCommand[] = [
  { name: "extract-paper-claims", label: "Extract claims", detail: "Maps paper evidence, equations, repository symbols, and uncertainty." },
  { name: "explain-paper-mechanism", label: "Explain mechanisms", detail: "Writes grounded lessons with formulas, code bindings, counterfactuals, and limits." },
  { name: "adapt-reproduction-environment", label: "Adapt environment", detail: "Classifies and tests minimal compatibility changes against pinned manifests." },
  { name: "plan-resource-fit-dataset", label: "Plan datasets", detail: "Matches paper names to live registry candidates, then records license, size, and a deterministic local subset." },
  { name: "author-concept-notebook", label: "Author notebook", detail: "Builds editable prediction, mechanism, verification, and transfer cells." },
  { name: "reproduce-paper-figure", label: "Redraw reported values", detail: "Preserves recoverable multi-series structure and rejects values that cannot be verified exactly in the PDF." },
  { name: "run-isolated-snippets", label: "Run snippets", detail: "Executes ordered cells inside the pinned, network-disabled container." },
  { name: "launch-modal-reproduction", label: "Plan Modal run", detail: "Prepares a cost-bounded GPU app and requires one-time launch approval." },
  { name: "package-research-provenance", label: "Package evidence", detail: "Freezes sources, cell hashes, run manifests, and notebook versions." },
  { name: "orchestrate-paper-demo", label: "Orchestrate study", detail: "Coordinates the complete paper-to-concept-demo workflow." },
];
const PRODUCT_NAME = "Rosetta";

function IconButton({ label, children, onClick, className = "", pressed }: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><img src="/brand-logo.png" alt="" /></span>;
}

function studyTitle(study: StudyInspection | null): string {
  return study?.paper?.title || study?.repository?.fullName || "New study";
}

function formatStudyTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatPlatform(profile: SystemProfile): string {
  const names: Record<string, string> = { darwin: "macOS", linux: "Linux", win32: "Windows" };
  return `${names[profile.platform] || profile.platform} ${profile.arch}`;
}

function formatAccelerator(profile: SystemProfile): string {
  if (profile.accelerators.length === 0) return "No supported accelerator detected";
  return profile.accelerators.map((accelerator) => `${accelerator.name} · ${accelerator.backend.toUpperCase()}`).join(", ");
}

export default function App() {
  const [view, setView] = useState<View>("agent");
  const [study, setStudy] = useState<StudyInspection | null>(null);
  const [studies, setStudies] = useState<StudyInspection[]>([]);
  const [profile, setProfile] = useState<SystemProfile | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [paperExtractionBusy, setPaperExtractionBusy] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [newStudyOpen, setNewStudyOpen] = useState(false);
  const [studyMenuId, setStudyMenuId] = useState<string | null>(null);
  const [deleteStudyTarget, setDeleteStudyTarget] = useState<StudyInspection | null>(null);
  const [deletingStudy, setDeletingStudy] = useState(false);
  const [deleteStudyError, setDeleteStudyError] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState("");
  const [messagesRevision, setMessagesRevision] = useState(0);
  const [messageSendError, setMessageSendError] = useState("");
  const [recordingMessage, setRecordingMessage] = useState(false);
  const [messageActivity, setMessageActivity] = useState<AgentActivityState | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [connectorConfig, setConnectorConfig] = useState<ConnectorConfig | null>(null);
  const [connectorsLoading, setConnectorsLoading] = useState(true);
  const [connectorError, setConnectorError] = useState("");
  const [connectorRevision, setConnectorRevision] = useState(0);
  const [desktopSetupOpen, setDesktopSetupOpen] = useState(() => Boolean(window.rosettaDesktop) && localStorage.getItem("rosetta.desktop-onboarding.v1") !== "complete");
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceCitation | null>(null);
  const [activeAnnotation, setActiveAnnotation] = useState<NotebookAnnotation | null>(null);
  const [artifactPaneOpen, setArtifactPaneOpen] = useState(false);
  const [artifactPaneAvailable, setArtifactPaneAvailable] = useState(false);
  const [studyQuery, setStudyQuery] = useState("");
  const studyChangedByUser = useRef(false);
  const activeStudyIdRef = useRef<string | null>(null);
  const effectiveSelectedAgentId = selectedAgentId && connectorConfig?.agents.some((agent) => agent.id === selectedAgentId && agent.enabled) ? selectedAgentId : null;

  function completeDesktopSetup() {
    localStorage.setItem("rosetta.desktop-onboarding.v1", "complete");
    setDesktopSetupOpen(false);
  }

  useEffect(() => {
    activeStudyIdRef.current = study?.studyId || null;
  }, [study?.studyId]);

  function acceptConnectorConfig(config: ConnectorConfig) {
    setConnectorConfig(config);
    setConnectorError("");
    setSelectedAgentId((current) => current && config.agents.some((agent) => agent.id === current && agent.enabled) ? current : null);
  }

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch("/api/studies/latest").then((response) => {
        if (!response.ok) throw new Error("Could not load the latest study");
        return response.json() as Promise<StudyInspection | null>;
      }),
      fetch("/api/system/profile").then((response) => {
        if (!response.ok) throw new Error("Could not profile this computer");
        return response.json() as Promise<SystemProfile>;
      }),
      fetch("/api/studies").then(async (response) => {
        const body = await response.json() as { studies?: StudyInspection[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load local studies");
        return body.studies || [];
      }),
    ]).then(([latestResult, profileResult, studiesResult]) => {
      if (!active) return;
      const errors: string[] = [];
      if (studiesResult.status === "fulfilled") setStudies(studiesResult.value);
      else errors.push(studiesResult.reason instanceof Error ? studiesResult.reason.message : String(studiesResult.reason));
      if (profileResult.status === "fulfilled") setProfile(profileResult.value);
      else errors.push(profileResult.reason instanceof Error ? profileResult.reason.message : String(profileResult.reason));
      if (!studyChangedByUser.current) {
        if (latestResult.status === "fulfilled") setStudy(latestResult.value);
        else if (studiesResult.status === "fulfilled") setStudy(studiesResult.value[0] || null);
      }
      if (latestResult.status === "rejected") errors.push(latestResult.reason instanceof Error ? latestResult.reason.message : String(latestResult.reason));
      setWorkspaceError([...new Set(errors)].join(" · "));
    }).finally(() => {
      if (active) setWorkspaceLoading(false);
    });
    return () => { active = false; };
  }, [workspaceRevision]);

  useEffect(() => {
    let active = true;
    fetch("/api/connectors").then(async (response) => {
      const body = await response.json() as ConnectorConfig & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load connectors");
      return body;
    }).then((config) => {
      if (active) {
        acceptConnectorConfig(config);
      }
    }).catch((error: unknown) => {
      if (active) setConnectorError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setConnectorsLoading(false);
    });
    return () => { active = false; };
  }, [connectorRevision]);

  useEffect(() => {
    if (!study) return;
    let active = true;
    fetch(`/api/studies/${encodeURIComponent(study.studyId)}/messages`)
      .then(async (response) => {
        const body = await response.json() as { messages?: Array<{ id: string; role: "user" | "agent"; content: string; annotation?: NotebookAnnotation; activity?: AgentActivityState }>; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load study messages");
        return body.messages || [];
      })
      .then((stored) => {
        if (active) setMessages(stored.map((message) => ({ id: message.id, role: message.role, content: message.content, annotation: message.annotation, activity: message.activity })));
      })
      .catch((error: unknown) => {
        if (active) setMessagesError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setMessagesLoading(false);
      });
    return () => { active = false; };
  }, [messagesRevision, study]);

  function selectView(nextView: View) {
    setView(nextView);
    setMobileSidebarOpen(false);
    setStudyMenuId(null);
  }

  function returnToStudy() {
    selectView("agent");
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-study-home-heading]")?.focus());
  }

  function retryWorkspace() {
    setWorkspaceError("");
    if (!study) setWorkspaceLoading(true);
    setWorkspaceRevision((current) => current + 1);
  }

  function retryMessages() {
    setMessagesError("");
    setMessagesLoading(true);
    setMessageActivity(null);
    setMessageSendError("");
    setMessagesRevision((current) => current + 1);
  }

  async function retryPaperExtraction(): Promise<void> {
    if (!study || paperExtractionBusy) return;
    const studyId = study.studyId;
    setPaperExtractionBusy(true);
    setWorkspaceError("");
    try {
      const response = await fetch(`/api/studies/${encodeURIComponent(studyId)}/paper/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json() as StudyInspection & { error?: string };
      if (!response.ok || !body.studyId) throw new Error(body.error || "Paper text could not be extracted");
      if (activeStudyIdRef.current !== studyId) return;
      setStudy(body);
      setStudies((current) => [body, ...current.filter((candidate) => candidate.studyId !== studyId)]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (activeStudyIdRef.current === studyId) setWorkspaceError(detail);
    } finally {
      setPaperExtractionBusy(false);
    }
  }

  function retryConnectors() {
    setConnectorError("");
    setConnectorsLoading(true);
    setConnectorRevision((current) => current + 1);
  }

  function selectStudy(nextStudy: StudyInspection) {
    studyChangedByUser.current = true;
    activeStudyIdRef.current = nextStudy.studyId;
    setStudy(nextStudy);
    setMessages([]);
    setMessagesError("");
    setMessagesLoading(true);
    setDraft("");
    setEvidenceTarget(null);
    setActiveAnnotation(null);
    setArtifactPaneOpen(false);
    setArtifactPaneAvailable(false);
    selectView("agent");
  }

  function openEvidence(citation: EvidenceCitation) {
    setEvidenceTarget(citation);
    selectView("sources");
  }

  function openSources() {
    setEvidenceTarget(null);
    selectView("sources");
  }

  function sendNotebookAnnotation(annotation: NotebookAnnotation) {
    setActiveAnnotation(annotation);
    setArtifactPaneOpen(true);
    setArtifactPaneAvailable(true);
    setInspectorOpen(false);
    setDraft(annotation.note);
    selectView("agent");
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !study || recordingMessage || messagesLoading) return;
    const submittedStudyId = study.studyId;
    const annotation = activeAnnotation || undefined;
    const optimisticId = clientMessageId();
    setMessageSendError("");
    setMessages((current) => [...current, { id: optimisticId, role: "user", content, annotation }]);
    setDraft("");
    setRecordingMessage(true);
    let activityTimer: number | undefined;
    try {
      const agentReady = Boolean(profile?.codexAgent.ready);
      const activityId = `activity-${clientMessageId()}`;
      if (agentReady) {
        const now = new Date().toISOString();
        setMessageActivity({
          requestId: activityId,
          status: "running",
          startedAt: now,
          updatedAt: now,
          events: [{ id: `event-${clientMessageId()}`, kind: "agent", label: "Starting automatic research routing", status: "running", createdAt: now }],
        });
        const refreshActivity = async () => {
          try {
            const activityResponse = await fetch(`/api/studies/${encodeURIComponent(submittedStudyId)}/agent/activity/${encodeURIComponent(activityId)}`);
            if (!activityResponse.ok) return;
            const activity = await activityResponse.json() as AgentActivityState;
            if (activeStudyIdRef.current === submittedStudyId) setMessageActivity(activity);
          } catch {
            // The response request remains authoritative when transient activity polling fails.
          }
        };
        activityTimer = window.setInterval(() => void refreshActivity(), 400);
        void refreshActivity();
      }
      const response = await fetch(`/api/studies/${encodeURIComponent(submittedStudyId)}/${agentReady ? "agent/respond" : "messages"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentReady ? { content, connectorAgentId: effectiveSelectedAgentId, annotation, activityId } : { content, annotation }),
      });
      const body = await response.json() as { error?: string; recordedAt?: string; message?: { id: string; content: string; activity?: AgentActivityState }; activity?: AgentActivityState; version?: string };
      if (!response.ok) throw new Error(body.error || "Message could not be recorded");
      if (activeStudyIdRef.current !== submittedStudyId) return;
      setActiveAnnotation(null);
      setMessages((current) => [...current, agentReady && body.message ? {
        id: body.message.id,
        role: "agent",
        content: body.message.content,
        activity: body.message.activity || body.activity,
      } : {
        id: clientMessageId(),
        role: "agent",
        content: `Recorded in ${submittedStudyId} provenance at ${new Date(body.recordedAt || Date.now()).toLocaleTimeString()}. No code analysis or execution was claimed.`,
      }]);
    } catch (error) {
      if (activeStudyIdRef.current !== submittedStudyId) return;
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setDraft((current) => current.trim() ? current : content);
      setMessageSendError(error instanceof Error ? error.message : String(error));
    } finally {
      if (activityTimer !== undefined) window.clearInterval(activityTimer);
      if (activeStudyIdRef.current === submittedStudyId) setMessageActivity(null);
      setRecordingMessage(false);
    }
  }

  async function deleteSelectedStudy() {
    if (!deleteStudyTarget || deletingStudy || (recordingMessage && deleteStudyTarget.studyId === study?.studyId)) return;
    const targetId = deleteStudyTarget.studyId;
    const deletingCurrent = targetId === study?.studyId;
    setDeletingStudy(true);
    setDeleteStudyError("");
    try {
      const response = await fetch(`/api/studies/${encodeURIComponent(targetId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json() as { latestStudy?: StudyInspection | null; error?: string };
      if (!response.ok) throw new Error(body.error || "Study could not be deleted");
      setStudies((current) => current.filter((candidate) => candidate.studyId !== targetId));
      if (deletingCurrent) {
        studyChangedByUser.current = true;
        activeStudyIdRef.current = body.latestStudy?.studyId || null;
        setStudy(body.latestStudy || null);
        setMessages([]);
        setMessagesError("");
        setMessagesLoading(Boolean(body.latestStudy));
        setMessageSendError("");
        setDraft("");
        setActiveAnnotation(null);
        setArtifactPaneOpen(false);
        setArtifactPaneAvailable(false);
        setEvidenceTarget(null);
        setView("agent");
      }
      setDeleteStudyTarget(null);
      setStudyMenuId(null);
    } catch (error) {
      setDeleteStudyError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingStudy(false);
    }
  }

  const notebookAvailable = Boolean(study);
  const chatCommands: SkillCommand[] = [
    ...skillCatalog,
    ...(connectorConfig?.skills.filter((skill) => skill.enabled).map((skill) => ({ name: skill.command, label: skill.name, detail: skill.description })) || []),
  ];
  const selectableAgents = connectorConfig?.agents.filter((agent) => agent.enabled).map((agent) => ({ id: agent.id, name: agent.name, detail: agent.description })) || [];
  const normalizedStudyQuery = studyQuery.trim().toLocaleLowerCase();
  const visibleStudies = normalizedStudyQuery ? studies.filter((candidate) => [studyTitle(candidate), candidate.repository?.fullName, candidate.paper?.identifier].filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(normalizedStudyQuery))) : studies;

  useEffect(() => {
    if (!studyMenuId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStudyMenuId(null);
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".project-row-more, .project-context-menu")) setStudyMenuId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [studyMenuId]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileSidebarOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileSidebarOpen]);

  return (
    <div className="workbench-shell">
      <aside className={`workbench-sidebar ${sidebarCollapsed ? "is-collapsed" : ""} ${mobileSidebarOpen ? "is-mobile-open" : ""}`} aria-label="Research navigation">
        <div className="sidebar-header">
          <button className="product-brand" type="button" onClick={() => selectView("agent")} aria-label={`${PRODUCT_NAME} home`}>
            <BrandMark />
            {!sidebarCollapsed && <strong>{PRODUCT_NAME}</strong>}
          </button>
          {!sidebarCollapsed && <IconButton label="Collapse sidebar" onClick={() => setSidebarCollapsed(true)} className="desktop-only"><PanelLeftClose size={18} /></IconButton>}
          {sidebarCollapsed && <IconButton label="Expand sidebar" onClick={() => setSidebarCollapsed(false)} className="desktop-only"><PanelLeftOpen size={18} /></IconButton>}
          <IconButton label="Close navigation" onClick={() => setMobileSidebarOpen(false)} className="mobile-close"><X size={19} /></IconButton>
        </div>

        <div className="sidebar-actions">
          <button type="button" className="new-study-button" onClick={() => setNewStudyOpen(true)}><Plus size={17} />{!sidebarCollapsed && <span>New study</span>}</button>
        </div>

        <nav className="workspace-nav" aria-label="Workspace">
          <NavItem label="Study" icon={MessageSquareText} active={view === "agent"} collapsed={sidebarCollapsed} onClick={() => selectView("agent")} />
          <NavItem label="Source map" icon={GitBranch} active={view === "sources"} collapsed={sidebarCollapsed} onClick={openSources} />
          <NavItem label="Datasets" icon={Database} active={view === "datasets"} collapsed={sidebarCollapsed} onClick={() => selectView("datasets")} />
          <NavItem label="Notebook" icon={NotebookTabs} active={view === "notebook"} collapsed={sidebarCollapsed} onClick={() => selectView("notebook")} />
          <NavItem label="Runs" icon={Terminal} active={view === "runs"} collapsed={sidebarCollapsed} onClick={() => selectView("runs")} />
          <NavItem label="Remote" icon={Cloud} active={view === "remote"} collapsed={sidebarCollapsed} onClick={() => selectView("remote")} />
        </nav>

        {!sidebarCollapsed && studies.length > 0 && (
          <section className="project-list" aria-label="Local studies">
            <div className="sidebar-label"><span>Local studies</span><small>{visibleStudies.length === studies.length ? studies.length : `${visibleStudies.length}/${studies.length}`}</small></div>
            <label className="study-filter"><Search size={14} /><input aria-label="Filter local studies" type="search" value={studyQuery} onChange={(event) => setStudyQuery(event.target.value)} placeholder="Filter studies" /></label>
            {visibleStudies.map((candidate) => {
              const title = studyTitle(candidate);
              const createdLabel = new Date(candidate.createdAt).toLocaleString();
              const menuLabel = `Open menu for ${title}, created ${createdLabel}`;
              return <div className={`project-row-shell ${candidate.studyId === study?.studyId ? "is-active" : ""}`} data-study-id={candidate.studyId} key={candidate.studyId}>
                <button type="button" className="project-row" onClick={() => selectStudy(candidate)} title={`${title}\nCreated ${createdLabel}`} aria-label={`${title}, created ${createdLabel}`}>
                  <span className="project-status status-ready" />
                  <span className="project-row-copy"><span>{title}</span><time dateTime={candidate.createdAt}>{formatStudyTime(candidate.createdAt)}</time></span>
                </button>
                <button type="button" className="project-row-more" aria-label={menuLabel} aria-haspopup="menu" aria-expanded={studyMenuId === candidate.studyId} onClick={() => setStudyMenuId((current) => current === candidate.studyId ? null : candidate.studyId)}><MoreHorizontal size={16} /></button>
                {studyMenuId === candidate.studyId && <div className="project-context-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setDeleteStudyError(""); setDeleteStudyTarget(candidate); setStudyMenuId(null); }}><Trash2 size={14} /><span>Delete conversation</span></button></div>}
              </div>;
            })}
            {visibleStudies.length === 0 && <div className="study-filter-empty">No matching studies</div>}
          </section>
        )}

        <div className="sidebar-bottom">
          <NavItem label="Connectors" icon={Cable} active={view === "connectors"} collapsed={sidebarCollapsed} onClick={() => selectView("connectors")} />
          {window.rosettaDesktop && <NavItem label="Setup" icon={Settings2} collapsed={sidebarCollapsed} onClick={() => setDesktopSetupOpen(true)} />}
          {!sidebarCollapsed && (
            <div className="orchestrator-status">
              <Server size={16} />
              <span><strong>Local workspace</strong><small><i className={profile?.dockerReady ? "is-ready" : ""} />{profile?.dockerReady ? "Docker connected" : "Source intake ready"}</small></span>
            </div>
          )}
        </div>
      </aside>

      {mobileSidebarOpen && <button className="mobile-scrim" type="button" aria-label="Dismiss navigation overlay" onClick={() => setMobileSidebarOpen(false)} />}

      <main className="workbench-main">
        <header className="workbench-topbar">
          <IconButton label="Open navigation" onClick={() => setMobileSidebarOpen(true)} className="mobile-menu"><Menu size={20} /></IconButton>
          {view !== "agent" && study && <IconButton label="Back to study" onClick={returnToStudy} className="topbar-back"><ArrowLeft size={19} /></IconButton>}
          <div className="project-heading"><span>{view === "connectors" ? "Workspace" : "Study"}</span><ChevronRight size={14} /><strong>{view === "agent" ? studyTitle(study) : VIEW_LABELS[view]}</strong></div>
          <div className="topbar-actions">
            <span className="save-state">{view === "connectors" ? <><Check size={14} /> Local</> : study ? <><Check size={14} /> Pinned</> : "No source"}</span>
            {view !== "connectors" && <IconButton
              label={view === "agent" && artifactPaneAvailable ? (artifactPaneOpen ? "Close notebook artifact" : "Open notebook artifact") : (inspectorOpen ? "Close study details" : "Open study details")}
              onClick={() => view === "agent" && artifactPaneAvailable ? setArtifactPaneOpen((current) => !current) : setInspectorOpen((current) => !current)}
            >
              {(view === "agent" && artifactPaneAvailable ? artifactPaneOpen : inspectorOpen) ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}
            </IconButton>}
          </div>
        </header>

        {workspaceError && study && <div className="workspace-load-warning" role="alert">
          <AlertCircle size={15} />
          <span>{workspaceError}. Available local data remains usable.</span>
          <button type="button" onClick={retryWorkspace}><RefreshCw size={14} /> Retry</button>
        </div>}

        <div className="workbench-body">
          {view === "notebook" && study ? <Suspense fallback={<section className="primary-workspace notebook-workspace"><div className="study-empty-state"><LoaderCircle className="spin" size={22} /><strong>Loading notebook workspace</strong></div></section>}><NotebookStudio key={study.studyId} inspectorOpen={inspectorOpen} study={study} onOpenEvidence={openEvidence} onSendAnnotation={sendNotebookAnnotation} autoGenerate={Boolean(profile?.codexAgent.ready)} /></Suspense> : (
            <>
              <section className="primary-workspace">
                {view === "agent" && <AgentView key={study?.studyId || "empty-study"} study={study} profile={profile} loading={workspaceLoading} error={workspaceError} messages={messages} messagesLoading={messagesLoading} messagesError={messagesError} messageSendError={messageSendError} onRetryMessages={retryMessages} onDismissSendError={() => setMessageSendError("")} recording={recordingMessage} activity={messageActivity} draft={draft} setDraft={setDraft} sendMessage={sendMessage} skills={chatCommands} agents={selectableAgents} selectedAgentId={effectiveSelectedAgentId} onAgentChange={setSelectedAgentId} onNewStudy={() => setNewStudyOpen(true)} onRetry={retryWorkspace} onRetryPaperExtraction={retryPaperExtraction} paperExtractionBusy={paperExtractionBusy} onOpenSources={openSources} onOpenEvidence={openEvidence} onNavigate={selectView} annotation={activeAnnotation} onClearAnnotation={() => setActiveAnnotation(null)} />}
                {view === "sources" && <SourcesView study={study} evidenceTarget={evidenceTarget} onNewStudy={() => setNewStudyOpen(true)} onRetryPaperExtraction={retryPaperExtraction} paperExtractionBusy={paperExtractionBusy} />}
                {view === "datasets" && <DatasetView key={study?.studyId || "empty-datasets"} study={study} profile={profile} onNewStudy={() => setNewStudyOpen(true)} onOpenEvidence={openEvidence} onRetryPaperExtraction={retryPaperExtraction} paperExtractionBusy={paperExtractionBusy} />}
                {view === "notebook" && <UnavailableView title="No source notebook" detail="A pinned source is required before an executable evidence notebook can be generated." action="Open source intake" onAction={() => setNewStudyOpen(true)} />}
                {view === "runs" && <ExecutionView key={study?.studyId || "empty-runs"} study={study} profile={profile} notebookAvailable={notebookAvailable} onOpenNotebook={() => selectView("notebook")} />}
                {view === "remote" && <RemoteView key={study?.studyId || "empty-remote"} study={study} onNewStudy={() => setNewStudyOpen(true)} onOpenNotebook={() => selectView("notebook")} onOpenRuns={() => selectView("runs")} />}
                {view === "connectors" && <ConnectorsView config={connectorConfig} loading={connectorsLoading} loadError={connectorError} skills={skillCatalog} modelRouting={profile?.codexAgent.modelRouting} onRetry={retryConnectors} onConfigChange={acceptConnectorConfig} onUse={(name) => { setDraft(`/${name} Use this command on the current study and show the required evidence.`); selectView("agent"); }} />}
              </section>
              {view === "agent" && artifactPaneOpen && artifactPaneAvailable && study ? <aside className="artifact-side-pane" aria-label="Referenced notebook artifact"><Suspense fallback={<div className="study-empty-state"><LoaderCircle className="spin" size={20} /><strong>Loading notebook artifact</strong></div>}><NotebookStudio key={`${study.studyId}-artifact`} embedded inspectorOpen={false} study={study} onOpenEvidence={openEvidence} onSendAnnotation={sendNotebookAnnotation} onOpenFull={() => selectView("notebook")} onClose={() => setArtifactPaneOpen(false)} /></Suspense></aside> : inspectorOpen && view !== "connectors" && <Inspector study={study} profile={profile} />}
            </>
          )}
        </div>
      </main>

      {newStudyOpen && <NewStudyDialog onClose={() => setNewStudyOpen(false)} onComplete={(result) => {
        studyChangedByUser.current = true;
        activeStudyIdRef.current = result.studyId;
        setStudy(result);
        setStudies((current) => [result, ...current.filter((candidate) => candidate.studyId !== result.studyId)]);
        setMessages([]);
        setMessagesError("");
        setMessagesLoading(true);
        setMessageSendError("");
        setActiveAnnotation(null);
        setArtifactPaneOpen(false);
        setArtifactPaneAvailable(false);
        setNewStudyOpen(false);
        selectView("agent");
      }} />}
      {deleteStudyTarget && <DeleteStudyDialog study={deleteStudyTarget} busy={deletingStudy} error={deleteStudyError} onClose={() => { if (!deletingStudy) { setDeleteStudyTarget(null); setDeleteStudyError(""); } }} onDelete={() => void deleteSelectedStudy()} />}
      {desktopSetupOpen && <Suspense fallback={null}><DesktopOnboarding profile={profile} onProfileChange={setProfile} onClose={completeDesktopSetup} onOpenRemote={() => { setDesktopSetupOpen(false); selectView("remote"); }} /></Suspense>}
    </div>
  );
}

function NavItem({ label, icon: Icon, active = false, collapsed = false, onClick }: {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active?: boolean;
  collapsed?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`workspace-nav-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick} title={collapsed ? label : undefined}>
      <Icon size={18} strokeWidth={1.8} />{!collapsed && <span>{label}</span>}
    </button>
  );
}

function AgentView({ study, profile, loading, error, messages, messagesLoading, messagesError, messageSendError, onRetryMessages, onDismissSendError, recording, activity, draft, setDraft, sendMessage, skills, agents, selectedAgentId, onAgentChange, onNewStudy, onRetry, onRetryPaperExtraction, paperExtractionBusy, onOpenSources, onOpenEvidence, onNavigate, annotation, onClearAnnotation }: {
  study: StudyInspection | null;
  profile: SystemProfile | null;
  loading: boolean;
  error: string;
  messages: ThreadMessage[];
  messagesLoading: boolean;
  messagesError: string;
  messageSendError: string;
  onRetryMessages: () => void;
  onDismissSendError: () => void;
  recording: boolean;
  activity: AgentActivityState | null;
  draft: string;
  setDraft: (value: string) => void;
  sendMessage: (event: FormEvent) => void;
  skills: SkillCommand[];
  agents: Array<{ id: string; name: string; detail: string }>;
  selectedAgentId: string | null;
  onAgentChange: (id: string | null) => void;
  onNewStudy: () => void;
  onRetry: () => void;
  onRetryPaperExtraction: () => Promise<void>;
  paperExtractionBusy: boolean;
  onOpenSources: () => void;
  onOpenEvidence: (citation: EvidenceCitation) => void;
  onNavigate: (view: View) => void;
  annotation: NotebookAnnotation | null;
  onClearAnnotation: () => void;
}) {
  const [workflowEvidence, setWorkflowEvidence] = useState<WorkflowEvidence | null>(null);
  const [workflowError, setWorkflowError] = useState("");
  const [workflowRevision, setWorkflowRevision] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatThreadRef = useRef<HTMLDivElement>(null);
  const stickToLatestRef = useRef(messages.length > 0);
  const previousMessageCountRef = useRef(messages.length);

  useEffect(() => {
    const scroller = chatScrollRef.current;
    const messageAdded = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    if (!scroller || (!messageAdded && !recording)) return;

    stickToLatestRef.current = true;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    let settledFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior });
      settledFrame = window.requestAnimationFrame(() => {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (settledFrame) window.cancelAnimationFrame(settledFrame);
    };
  }, [messages.length, recording]);

  useEffect(() => {
    const scroller = chatScrollRef.current;
    const thread = chatThreadRef.current;
    if (!scroller || !thread || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToLatestRef.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [study?.studyId]);

  useEffect(() => {
    if (!study) return;
    let active = true;
    const notebookId = notebookIdForStudy(study);
    Promise.allSettled([
      fetch(`/api/studies/${encodeURIComponent(study.studyId)}/datasets`).then(async (response) => {
        if (!response.ok) throw new Error("Dataset evidence could not be loaded");
        return response.json() as Promise<DatasetPlan | null>;
      }),
      fetch(`/api/notebooks/${encodeURIComponent(notebookId)}?optional=1`).then(async (response) => {
        if (!response.ok) throw new Error("Notebook evidence could not be loaded");
        return response.json() as Promise<{ notebook?: { provenance?: Array<{ type?: string }> } } | null>;
      }),
      fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/runs`).then(async (response) => {
        if (!response.ok) throw new Error("Run evidence could not be loaded");
        return response.json() as Promise<{ runs?: RunSummary[] }>;
      }),
    ]).then(([datasetResult, notebookResult, runResult]) => {
      if (!active) return;
      const datasetPlan = datasetResult.status === "fulfilled" ? datasetResult.value : null;
      const notebookRecord = notebookResult.status === "fulfilled" ? notebookResult.value : null;
      const runRecord = runResult.status === "fulfilled" ? runResult.value : null;
      setWorkflowEvidence({
        datasetCandidates: datasetPlan ? datasetPlan.candidates.length : null,
        datasetMatches: datasetPlan ? datasetPlan.candidates.filter((candidate) => candidate.hub).length : null,
        notebookReady: Boolean(notebookRecord?.notebook?.provenance?.some((event) => event.type === "notebook.generated")),
        runCount: runRecord?.runs?.length || 0,
      });
      const failures = [datasetResult, notebookResult, runResult]
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
      setWorkflowError([...new Set(failures)].join(" · "));
    });
    return () => { active = false; };
  }, [study, workflowRevision]);

  function retryWorkflowEvidence() {
    setWorkflowError("");
    setWorkflowRevision((current) => current + 1);
  }

  if (loading) return <div className="study-empty-state"><LoaderCircle className="spin" size={22} /><strong>Loading local workspace</strong></div>;
  if (!study) return (
    <div className="chat-view">
      <div className="study-empty-state">
        {error ? <AlertCircle size={22} /> : <FileText size={22} />}
        <h1>{error || "Decode a paper by running it"}</h1>
        <p>Pin a paper and its repository, then learn each idea through evidence-linked experiments adapted to this computer.</p>
        <div className="empty-state-actions">
          {error && <button type="button" className="quiet-button" onClick={onRetry}><RefreshCw size={15} /> Retry loading</button>}
          <button type="button" className="primary-command" onClick={onNewStudy}><Plus size={15} /> New study</button>
        </div>
      </div>
    </div>
  );

  const repositoryManifestCount = study.repository?.dependencyManifests?.length || 0;
  const compatibility = study.repository?.compatibility;
  const notebookReady = Boolean(workflowEvidence?.notebookReady);
  const runCount = workflowEvidence?.runCount || 0;
  const buildDetail = notebookReady
    ? "An executable learning notebook is available"
    : !study.paperDocument
      ? "Recover the paper PDF before generating a learning demo"
      : !profile?.codexAgent.ready
        ? "A signed-in local Codex agent is required to generate the demo"
        : "Create a minimal PDF-grounded mechanism demo and smoke-test its code";
  const workflow: Array<{
    label: string;
    detail: string;
    state: "done" | "skipped" | "available" | "current" | "next";
    action?: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean; busy?: boolean };
  }> = [
    study.paperDocument ? {
      label: "Inspect",
      detail: "Remote metadata and full-text evidence are locally pinned",
      state: "done",
    } : {
      label: "Inspect",
      detail: "Paper metadata is pinned, but its local PDF text must be recovered before the next stages can run",
      state: "current",
      action: { label: paperExtractionBusy ? "Recovering" : "Recover", onClick: () => void onRetryPaperExtraction(), disabled: paperExtractionBusy, primary: true, busy: paperExtractionBusy },
    },
    study.repository ? {
      label: "Adapt",
      detail: compatibility?.status === "blocked"
        ? "Code-level compatibility is blocked because the pinned source snapshot is incomplete"
        : compatibility
          ? `${compatibility.sourceFileCount} source files and ${compatibility.symbolCount} symbols analyzed; no patch has been applied`
          : repositoryManifestCount > 0
            ? `${repositoryManifestCount} manifests pinned; code compatibility has not been analyzed`
            : "Repository metadata is pinned; code compatibility has not been analyzed",
      state: compatibility?.status === "blocked" ? "current" : "available",
      action: { label: "Review", onClick: () => onNavigate("sources") },
    } : {
      label: "Adapt",
      detail: "Skipped because no repository was attached",
      state: "skipped",
    },
    workflowEvidence?.datasetCandidates != null ? {
      label: "Dataset",
      detail: `${workflowEvidence.datasetCandidates} paper mention${workflowEvidence.datasetCandidates === 1 ? "" : "s"}; ${workflowEvidence.datasetMatches || 0} live registry name match${workflowEvidence.datasetMatches === 1 ? "" : "es"}`,
      state: (workflowEvidence.datasetMatches || 0) > 0 ? "done" : "current",
      action: { label: "Review", onClick: () => onNavigate("datasets") },
    } : {
      label: "Dataset",
      detail: "Optional: match paper datasets to this computer",
      state: "available",
      action: { label: "Plan", onClick: () => onNavigate("datasets") },
    },
    notebookReady ? {
      label: "Build",
      detail: buildDetail,
      state: "done",
      action: { label: "Open", onClick: () => onNavigate("notebook") },
    } : {
      label: "Build",
      detail: buildDetail,
      state: "current",
      action: { label: "Open builder", onClick: () => onNavigate("notebook"), primary: true },
    },
    notebookReady && runCount > 0 ? {
      label: "Run",
      detail: `${runCount} isolated execution manifest${runCount === 1 ? "" : "s"} retained`,
      state: "done",
      action: { label: "Review", onClick: () => onNavigate("runs") },
    } : {
      label: "Run",
      detail: notebookReady ? "Run a notebook cell to retain execution evidence" : runCount > 0 ? `${runCount} source-audit run${runCount === 1 ? "" : "s"} retained; build the mechanism demo next` : "Available after the learning notebook is built",
      state: notebookReady ? "current" : "next",
      action: notebookReady ? { label: "Open", onClick: () => onNavigate("notebook"), primary: true } : undefined,
    },
  ];

  return (
    <div className="chat-view">
      <div
        className="chat-scroll"
        ref={chatScrollRef}
        onScroll={(event) => {
          const scroller = event.currentTarget;
          stickToLatestRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 80;
        }}
      >
        <div className="chat-thread" aria-label="Study conversation" ref={chatThreadRef}>
          <header className="chat-study-header"><span>Active study</span><h1 data-study-home-heading tabIndex={-1}>{studyTitle(study)}</h1></header>
          <article className="chat-message is-assistant">
            <div className="chat-message-body">
              <p>Source inspection is complete. Build a minimal learning demo next; dataset matching is optional. {study.repository ? "Repository dependency evidence is ready for compatibility analysis." : "Repository adaptation is skipped because no repository was attached."}</p>
              <SourceLinks study={study} />
              <section className="chat-tool-block" aria-labelledby="workflow-title">
                <header><div><span>Evidence state</span><h2 id="workflow-title">Research workflow</h2></div><button type="button" className="quiet-button" onClick={onOpenSources}>Source map <ChevronRight size={14} /></button></header>
                <div className="workflow-list">
                  {workflow.map((step, index) => (
                    <div className={`workflow-row state-${step.state}`} key={step.label}>
                      <span className="workflow-index">{step.state === "done" ? <Check size={14} /> : step.state === "skipped" ? <Minus size={14} /> : index + 1}</span>
                      <span><strong>{step.label}</strong><small>{step.detail}</small></span>
                      {step.action && <button type="button" className={`workflow-action ${step.action.primary ? "is-primary" : ""}`} onClick={step.action.onClick} disabled={step.action.disabled}>{step.action.busy ? <LoaderCircle className="spin" size={13} /> : null}{step.action.label}<ChevronRight size={13} /></button>}
                    </div>
                  ))}
                </div>
                {workflowError && <div className="source-warning workflow-warning" role="alert"><AlertCircle size={15} /><span>{workflowError}. Available workflow evidence remains visible.</span><button type="button" onClick={retryWorkflowEvidence}><RefreshCw size={14} /> Retry</button></div>}
              </section>
            </div>
          </article>
          {messagesLoading && messages.length === 0 && <div className="chat-history-state" role="status"><LoaderCircle className="spin" size={15} /> Loading conversation history</div>}
          {messagesError && <div className="chat-history-state is-error" role="alert"><AlertCircle size={15} /><span>{messagesError}. No stored message was replaced.</span><button type="button" onClick={onRetryMessages}><RefreshCw size={14} /> Retry</button></div>}
          {messages.map((message) => <article className={`chat-message is-${message.role === "agent" ? "assistant" : "user"}`} key={message.id}><div className="chat-message-body"><strong>{message.role === "agent" ? "Workspace" : "You"}</strong>{message.annotation && <AnnotationContext annotation={message.annotation} compact />}{message.role === "agent" && message.activity && <AgentActivity activity={message.activity} />}{message.role === "agent" ? <Suspense fallback={<p>{message.content}</p>}><RichMarkdown source={message.content} onOpenEvidence={onOpenEvidence} /></Suspense> : <p>{message.content}</p>}</div></article>)}
          {recording && (activity ? <AgentActivity activity={activity} live /> : <div className="chat-thinking"><MoreHorizontal size={16} /> {profile?.codexAgent.ready ? "Preparing the research agent" : "Recording provenance"}</div>)}
        </div>
      </div>
      <div className="chat-composer-dock">
        {annotation && <AnnotationContext annotation={annotation} onClear={onClearAnnotation} />}
        {messageSendError && <div className="composer-send-error" role="alert"><AlertCircle size={14} /><span>{messageSendError}. The unsent draft was restored.</span><button type="button" onClick={onDismissSendError}>Dismiss</button></div>}
        <ChatComposer draft={draft} busy={recording || messagesLoading} skills={skills} agents={agents} selectedAgentId={selectedAgentId} onAgentChange={onAgentChange} onDraftChange={setDraft} onAttach={onNewStudy} onSubmit={sendMessage} />
        <small>{profile?.codexAgent.ready ? `Local Codex · GPT-5.6 auto-routing · ${profile.codexAgent.authMode === "chatgpt" ? "ChatGPT sign-in" : "API key"}` : "Messages are recorded locally; run codex login to enable grounded responses."}</small>
      </div>
    </div>
  );
}

function AgentActivity({ activity, live = false }: { activity: AgentActivityState; live?: boolean }) {
  const events = activity.events.map((event) => <div className={`agent-activity-event is-${event.status}`} data-kind={event.kind} key={event.id}>
    <span className="agent-activity-icon" aria-hidden="true">{event.kind === "agent" ? <Cpu size={15} /> : event.kind === "skill" ? <FileCode2 size={15} /> : event.kind === "hook" ? <Cable size={15} /> : event.kind === "tool" ? <Terminal size={15} /> : event.kind === "answer" ? <MessageSquareText size={15} /> : <MoreHorizontal size={15} />}</span>
    <span className="agent-activity-copy"><strong>{event.label}<span className="agent-activity-result" aria-label={event.status}>{event.status === "completed" ? <Check size={13} /> : event.status === "failed" ? <AlertCircle size={13} /> : <MoreHorizontal size={15} />}</span></strong>{event.detail && <small>{event.detail}</small>}</span>
  </div>);

  if (activity.status === "completed" && !live) {
    return (
      <section className="agent-activity is-completed" aria-label="Agent activity">
        <details>
          <summary className="agent-activity-summary">
            <span className="agent-activity-summary-status" aria-hidden="true"><Check size={14} /></span>
            <span><strong>Research activity completed</strong><small>{activity.events.length} steps · evidence trace saved</small></span>
            <ChevronRight className="agent-activity-summary-chevron" size={15} aria-hidden="true" />
          </summary>
          <div className="agent-activity-events">{events}</div>
        </details>
      </section>
    );
  }

  return (
    <section className={`agent-activity is-${activity.status}`} aria-label="Agent activity" aria-live={live ? "polite" : undefined} role={live ? "status" : undefined}>
      {events}
    </section>
  );
}

function AnnotationContext({ annotation, compact = false, onClear }: { annotation: NotebookAnnotation; compact?: boolean; onClear?: () => void }) {
  const figureUrl = annotation.kind === "figure" && annotation.runId && annotation.artifactPath
    ? annotation.runBackend === "modal"
      ? `/api/notebooks/${encodeURIComponent(annotation.notebookId)}/modal/runs/${encodeURIComponent(annotation.runId)}/artifacts/${annotation.artifactPath.split("/").map(encodeURIComponent).join("/")}`
      : `/api/runs/${encodeURIComponent(annotation.runId)}/artifacts/${annotation.artifactPath.split("/").map(encodeURIComponent).join("/")}`
    : null;
  return (
    <section className={`chat-annotation-context ${compact ? "is-compact" : ""}`} aria-label={`Attached ${annotation.kind} annotation from ${annotation.cellId}`}>
      <header><span><MessageSquareText size={14} /> {annotation.kind === "figure" ? "Figure" : "Selection"} · {annotation.cellId}</span>{onClear && <button type="button" aria-label="Remove annotation" title="Remove annotation" onClick={onClear}><X size={14} /></button>}</header>
      {figureUrl && <img src={figureUrl} alt={`Annotated output from ${annotation.cellId}`} />}
      <blockquote>{annotation.excerpt}</blockquote>
      {annotation.artifactPath && <code>{annotation.artifactPath}</code>}
    </section>
  );
}

function SourceLinks({ study }: { study: StudyInspection }) {
  return (
    <div className="chat-source-row">
      {study.paper && <a href={study.paper.url} target="_blank" rel="noreferrer"><FileText size={15} /> {study.paper.source}{study.paper.identifier ? ` · ${study.paper.identifier}` : ""} <ExternalLink size={13} /></a>}
      {study.repository && <a href={study.repository.url} target="_blank" rel="noreferrer"><GitBranch size={15} /> {study.repository.fullName} <ExternalLink size={13} /></a>}
    </div>
  );
}

interface PaperPageEvidence {
  page: number;
  totalPages: number;
  text: string;
  sourceUrl: string;
  paperSha256: string;
}

function pdfPageUrl(sourceUrl: string, page: number): string | null {
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  const url = new URL(sourceUrl);
  url.hash = `page=${page}`;
  return url.toString();
}

type RepositorySourceFile = NonNullable<RepositoryInspection["sourceFiles"]>[number];

function peripheralSourcePath(path: string): boolean {
  const normalized = path.toLowerCase();
  return /(^|\/)(tests?|testdata|docs?|examples?|scripts?|benchmarks?|fixtures?)(\/|$)/.test(normalized)
    || /(^|\/)(download|eval|adapter)[^/]*\.(sh|py)$/.test(normalized)
    || /(^|\/)__init__\.py$/.test(normalized);
}

function sourceRelevance(source: RepositorySourceFile): number {
  const path = source.path.toLowerCase();
  let score = Math.min(source.symbols.length, 12);
  if (/(^|\/)(src|lib|library|core|model|models|layers?|modules?|training|optim)(\/|\.)/.test(path)) score += 14;
  if (/(layer|model|module|train|optim|dataset|attention|lora)/.test(path)) score += 8;
  score -= Math.max(0, path.split("/").length - 2);
  return score;
}

function coreImplementationSources(repository: RepositoryInspection): RepositorySourceFile[] {
  const withSymbols = (repository.sourceFiles || []).filter((source) => source.symbols.length > 0);
  const core = withSymbols.filter((source) => !peripheralSourcePath(source.path));
  const candidates = core.length > 0 ? core : withSymbols.filter((source) => !/(^|\/)tests?(\/|$)/i.test(source.path));
  return candidates.sort((left, right) => sourceRelevance(right) - sourceRelevance(left) || left.path.localeCompare(right.path)).slice(0, 6);
}

function meaningfulSymbols(source: RepositorySourceFile): string[] {
  const generic = new Set(["__init__", "forward", "train", "reset_parameters", "main", "T", "zero_pad"]);
  const specific = source.symbols
    .filter((symbol) => !generic.has(symbol) && !/^Conv[123]d$/.test(symbol))
    .map((symbol, index) => ({
      symbol,
      index,
      score: (/^[A-Z]/.test(symbol) ? 4 : 0) + (/lora/i.test(symbol) ? 3 : 0) + (/(merge|state|trainable)/i.test(symbol) ? 2 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ symbol }) => symbol);
  const selected = specific.length > 0 ? specific : source.symbols;
  return selected.slice(0, 7);
}

function RepositoryEvidence({ repository }: { repository: RepositoryInspection }) {
  const coreSources = coreImplementationSources(repository);
  const corePaths = new Set(coreSources.map((source) => source.path));
  const compatibilityIssues = (repository.compatibility?.issues || [])
    .filter((issue) => issue.severity === "blocker" || !issue.path || issue.kind === "dependency" || corePaths.has(issue.path))
    .sort((left, right) => ({ blocker: 0, warning: 1, info: 2 })[left.severity] - ({ blocker: 0, warning: 1, info: 2 })[right.severity])
    .slice(0, 5);
  const indexedFileCount = repository.sourceFiles?.length || 0;
  const omittedFileCount = Math.max(0, indexedFileCount - coreSources.length);

  return (
    <section className="source-evidence-section">
      <header><GitBranch size={17} /><div><span>Repository</span><h2>{repository.fullName}</h2></div></header>
      {repository.description && <p>{repository.description}</p>}
      <dl>
        <div><dt>Default branch</dt><dd>{repository.defaultBranch}</dd></div>
        <div><dt>Commit</dt><dd><code>{repository.commitSha || "Not pinned"}</code></dd></div>
        <div><dt>Language</dt><dd>{repository.language || "Not reported"}</dd></div>
        <div><dt>License</dt><dd>{repository.license || "Not reported"}</dd></div>
        <div><dt>Root manifests</dt><dd>{repository.manifests.join(", ") || "None detected"}</dd></div>
        <div><dt>Code snapshot</dt><dd>{repository.compatibility ? `${repository.compatibility.sourceFileCount} files · ${repository.compatibility.symbolCount} symbols · ${repository.compatibility.status}` : "Not analyzed"}</dd></div>
      </dl>

      {compatibilityIssues.length > 0 && <div className="readme-digest dependency-evidence compatibility-summary">
        <span>Relevant compatibility constraints</span>
        {compatibilityIssues.map((issue, index) => <section key={`${issue.path || issue.kind}-${index}`}><h3>{issue.path || issue.kind}</h3><p>{issue.severity} · {issue.evidence}</p></section>)}
      </div>}

      {coreSources.length > 0 && <div className="readme-digest dependency-evidence implementation-summary">
        <span>Core implementation</span>
        <p className="source-summary-copy">Only reusable implementation files are shown. Tests, examples, download scripts, and symbol-free files remain pinned but are omitted.</p>
        {coreSources.map((source) => {
          const symbols = meaningfulSymbols(source);
          return <section key={source.path}><h3>{source.path}</h3><p className="implementation-symbols"><strong>Key symbols</strong> <code>{symbols.join(", ")}</code>{source.truncated ? " · partial file" : ""}</p></section>;
        })}
        {omittedFileCount > 0 && <small>{coreSources.length} core files shown · {omittedFileCount} auxiliary files omitted</small>}
      </div>}

      {(repository.dependencyManifests || []).length > 0 && <div className="readme-digest dependency-evidence">
        <span>Dependency evidence</span>
        {repository.dependencyManifests?.map((manifest) => <section key={manifest.path}><h3>{manifest.path}</h3><p>{manifest.format} · {manifest.dependencies.length} parsed dependencies{manifest.truncated ? " · partial source" : ""}</p>{manifest.dependencies.length > 0 && <p>{manifest.dependencies.slice(0, 20).join(", ")}{manifest.dependencies.length > 20 ? ` · +${manifest.dependencies.length - 20} more` : ""}</p>}</section>)}
      </div>}

      {(repository.readmeSections || []).length > 0 && <div className="readme-digest">
        <span>README summary</span>
        {repository.readmeSections.slice(0, 4).map((section, index) => <section key={`${section.title}-${index}`}><h3>{section.title}</h3>{section.paragraphs.slice(0, 2).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets.length > 0 && <ul>{section.bullets.slice(0, 6).map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}</section>)}
      </div>}
    </section>
  );
}

function SourcesView({ study, evidenceTarget, onNewStudy, onRetryPaperExtraction, paperExtractionBusy }: { study: StudyInspection | null; evidenceTarget: EvidenceCitation | null; onNewStudy: () => void; onRetryPaperExtraction: () => Promise<void>; paperExtractionBusy: boolean }) {
  const [paperPageRequest, setPaperPageRequest] = useState<{ key: string; data?: PaperPageEvidence; error?: string } | null>(null);
  const [paperPageRevision, setPaperPageRevision] = useState(0);
  const evidencePanelRef = useRef<HTMLElement>(null);
  const studyId = study?.studyId;
  const evidencePage = evidenceTarget?.page;
  const evidenceRequestKey = studyId && evidencePage ? `${studyId}:${evidencePage}` : "";

  useEffect(() => {
    if (!studyId || !evidencePage || !evidenceRequestKey) return;
    const controller = new AbortController();
    fetch(`/api/studies/${encodeURIComponent(studyId)}/paper/pages/${evidencePage}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as PaperPageEvidence & { error?: string };
        if (!response.ok) throw new Error(body.error || "The cited PDF page could not be loaded");
        return body;
      })
      .then((data) => setPaperPageRequest({ key: evidenceRequestKey, data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setPaperPageRequest({ key: evidenceRequestKey, error: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
  }, [evidencePage, evidenceRequestKey, paperPageRevision, studyId]);

  function retryPaperPage() {
    setPaperPageRequest(null);
    setPaperPageRevision((current) => current + 1);
  }

  const activePageRequest = paperPageRequest?.key === evidenceRequestKey ? paperPageRequest : null;
  const paperPage = activePageRequest?.data || null;
  const paperPageError = activePageRequest?.error || "";
  const paperPageLoading = Boolean(evidenceTarget && !activePageRequest);
  const passage = paperPage && evidenceTarget ? evidencePassageRange(paperPage.text, evidenceTarget.quote, evidenceTarget.query || evidenceTarget.label) : null;

  useEffect(() => {
    if (!evidenceTarget || (!paperPage && !paperPageError)) return;
    const frame = window.requestAnimationFrame(() => {
      evidencePanelRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [evidenceTarget, paperPage, paperPageError, passage?.start]);

  if (!study) return <UnavailableView title="No source pinned" detail="Create a study to inspect a paper, DOI, or public GitHub repository." action="New study" onAction={onNewStudy} />;
  const originalPageUrl = paperPage ? pdfPageUrl(paperPage.sourceUrl, paperPage.page) : null;
  return (
    <div className="content-view source-map-view">
      <div className="content-header"><div><span>Source map</span><h1>Retrieved evidence</h1><p>Remote values are shown as received and stored in <code>{study.studyId}</code>.</p></div><CheckCircle2 size={20} /></div>
      {evidenceTarget && <section className="paper-evidence-viewer" aria-label={`Cited evidence on PDF page ${evidenceTarget.page}`} ref={evidencePanelRef}>
        <header>
          <div><span>{passage ? "Exact cited passage" : "Cited passage"}</span><h2>{evidenceTarget.label}</h2></div>
          <div className="paper-evidence-actions"><small>PDF page {evidenceTarget.page}{paperPage ? ` of ${paperPage.totalPages}` : ""}</small>{originalPageUrl && <a href={originalPageUrl} target="_blank" rel="noreferrer">Open original <ExternalLink size={12} /></a>}</div>
        </header>
        {paperPageLoading ? <div className="paper-evidence-state"><LoaderCircle className="spin" size={16} /> Loading the pinned page</div> : paperPageError ? <div className="paper-evidence-state is-error"><AlertCircle size={16} /><span>{paperPageError}</span><button type="button" className="quiet-button" onClick={retryPaperPage}><RefreshCw size={14} /> Retry</button></div> : paperPage && !passage ? <div className="paper-evidence-state is-error"><AlertCircle size={16} /> The exact cited quote is not present on this pinned PDF page. This citation is invalid and no approximate passage was highlighted.</div> : paperPage && passage && <>
          <Suspense fallback={<div className="paper-evidence-state"><LoaderCircle className="spin" size={16} /> Loading the PDF renderer</div>}>
            <PdfEvidencePage studyId={study.studyId} page={paperPage.page} passageText={paperPage.text.slice(passage.start, passage.end)} label={evidenceTarget.label} />
          </Suspense>
          <footer><span>Exact quote highlighted on the pinned PDF page</span><code title={paperPage.paperSha256}>sha256:{paperPage.paperSha256.slice(0, 12)}</code></footer>
        </>}
      </section>}
      {!study.paperDocument && <section className="source-warning source-extraction-warning" role="alert"><AlertCircle size={15} /><span>Paper metadata was saved, but full-text extraction did not finish. Recover the locally cached PDF to unlock evidence, datasets, and notebook generation.</span><button type="button" className="quiet-button" onClick={() => void onRetryPaperExtraction()} disabled={paperExtractionBusy}>{paperExtractionBusy ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{paperExtractionBusy ? "Recovering" : "Retry paper extraction"}</button></section>}
      {study.paper && <section className="source-evidence-section"><header><FileText size={17} /><div><span>Paper</span><h2>{study.paper.title}</h2></div></header>{study.paper.authors.length > 0 && <p className="source-authors">{study.paper.authors.join(", ")}</p>}{study.paper.abstract && <p>{study.paper.abstract}</p>}<dl><div><dt>Source</dt><dd>{study.paper.source}</dd></div><div><dt>Identifier</dt><dd>{study.paper.identifier || "Not exposed"}</dd></div><div><dt>Retrieved</dt><dd>{new Date(study.createdAt).toLocaleString()}</dd></div>{study.paperDocument ? <><div><dt>Full text</dt><dd>{study.paperDocument.retainedPages} / {study.paperDocument.totalPages} pages · {study.paperDocument.characterCount.toLocaleString()} characters</dd></div><div><dt>Document hash</dt><dd><code title={study.paperDocument.sha256}>{study.paperDocument.sha256.slice(0, 16)}…</code></dd></div><div><dt>Extraction</dt><dd>{study.paperDocument.extractor} · {study.paperDocument.retrievalMode}</dd></div></> : <div><dt>Full text</dt><dd>Not extracted</dd></div>}</dl></section>}
      {study.repository && <RepositoryEvidence repository={study.repository} />}
      {study.warnings.map((warning) => <div className="source-warning" key={warning}><AlertCircle size={15} />{warning}</div>)}
    </div>
  );
}

function DatasetView({ study, profile, onNewStudy, onOpenEvidence, onRetryPaperExtraction, paperExtractionBusy }: { study: StudyInspection | null; profile: SystemProfile | null; onNewStudy: () => void; onOpenEvidence: (citation: EvidenceCitation) => void; onRetryPaperExtraction: () => Promise<void>; paperExtractionBusy: boolean }) {
  const [plan, setPlan] = useState<DatasetPlan | null>(null);
  const [loading, setLoading] = useState(Boolean(study));
  const [generating, setGenerating] = useState(false);
  const [selectedHubId, setSelectedHubId] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!study) return;
    let active = true;
    fetch(`/api/studies/${encodeURIComponent(study.studyId)}/datasets`)
      .then(async (response) => {
        const body = await response.json() as DatasetPlan | null | { error?: string };
        if (!response.ok) throw new Error(body && "error" in body ? body.error || "Dataset plan could not be loaded" : "Dataset plan could not be loaded");
        return body as DatasetPlan | null;
      })
      .then((stored) => { if (active) { setPlan(stored); setSelectedHubId(stored?.selection?.hubId || ""); setLoadError(""); } })
      .catch((cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, study]);

  function retryDatasetLoad() {
    setLoadError("");
    setLoading(true);
    setRevision((current) => current + 1);
  }

  async function generate(regenerate: boolean) {
    if (!study || generating) return;
    setGenerating(true);
    setActionError("");
    try {
      const response = await fetch(`/api/studies/${encodeURIComponent(study.studyId)}/datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const body = await response.json() as { plan?: DatasetPlan; error?: string };
      if (!response.ok || !body.plan) throw new Error(body.error || "Dataset planning failed");
      setPlan(body.plan);
      setSelectedHubId(body.plan.selection?.hubId || "");
      setLoadError("");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  }

  async function downloadSelected() {
    if (!study || !selectedHubId || downloading) return;
    setDownloading(true);
    setActionError("");
    try {
      const response = await fetch(`/api/studies/${encodeURIComponent(study.studyId)}/datasets/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubId: selectedHubId }),
      });
      const body = await response.json() as { plan?: DatasetPlan; error?: string };
      if (!response.ok || !body.plan) throw new Error(body.error || "Dataset download failed");
      setPlan(body.plan);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDownloading(false);
    }
  }

  if (!study) return <UnavailableView title="No dataset evidence" detail="Create a study before matching paper datasets to this computer." action="New study" onAction={onNewStudy} />;
  const canGenerate = Boolean(profile?.codexAgent.ready && study.paperDocument);
  return (
    <div className="content-view dataset-view">
      <div className="content-header"><div><span>Datasets</span><h1>Resource-fit dataset evidence</h1><p>Paper mentions are separated from live Hub metadata and local fit calculations.</p></div>{plan ? <button type="button" className="quiet-button" onClick={() => void generate(true)} disabled={!canGenerate || generating}><RefreshCw className={generating ? "spin" : ""} size={15} /> Refresh</button> : <Database size={20} />}</div>
      {loadError && plan && <div className="source-warning run-load-warning" role="alert"><AlertCircle size={15} /><span>{loadError}. The last loaded dataset plan remains visible.</span><button type="button" onClick={retryDatasetLoad}><RefreshCw size={14} /> Retry</button></div>}
      {loading ? <section className="execution-empty"><LoaderCircle className="spin" size={22} /><h2>Loading dataset evidence</h2></section> : loadError && !plan ? <section className="execution-empty"><AlertCircle size={22} /><h2>Dataset evidence unavailable</h2><p>{loadError}. No saved plan was replaced.</p><button type="button" className="quiet-button" onClick={retryDatasetLoad}><RefreshCw size={14} /> Retry</button></section> : !plan && !study.paperDocument ? <section className="execution-empty"><AlertCircle size={22} /><h2>Recover paper text first</h2><p>The paper PDF was downloaded but its text is not yet pinned. Recover it to find paper-specific datasets and calculate a local fit.</p><button type="button" className="primary-command" onClick={() => void onRetryPaperExtraction()} disabled={paperExtractionBusy}>{paperExtractionBusy ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{paperExtractionBusy ? "Recovering paper" : "Recover paper text"}</button></section> : !plan ? <section className="execution-empty"><Database size={22} /><h2>No dataset plan has run</h2><p>{canGenerate ? "Extract paper dataset mentions and verify current Hub metadata against this machine." : "A signed-in local Codex agent is required to find datasets."}</p><button type="button" className="primary-command" onClick={() => void generate(false)} disabled={!canGenerate || generating}>{generating ? <LoaderCircle className="spin" size={15} /> : <Database size={15} />} Find datasets</button></section> : <>
        {plan.stale && <div className="source-warning" role="status"><AlertCircle size={15} /><span>{plan.migrationNotes?.[0] || "This saved dataset plan uses an older evidence format. Refresh it before using a candidate."}</span></div>}
        <div className="dataset-budget"><span><HardDrive size={16} /><strong>{formatBytes(plan.hardware.freeDiskBytes)}</strong><small>free disk at planning</small></span><span><Cpu size={16} /><strong>{formatBytes(plan.hardware.freeMemoryBytes)}</strong><small>available memory at planning</small></span><code title={plan.paperSha256}>paper {plan.paperSha256.slice(0, 12)}</code></div>
        {plan.selection && <section className="dataset-selection-summary" aria-label="Attached local dataset">
          <CheckCircle2 size={18} />
          <div><strong>{plan.selection.hubId}</strong><p>{plan.selection.config} / {plan.selection.split} · {plan.selection.rowCount.toLocaleString()} rows · {formatBytes(plan.selection.sizeBytes)}</p><code title={plan.selection.sha256}>{plan.selection.localPath} · sha256:{plan.selection.sha256.slice(0, 12)}</code></div>
          <span>Mounted read-only at {plan.selection.mountPath}</span>
        </section>}
        <section className="dataset-table" aria-label="Verified dataset candidates">
          <div className="dataset-table-header"><span>Paper evidence and Hub identity</span><span>Verified size</span><span>Local mode</span><span>Select</span></div>
          {plan.candidates.map((candidate) => {
            const evidence = candidate.evidence?.[0];
            const identityLabel = candidate.hub?.identityScore == null ? "legacy match not rescored" : `${Math.round(candidate.hub.identityScore * 100)}% name match`;
            const selectable = Boolean(!plan.stale && candidate.hub && !candidate.hub.gated && candidate.hub.license !== "unknown" && candidate.fit.recommendedRows);
            return <article key={`${candidate.name}-${candidate.searchQuery}`}>
            <div className="dataset-name"><i><Database size={12} /></i><span><strong>{candidate.name}</strong>{evidence && <button type="button" className="dataset-evidence-link" onClick={() => onOpenEvidence({ page: evidence.page, quote: evidence.quote, label: `${candidate.name} dataset role` })}>{evidence.quote.slice(0, 96)}{evidence.quote.length > 96 ? "..." : ""}</button>}<p>{candidate.role}</p><small>Split: {candidate.split || "Not specified"} · preprocessing: {candidate.preprocessing || "Not specified"}</small>{candidate.hub ? <a href={candidate.hub.url} target="_blank" rel="noreferrer">{candidate.hub.id} · {identityLabel} <ExternalLink size={12} /></a> : <small>No sufficiently close public Hub name match</small>}</span></div>
            <div className="dataset-metric"><strong>{candidate.hub?.size?.memoryBytes ? formatBytes(candidate.hub.size.memoryBytes) : "Unknown"}</strong><small>{candidate.hub?.size?.rows?.toLocaleString() || "Unknown"} rows · license {candidate.hub?.license || "unverified"}</small><code title={candidate.hub?.revision || undefined}>{candidate.hub?.revision?.slice(0, 10) || "no revision"}</code></div>
            <div className="dataset-fit"><strong>{candidate.fit?.mode || "inspect"}</strong><small>{candidate.fit?.recommendedRows ? `${candidate.fit.recommendedRows.toLocaleString()} rows · bounded local sample` : "Inspect first"}</small></div>
            <label className={`dataset-select-control${selectedHubId === candidate.hub?.id ? " is-selected" : ""}`}><input type="radio" name="dataset-candidate" value={candidate.hub?.id || ""} checked={Boolean(candidate.hub?.id && selectedHubId === candidate.hub.id)} disabled={!selectable || downloading} onChange={() => setSelectedHubId(candidate.hub?.id || "")} /><span>{plan.selection?.hubId === candidate.hub?.id ? "Attached" : selectable ? "Choose" : "Unavailable"}</span></label>
          </article>})}
        </section>
        <div className="dataset-download-bar"><div><strong>Local learning sample</strong><p>The selected revision is downloaded as bounded JSONL, hashed, and mounted read-only when this notebook runs.</p></div><button type="button" className="primary-command" disabled={!selectedHubId || plan.stale || downloading} onClick={() => void downloadSelected()}>{downloading ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />} {downloading ? "Downloading" : "Download selected"}</button></div>
        <p className="dataset-limit">{plan.limitations}</p>
      </>}
      {actionError && <div className="source-warning" role="alert"><AlertCircle size={15} />{actionError}</div>}
    </div>
  );
}

function RemoteView({ study, onNewStudy, onOpenNotebook, onOpenRuns }: { study: StudyInspection | null; onNewStudy: () => void; onOpenNotebook: () => void; onOpenRuns: () => void }) {
  const [status, setStatus] = useState<{ installed: boolean; authenticated: boolean; ready: boolean; version?: string; message?: string; credentialSource?: "profile" | "environment" | "session" | "app-profile"; installationSource?: "configured" | "managed" | "system" } | null>(null);
  const [tokenId, setTokenId] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");
  const [rememberCredentials, setRememberCredentials] = useState(true);
  const [gpu, setGpu] = useState("auto");
  const [timeoutSeconds, setTimeoutSeconds] = useState(300);
  const [localBlocker, setLocalBlocker] = useState("");
  const [plan, setPlan] = useState<ModalPlan | null>(null);
  const [approvalToken, setApprovalToken] = useState("");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [launch, setLaunch] = useState<{ status: "passed" | "failed"; stdout: string; stderr: string; startedAt: string; endedAt: string } | null>(null);
  const [notebookSaved, setNotebookSaved] = useState<boolean | null>(null);
  const [notebookStatusError, setNotebookStatusError] = useState("");
  const [notebookStatusRevision, setNotebookStatusRevision] = useState(0);
  const [statusRefreshing, setStatusRefreshing] = useState(false);

  async function refreshStatus() {
    setStatusRefreshing(true);
    try {
      const response = await fetch("/api/modal/status");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Modal status is unavailable");
      setStatus(body);
    } catch (cause) {
      setStatus({ installed: false, authenticated: false, ready: false, message: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setStatusRefreshing(false);
    }
  }

  useEffect(() => {
    fetch("/api/modal/status")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Modal status is unavailable");
        return body;
      })
      .then(setStatus)
      .catch((cause: unknown) => setStatus({ installed: false, authenticated: false, ready: false, message: cause instanceof Error ? cause.message : String(cause) }));
  }, []);

  useEffect(() => {
    if (!study) return;
    let active = true;
    fetch(`/api/notebooks/${encodeURIComponent(notebookIdForStudy(study))}?optional=1`)
      .then(async (response) => {
        const body = await response.json() as { error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "Saved notebook status is unavailable");
        return Boolean(body);
      })
      .then((saved) => { if (active) { setNotebookSaved(saved); setNotebookStatusError(""); } })
      .catch((cause: unknown) => {
        if (active) {
          setNotebookSaved(null);
          setNotebookStatusError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => { active = false; };
  }, [notebookStatusRevision, study]);

  function retryNotebookStatus() {
    setNotebookSaved(null);
    setNotebookStatusError("");
    setNotebookStatusRevision((current) => current + 1);
  }

  if (!study) return <UnavailableView title="No remote workload" detail="Create and save a study notebook before preparing remote execution." action="New study" onAction={onNewStudy} />;
  const notebookId = notebookIdForStudy(study);

  async function connectModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tokenId.trim() || !tokenSecret.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/modal/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId: tokenId.trim(), tokenSecret: tokenSecret.trim(), remember: rememberCredentials }),
      });
      const body = await response.json();
      if (!response.ok || !body.ready) throw new Error(body.error || body.message || "Modal credentials were not retained");
      setStatus(body);
      setTokenId("");
      setTokenSecret("");
    } catch (cause) {
      setTokenSecret("");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function disconnectModal() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/modal/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Modal could not be disconnected");
      setStatus(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function createPlan() {
    setBusy(true);
    setError("");
    setLaunch(null);
    try {
      const response = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/modal/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gpu, timeoutSeconds, ...(localBlocker.trim() ? { localBlocker: localBlocker.trim() } : {}) }),
      });
      const body = await response.json() as { plan?: ModalPlan; approvalToken?: string; error?: string };
      if (!response.ok || !body.plan || !body.approvalToken) throw new Error(body.error || "Modal plan could not be created");
      setPlan(body.plan);
      setApprovalToken(body.approvalToken);
      setApproved(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function launchPlan() {
    if (!plan || !approved || !approvalToken) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/modal/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId, approvalToken }),
      });
      const body = await response.json() as { status?: "passed" | "failed"; stdout?: string; stderr?: string; startedAt?: string; endedAt?: string; error?: string };
      if (!response.ok || !body.status || !body.startedAt || !body.endedAt) throw new Error(body.error || "Modal launch failed");
      setLaunch({ status: body.status, stdout: body.stdout || "", stderr: body.stderr || "", startedAt: body.startedAt, endedAt: body.endedAt });
      setApprovalToken("");
      setApproved(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-view remote-view">
      <div className="content-header"><div><span>Remote</span><h1>Bounded Modal execution</h1><p>Planning is local. Launch requires a fresh one-time approval and retains the external run evidence.</p></div><Cloud size={20} /></div>
      <section className="remote-status"><div><span>Modal</span><strong>{status?.ready ? "Connected" : status?.message || "Checking"}</strong><small>{status?.version || "CLI installs automatically when you connect"}{status?.credentialSource ? ` · ${status.credentialSource}` : ""}</small></div><div><span>Notebook</span><strong>{notebookStatusError ? "Status unavailable" : notebookSaved === null ? "Checking saved version" : notebookSaved ? "Saved notebook ready" : "Save required"}</strong><small>{notebookId}</small></div></section>
      {notebookStatusError ? <div className="remote-notebook-gate is-error" role="alert"><AlertCircle size={16} /><span><strong>{notebookStatusError}</strong><small>Remote planning remains blocked until the saved version can be verified.</small></span><button type="button" className="quiet-button" onClick={retryNotebookStatus}><RefreshCw size={14} /> Retry</button></div> : notebookSaved === false && <div className="remote-notebook-gate" role="status"><AlertCircle size={16} /><span><strong>Save the notebook before planning a remote run.</strong><small>The plan is bound to an immutable notebook hash.</small></span><button type="button" className="quiet-button" onClick={onOpenNotebook}><NotebookTabs size={14} /> Open notebook</button></div>}
      {!status?.ready ? <section className="remote-auth" aria-label="Modal authentication setup">
        <header><KeyRound size={17} /><div><span>Modal account</span><h2>Connect API credentials</h2></div><div className="remote-auth-actions"><button type="button" onClick={() => void refreshStatus()} disabled={statusRefreshing}>{statusRefreshing ? <LoaderCircle className="spin" size={12} /> : <RefreshCw size={12} />} Retry status</button><a href="https://modal.com/settings/tokens" target="_blank" rel="noreferrer">Create token <ExternalLink size={12} /></a></div></header>
        <form onSubmit={(event) => void connectModal(event)}>
          <label><span>Token ID</span><input type="text" value={tokenId} onChange={(event) => setTokenId(event.target.value)} placeholder="ak-..." autoComplete="off" spellCheck={false} /></label>
          <label><span>Token Secret</span><input type="password" value={tokenSecret} onChange={(event) => setTokenSecret(event.target.value)} placeholder="as-..." autoComplete="new-password" spellCheck={false} /></label>
          <label className="remote-remember"><input type="checkbox" checked={rememberCredentials} onChange={(event) => setRememberCredentials(event.target.checked)} /><span>Remember on this device</span></label>
          <button type="submit" className="primary-command" disabled={busy || !tokenId.trim() || !tokenSecret.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}{busy ? (status?.installed ? "Verifying" : "Installing and verifying") : "Connect Modal"}</button>
        </form>
        {error && <div className="source-warning remote-auth-error" role="alert"><AlertCircle size={15} />{error}</div>}
        <p>The secret is sent only to this localhost process. Remembered credentials use an app-isolated Modal profile; they are excluded from studies, artifacts, logs, and provenance.</p>
      </section> : <div className="remote-connection-actions"><span><CheckCircle2 size={14} /> Credential verification passed{status.installationSource === "managed" ? " with the app-managed CLI" : ""}</span>{status.credentialSource === "app-profile" || status.credentialSource === "session" ? <button type="button" className="quiet-button" onClick={() => void disconnectModal()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Minus size={14} />} Disconnect</button> : <button type="button" className="quiet-button" onClick={() => void refreshStatus()} disabled={busy}><RefreshCw size={14} /> Refresh</button>}</div>}
      <section className="remote-config" aria-label="Modal execution plan">
        <header><span>Execution bounds</span><h2>GPU and hard timeout</h2></header>
        <div className="remote-fields"><label>GPU<select value={gpu} onChange={(event) => setGpu(event.target.value)}>{["auto", "T4", "L4", "A10", "L40S", "A100-40GB", "A100-80GB", "H100", "H200", "B200"].map((option) => <option key={option} value={option}>{option === "auto" ? "Auto (recommended)" : option}</option>)}</select></label><label>Timeout (seconds)<input type="number" min={30} max={900} step={30} value={timeoutSeconds} onChange={(event) => setTimeoutSeconds(Math.max(30, Math.min(900, Number(event.target.value) || 30)))} /></label><button type="button" className="primary-command" onClick={() => void createPlan()} disabled={busy || notebookSaved !== true}>{busy && !plan ? <LoaderCircle className="spin" size={15} /> : <FileCode2 size={15} />} Create plan</button><label className="remote-blocker">Local execution blocker<textarea value={localBlocker} onChange={(event) => setLocalBlocker(event.target.value)} placeholder="Required only when verified local execution is impossible" rows={2} /></label></div>
      </section>
      {plan && <section className="remote-plan"><header><div><span>Prepared plan</span><h2>{plan.gpu} · {plan.timeoutSeconds} seconds maximum</h2><p>{plan.selectionReason}</p></div><code>{plan.planId}</code></header><dl><div><dt>Requested target</dt><dd>{plan.requestedGpu === "auto" ? `Auto selected ${plan.gpu}` : plan.gpu} · at least {plan.minimumGpuMemoryGiB} GiB</dd></div><div><dt>GPU-only maximum</dt><dd>${plan.maximumGpuCostUsd.toFixed(4)} USD</dd></div><div><dt>Rate snapshot</dt><dd>${plan.gpuRateUsdPerSecond}/second · <a href={plan.pricingSource} target="_blank" rel="noreferrer">{plan.pricingAsOf} <ExternalLink size={11} /></a></dd></div><div><dt>Local gate</dt><dd>{plan.localEvidence.mode === "verified-run" ? `${plan.localEvidence.runIds.length} verified run manifest${plan.localEvidence.runIds.length === 1 ? "" : "s"}` : plan.localEvidence.mode === "user-selected-remote" ? plan.localEvidence.reason : plan.localEvidence.blocker}</dd></div><div><dt>Runtime packages</dt><dd>{plan.packages.length ? plan.packages.join(", ") : "Python standard library only"}</dd></div><div><dt>Device contract</dt><dd>{plan.deviceEnvironment.toUpperCase()} via CODEX_RESEARCH_DEVICE · {plan.containerMemoryMiB} MiB function memory</dd></div><div><dt>Network</dt><dd>{plan.networkPolicy === "blocked" ? "Disabled during execution" : plan.networkPolicy}</dd></div><div><dt>Retained files</dt><dd>Up to {plan.artifactPolicy.maxFiles} files · {(plan.artifactPolicy.maxFileBytes / 1024 ** 2).toFixed(0)} MB each · {(plan.artifactPolicy.maxTotalBytes / 1024 ** 2).toFixed(0)} MB total</dd></div><div><dt>Notebook hash</dt><dd><code>{plan.notebookHash}</code></dd></div><div><dt>App hash</dt><dd><code>{plan.appSha256}</code></dd></div><div><dt>Plan hash</dt><dd><code title={plan.planHash}>{plan.planHash.slice(0, 18)}...</code></dd></div><div><dt>Code cells</dt><dd>{plan.codeCellCount}</dd></div><div><dt>Approval expires</dt><dd>{new Date(plan.expiresAt).toLocaleString()}</dd></div></dl>{launch ? <div className="remote-plan-consumed"><CheckCircle2 size={15} /><span>This one-time plan has been consumed. Create a new plan to rerun it.</span><button type="button" className="quiet-button" onClick={onOpenRuns}>View run</button></div> : <><label className="remote-approval"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /> <span>I approve this bounded external GPU run and its potential charge.</span></label><button type="button" className="primary-command" onClick={() => void launchPlan()} disabled={!approved || !status?.ready || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Cloud size={15} />} Launch approved run</button></>}</section>}
      {launch && <section className="remote-result"><header><strong>Remote run {launch.status}</strong><span><small>{new Date(launch.endedAt).toLocaleString()}</small><button type="button" className="quiet-button" onClick={onOpenRuns}><Terminal size={14} /> View retained run</button></span></header>{launch.stdout && <pre>{launch.stdout}</pre>}{launch.stderr && <pre>{launch.stderr}</pre>}</section>}
      {error && status?.ready && <div className="source-warning" role="alert"><AlertCircle size={15} />{error}</div>}
    </div>
  );
}

function ExecutionView({ study, profile, notebookAvailable, onOpenNotebook }: { study: StudyInspection | null; profile: SystemProfile | null; notebookAvailable: boolean; onOpenNotebook: () => void }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [remoteRuns, setRemoteRuns] = useState<RemoteRunSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(study));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!study) return;
    let active = true;
    const notebookId = encodeURIComponent(notebookIdForStudy(study));
    Promise.allSettled([
      fetch(`/api/notebooks/${notebookId}/runs`).then(async (response) => {
        const body = await response.json() as { runs?: RunSummary[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Local run manifests could not be loaded");
        return body.runs || [];
      }),
      fetch(`/api/notebooks/${notebookId}/modal/runs`).then(async (response) => {
        const body = await response.json() as { runs?: RemoteRunSummary[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Remote run manifests could not be loaded");
        return body.runs || [];
      }),
    ])
      .then(([localResult, remoteResult]) => {
        if (!active) return;
        if (localResult.status === "fulfilled") setRuns(localResult.value);
        if (remoteResult.status === "fulfilled") setRemoteRuns(remoteResult.value);
        const failures = [localResult, remoteResult]
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
        setError([...new Set(failures)].join(" · "));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [revision, study]);

  function retryRuns() {
    setError("");
    setLoading(true);
    setRevision((current) => current + 1);
  }

  const retainedCount = runs.length + remoteRuns.length;

  return (
    <div className="content-view run-view">
      <div className="content-header"><div><span>Execution</span><h1>Runtime evidence</h1><p>No progress, metric, or artifact is displayed without a real runner manifest.</p></div>{profile?.runnerImageReady ? <CheckCircle2 size={20} /> : <Server size={20} />}</div>
      <div className="runtime-evidence-grid">
        <div><Cpu size={18} /><span><strong>{profile?.cpu || "Detecting processor"}</strong><small>{profile ? `${profile.logicalCores} logical cores · ${formatPlatform(profile)}` : "System profile unavailable"}</small></span></div>
        <div><HardDrive size={18} /><span><strong>{profile ? formatBytes(profile.memoryBytes) : "Unknown memory"}</strong><small>{profile ? `${formatBytes(profile.freeMemoryBytes)} available at inspection` : "System profile unavailable"}</small></span></div>
        <div><CircuitBoard size={18} /><span><strong>{profile ? formatAccelerator(profile) : "Detecting accelerator"}</strong><small>{profile?.accelerators.some((accelerator) => accelerator.localRunnerAccess) ? "Available inside a reviewed local runner" : profile?.accelerators.length ? "Detected on host · target-specific isolated runtime required" : "Portable CPU validation available"}</small></span></div>
        <div><PackageCheck size={18} /><span><strong>{profile?.runnerImageReady ? "Portable runner ready" : profile?.dockerReady ? "Runner image not built" : "Docker not connected"}</strong><small>{profile ? `${profile.localRuntime.cpus} CPU · ${formatBytes(profile.localRuntime.memoryBytes)} · ${profile.localRuntime.timeoutSeconds} s · ${profile.runnerPlatform ? `${profile.runnerPlatform.os}/${profile.runnerPlatform.arch}` : profile.runnerImage}` : "rosetta-python:0.1"}</small></span></div>
      </div>
      {error && retainedCount > 0 && <div className="source-warning run-load-warning" role="alert"><AlertCircle size={15} /><span>{error}. Available run manifests remain visible.</span><button type="button" onClick={retryRuns} disabled={loading}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} Retry</button></div>}
      {loading && retainedCount === 0 ? <section className="execution-empty"><LoaderCircle className="spin" size={22} /><h2>Loading run manifests</h2></section> : error && retainedCount === 0 ? (
        <section className="execution-empty"><AlertCircle size={22} /><h2>Run history unavailable</h2><p>{error}</p><button type="button" className="quiet-button" onClick={retryRuns}><RefreshCw size={14} /> Retry</button></section>
      ) : runs.length === 0 && remoteRuns.length === 0 ? (
        <section className="execution-empty"><Terminal size={22} /><h2>No run manifests</h2><p>{study ? "The source evidence notebook can create an isolated run manifest on this machine. Paper-specific architecture claims remain gated by later evidence mapping." : "Create a study before generating an executable notebook."}</p>{notebookAvailable && <button type="button" className="primary-command" onClick={onOpenNotebook}><NotebookTabs size={15} /> Open notebook</button>}</section>
      ) : (
        <section className="execution-run-list" aria-label="Stored run manifests">
          <header><span>{retainedCount} retained run{retainedCount === 1 ? "" : "s"} · {runs.length} local · {remoteRuns.length} Modal</span><button type="button" className="quiet-button" onClick={onOpenNotebook}><NotebookTabs size={15} /> Open notebook</button></header>
          {runs.map((run) => (
            <article key={run.runId}>
              <span className={`run-state is-${run.status}`}>{run.status === "passed" ? <Check size={14} /> : <AlertCircle size={14} />}</span>
              <div><strong>{run.targetCellId}</strong><code>{run.runId}</code></div>
              <div><small>{new Date(run.createdAt).toLocaleString()}</small><small>{run.durationMs} ms · {run.artifacts.length} artifact{run.artifacts.length === 1 ? "" : "s"}</small></div>
              <code title={run.imageDigest}>sha256:{run.codeHash.slice(0, 10)}</code>
            </article>
          ))}
          {remoteRuns.map((run) => (
            <article className="is-remote-run" key={run.runId}>
              <span className={`run-state is-${run.status}`}>{run.status === "passed" ? <Check size={14} /> : <AlertCircle size={14} />}</span>
              <div><strong><Cloud size={12} /> {run.gpu} Modal run</strong><code>{run.runId}</code></div>
              <div><small>{new Date(run.createdAt).toLocaleString()}</small><small>{run.durationMs} ms · {run.cells.length} cell{run.cells.length === 1 ? "" : "s"} · ≤ ${run.maximumGpuCostUsd.toFixed(4)}{run.executionEnvironment ? ` · ${run.executionEnvironment.resolvedDevice}` : ""}</small></div>
              <code title={run.planHash}>plan:{run.planHash.slice(0, 10)}</code>
              <details className="remote-run-output"><summary>Cell output and artifacts</summary>{run.cells.map((cell) => <section key={cell.id}><header><strong>{cell.id}</strong><small>{cell.status} · {cell.duration_ms} ms</small></header>{cell.stdout && <pre>{cell.stdout}</pre>}{cell.stderr && <pre className="is-error">{cell.stderr}</pre>}</section>)}{run.cells.length === 0 && <p>No structured cell output was retained.</p>}{run.artifacts.length > 0 && <div className="remote-run-artifacts">{run.artifacts.map((artifact) => { const path = artifact.path.split("/").map(encodeURIComponent).join("/"); const base = `/api/notebooks/${encodeURIComponent(notebookIdForStudy(study!))}/modal/runs/${encodeURIComponent(run.runId)}`; return <figure key={artifact.path}>{artifact.mimeType.match(/^image\/(png|jpeg|webp)$/) && <img src={`${base}/artifacts/${path}`} alt={`Modal output ${artifact.path}`} />}<figcaption><span><strong>{artifact.path}</strong><small>{(artifact.sizeBytes / 1024).toFixed(1)} KB · sha256:{artifact.sha256.slice(0, 10)}</small></span><a href={`${base}/files/${path}`} aria-label={`Download Modal artifact ${artifact.path}`}><Download size={14} /></a></figcaption></figure>; })}</div>}</details>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function UnavailableView({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return <div className="study-empty-state"><FileCode2 size={22} /><h1>{title}</h1><p>{detail}</p><button type="button" className="primary-command" onClick={onAction}>{action}</button></div>;
}

function DeleteStudyDialog({ study, busy, error, onClose, onDelete }: { study: StudyInspection; busy: boolean; error: string; onClose: () => void; onDelete: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  useEffect(() => {
    if (busy) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div ref={dialogRef} tabIndex={-1} className="app-dialog delete-study-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-study-title">
        <header><div><span>Delete conversation</span><h1 id="delete-study-title">Delete this study?</h1></div><IconButton label="Close delete confirmation" onClick={onClose}><X size={18} /></IconButton></header>
        <div className="delete-study-summary"><strong>{studyTitle(study)}</strong><p>This permanently removes its messages, pinned study copy, dataset plan, notebook, runs, artifacts, and remote plans from this workspace. Shared source caches and other studies remain available.</p></div>
        {error && <div className="dialog-error" role="alert"><AlertCircle size={15} />{error}</div>}
        <footer><button type="button" className="secondary-command" onClick={onClose} disabled={busy} data-dialog-initial-focus>Cancel</button><button type="button" className="danger-command" onClick={onDelete} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}{busy ? "Deleting" : "Delete study"}</button></footer>
      </div>
    </div>
  );
}

function Inspector({ study, profile }: { study: StudyInspection | null; profile: SystemProfile | null }) {
  return (
    <aside className="study-inspector" aria-label="Study details">
      <div className="inspector-title"><div><span>Study details</span><small>{study ? new Date(study.createdAt).toLocaleString() : "No source"}</small></div><MoreHorizontal size={17} /></div>
      <InspectorSection title="Sources">
        {study?.paper && <a href={study.paper.url} target="_blank" rel="noreferrer"><FileText size={16} /><span><strong>{study.paper.title}</strong><small>{study.paper.source} · {study.paper.identifier || "metadata"}</small></span><ExternalLink size={13} /></a>}
        {study?.repository && <a href={study.repository.url} target="_blank" rel="noreferrer"><GitBranch size={16} /><span><strong>{study.repository.fullName}</strong><small>{study.repository.commitSha ? `commit ${study.repository.commitSha.slice(0, 7)}` : `branch ${study.repository.defaultBranch}`}</small></span><ExternalLink size={13} /></a>}
        {!study && <div className="detail-row"><FileText size={16} /><span><strong>Not pinned</strong><small>No remote request made</small></span></div>}
      </InspectorSection>
      <InspectorSection title="Computer">
        <div className="detail-row"><Cpu size={16} /><span><strong>{profile?.cpu || "Unavailable"}</strong><small>{profile ? `${profile.logicalCores} cores · ${formatPlatform(profile)}` : "Profile request failed"}</small></span>{profile && <CheckCircle2 size={15} className="ok-icon" />}</div>
        <div className="detail-row"><HardDrive size={16} /><span><strong>{profile ? formatBytes(profile.memoryBytes) : "Unknown memory"}</strong><small>{profile ? `${formatBytes(profile.freeMemoryBytes)} available` : "Profile request failed"}</small></span></div>
        <div className="detail-row"><CircuitBoard size={16} /><span><strong>{profile ? formatAccelerator(profile) : "Unknown accelerator"}</strong><small>{profile?.accelerators.some((accelerator) => accelerator.localRunnerAccess) ? "Reviewed accelerator runtime ready" : profile?.accelerators.length ? "Detected, but a native isolated runtime is still required" : profile ? "No supported local accelerator; CPU validation remains available" : "Profile request failed"}</small></span></div>
      </InspectorSection>
      <InspectorSection title="Isolation">
        <div className="detail-row"><ShieldCheck size={16} /><span><strong>{profile?.dockerReady ? "Docker connected" : "Docker unavailable"}</strong><small>{profile?.runnerImageReady ? `${profile.localRuntime.cpus} CPU · ${formatBytes(profile.localRuntime.memoryBytes)} · ${profile.localRuntime.timeoutSeconds} s` : "Source inspection remains available"}</small></span></div>
      </InspectorSection>
      <div className={`inspector-state ${study ? "is-complete" : ""}`}>
        {study ? <Check size={14} /> : <LoaderCircle size={14} />}
        <span>{study ? "Source intake persisted" : "Waiting for source intake"}</span>
      </div>
    </aside>
  );
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="inspector-section"><h2>{title}</h2>{children}</section>;
}

function NewStudyDialog({ onClose, onComplete }: { onClose: () => void; onComplete: (study: StudyInspection) => void }) {
  const dialogRef = useRef<HTMLFormElement>(null);
  useDialogFocus(dialogRef);
  const [paper, setPaper] = useState("");
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [repository, setRepository] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (submitting) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, submitting]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((!paper.trim() && !paperFile && !repository.trim()) || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      let uploadedPaperId: string | undefined;
      if (paperFile) {
        if (paperFile.size > 25 * 1024 * 1024) throw new Error("Paper PDF must be 25 MB or smaller");
        const uploadResponse = await fetch("/api/papers/upload", {
          method: "POST",
          headers: { "Content-Type": "application/pdf", "X-Paper-Filename": encodeURIComponent(paperFile.name) },
          body: paperFile,
        });
        const upload = await uploadResponse.json() as { uploadId?: string; error?: string };
        if (!uploadResponse.ok || !upload.uploadId) throw new Error(upload.error || "Paper PDF upload failed");
        uploadedPaperId = upload.uploadId;
      }
      const response = await fetch("/api/studies/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperUrl: paper.trim() || undefined, uploadedPaperId, repositoryUrl: repository.trim() || undefined }),
      });
      const body = await response.json() as StudyInspection & { error?: string };
      if (!response.ok) throw new Error(body.error || "Source inspection failed");
      onComplete(body);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !submitting && onClose()}>
      <form ref={dialogRef} tabIndex={-1} className="app-dialog new-study-dialog" role="dialog" aria-modal="true" aria-labelledby="new-study-title" onSubmit={submit}>
        <header><div><span>New study</span><h1 id="new-study-title">Inspect sources</h1></div><IconButton label="Close" onClick={onClose}><X size={18} /></IconButton></header>
        <p>Remote metadata or a local PDF is extracted and pinned before analysis begins.</p>
        <label><span>Paper URL or DOI</span><div><FileText size={17} /><input data-dialog-initial-focus aria-label="Paper URL or DOI" placeholder="https://arxiv.org/abs/..." value={paper} onChange={(event) => setPaper(event.target.value)} disabled={submitting || Boolean(paperFile)} /></div></label>
        <label><span>Paper PDF</span><div className="paper-upload-field"><FileText size={17} /><input aria-label="Paper PDF" type="file" accept="application/pdf,.pdf" onChange={(event) => setPaperFile(event.target.files?.[0] || null)} disabled={submitting || Boolean(paper.trim())} /></div></label>
        <label><span>GitHub repository</span><div><GitBranch size={17} /><input aria-label="GitHub repository" placeholder="https://github.com/owner/repository" value={repository} onChange={(event) => setRepository(event.target.value)} disabled={submitting} /></div></label>
        {error && <div className="dialog-error" role="alert"><AlertCircle size={15} />{error}</div>}
        <footer><button type="button" className="secondary-command" onClick={onClose} disabled={submitting}>Cancel</button><button type="submit" className="primary-command" disabled={(!paper.trim() && !paperFile && !repository.trim()) || submitting}>{submitting ? <LoaderCircle className="spin" size={15} /> : <ArrowUp size={15} />}{submitting ? "Inspecting sources" : "Start inspection"}</button></footer>
      </form>
    </div>
  );
}
