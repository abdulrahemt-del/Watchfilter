import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import type { Insight } from "@/app/api/youtube/insights/route";
import { sanitizeText } from "@/lib/utils/sanitize";

export const runtime = "nodejs";
export const maxDuration = 60;

type SyncStatus = "sent" | "failed" | "skipped";
export interface OutputStatus { status: SyncStatus; url?: string; error?: string; }

interface InsightResult {
  index:         number;
  noteStatus:    OutputStatus;
  taskStatus:    OutputStatus;
  contentStatus: OutputStatus;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { insights, videoTitle, channelTitle, videoType } = await req.json() as {
    insights:      Insight[];
    videoTitle?:   string;
    channelTitle?: string;
    videoType?:    string;
  };

  const safeTitle   = sanitizeText(videoTitle   ?? "");
  const safeChannel = sanitizeText(channelTitle ?? "");
  const safeType    = sanitizeText(videoType    ?? "");

  console.log(`[auto-send] POST — ${insights?.length ?? 0} insights | "${safeTitle}" | type: ${safeType}`);

  if (!insights?.length) return NextResponse.json({ results: [] });

  const results: InsightResult[] = await Promise.all(
    insights.map(async (ins, i): Promise<InsightResult> => {
      console.log(`[auto-send] Processing insight ${i}: "${ins.title}"`);

      const [noteStatus, taskStatus, contentStatus] = await Promise.all([
        sendNote(ins, safeTitle, safeChannel, safeType),
        sendTask(ins),
        sendContent(ins, safeTitle, safeChannel),
      ]);

      console.log(
        `[auto-send] Insight ${i} — note:${noteStatus.status}${noteStatus.error ? ` (${noteStatus.error})` : ""}` +
        ` | task:${taskStatus.status}${taskStatus.error ? ` (${taskStatus.error})` : ""}` +
        ` | content:${contentStatus.status}${contentStatus.error ? ` (${contentStatus.error})` : ""}`
      );

      return { index: i, noteStatus, taskStatus, contentStatus };
    })
  );

  return NextResponse.json({ results });
}

// ── Strategic Note → Notion ──────────────────────────────────────────────────

async function sendNote(
  ins:          Insight,
  videoTitle:   string,
  channelTitle: string,
  videoType:    string,
): Promise<OutputStatus> {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId   = process.env.NOTION_DATABASE_ID;

  if (!apiKey) { console.warn("[notion] NOTION_API_KEY not set"); return { status: "skipped", error: "Notion not configured" }; }
  if (!dbId)   { console.warn("[notion] NOTION_DATABASE_ID not set"); return { status: "skipped", error: "Notion not configured" }; }

  const noteTitle   = sanitizeText(ins.assets.note.title);
  const noteContent = sanitizeText(ins.assets.note.content);
  const insTitle    = sanitizeText(ins.title);

  console.log(`[notion] Creating note: "${noteTitle}"`);
  console.log(`[notion] RAW title char codes:`, [...noteTitle].slice(0, 5).map(c => c.charCodeAt(0)));

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

    const meta = [videoType, ins.category, `Importance: ${ins.importance}/10`].filter(Boolean).join("  ·  ");
    if (meta) blocks.push(para(meta));
    blocks.push(divider());

    blocks.push(heading3("Insight"));
    blocks.push(para(insTitle));
    blocks.push(para(sanitizeText(ins.why_it_matters)));
    blocks.push(divider());

    blocks.push(heading3("Strategic Note"));
    blocks.push(para(noteContent));

    if (ins.assets.task?.title) {
      blocks.push(divider());
      blocks.push(heading3("Suggested Action"));
      blocks.push(quote(sanitizeText(ins.assets.task.title)));
      if (ins.assets.task.description) blocks.push(para(sanitizeText(ins.assets.task.description)));
    }

    const body = JSON.stringify({
      parent:     { database_id: dbId },
      properties: { Name: { title: [{ text: { content: noteTitle || insTitle || "WatchFilter Note" } }] } },
      children:   blocks.slice(0, 100),
    });

    console.log(`[notion] POST /v1/pages — ${blocks.length} blocks — body length: ${body.length}`);
    console.log(`[notion] Body first char code: ${body.charCodeAt(0)}`);

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        "Content-Type":   "application/json",
        "Notion-Version": "2022-06-28",
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[notion] API error ${res.status}: ${errText}`);
      throw new Error(`Notion ${res.status}: ${errText}`);
    }

    const data = await res.json() as { url: string; id: string };
    console.log(`[notion] Note created: ${data.url}`);
    return { status: "sent", url: data.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[notion] Failed: ${msg}`);
    return { status: "failed", error: msg };
  }
}

// ── Action Task → Todoist ────────────────────────────────────────────────────

async function sendTask(ins: Insight): Promise<OutputStatus> {
  const apiKey = process.env.TODOIST_API_KEY;
  if (!apiKey) { console.warn("[todoist] TODOIST_API_KEY not set"); return { status: "skipped", error: "Todoist not configured" }; }

  const taskTitle = sanitizeText(ins.assets.task.title);
  const taskDesc  = sanitizeText(ins.assets.task.description);
  const insTitle  = sanitizeText(ins.title);

  console.log(`[todoist] Creating task: "${taskTitle}"`);

  try {
    const res = await fetch("https://api.todoist.com/rest/v2/tasks", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        content:     taskTitle,
        description: `${taskDesc}\n\n💡 From: ${insTitle}`,
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

// ── Content Opportunity → Notion Content Queue ───────────────────────────────

async function sendContent(
  ins:          Insight,
  videoTitle:   string,
  channelTitle: string,
): Promise<OutputStatus> {
  const apiKey = process.env.NOTION_API_KEY;
  const queueId = process.env.NOTION_CONTENT_QUEUE_ID;

  if (!apiKey)   { console.warn("[content] NOTION_API_KEY not set"); return { status: "skipped", error: "Notion not configured" }; }
  if (!queueId)  {
    console.warn("[content] NOTION_CONTENT_QUEUE_ID not set — content queue skipped");
    return { status: "skipped", error: "Content queue not configured (set NOTION_CONTENT_QUEUE_ID)" };
  }

  const contentTitle = sanitizeText(ins.assets.content.title);
  const contentAngle = sanitizeText(ins.assets.content.angle);
  const insTitle     = sanitizeText(ins.title);

  console.log(`[content] Adding to queue: "${contentTitle}"`);

  try {
    const blocks: object[] = [
      heading3("Content Angle"),
      para(contentAngle),
      divider(),
      heading3("Source Insight"),
      para(insTitle),
    ];
    if (channelTitle || videoTitle) {
      blocks.push(divider());
      blocks.push(para(`📺 ${[channelTitle, videoTitle].filter(Boolean).join(" · ")}`));
    }

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        "Content-Type":   "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent:     { database_id: queueId },
        properties: { Name: { title: [{ text: { content: contentTitle || insTitle || "Content Idea" } }] } },
        children:   blocks.slice(0, 100),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[content] API error ${res.status}: ${errText}`);
      throw new Error(`Content queue ${res.status}: ${errText}`);
    }

    const data = await res.json() as { url: string; id: string };
    console.log(`[content] Page created: ${data.url}`);
    return { status: "sent", url: data.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[content] Failed: ${msg}`);
    return { status: "failed", error: msg };
  }
}

// ── Block helpers ─────────────────────────────────────────────────────────────

function para(content: string)     { return { object: "block", type: "paragraph",  paragraph:  { rich_text: [{ text: { content: sanitizeText(content) } }] } }; }
function heading3(content: string) { return { object: "block", type: "heading_3",  heading_3:  { rich_text: [{ text: { content: sanitizeText(content) } }] } }; }
function quote(content: string)    { return { object: "block", type: "quote",      quote:      { rich_text: [{ text: { content: sanitizeText(content) } }] } }; }
function divider()                 { return { object: "block", type: "divider",    divider: {} }; }
