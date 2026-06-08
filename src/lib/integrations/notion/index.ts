import type { IntegrationAdapter, ActionPayload, SendResult } from "../adapter";

export class NotionAdapter implements IntegrationAdapter {
  readonly key = "notion";
  readonly name = "Notion";

  isConfigured() {
    return !!(process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID);
  }

  async send(action: ActionPayload): Promise<SendResult> {
    const apiKey = process.env.NOTION_API_KEY;
    const dbId   = process.env.NOTION_DATABASE_ID;
    if (!apiKey || !dbId) throw new Error("Notion not configured");

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          Name: { title: [{ text: { content: action.action_title } }] },
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content: buildContent(action) } }],
            },
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
    const data = await res.json() as { id: string; url: string };
    return { externalId: data.id, url: data.url, destination: this.name };
  }
}

function buildContent(a: ActionPayload): string {
  const parts: string[] = [];
  if (a.insight)   parts.push(`Insight: ${a.insight}`);
  if (a.rationale) parts.push(`Why: ${a.rationale}`);
  parts.push(`Type: ${a.action_type} | Confidence: ${a.confidence}`);
  return parts.join("\n\n");
}
