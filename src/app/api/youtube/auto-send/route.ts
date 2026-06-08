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

  if (!insights?.length) return NextResponse.json({ results: [] });

  const results: InsightResult[] = await Promise.all(
    insights.map(async (ins, i): Promise<InsightResult> => {
      const [notionStatus, taskStatus] = await Promise.all([
        sendInsightNote(ins, videoTitle, channelTitle, videoType),
        isActionable(ins) ? sendInsightTask(ins) : Promise.resolve({ status: "skipped" as const, error: "Informational only" }),
      ]);
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
  if (!apiKey || !dbId) return { status: "skipped", error: "Notion not configured" };

  try {
    const blocks: object[] = [];

    // Source callout
    if (channelTitle || videoTitle) {
      blocks.push({
        object: "block", type: "callout",
        callout: {
          rich_text: [{ text: { content: `📺 ${[channelTitle, videoTitle].filter(Boolean).join(" · ")}` } }],
          icon: { emoji: "📺" },
        },
      });
    }

    // Video type + confidence + category metadata
    const meta = [
      videoType,
      ins.confidence ? `Confidence: ${ins.confidence}` : null,
      ins.category,
    ].filter(Boolean).join("  ·  ");
    if (meta) blocks.push(para(meta));
    blocks.push({ object: "block", type: "divider", divider: {} });

    // What was said
    blocks.push(heading3("What Was Said"));
    blocks.push(para(ins.what_was_said));
    blocks.push({ object: "block", type: "divider", divider: {} });

    // Why it matters
    blocks.push(heading3("Why It Matters"));
    blocks.push(para(ins.why_it_matters));

    // Suggested action (only if actionable)
    if (isActionable(ins)) {
      blocks.push({ object: "block", type: "divider", divider: {} });
      blocks.push(heading3("Suggested Action"));
      blocks.push({ object: "block", type: "quote", quote: { rich_text: [{ text: { content: ins.actionability.task } }] } });
      blocks.push(para(ins.actionability.description));
    }

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        "Content-Type":   "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent:     { database_id: dbId },
        properties: { Name: { title: [{ text: { content: ins.title } }] } },
        children:   blocks.slice(0, 100),
      }),
    });

    if (!res.ok) throw new Error(`Notion ${res.status}: ${await res.text()}`);
    const data = await res.json() as { url: string };
    return { status: "sent", url: data.url };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Failed" };
  }
}

// ── Todoist task (only when speaker explicitly recommended action) ─────────────

async function sendInsightTask(
  ins: Insight & { actionability: { task: string; description: string } },
): Promise<OutputStatus> {
  const apiKey = process.env.TODOIST_API_KEY;
  if (!apiKey) return { status: "skipped", error: "Todoist not configured" };

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

    if (!res.ok) throw new Error(`Todoist ${res.status}: ${await res.text()}`);
    const data = await res.json() as { id: string; url: string };
    return { status: "sent", url: data.url };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Failed" };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function para(content: string)     { return { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content } }] } }; }
function heading3(content: string) { return { object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content } }] } }; }
