import type { ActionType } from "@/lib/integrations/adapter";

export const DEFAULT_ROUTES: Record<ActionType, string> = {
  TASK:     "todoist",
  NOTE:     "notion",
  CONTENT:  "notion",
  REMINDER: "notion",
  LEARNING: "notion",
};
