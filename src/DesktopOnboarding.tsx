import { Check, Cloud, Code2, Container, ExternalLink, FolderOpen, LoaderCircle, LogIn, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SystemProfile } from "./study-types";
import { useDialogFocus } from "./use-dialog-focus";

interface ModalStatus {
  installed: boolean;
  authenticated: boolean;
  ready: boolean;
  version?: string;
  message?: string;
}

interface DesktopInfo {
  appName: string;
  version: string;
  platform: string;
  dataPath: string;
}

export default function DesktopOnboarding({ profile, onProfileChange, onClose, onOpenRemote }: {
  profile: SystemProfile | null;
  onProfileChange: (profile: SystemProfile) => void;
  onClose: () => void;
  onOpenRemote: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [modal, setModal] = useState<ModalStatus | null>(null);
  const [busy, setBusy] = useState<"codex" | "runner" | "folder" | "refresh" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useDialogFocus(dialogRef);

  async function refreshEnvironment(): Promise<void> {
    setBusy("refresh");
    setError("");
    try {
      const [profileResponse, modalResponse] = await Promise.all([
        fetch("/api/system/profile"),
        fetch("/api/modal/status"),
      ]);
      const profileBody = await profileResponse.json() as SystemProfile & { error?: string };
      const modalBody = await modalResponse.json() as ModalStatus & { error?: string };
      if (!profileResponse.ok) throw new Error(profileBody.error || "Computer diagnostics failed");
      if (!modalResponse.ok) throw new Error(modalBody.error || "Modal status check failed");
      onProfileChange(profileBody);
      setModal(modalBody);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let active = true;
    window.codexDesktop?.getInfo().then((value) => { if (active) setInfo(value); }).catch(() => undefined);
    fetch("/api/modal/status")
      .then(async (response) => {
        const body = await response.json() as ModalStatus & { error?: string };
        if (!response.ok) throw new Error(body.error || "Modal status check failed");
        if (active) setModal(body);
      })
      .catch((statusError) => { if (active) setError(statusError instanceof Error ? statusError.message : String(statusError)); });
    return () => { active = false; };
  }, []);

  async function signInCodex(): Promise<void> {
    if (!window.codexDesktop || busy) return;
    setBusy("codex");
    setError("");
    setNotice("A browser window may open to complete Codex sign-in.");
    const result = await window.codexDesktop.signInCodex();
    if (result.ok) setNotice(result.message);
    else setError(result.message);
    setBusy(null);
    await refreshEnvironment();
  }

  async function prepareRunner(): Promise<void> {
    if (!window.codexDesktop || busy) return;
    setBusy("runner");
    setError("");
    setNotice("Building the pinned local runner. This can take several minutes the first time.");
    const result = await window.codexDesktop.buildRunner();
    if (result.ok) setNotice(result.message);
    else setError(result.message);
    setBusy(null);
    await refreshEnvironment();
  }

  async function showDataFolder(): Promise<void> {
    if (!window.codexDesktop || busy) return;
    setBusy("folder");
    const result = await window.codexDesktop.showDataFolder();
    if (!result.ok) setError(result.message);
    setBusy(null);
  }

  const executionReady = Boolean(profile?.runnerImageReady || modal?.ready);
  const setupReady = Boolean(profile?.codexAgent.ready && executionReady);

  return (
    <div className="dialog-backdrop desktop-onboarding-backdrop" role="presentation">
      <div ref={dialogRef} tabIndex={-1} className="app-dialog desktop-onboarding" role="dialog" aria-modal="true" aria-labelledby="desktop-onboarding-title">
        <header>
          <div><span>Local setup</span><h1 id="desktop-onboarding-title">Prepare this computer</h1></div>
          <button type="button" className="icon-button" aria-label="Close setup" onClick={onClose}><X size={18} /></button>
        </header>
        <p>Codex handles research reasoning. Choose Docker for isolated local cells, Modal for remote GPU execution, or continue with source inspection only.</p>

        <div className="onboarding-checks">
          <section className="onboarding-row">
            <span className="onboarding-row-icon"><Code2 size={18} /></span>
            <div><strong>Codex agent</strong><small>{profile?.codexAgent.ready ? `${profile.codexAgent.version || "Codex CLI"} · ${profile.codexAgent.authMode === "api-key" ? "API key" : "ChatGPT"}` : profile?.codexAgent.message || "Checking Codex installation"}</small></div>
            {profile?.codexAgent.ready ? <span className="onboarding-state"><Check size={14} /> Ready</span> : profile?.codexAgent.installed ? <button type="button" className="secondary-command" onClick={() => void signInCodex()} disabled={Boolean(busy)}>{busy === "codex" ? <LoaderCircle className="spin" size={14} /> : <LogIn size={14} />} Sign in</button> : <a className="secondary-command" href="https://learn.chatgpt.com/docs/codex-cli" target="_blank" rel="noreferrer">Install <ExternalLink size={13} /></a>}
          </section>

          <section className="onboarding-row">
            <span className="onboarding-row-icon"><Container size={18} /></span>
            <div><strong>Local isolated execution</strong><small>{profile?.runnerImageReady ? `${profile.runnerImage} · ${profile.runnerPlatform?.os || profile.platform}/${profile.runnerPlatform?.arch || profile.arch}` : profile?.dockerReady ? "Docker is connected; build the pinned runner once" : "Optional · install and start Docker Desktop or Docker Engine"}</small></div>
            {profile?.runnerImageReady ? <span className="onboarding-state"><Check size={14} /> Ready</span> : profile?.dockerReady ? <button type="button" className="secondary-command" onClick={() => void prepareRunner()} disabled={Boolean(busy)}>{busy === "runner" ? <LoaderCircle className="spin" size={14} /> : <Container size={14} />} Build runner</button> : <a className="secondary-command" href="https://docs.docker.com/get-started/get-docker/" target="_blank" rel="noreferrer">Get Docker <ExternalLink size={13} /></a>}
          </section>

          <section className="onboarding-row">
            <span className="onboarding-row-icon"><Cloud size={18} /></span>
            <div><strong>Modal GPU</strong><small>{modal?.ready ? `${modal.version || "Modal"} · credentials verified` : modal?.message || "Optional remote CUDA execution with a personal token"}</small></div>
            {modal?.ready ? <span className="onboarding-state"><Check size={14} /> Ready</span> : <button type="button" className="secondary-command" onClick={onOpenRemote}><Cloud size={14} /> Configure</button>}
          </section>

          <section className="onboarding-row">
            <span className="onboarding-row-icon"><FolderOpen size={18} /></span>
            <div><strong>Local workspace data</strong><small title={info?.dataPath}>{info?.dataPath || "Resolving the app data directory"}</small></div>
            <button type="button" className="secondary-command" onClick={() => void showDataFolder()} disabled={Boolean(busy)}>{busy === "folder" ? <LoaderCircle className="spin" size={14} /> : <FolderOpen size={14} />} Open</button>
          </section>
        </div>

        {notice && <div className="onboarding-notice" role="status">{notice}</div>}
        {error && <div className="dialog-error onboarding-error" role="alert">{error}</div>}

        <footer>
          <button type="button" className="secondary-command" onClick={() => void refreshEnvironment()} disabled={Boolean(busy)}>{busy === "refresh" ? <LoaderCircle className="spin" size={14} /> : null} Refresh</button>
          <button type="button" className="primary-command" data-dialog-initial-focus onClick={onClose}>{setupReady ? "Finish setup" : "Continue with available tools"}</button>
        </footer>
      </div>
    </div>
  );
}
