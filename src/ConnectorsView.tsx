import { AlertCircle, Bot, Cable, Cpu, LoaderCircle, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Webhook, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SkillCommand } from "./ChatComposer";
import { connectorHookEvents } from "./connector-types";
import type { ConnectorAgent, ConnectorConfig, ConnectorHook, ConnectorHookEvent, ConnectorSkill } from "./connector-types";
import { useDialogFocus } from "./use-dialog-focus";
import type { CodexModelFamily, CodexModelRoute } from "./model-routing";

type ConnectorTab = "agents" | "hooks" | "skills";
type EditorState = { kind: "agent"; value: ConnectorAgent | null } | { kind: "hook"; value: ConnectorHook | null } | { kind: "skill"; value: ConnectorSkill | null };
type DeleteState = { kind: "agent" | "hook" | "skill"; id: string; name: string };

const hookLabels: Record<ConnectorHookEvent, string> = {
  "chat.before": "Before study response",
  "notebook.review.before": "Before cell review",
  "notebook.generate.before": "Before notebook generation",
  "figure.generate.before": "Before figure generation",
  "dataset.plan.before": "Before dataset planning",
};

async function connectorRequest(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<ConnectorConfig> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as ConnectorConfig & { error?: string };
  if (!response.ok) throw new Error(result.error || "Connector change failed");
  return result;
}

export default function ConnectorsView({ config, loading, loadError, skills, modelRouting, onRetry, onConfigChange, onUse }: {
  config: ConnectorConfig | null;
  loading: boolean;
  loadError: string;
  skills: SkillCommand[];
  modelRouting?: CodexModelRoute[];
  onRetry: () => void;
  onConfigChange: (config: ConnectorConfig) => void;
  onUse: (command: string) => void;
}) {
  const [tab, setTab] = useState<ConnectorTab>("agents");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<DeleteState | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const tabId = useId();

  function moveTabFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    const tabs: ConnectorTab[] = ["agents", "hooks", "skills"];
    const currentIndex = tabs.indexOf(tab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[nextIndex]);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }

  useEffect(() => {
    if ((!editor && !deleting) || pending) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setEditor(null);
      setDeleting(null);
      setError("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleting, editor, pending]);

  async function change(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, pendingId: string): Promise<boolean> {
    setPending(pendingId);
    setError("");
    try {
      onConfigChange(await connectorRequest(path, method, body));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setPending("");
    }
  }

  async function saveAgent(input: AgentInput): Promise<void> {
    const id = editor?.kind === "agent" ? editor.value?.id : undefined;
    if (await change(id ? `/api/connectors/agents/${encodeURIComponent(id)}` : "/api/connectors/agents", id ? "PATCH" : "POST", input, id || "new-agent")) setEditor(null);
  }

  async function saveHook(input: HookInput): Promise<void> {
    const id = editor?.kind === "hook" ? editor.value?.id : undefined;
    if (await change(id ? `/api/connectors/hooks/${encodeURIComponent(id)}` : "/api/connectors/hooks", id ? "PATCH" : "POST", input, id || "new-hook")) setEditor(null);
  }

  async function saveSkill(input: SkillInput): Promise<void> {
    const id = editor?.kind === "skill" ? editor.value?.id : undefined;
    if (await change(id ? `/api/connectors/skills/${encodeURIComponent(id)}` : "/api/connectors/skills", id ? "PATCH" : "POST", input, id || "new-skill")) setEditor(null);
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return;
    const path = `/api/connectors/${deleting.kind === "agent" ? "agents" : deleting.kind === "hook" ? "hooks" : "skills"}/${encodeURIComponent(deleting.id)}`;
    if (await change(path, "DELETE", {}, `delete-${deleting.id}`)) setDeleting(null);
  }

  async function toggleAgent(agent: ConnectorAgent): Promise<void> {
    if (!config) return;
    const optimistic = { ...config, agents: config.agents.map((candidate) => candidate.id === agent.id ? { ...candidate, enabled: !agent.enabled } : candidate) };
    onConfigChange(optimistic);
    if (!await change(`/api/connectors/agents/${encodeURIComponent(agent.id)}`, "PATCH", { enabled: !agent.enabled }, agent.id)) onConfigChange(config);
  }

  async function toggleHook(hook: ConnectorHook): Promise<void> {
    if (!config) return;
    const optimistic = { ...config, hooks: config.hooks.map((candidate) => candidate.id === hook.id ? { ...candidate, enabled: !hook.enabled } : candidate) };
    onConfigChange(optimistic);
    if (!await change(`/api/connectors/hooks/${encodeURIComponent(hook.id)}`, "PATCH", { enabled: !hook.enabled }, hook.id)) onConfigChange(config);
  }

  async function toggleSkill(skill: ConnectorSkill): Promise<void> {
    if (!config) return;
    const optimistic = { ...config, skills: config.skills.map((candidate) => candidate.id === skill.id ? { ...candidate, enabled: !skill.enabled } : candidate) };
    onConfigChange(optimistic);
    if (!await change(`/api/connectors/skills/${encodeURIComponent(skill.id)}`, "PATCH", { enabled: !skill.enabled }, skill.id)) onConfigChange(config);
  }

  return (
    <div className="content-view connectors-view">
      <div className="content-header connector-header">
        <div><span>Local extensions</span><h1>Connectors</h1></div>
        <button type="button" className="primary-command" disabled={!config || loading} onClick={() => setEditor(tab === "agents" ? { kind: "agent", value: null } : tab === "hooks" ? { kind: "hook", value: null } : { kind: "skill", value: null })}><Plus size={15} /> New {tab === "agents" ? "agent" : tab === "hooks" ? "hook" : "skill"}</button>
      </div>

      <ModelRoutingPolicy routes={modelRouting || []} />

      <div className="connector-tabs" role="tablist" tabIndex={-1} aria-label="Connector types" onKeyDown={moveTabFocus}>
        <button id={`${tabId}-tab-agents`} type="button" role="tab" aria-controls={`${tabId}-panel-agents`} aria-selected={tab === "agents"} tabIndex={tab === "agents" ? 0 : -1} onClick={() => setTab("agents")}><Bot size={15} />Agents{config && <small>{config.agents.length}</small>}</button>
        <button id={`${tabId}-tab-hooks`} type="button" role="tab" aria-controls={`${tabId}-panel-hooks`} aria-selected={tab === "hooks"} tabIndex={tab === "hooks" ? 0 : -1} onClick={() => setTab("hooks")}><Webhook size={15} />Hooks{config && <small>{config.hooks.length}</small>}</button>
        <button id={`${tabId}-tab-skills`} type="button" role="tab" aria-controls={`${tabId}-panel-skills`} aria-selected={tab === "skills"} tabIndex={tab === "skills" ? 0 : -1} onClick={() => setTab("skills")}><Cable size={15} />Skills<small>{skills.length + (config?.skills.length || 0)}</small></button>
      </div>

      {(loadError || error) && <div className="connector-error" role="alert"><AlertCircle size={15} /><span>{error || loadError}</span>{loadError && <button type="button" onClick={onRetry}><RefreshCw size={14} /> Retry</button>}</div>}
      {loading && <div className="connector-empty"><LoaderCircle className="spin" size={18} /><span>Loading connectors</span></div>}

      {!loading && config && tab === "agents" && (
        <div id={`${tabId}-panel-agents`} className="connector-tab-panel" role="tabpanel" aria-labelledby={`${tabId}-tab-agents`}>
        <section className="connector-list" aria-label="Custom agents">
          {config.agents.length === 0 && <div className="connector-empty"><Bot size={18} /><strong>No custom agents</strong><button type="button" className="quiet-button" onClick={() => setEditor({ kind: "agent", value: null })}>Create agent</button></div>}
          {config.agents.map((agent) => <article key={agent.id} className={!agent.enabled ? "is-disabled" : ""}>
            <Bot size={18} />
            <div className="connector-copy"><div><strong>{agent.name}</strong><code>{agent.command}</code></div><p>{agent.description}</p><small>Composer selector · Explicit agent</small></div>
            <label className="connector-toggle"><input type="checkbox" checked={agent.enabled} disabled={Boolean(pending)} onChange={() => void toggleAgent(agent)} /><span /><small>{agent.enabled ? "On" : "Off"}</small></label>
            <div className="connector-actions"><button type="button" aria-label={`Edit ${agent.name}`} title={`Edit ${agent.name}`} onClick={() => setEditor({ kind: "agent", value: agent })}><Pencil size={15} /></button><button type="button" aria-label={`Delete ${agent.name}`} title={`Delete ${agent.name}`} onClick={() => setDeleting({ kind: "agent", id: agent.id, name: agent.name })}><Trash2 size={15} /></button></div>
          </article>)}
        </section>
        </div>
      )}

      {!loading && config && tab === "hooks" && (
        <div id={`${tabId}-panel-hooks`} className="connector-tab-panel" role="tabpanel" aria-labelledby={`${tabId}-tab-hooks`}>
        <section className="connector-list" aria-label="Prompt hooks">
          {config.hooks.length === 0 && <div className="connector-empty"><Webhook size={18} /><strong>No hooks</strong><button type="button" className="quiet-button" onClick={() => setEditor({ kind: "hook", value: null })}>Create hook</button></div>}
          {config.hooks.map((hook) => <article key={hook.id} className={!hook.enabled ? "is-disabled" : ""}>
            <Webhook size={18} />
            <div className="connector-copy"><div><strong>{hook.name}</strong><code>{hookLabels[hook.event]}</code></div><p>{hook.instructions}</p><small>Codex prompt hook · Local configuration</small></div>
            <label className="connector-toggle"><input type="checkbox" checked={hook.enabled} disabled={Boolean(pending)} onChange={() => void toggleHook(hook)} /><span /><small>{hook.enabled ? "On" : "Off"}</small></label>
            <div className="connector-actions"><button type="button" aria-label={`Edit ${hook.name}`} title={`Edit ${hook.name}`} onClick={() => setEditor({ kind: "hook", value: hook })}><Pencil size={15} /></button><button type="button" aria-label={`Delete ${hook.name}`} title={`Delete ${hook.name}`} onClick={() => setDeleting({ kind: "hook", id: hook.id, name: hook.name })}><Trash2 size={15} /></button></div>
          </article>)}
        </section>
        </div>
      )}

      {!loading && config && tab === "skills" && <div id={`${tabId}-panel-skills`} className="connector-tab-panel" role="tabpanel" aria-labelledby={`${tabId}-tab-skills`}>
        <section className="connector-list" aria-label="Custom skills">
          <div className="connector-group-label"><span>Custom</span><small>Explicit slash workflows</small></div>
          {config.skills.length === 0 && <div className="connector-empty connector-empty-compact"><Cable size={18} /><strong>No custom skills</strong><button type="button" className="quiet-button" onClick={() => setEditor({ kind: "skill", value: null })}>Create skill</button></div>}
          {config.skills.map((skill) => <article key={skill.id} className={!skill.enabled ? "is-disabled" : ""}>
            <Cable size={18} />
            <div className="connector-copy"><div><strong>{skill.name}</strong><code>/{skill.command}</code></div><p>{skill.description}</p><small>Custom workflow · Explicit invocation</small></div>
            <label className="connector-toggle"><input type="checkbox" checked={skill.enabled} disabled={Boolean(pending)} onChange={() => void toggleSkill(skill)} /><span /><small>{skill.enabled ? "On" : "Off"}</small></label>
            <div className="connector-actions"><button type="button" aria-label={`Edit ${skill.name}`} title={`Edit ${skill.name}`} onClick={() => setEditor({ kind: "skill", value: skill })}><Pencil size={15} /></button><button type="button" aria-label={`Delete ${skill.name}`} title={`Delete ${skill.name}`} onClick={() => setDeleting({ kind: "skill", id: skill.id, name: skill.name })}><Trash2 size={15} /></button></div>
          </article>)}
        </section>
        <section className="connector-list built-in-connector-list" aria-label="Built-in skills"><div className="connector-group-label"><span>Project</span><small>Versioned and contract-tested</small></div>{skills.map((skill) => <article key={skill.name}><Cable size={18} /><div className="connector-copy"><div><strong>{skill.label}</strong><code>/{skill.name}</code></div><p>{skill.detail}</p><small>Project skill · Versioned with workspace</small></div><button type="button" className="quiet-button" aria-label={`Use ${skill.name} in chat`} onClick={() => onUse(skill.name)}>Add request</button></article>)}</section>
      </div>}

      {editor?.kind === "agent" && <AgentDialog key={editor.value?.id || "new-agent"} value={editor.value} busy={Boolean(pending)} error={error} onClose={() => setEditor(null)} onSave={(input) => void saveAgent(input)} />}
      {editor?.kind === "hook" && <HookDialog key={editor.value?.id || "new-hook"} value={editor.value} busy={Boolean(pending)} error={error} onClose={() => setEditor(null)} onSave={(input) => void saveHook(input)} />}
      {editor?.kind === "skill" && <SkillDialog key={editor.value?.id || "new-skill"} value={editor.value} busy={Boolean(pending)} error={error} onClose={() => setEditor(null)} onSave={(input) => void saveSkill(input)} />}
      {deleting && <DeleteDialog name={deleting.name} kind={deleting.kind} busy={Boolean(pending)} error={error} onClose={() => setDeleting(null)} onDelete={() => void confirmDelete()} />}
    </div>
  );
}

const modelFamilyOrder: CodexModelFamily[] = ["sol", "terra", "luna"];

function ModelRoutingPolicy({ routes }: { routes: CodexModelRoute[] }) {
  if (routes.length === 0) return null;
  return <section className="model-routing-policy" aria-labelledby="model-routing-title">
    <header><div><span>Codex execution policy</span><h2 id="model-routing-title">GPT-5.6 routing</h2></div><small>{routes[0].policyVersion}</small></header>
    <div className="model-routing-list">
      {modelFamilyOrder.map((family) => {
        const familyRoutes = routes.filter((route) => route.family === family);
        if (familyRoutes.length === 0) return null;
        const efforts = [...new Set(familyRoutes.map((route) => route.reasoningEffort))];
        return <article key={family}>
          <Cpu size={17} />
          <div><strong>{familyRoutes[0].model}</strong><span>{familyRoutes.map((route) => route.purpose).join(" · ")}</span></div>
          <small>{efforts.join(" / ")} reasoning</small>
        </article>;
      })}
      <article className="is-deterministic">
        <ShieldCheck size={17} />
        <div><strong>Deterministic harness</strong><span>Retrieval, schemas, citations, registry checks, Docker smoke tests, and hashes</span></div>
        <small>No model call</small>
      </article>
    </div>
  </section>;
}

interface AgentInput { name: string; command: string; description: string; instructions: string; enabled: boolean }

function AgentDialog({ value, busy, error, onClose, onSave }: { value: ConnectorAgent | null; busy: boolean; error: string; onClose: () => void; onSave: (input: AgentInput) => void }) {
  const dialogRef = useRef<HTMLFormElement>(null);
  useDialogFocus(dialogRef);
  const [name, setName] = useState(value?.name || "");
  const [command, setCommand] = useState(value?.command || "");
  const [description, setDescription] = useState(value?.description || "");
  const [instructions, setInstructions] = useState(value?.instructions || "");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    onSave({ name: name.trim(), command: command.trim().toLowerCase(), description: description.trim(), instructions: instructions.trim(), enabled: value?.enabled ?? true });
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><form ref={dialogRef} tabIndex={-1} className="app-dialog connector-dialog" role="dialog" aria-modal="true" aria-labelledby="connector-agent-title" onSubmit={submit}>
    <header><div><span>Custom agent</span><h1 id="connector-agent-title">{value ? "Edit agent" : "New agent"}</h1></div><button type="button" className="icon-button" aria-label="Close agent editor" onClick={onClose}><X size={18} /></button></header>
    <div className="connector-form-grid"><label><span>Name</span><input aria-label="Agent name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} /></label><label><span>Agent handle</span><input aria-label="Agent handle" value={command} onChange={(event) => setCommand(event.target.value.replace(/^\//, "").toLowerCase())} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label className="is-wide"><span>Description</span><input aria-label="Agent description" value={description} onChange={(event) => setDescription(event.target.value)} required minLength={2} maxLength={300} /></label><label className="is-wide"><span>Instructions</span><textarea aria-label="Agent instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} required minLength={10} maxLength={12000} rows={7} /></label></div>
    {error && <div className="dialog-error" role="alert"><AlertCircle size={15} />{error}</div>}
    <footer><button type="button" className="secondary-command" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="primary-command" disabled={busy}>{busy && <LoaderCircle className="spin" size={14} />}{value ? "Save" : "Create agent"}</button></footer>
  </form></div>;
}

interface HookInput { name: string; event: ConnectorHookEvent; instructions: string; enabled: boolean }

interface SkillInput { name: string; command: string; description: string; instructions: string; enabled: boolean }

function SkillDialog({ value, busy, error, onClose, onSave }: { value: ConnectorSkill | null; busy: boolean; error: string; onClose: () => void; onSave: (input: SkillInput) => void }) {
  const dialogRef = useRef<HTMLFormElement>(null);
  useDialogFocus(dialogRef);
  const [name, setName] = useState(value?.name || "");
  const [command, setCommand] = useState(value?.command || "");
  const [description, setDescription] = useState(value?.description || "");
  const [instructions, setInstructions] = useState(value?.instructions || "");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    onSave({ name: name.trim(), command: command.trim().toLowerCase(), description: description.trim(), instructions: instructions.trim(), enabled: value?.enabled ?? true });
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><form ref={dialogRef} tabIndex={-1} className="app-dialog connector-dialog" role="dialog" aria-modal="true" aria-labelledby="connector-skill-title" onSubmit={submit}>
    <header><div><span>Custom skill</span><h1 id="connector-skill-title">{value ? "Edit skill" : "New skill"}</h1></div><button type="button" className="icon-button" aria-label="Close skill editor" onClick={onClose}><X size={18} /></button></header>
    <div className="connector-form-grid"><label><span>Name</span><input aria-label="Skill name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} /></label><label><span>Slash command</span><div className="command-field"><b>/</b><input aria-label="Skill slash command" value={command} onChange={(event) => setCommand(event.target.value.replace(/^\//, "").toLowerCase())} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></div></label><label className="is-wide"><span>Description</span><input aria-label="Skill description" value={description} onChange={(event) => setDescription(event.target.value)} required minLength={2} maxLength={300} /></label><label className="is-wide"><span>Workflow and output contract</span><textarea aria-label="Skill instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} required minLength={30} maxLength={12000} rows={10} /></label></div>
    {error && <div className="dialog-error" role="alert"><AlertCircle size={15} />{error}</div>}
    <footer><button type="button" className="secondary-command" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="primary-command" disabled={busy}>{busy && <LoaderCircle className="spin" size={14} />}{value ? "Save" : "Create skill"}</button></footer>
  </form></div>;
}

function HookDialog({ value, busy, error, onClose, onSave }: { value: ConnectorHook | null; busy: boolean; error: string; onClose: () => void; onSave: (input: HookInput) => void }) {
  const dialogRef = useRef<HTMLFormElement>(null);
  useDialogFocus(dialogRef);
  const [name, setName] = useState(value?.name || "");
  const [hookEvent, setHookEvent] = useState<ConnectorHookEvent>(value?.event || "chat.before");
  const [instructions, setInstructions] = useState(value?.instructions || "");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    onSave({ name: name.trim(), event: hookEvent, instructions: instructions.trim(), enabled: value?.enabled ?? true });
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><form ref={dialogRef} tabIndex={-1} className="app-dialog connector-dialog" role="dialog" aria-modal="true" aria-labelledby="connector-hook-title" onSubmit={submit}>
    <header><div><span>Prompt hook</span><h1 id="connector-hook-title">{value ? "Edit hook" : "New hook"}</h1></div><button type="button" className="icon-button" aria-label="Close hook editor" onClick={onClose}><X size={18} /></button></header>
    <div className="connector-form-grid"><label><span>Name</span><input aria-label="Hook name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} /></label><label><span>Event</span><select aria-label="Hook event" value={hookEvent} onChange={(event) => setHookEvent(event.target.value as ConnectorHookEvent)}>{connectorHookEvents.map((event) => <option value={event} key={event}>{hookLabels[event]}</option>)}</select></label><label className="is-wide"><span>Instructions</span><textarea aria-label="Hook instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} required minLength={10} maxLength={12000} rows={8} /></label></div>
    {error && <div className="dialog-error" role="alert"><AlertCircle size={15} />{error}</div>}
    <footer><button type="button" className="secondary-command" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="primary-command" disabled={busy}>{busy && <LoaderCircle className="spin" size={14} />}{value ? "Save" : "Create hook"}</button></footer>
  </form></div>;
}

function DeleteDialog({ name, kind, busy, error, onClose, onDelete }: { name: string; kind: "agent" | "hook" | "skill"; busy: boolean; error: string; onClose: () => void; onDelete: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><div ref={dialogRef} tabIndex={-1} className="app-dialog connector-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-connector-title"><header><div><span>Remove {kind}</span><h1 id="delete-connector-title">Delete {name}?</h1></div><button type="button" className="icon-button" aria-label="Close delete confirmation" onClick={onClose}><X size={18} /></button></header>{error && <div className="dialog-error" role="alert"><AlertCircle size={15} />{error}</div>}<footer><button type="button" className="secondary-command" onClick={onClose} disabled={busy} data-dialog-initial-focus>Cancel</button><button type="button" className="danger-command" onClick={onDelete} disabled={busy}>{busy && <LoaderCircle className="spin" size={14} />}Delete</button></footer></div></div>;
}
