import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import type { Insight } from "@/app/api/youtube/insights/route";

export const runtime = "nodejs";
export const maxDuration = 60;

interface OutputStatus { status: "sent" | "failed" | "skipped"; url?: string; error?: string; }

interface InsightResult {
  index:        number;
  notionStatus: OutputStatus;
  taskStatus:   OutputStatus;
}

function isActionable(ins: Insight): ins is Insight & { actionability: { task: string; description: string } } {
  return typeof ins.actionability === "object" && ins.actionability !== null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { insights, videoTitle, channelTitle, videoType } = await req.json() as {
    insights:     Insight[];
    videoTitle?:  string;
    channelTitle?: string;
    videoType?:   string;
  };

  console.log(`[auto-send] POST — ${insights?.length ?? 0} insights | video: "${videoTitle}" | type: ${videoType}`);

  if (!insights?.length) return NextResponse.json({ results: [] });

  const results: InsightResult[] = await Promise.all(
    insights.map(async (ins, i): Promise<InsightResult> => {
      console.log(`[auto-send] Processing insight ${i}: "${ins.title}" | actionable: ${isActionable(ins)}`);
      const [notionStatus, taskStatus] = await Promise.all([
        sendInsightNote(ins, videoTitle, channelTitle, videoType),
        isActionable(ins) ? sendInsightTask(ins) : Promise.resolve({ status: "skipped" as const, error: "Informational only" }),
      ]);
      console.log(`[auto-send] Insight ${i} result — notion: ${notionStatus.status}${notionStatus.error ? ` (${notionStatus.error})` : ""} | task: ${taskStatus.status}${taskStatus.error ? ` (${taskStatus.error})` : ""}`);
      return { index: i, notionStatus, taskStatus };
    })
  );

  return NextResponse.json({ results });
}

// ── Notion insight note ────────────────────────────────────────────────────────

async function sendInsightNote(
  ins: Insight,
  videoTitle?: string,
  channelTitle?: string,
  videoType?: string,
): Promise<OutputStatus> {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId   = process.env.NOTION_DATABASE_ID;

  if (!apiKey) { console.warn("[notion] NOTION_API_KEY not set"); return { status: "skipped", error: "Notion not configured" }; }
  if (!dbId)   { console.warn("[notion] NOTION_DATABASE_ID not set"); return { status: "skipped", error: "Notion not configured" }; }

  console.log(`[notion] Creating page for: "${ins.title}" | db: ${dbId.slice(0, 8)}...`);

  try {
    const blocks: object[] = [];

    if (channelTitle || videoTitle) {
      blocks.push({
        object: "block", type: "callout",
        callout: {
          rich_text: [{ text: { content: `📺 ${[channelTitle, videoTitle].filter(Boolean).join(" · ")}` } }],
          icon: { emoji: "📺" },
        },
      });
    }

    const meta = [
      videoType,
      ins.confidence ? `Confidence: ${ins.confidence}` : null,
      ins.category,
    ].filter(Boolean).join("  ·  ");
    if (meta) blocks.push(para(meta));
    blocks.push({ object: "block", type: "divider", divider: {} });

    blocks.push(heading3("What Was Said"));
    blocks.push(para(ins.what_was_said));
    blocks.push({ object: "block", type: "divider", divider: {} });

    blocks.push(heading3("Why It Matters"));
    blocks.push(para(ins.why_it_matters));

    if (isActionable(ins)) {
      blocks.push({ object: "block", type: "divider", divider: {} });
      blocks.push(heading3("Suggested Action"));
      blocks.push({ object: "block", type: "quote", quote: { rich_text: [{ text: { content: ins.actionability.task } }] } });
      blocks.push(para(ins.actionability.description));
    }

    const body = {
      parent:     { database_id: dbId },
      properties: { Name: { title: [{ text: { content: ins.title ?? "Untitled" } }] } },
      children:   blocks.slice(0, 100),
    };

    console.log(`[notion] POST https://api.notion.com/v1/pages — ${blocks.length} blocks`);

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        "Content-Type":   "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[notion] API error ${res.status}: ${errText}`);
      throw new Error(`Notion ${res.status}: ${errText}`);
    }

    const data = await res.json() as { url: string; id: string };
    console.log(`[notion] Page created: ${data.url}`);
    return { status: "sent", url: data.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[notion] Failed: ${msg}`);
    return { status: "failed", error: msg };
  }
}

// ── Todoist task (only when speaker explicitly recommended action) ─────────────

async function sendInsightTask(
  ins: Insight & { actionability: { task: string; description: string } },
): Promise<OutputStatus> {
  const apiKey = process.env.TODOIST_API_KEY;
  if (!apiKey) { console.warn("[todoist] TODOIST_API_KEY not set"); return { status: "skipped", error: "Todoist not configured" }; }

  console.log(`[todoist] Creating task: "${ins.actionability.task}"`);

  try {
    const res = await fetch("https://api.todoist.com/rest/v2/tasks", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        "Content-Type":   "application/json",
        "X-Request-Id":   crypto.randomUUID(),
      },
      body: JSON.stringify({
        content:     ins.actionability.task,
        description: `${ins.actionability.description}\n\n💡 From: ${ins.title}`,
        priority:    ins.importance >= 8 ? 4 : ins.importance >= 6 ? 3 : 2,
        labels:      ["watchfilter"],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[todoist] API error ${res.status}: ${errText}`);
      throw new Error(`Todoist ${res.status}: ${errText}`);
    }

    const data = await res.json() as { id: string; url: string };
    console.log(`[todoist] Task created: ${data.id}`);
    return { status: "sent", url: data.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[todoist] Failed: ${msg}`);
    return { status: "failed", error: msg };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function para(content: string)     { return { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content } }] } }; }
function heading3(content: string) { return { object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content } }] } }; }
