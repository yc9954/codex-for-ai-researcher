import { ArrowUp, Check, ChevronDown, Command, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";

export interface SkillCommand {
  name: string;
  label: string;
  detail: string;
}

function highlightedDraft(draft: string, skills: SkillCommand[]) {
  const nodes: ReactNode[] = [];
  const commandPattern = /(^|\s)(\/[a-z0-9-]*)/gi;
  let cursor = 0;

  for (const match of draft.matchAll(commandPattern)) {
    const prefixLength = match[1].length;
    const start = (match.index || 0) + prefixLength;
    const command = match[2];
    const end = start + command.length;
    const query = command.slice(1).toLowerCase();
    const exactSkill = skills.find((skill) => skill.name === query);
    const activeQuery = end === draft.length && skills.some((skill) => (
      skill.name.includes(query) || skill.label.toLowerCase().includes(query)
    ));

    if (start > cursor) nodes.push(draft.slice(cursor, start));
    nodes.push(exactSkill || activeQuery
      ? <span className={`composer-skill-highlight ${exactSkill ? "is-exact" : "is-query"}`} data-skill-command={exactSkill?.name || "query"} key={`${start}:${command}`}>{command}</span>
      : command);
    cursor = end;
  }

  if (cursor < draft.length) nodes.push(draft.slice(cursor));
  return nodes;
}

export default function ChatComposer({ draft, busy, skills, agents, selectedAgentId, onAgentChange, onDraftChange, onAttach, onSubmit }: {
  draft: string;
  busy: boolean;
  skills: SkillCommand[];
  agents: Array<{ id: string; name: string; detail: string }>;
  selectedAgentId: string | null;
  onAgentChange: (id: string | null) => void;
  onDraftChange: (value: string) => void;
  onAttach: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [activeSelection, setActiveSelection] = useState({ key: "", index: 0 });
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const agentSelectRef = useRef<HTMLDivElement>(null);
  const agentTriggerRef = useRef<HTMLButtonElement>(null);
  const skillMenuId = useId();
  const agentMenuId = useId();
  const slashMatch = draft.match(/(^|\s)\/([a-z0-9-]*)$/i);
  const query = slashMatch?.[2].toLowerCase() || "";
  const menuKey = `${slashMatch?.index || 0}:${query}`;
  const suggestions = useMemo(() => slashMatch ? skills.filter((skill) => (
    skill.name.includes(query) || skill.label.toLowerCase().includes(query)
  )) : [], [query, skills, slashMatch]);
  const menuOpen = suggestions.length > 0 && dismissedQuery !== menuKey;
  const activeIndex = activeSelection.key === menuKey ? Math.min(activeSelection.index, suggestions.length - 1) : 0;
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || null;

  function focusAgentOption(index: number) {
    requestAnimationFrame(() => {
      const options = agentSelectRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
      if (!options?.length) return;
      options[(index + options.length) % options.length].focus();
    });
  }

  function selectAgent(id: string | null) {
    onAgentChange(id);
    setAgentMenuOpen(false);
    requestAnimationFrame(() => agentTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (!agentMenuOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setAgentMenuOpen(false);
        requestAnimationFrame(() => agentTriggerRef.current?.focus());
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !agentSelectRef.current?.contains(event.target)) setAgentMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [agentMenuOpen]);

  function selectSkill(skill: SkillCommand) {
    if (!slashMatch || slashMatch.index == null) return;
    const commandStart = slashMatch.index + slashMatch[1].length;
    onDraftChange(`${draft.slice(0, commandStart)}/${skill.name} `);
    setDismissedQuery(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveSelection({ key: menuKey, index: (activeIndex + direction + suggestions.length) % suggestions.length });
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectSkill(suggestions[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedQuery(menuKey);
        return;
      }
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form className="chatgpt-composer" onSubmit={onSubmit}>
      {menuOpen && <div id={skillMenuId} className="skill-command-menu" role="listbox" aria-label="Project skills">
        <header><Command size={14} /><span>Commands</span></header>
        <div>
          {suggestions.map((skill, index) => <button
            type="button"
            id={`${skillMenuId}-option-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            key={skill.name}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveSelection({ key: menuKey, index })}
            onClick={() => selectSkill(skill)}
          >
            <code>/{skill.name}</code>
            <span><strong>{skill.label}</strong><small>{skill.detail}</small></span>
          </button>)}
        </div>
      </div>}
      <button type="button" className="chatgpt-composer-attach" aria-label="Attach paper or repository" title="Attach paper or repository" onClick={onAttach}>
        <Plus size={20} />
      </button>
      <div className="composer-input-shell">
        <div className="composer-input-highlight" aria-hidden="true" ref={highlightRef}>{highlightedDraft(draft, skills)}</div>
        <textarea
          ref={textareaRef}
          role="combobox"
          aria-label="Message the research workspace"
          aria-autocomplete="list"
          aria-controls={menuOpen ? skillMenuId : undefined}
          aria-expanded={menuOpen}
          aria-activedescendant={menuOpen ? `${skillMenuId}-option-${activeIndex}` : undefined}
          placeholder="Ask about the paper, code, dataset, or plan"
          rows={1}
          value={draft}
          onChange={(event) => { setDismissedQuery(null); onDraftChange(event.target.value); }}
          onKeyDown={submitOnEnter}
          onScroll={(event) => {
            if (!highlightRef.current) return;
            highlightRef.current.scrollTop = event.currentTarget.scrollTop;
            highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }}
        />
      </div>
      <div className="composer-agent-select" ref={agentSelectRef}>
        <button
          ref={agentTriggerRef}
          type="button"
          className="composer-agent-trigger"
          aria-label="Select research agent"
          aria-haspopup="listbox"
          aria-controls={agentMenuOpen ? agentMenuId : undefined}
          aria-expanded={agentMenuOpen}
          onClick={() => setAgentMenuOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            setAgentMenuOpen(true);
            focusAgentOption(event.key === "ArrowDown" ? 0 : -1);
          }}
          disabled={busy}
        ><span>{selectedAgent?.name || "Auto"}</span><ChevronDown size={13} /></button>
        {agentMenuOpen && <div
          id={agentMenuId}
          className="composer-agent-menu"
          role="listbox"
          tabIndex={-1}
          aria-label="Research agents"
          onKeyDown={(event) => {
            const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
            const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setAgentMenuOpen(false);
              agentTriggerRef.current?.focus();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const direction = event.key === "ArrowDown" ? 1 : -1;
              options[(currentIndex + direction + options.length) % options.length]?.focus();
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              options[event.key === "Home" ? 0 : options.length - 1]?.focus();
            }
          }}
        >
          <button type="button" role="option" aria-selected={!selectedAgentId} onClick={() => selectAgent(null)}><span><strong>Auto</strong><small>Selects the evidence-grounded mediator for this request</small></span>{!selectedAgentId && <Check size={14} />}</button>
          {agents.map((agent) => <button type="button" role="option" aria-selected={agent.id === selectedAgentId} key={agent.id} onClick={() => selectAgent(agent.id)}><span><strong>{agent.name}</strong><small>{agent.detail}</small></span>{agent.id === selectedAgentId && <Check size={14} />}</button>)}
        </div>}
      </div>
      <button type="submit" className="chatgpt-composer-send" aria-label="Send message" disabled={!draft.trim() || busy}>
        <ArrowUp size={18} />
      </button>
    </form>
  );
}
