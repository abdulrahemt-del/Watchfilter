import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import type { Insight } from "@/app/api/youtube/insights/route";
import { sanitizeText, sanitizeApiKey, debugCharCodes, findSuspiciousChars } from "@/lib/utils/sanitize";
export const runtime = "nodejs";
export const maxDuration = 60;

type SyncStatus = "sent" | "failed" | "skipped";
export interface OutputStatus { status: SyncStatus; url?: string; error?: string; }

interface InsightResult {
  index:          number;
  noteStatus:     OutputStatus;
  taskStatus:     OutputStatus;
  contentStatus:  OutputStatus;
  decisionStatus: OutputStatus;
}

// ── API key sanitization (runs once at module load) ───────────────────────────
// Root cause: Vercel env vars for NOTION_API_KEY / TODOIST_API_KEY contain
// U+FEFF (BOM, code 65279) at position 0, placing it at index 7 of
// "Bearer ${key}" → fetch() ByteString header validation throws.

function loadKeys() {
  const notionRaw   = process.env.NOTION_API_KEY     ?? "";
  const todoistRaw  = process.env.TODOIST_API_KEY    ?? "";
  const queueRaw    = process.env.NOTION_CONTENT_QUEUE_ID ?? "";
  const dbRaw       = process.env.NOTION_DATABASE_ID ?? "";

  console.log("[keys] NOTION_API_KEY   first 10 codes:", debugCharCodes(notionRaw));
  console.log("[keys] TODOIST_API_KEY  first 10 codes:", debugCharCodes(todoistRaw));
  console.log("[keys] NOTION_DB_ID     first 10 codes:", debugCharCodes(dbRaw));

  const suspiciousNotion  = findSuspiciousChars(notionRaw.slice(0, 20));
  const suspiciousTodoist = findSuspiciousChars(todoistRaw.slice(0, 20));
  if (suspiciousNotion.length)  console.error("[keys] NOTION_API_KEY  has suspicious chars:", JSON.stringify(suspiciousNotion));
  if (suspiciousTodoist.length) console.error("[keys] TODOIST_API_KEY has suspicious chars:", JSON.stringify(suspiciousTodoist));

  return {
    notionKey:   sanitizeApiKey(notionRaw),
    todoistKey:  sanitizeApiKey(todoistRaw),
    notionDbId:  sanitizeApiKey(dbRaw),
    contentDbId: sanitizeApiKey(queueRaw),
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { notionKey, todoistKey, notionDbId, contentDbId } = loadKeys();

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
      console.log(`[auto-send] Processing insight ${i}: "${sanitizeText(ins.title ?? "")}"`);

      const [noteStatus, taskStatus, contentStatus, decisionStatus] = await Promise.all([
        sendNote(ins, safeTitle, safeChannel, safeType, notionKey, notionDbId),
        sendTask(ins, todoistKey),
        sendContent(ins, safeTitle, safeChannel, notionKey, contentDbId),
        sendDecision(ins, safeTitle, safeChannel, safeType, notionKey, notionDbId),
      ]);

      console.log(
        `[auto-send] Insight ${i} score:${ins.actionability_score} — ` +
        `note:${noteStatus.status} | task:${taskStatus.status} | ` +
        `content:${contentStatus.status} | decision:${decisionStatus.status}`
      );

      return { index: i, noteStatus, taskStatus, contentStatus, decisionStatus };
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
  notionKey:    string,
  dbId:         string,
): Promise<OutputStatus> {
  if (!notionKey) { console.warn("[notion] NOTION_API_KEY not set / empty after sanitize"); return { status: "skipped", error: "Notion not configured" }; }
  if (!dbId)      { console.warn("[notion] NOTION_DATABASE_ID not set / empty after sanitize"); return { status: "skipped", error: "Notion not configured" }; }

  const noteTitle   = sanitizeText(ins.assets?.note?.title   ?? "");
  const noteContent = sanitizeText(ins.assets?.note?.content ?? "");
  const taskTitle   = sanitizeText(ins.assets?.task?.title       ?? "");
  const taskDesc    = sanitizeText(ins.assets?.task?.description ?? "");
  const insTitle    = sanitizeText(ins.title          ?? "");
  const insWhy      = sanitizeText(ins.why_it_matters ?? "");

  // ── Diagnostic: scan all fields for suspicious chars ─────────────────────
  const fields: Record<string, string> = { noteTitle, noteContent, taskTitle, taskDesc, insTitle };
  Object.entries(fields).forEach(([name, val]) => {
    const hits = findSuspiciousChars(val);
    if (hits.length) {
      console.error(`[notion] SUSPICIOUS chars in ${name}:`, JSON.stringify(hits.slice(0, 5)));
      console.log(`[notion] RAW ${name}:`, JSON.stringify(val));
    }
  });

  const blocks: object[] = [];

  if (channelTitle || videoTitle) {
    blocks.push(para(sanitizeText(`Source: ${[channelTitle, videoTitle].filter(Boolean).join(" - ")}`)));
  }

  const meta = sanitizeText([videoType, ins.category, `Importance: ${ins.importance_score}/10`].filter(Boolean).join(" - "));
  if (meta) blocks.push(para(meta));
  blocks.push(divider());
  blocks.push(heading3("Insight"));
  blocks.push(para(insTitle));
  blocks.push(para(insWhy));
  blocks.push(divider());
  blocks.push(heading3("Strategic Note"));
  blocks.push(para(noteContent));

  if (taskTitle) {
    blocks.push(divider());
    blocks.push(heading3("Suggested Action"));
    blocks.push(quote(taskTitle));
    if (taskDesc) blocks.push(para(taskDesc));
  }

  const payload = {
    parent:     { database_id: dbId },
    properties: { Name: { title: [{ text: { content: noteTitle || insTitle || "WatchFilter Note" } }] } },
    children:   blocks.slice(0, 100),
  };
  const body = JSON.stringify(payload);

  // ── Final payload scan ────────────────────────────────────────────────────
  const payloadHits = findSuspiciousChars(body);
  if (payloadHits.length) {
    console.error("[notion] FINAL PAYLOAD has suspicious chars at indices:", payloadHits.slice(0, 10).map(h => h.index));
  }
  console.log("[notion] FINAL PAYLOAD first 120 chars:", body.slice(0, 120));
  console.log("[notion] Authorization header first 20 codes:", debugCharCodes(`Bearer ${notionKey}`, 20));

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${notionKey}`,
        "Content-Type":   "application/json",
        "Notion-Version": "2022-06-28",
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[notion] API error ${res.status}: ${errText.slice(0, 400)}`);
      return { status: "failed", error: `Notion ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json() as { url: string; id: string };
    console.log(`[notion] Note created: ${data.url}`);
    return { status: "sent", url: data.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[notion] Fetch threw: ${msg}`);
    return { status: "failed", error: msg };
  }
}

// ── Action Task → Todoist ─────────────────────────────────────────────────────

async function sendTask(ins: Insight, todoistKey: string): Promise<OutputStatus> {
  if (!todoistKey) { console.warn("[todoist] TODOIST_API_KEY not set / empty after sanitize"); return { status: "skipped", error: "Todoist not configured" }; }

  // Only send tasks when actionability_score >= 6 and a task asset exists
  if ((ins.actionability_score ?? 0) < 6 || !ins.assets?.task) {
    const reason = (ins.actionability_score ?? 0) < 6
      ? `Score ${ins.actionability_score ?? 0}/10 — below threshold for task creation`
      : "No task generated for this insight";
    return { status: "skipped", error: reason };
  }

  const taskTitle = sanitizeText(ins.assets.task.title);
  const taskDesc  = sanitizeText(ins.assets.task.description ?? "");
  const insTitle  = sanitizeText(ins.title ?? "");

  const payload = {
    content:     taskTitle || insTitle,
    description: `${taskDesc}\n\nFrom: ${insTitle}`,
    priority:    (ins.importance_score ?? 5) >= 8 ? 4 : (ins.importance_score ?? 5) >= 6 ? 3 : 2,
  };
  const body = JSON.stringify(payload);

  const payloadHits = findSuspiciousChars(body);
  if (payloadHits.length) {
    console.error("[todoist] FINAL PAYLOAD has suspicious chars:", JSON.stringify(payloadHits.slice(0, 5)));
  }
  console.log("[todoist] FINAL PAYLOAD first 120 chars:", body.slice(0, 120));
  console.log("[todoist] Authorization header first 20 codes:", debugCharCodes(`Bearer ${todoistKey}`, 20));

  try {
    const res = await fetch("https://api.todoist.com/api/v1/tasks", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${todoistKey}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[todoist] API error ${res.status}: ${errText.slice(0, 400)}`);
      return { status: "failed", error: `Todoist ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json() as { id: string };
    const taskUrl = `https://todoist.com/app/task/${data.id}`;
    console.log(`[todoist] Task created: ${data.id}`);
    return { status: "sent", url: taskUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[todoist] Fetch threw: ${msg}`);
    return { status: "failed", error: msg };
  }
}

// ── Content Opportunity → Notion Content Queue ────────────────────────────────

async function sendContent(
  ins:          Insight,
  videoTitle:   string,
  channelTitle: string,
  notionKey:    string,
  queueId:      string,
): Promise<OutputStatus> {
  if (!notionKey) return { status: "skipped", error: "Notion not configured" };
  if (!queueId)   {
    console.warn("[content] NOTION_CONTENT_QUEUE_ID not set");
    return { status: "skipped", error: "Content queue not configured (set NOTION_CONTENT_QUEUE_ID)" };
  }

  const contentTitle = sanitizeText(ins.assets?.content?.title ?? "");
  const contentAngle = sanitizeText(ins.assets?.content?.angle ?? "");
  const insTitle     = sanitizeText(ins.title ?? "");
  const keyQuote     = ins.key_quote ? sanitizeText(ins.key_quote) : null;

  const blocks: object[] = [];

  if (channelTitle || videoTitle) {
    blocks.push(para(sanitizeText(`Source: ${[channelTitle, videoTitle].filter(Boolean).join(" — ")}`)));
    blocks.push(divider());
  }

  blocks.push(heading3("Content Angle"));
  blocks.push(para(sanitizeText(contentAngle || insTitle)));
  blocks.push(divider());

  blocks.push(heading3("Source Insight"));
  blocks.push(para(sanitizeText(ins.what_was_discussed || insTitle)));
  blocks.push(divider());

  blocks.push(heading3("Why It Matters"));
  blocks.push(para(sanitizeText(ins.why_it_matters || "")));
  blocks.push(divider());

  if (ins.supporting_points?.length) {
    blocks.push(heading3("Supporting Evidence"));
    ins.supporting_points.slice(0, 5).forEach(point => {
      blocks.push(bullet(sanitizeText(point)));
    });
    blocks.push(divider());
  }

  blocks.push(heading3("Key Quote"));
  if (keyQuote) {
    blocks.push(quote(keyQuote));
  } else {
    blocks.push(para("No standout quote identified."));
  }
  blocks.push(divider());

  if (ins.actionability_reason) {
    blocks.push(heading3("Actionability"));
    blocks.push(para(sanitizeText(`Score: ${ins.actionability_score ?? 0}/10 — ${ins.actionability_reason}`)));
  }

  const body = JSON.stringify({
    parent:     { database_id: queueId },
    properties: {
      Name:   { title:  [{ text: { content: contentTitle || insTitle || "Content Idea" } }] },
      Status: { select: { name: "Idea" } },
    },
    children: blocks.slice(0, 100),
  });

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${notionKey}`,
        "Content-Type":   "application/json",
        "Notion-Version": "2022-06-28",
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[content] API error ${res.status}: ${errText.slice(0, 400)}`);
      return { status: "failed", error: `Content queue ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json() as { url: string; id: string };
    console.log(`[content] Page created: ${data.url}`);
    return { status: "sent", url: data.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[content] Fetch threw: ${msg}`);
    return { status: "failed", error: msg };
  }
}

// ── Decision Record → Notion ──────────────────────────────────────────────────

async function sendDecision(
  ins:          Insight,
  videoTitle:   string,
  channelTitle: string,
  videoType:    string,
  notionKey:    string,
  dbId:         string,
): Promise<OutputStatus> {
  if (!notionKey) return { status: "skipped", error: "Notion not configured" };
  if (!dbId)      return { status: "skipped", error: "Notion not configured" };

  if ((ins.actionability_score ?? 0) < 4 || !ins.assets?.decision) {
    return { status: "skipped", error: `Score ${ins.actionability_score ?? 0}/10 — below threshold for decision record` };
  }

  const decTitle   = sanitizeText(ins.assets.decision.title   ?? "");
  const decContext = sanitizeText(ins.assets.decision.context ?? "");
  const insTitle   = sanitizeText(ins.title ?? "");
  const scoreLabel = `Actionability: ${ins.actionability_score}/10 — ${sanitizeText(ins.actionability_reason ?? "")}`;

  const blocks: object[] = [];
  if (channelTitle || videoTitle) {
    blocks.push(para(sanitizeText(`Source: ${[channelTitle, videoTitle].filter(Boolean).join(" — ")}`)));
    blocks.push(para(sanitizeText([videoType, ins.category, `Importance: ${ins.importance_score}/10`].filter(Boolean).join(" · "))));
    blocks.push(divider());
  }
  blocks.push(heading3("Insight"));
  blocks.push(para(insTitle));
  blocks.push(para(sanitizeText(ins.why_it_matters ?? "")));
  blocks.push(divider());
  blocks.push(heading3("Decision Required"));
  blocks.push(para(decContext));
  blocks.push(divider());
  blocks.push(heading3("Actionability Assessment"));
  blocks.push(para(scoreLabel));

  const body = JSON.stringify({
    parent:     { database_id: dbId },
    properties: { Name: { title: [{ text: { content: decTitle || `Decision: ${insTitle}` } }] } },
    children:   blocks.slice(0, 100),
  });

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${notionKey}`,
        "Content-Type":   "application/json",
        "Notion-Version": "2022-06-28",
      },
      body,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[decision] API error ${res.status}: ${errText.slice(0, 400)}`);
      return { status: "failed", error: `Notion ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = await res.json() as { url: string };
    console.log(`[decision] Page created: ${data.url}`);
    return { status: "sent", url: data.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[decision] Fetch threw: ${msg}`);
    return { status: "failed", error: msg };
  }
}

// ── Block helpers (all values pre-sanitized before reaching here) ─────────────

function para(content: string)     { return { object: "block", type: "paragraph",        paragraph:        { rich_text: [{ text: { content } }] } }; }
function heading3(content: string) { return { object: "block", type: "heading_3",         heading_3:         { rich_text: [{ text: { content } }] } }; }
function quote(content: string)    { return { object: "block", type: "quote",             quote:             { rich_text: [{ text: { content } }] } }; }
function bullet(content: string)   { return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ text: { content } }] } }; }
function divider()                 { return { object: "block", type: "divider",            divider: {} }; }
