export const connectorHookEvents = [
  "chat.before",
  "notebook.review.before",
  "notebook.generate.before",
  "figure.generate.before",
  "dataset.plan.before",
] as const;

export type ConnectorHookEvent = typeof connectorHookEvents[number];

export interface ConnectorAgent {
  id: string;
  name: string;
  command: string;
  description: string;
  instructions: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorHook {
  id: string;
  name: string;
  event: ConnectorHookEvent;
  instructions: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorSkill {
  id: string;
  name: string;
  command: string;
  description: string;
  instructions: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorConfig {
  schemaVersion: "1.0";
  agents: ConnectorAgent[];
  hooks: ConnectorHook[];
  skills: ConnectorSkill[];
  updatedAt: string | null;
}
