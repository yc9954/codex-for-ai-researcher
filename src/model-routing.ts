export type CodexModelFamily = "sol" | "terra" | "luna";
export type CodexReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
export type CodexWorkload =
  | "notebook-authoring"
  | "notebook-structure-repair"
  | "notebook-runtime-repair"
  | "figure-reproduction"
  | "research-chat"
  | "cell-review"
  | "dataset-discovery";

export interface CodexModelRoute {
  workload: CodexWorkload;
  label: string;
  model: string;
  family: CodexModelFamily;
  reasoningEffort: CodexReasoningEffort;
  purpose: string;
  rationale: string;
  policyVersion: string;
}

export const CODEX_MODEL_POLICY_VERSION = "gpt-5.6-research-v1";

export const DEFAULT_CODEX_MODEL_ROUTES: Readonly<Record<CodexWorkload, CodexModelRoute>> = {
  "notebook-authoring": {
    workload: "notebook-authoring",
    label: "Notebook authoring",
    model: "gpt-5.6-sol",
    family: "sol",
    reasoningEffort: "high",
    purpose: "Canonical paper-to-code lesson",
    rationale: "Scientific synthesis and executable code are quality-critical and become the study's canonical artifact.",
    policyVersion: CODEX_MODEL_POLICY_VERSION,
  },
  "notebook-structure-repair": {
    workload: "notebook-structure-repair",
    label: "Schema repair",
    model: "gpt-5.6-sol",
    family: "sol",
    reasoningEffort: "xhigh",
    purpose: "Repair rejected lesson structure",
    rationale: "Escalates only after deterministic grounding or curriculum validation rejects the first draft.",
    policyVersion: CODEX_MODEL_POLICY_VERSION,
  },
  "notebook-runtime-repair": {
    workload: "notebook-runtime-repair",
    label: "Runtime repair",
    model: "gpt-5.6-sol",
    family: "sol",
    reasoningEffort: "max",
    purpose: "Repair code from isolated runtime evidence",
    rationale: "Maximum reasoning is reserved for an observed Docker failure or unsafe runtime warning.",
    policyVersion: CODEX_MODEL_POLICY_VERSION,
  },
  "figure-reproduction": {
    workload: "figure-reproduction",
    label: "Figure reconstruction",
    model: "gpt-5.6-sol",
    family: "sol",
    reasoningEffort: "high",
    purpose: "Recover a thesis-bearing numeric figure",
    rationale: "Figure structure and exact-value attribution require high-fidelity scientific reasoning before deterministic verification.",
    policyVersion: CODEX_MODEL_POLICY_VERSION,
  },
  "research-chat": {
    workload: "research-chat",
    label: "Research conversation",
    model: "gpt-5.6-terra",
    family: "terra",
    reasoningEffort: "medium",
    purpose: "Interactive grounded paper and repository analysis",
    rationale: "Balances reasoning quality and latency for iterative questions while evidence retrieval remains deterministic.",
    policyVersion: CODEX_MODEL_POLICY_VERSION,
  },
  "cell-review": {
    workload: "cell-review",
    label: "Cell review",
    model: "gpt-5.6-terra",
    family: "terra",
    reasoningEffort: "medium",
    purpose: "Explain or revise one bounded notebook cell",
    rationale: "The selected cell, outputs, and annotation bound the task, making balanced interactive reasoning appropriate.",
    policyVersion: CODEX_MODEL_POLICY_VERSION,
  },
  "dataset-discovery": {
    workload: "dataset-discovery",
    label: "Dataset extraction",
    model: "gpt-5.6-luna",
    family: "luna",
    reasoningEffort: "low",
    purpose: "Extract bounded dataset candidates",
    rationale: "A fast model proposes names only; live registry lookup, license checks, and hardware-fit rules verify every candidate.",
    policyVersion: CODEX_MODEL_POLICY_VERSION,
  },
};

export function defaultCodexModelRoute(workload: CodexWorkload): CodexModelRoute {
  return DEFAULT_CODEX_MODEL_ROUTES[workload];
}

export function publicCodexModelRoutes(): CodexModelRoute[] {
  return Object.values(DEFAULT_CODEX_MODEL_ROUTES);
}
