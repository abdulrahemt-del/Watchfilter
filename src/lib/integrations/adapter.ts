export type ActionType = "TASK" | "NOTE" | "CONTENT" | "REMINDER" | "LEARNING";
export type Confidence = "low" | "medium" | "high";

export interface ActionPayload {
  action_type: ActionType;
  action_title: string;
  insight: string | null;
  rationale: string | null;
  confidence: Confidence;
}

export interface SendResult {
  externalId: string;
  url?: string;
  destination: string;
}

export interface IntegrationAdapter {
  readonly key: string;
  readonly name: string;
  isConfigured(): boolean;
  send(action: ActionPayload): Promise<SendResult>;
}
