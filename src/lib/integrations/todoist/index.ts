import type { IntegrationAdapter, ActionPayload, SendResult } from "../adapter";

export class TodoistAdapter implements IntegrationAdapter {
  readonly key = "todoist";
  readonly name = "Todoist";

  isConfigured() {
    return !!process.env.TODOIST_API_KEY;
  }

  async send(action: ActionPayload): Promise<SendResult> {
    const apiKey = process.env.TODOIST_API_KEY;
    if (!apiKey) throw new Error("Todoist not configured");

    const res = await fetch("https://api.todoist.com/rest/v2/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        content: action.action_title,
        description: buildDescription(action),
        priority: action.confidence === "high" ? 4 : action.confidence === "medium" ? 3 : 2,
        labels: ["watchfilter"],
      }),
    });

    if (!res.ok) throw new Error(`Todoist API ${res.status}: ${await res.text()}`);
    const data = await res.json() as { id: string; url: string };
    return { externalId: data.id, url: data.url, destination: this.name };
  }
}

function buildDescription(a: ActionPayload): string {
  const parts: string[] = [];
  if (a.insight)   parts.push(`💡 ${a.insight}`);
  if (a.rationale) parts.push(`📌 ${a.rationale}`);
  parts.push(`via WatchFilter | Confidence: ${a.confidence}`);
  return parts.join("\n\n");
}
