import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "crypto";
import type { AnalyzeVideoResult } from "../types";
import type { AnalysisRow, AnalysisSummary, SavedAnalysis, WorthWatchingData } from "./schema";

// ── Client singleton ──────────────────────────────────────────────────────────

let _client: Client | null = null;

function getClient(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL ?? "file:./data/watchfilter.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;
  _client = createClient({ url, authToken });
  return _client;
}

// ── Schema init (runs once per cold start) ────────────────────────────────────

let _schemaInit: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  const c = getClient();
  await c.batch([
    { sql: `CREATE TABLE IF NOT EXISTS user_refresh_tokens (
      user_id      TEXT PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS intelligence_snapshot (
      id          TEXT PRIMARY KEY,
      user_id     TEXT UNIQUE NOT NULL,
      computed_at TEXT NOT NULL,
      meta_data   TEXT NOT NULL,
      brief       TEXT NOT NULL,
      alerts      TEXT NOT NULL,
      shifts      TEXT NOT NULL,
      voice_share TEXT NOT NULL
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      youtube_url TEXT NOT NULL,
      title TEXT,
      clickbait_score INTEGER NOT NULL,
      primary_subject TEXT NOT NULL,
      hard_data_points TEXT NOT NULL,
      actionable_takeaways TEXT NOT NULL,
      timestamps TEXT NOT NULL,
      transcript_source TEXT,
      transcript_char_count INTEGER,
      audio_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses (created_at DESC)`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_analyses_video_id ON analyses (video_id)`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS feed_cache (
      user_id   TEXT PRIMARY KEY,
      cached_at TEXT NOT NULL,
      videos    TEXT NOT NULL
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS waitlist (
      id         TEXT PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS team_workspace_waitlist (
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      company      TEXT,
      team_size    TEXT NOT NULL,
      user_id      TEXT,
      created_at   TEXT NOT NULL
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS beta_events (
      id         TEXT PRIMARY KEY,
      event      TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(event, user_id)
    )`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_beta_events_event ON beta_events (event)`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS research_index (
      id              TEXT PRIMARY KEY,
      analysis_id     TEXT NOT NULL,
      video_id        TEXT NOT NULL,
      video_title     TEXT,
      channel_name    TEXT,
      upload_date     TEXT,
      type            TEXT NOT NULL,
      quote           TEXT,
      timestamp_str   TEXT,
      insight         TEXT,
      why_matters     TEXT,
      takeaway        TEXT,
      signal_strength TEXT,
      contrarian      TEXT,
      category        TEXT,
      embedding       TEXT,
      indexed_at      TEXT NOT NULL
    )`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_research_analysis_id ON research_index (analysis_id)`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_research_channel ON research_index (channel_name)`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS kv_cache (
      key       TEXT PRIMARY KEY,
      value     TEXT NOT NULL,
      cached_at TEXT NOT NULL
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS creator_profiles (
      channel_name      TEXT PRIMARY KEY,
      video_count       INTEGER NOT NULL DEFAULT 0,
      data_point_count  INTEGER NOT NULL DEFAULT 0,
      high_signal_count INTEGER NOT NULL DEFAULT 0,
      category_count    INTEGER NOT NULL DEFAULT 0,
      authority_score   INTEGER NOT NULL DEFAULT 0,
      top_categories    TEXT NOT NULL DEFAULT '[]',
      updated_at        TEXT NOT NULL
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS creator_positions (
      id               TEXT PRIMARY KEY,
      channel_name     TEXT NOT NULL,
      category         TEXT NOT NULL,
      stance           TEXT NOT NULL,
      confidence       INTEGER NOT NULL DEFAULT 0,
      data_point_count INTEGER NOT NULL DEFAULT 0,
      contrarian_count INTEGER NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL,
      UNIQUE(channel_name, category)
    )`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_creator_positions_category ON creator_positions (category)`, args: [] },
  ], "write");

  for (const sql of [
    `ALTER TABLE analyses ADD COLUMN audio_path TEXT`,
    `ALTER TABLE analyses ADD COLUMN worth_watching TEXT`,
    `ALTER TABLE analyses ADD COLUMN channel_name TEXT`,
    `ALTER TABLE analyses ADD COLUMN view_count INTEGER`,
    `ALTER TABLE analyses ADD COLUMN upload_date TEXT`,
    `ALTER TABLE analyses ADD COLUMN duration_seconds INTEGER`,
    `ALTER TABLE analyses ADD COLUMN off_script_nuggets TEXT`,
    `ALTER TABLE analyses ADD COLUMN speaker_name TEXT`,
    // Cloud pipeline cache — stores AI scores + consensus per user
    `ALTER TABLE intelligence_snapshot ADD COLUMN ai_scores_cache TEXT`,
    `ALTER TABLE intelligence_snapshot ADD COLUMN consensus_cache TEXT`,
    `ALTER TABLE intelligence_snapshot ADD COLUMN pipeline_cached_at TEXT`,
  ]) {
    try { await c.execute(sql); } catch { /* column already present */ }
  }
}

export async function db(): Promise<Client> {
  if (!_schemaInit) _schemaInit = ensureSchema();
  await _schemaInit;
  return getClient();
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function safeJsonParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

function rowToSavedAnalysis(row: AnalysisRow): SavedAnalysis {
  let worthWatching: WorthWatchingData | undefined;
  if (row.worth_watching) {
    try { worthWatching = JSON.parse(row.worth_watching) as WorthWatchingData; } catch { /* ignore */ }
  }
  return {
    id: row.id,
    videoId: row.video_id,
    youtubeUrl: row.youtube_url,
    title: row.title,
    channelName: row.channel_name ?? null,
    viewCount: row.view_count ?? null,
    uploadDate: row.upload_date ?? null,
    durationSeconds: row.duration_seconds ?? null,
    clickbait_score: row.clickbait_score,
    primary_subject: row.primary_subject,
    hard_data_points: safeJsonParse(row.hard_data_points, []) as SavedAnalysis["hard_data_points"],
    actionable_takeaways: safeJsonParse(row.actionable_takeaways, []) as SavedAnalysis["actionable_takeaways"],
    timestamps: safeJsonParse(row.timestamps, []) as SavedAnalysis["timestamps"],
    speaker_name: row.speaker_name ?? undefined,
    off_script_nuggets: row.off_script_nuggets ? safeJsonParse(row.off_script_nuggets, [] as string[]) : [],
    transcriptSource: row.transcript_source ?? "unknown",
    transcriptCharCount: row.transcript_char_count ?? 0,
    audioPath: row.audio_path ?? null,
    worth_watching: worthWatching,
    createdAt: row.created_at,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

export async function saveAnalysis(
  youtubeUrl: string,
  result: AnalyzeVideoResult,
  opts: { id?: string; audioPath?: string | null } = {},
): Promise<SavedAnalysis> {
  const c = await db();
  const id = opts.id ?? crypto.randomUUID();
  const audioPath = opts.audioPath ?? null;
  const createdAt = new Date().toISOString();

  await c.execute({
    sql: `INSERT INTO analyses (
      id, video_id, youtube_url, title, channel_name, view_count, upload_date, duration_seconds,
      clickbait_score, primary_subject,
      hard_data_points, actionable_takeaways, timestamps, off_script_nuggets, speaker_name,
      transcript_source, transcript_char_count, audio_path, worth_watching, created_at
    ) VALUES (
      :id, :video_id, :youtube_url, :title, :channel_name, :view_count, :upload_date, :duration_seconds,
      :clickbait_score, :primary_subject,
      :hard_data_points, :actionable_takeaways, :timestamps, :off_script_nuggets, :speaker_name,
      :transcript_source, :transcript_char_count, :audio_path, :worth_watching, :created_at
    )`,
    args: {
      id,
      video_id: result.videoId,
      youtube_url: youtubeUrl,
      title: result.title ?? null,
      channel_name: result.channelName ?? null,
      view_count: result.viewCount ?? null,
      upload_date: result.uploadDate ?? null,
      duration_seconds: result.durationSeconds ?? null,
      clickbait_score: result.clickbait_score,
      primary_subject: result.primary_subject,
      hard_data_points: JSON.stringify(result.hard_data_points),
      actionable_takeaways: JSON.stringify(result.actionable_takeaways),
      timestamps: JSON.stringify(result.timestamps),
      off_script_nuggets: JSON.stringify(result.off_script_nuggets ?? []),
      speaker_name: result.speaker_name ?? null,
      transcript_source: result.transcriptSource,
      transcript_char_count: result.transcriptCharCount,
      audio_path: audioPath,
      worth_watching: result.worth_watching ? JSON.stringify(result.worth_watching) : null,
      created_at: createdAt,
    },
  });

  return { ...result, id, youtubeUrl, audioPath, createdAt };
}

export async function updateAudioPath(id: string, audioPath: string): Promise<void> {
  const c = await db();
  await c.execute({ sql: `UPDATE analyses SET audio_path = ? WHERE id = ?`, args: [audioPath, id] });
}

function toKeyAnchorPreview(metricTitle: string | null): string | null {
  if (!metricTitle) return null;
  if (metricTitle.length <= 120) return metricTitle;
  const cut = metricTitle.lastIndexOf(" ", 120);
  return (cut > 60 ? metricTitle.slice(0, cut) : metricTitle.slice(0, 120)) + "…";
}

export async function listAnalyses(limit = 50): Promise<AnalysisSummary[]> {
  const c = await db();
  const result = await c.execute({
    sql: `SELECT id, video_id, youtube_url, title, channel_name, clickbait_score, primary_subject,
                 created_at, audio_path, upload_date, duration_seconds,
                 json_array_length(hard_data_points) as data_points_count,
                 COALESCE(transcript_char_count, 0) as transcript_char_count,
                 json_extract(hard_data_points, '$[0].metric_title') as key_anchor,
                 json_extract(hard_data_points, '$[0].metric_context_example') as context_example
          FROM analyses ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    videoId: row.video_id as string,
    youtubeUrl: row.youtube_url as string,
    title: (row.title as string | null) ?? null,
    channelName: (row.channel_name as string | null) ?? null,
    clickbaitScore: row.clickbait_score as number,
    primarySubject: row.primary_subject as string,
    audioPath: (row.audio_path as string | null) ?? null,
    dataPointsCount: (row.data_points_count as number) ?? 0,
    keyAnchorPreview: toKeyAnchorPreview((row.key_anchor as string | null) ?? null),
    contextExamplePreview: row.context_example ? (row.context_example as string).slice(0, 200) : null,
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    transcriptCharCount: (row.transcript_char_count as number) ?? 0,
    uploadDate: (row.upload_date as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function getLatestAnalysisByVideoId(videoId: string): Promise<SavedAnalysis | null> {
  const c = await db();
  const result = await c.execute({
    sql: `SELECT * FROM analyses WHERE video_id = ? ORDER BY created_at DESC LIMIT 1`,
    args: [videoId],
  });
  const row = result.rows[0];
  return row ? rowToSavedAnalysis(row as unknown as AnalysisRow) : null;
}

export async function getAnalysisById(id: string): Promise<SavedAnalysis | null> {
  const c = await db();
  const result = await c.execute({ sql: `SELECT * FROM analyses WHERE id = ?`, args: [id] });
  const row = result.rows[0];
  return row ? rowToSavedAnalysis(row as unknown as AnalysisRow) : null;
}

export async function getAnalysesByIds(ids: string[]): Promise<SavedAnalysis[]> {
  if (!ids.length) return [];
  const c = await db();
  const placeholders = ids.map(() => "?").join(", ");
  const result = await c.execute({ sql: `SELECT * FROM analyses WHERE id IN (${placeholders})`, args: ids });
  return result.rows.map((row) => rowToSavedAnalysis(row as unknown as AnalysisRow));
}

export async function updateBackfilledFields(
  id: string,
  updates: { durationSeconds: number | null; hardDataPoints: string; offScriptNuggets: string },
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE analyses SET duration_seconds = ?, hard_data_points = ?, off_script_nuggets = ? WHERE id = ?`,
    args: [updates.durationSeconds, updates.hardDataPoints, updates.offScriptNuggets, id],
  });
}

export async function deleteAnalysis(id: string): Promise<boolean> {
  const c = await db();
  const result = await c.execute({ sql: `DELETE FROM analyses WHERE id = ?`, args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}

// ── Intelligence Snapshot ─────────────────────────────────────────────────────

export interface SnapshotRecord {
  id: string;
  userId: string;
  computedAt: Date;
  metaData: Record<string, unknown>;
  brief: string[];
  alerts: Record<string, unknown>[];
  shifts: Record<string, unknown>[];
  voiceShare: Record<string, unknown>[];
}

export interface SnapshotUpsertData {
  userId: string;
  metaData: Record<string, unknown>;
  brief: string[];
  alerts: Record<string, unknown>[];
  shifts: Record<string, unknown>[];
  voiceShare: Record<string, unknown>[];
}

export async function getIntelligenceSnapshot(userId: string): Promise<SnapshotRecord | null> {
  const c = await db();
  const { rows } = await c.execute({
    sql: "SELECT * FROM intelligence_snapshot WHERE user_id = ?",
    args: [userId],
  });
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    userId: r.user_id as string,
    computedAt: new Date(r.computed_at as string),
    metaData: JSON.parse(r.meta_data as string),
    brief: JSON.parse(r.brief as string),
    alerts: JSON.parse(r.alerts as string),
    shifts: JSON.parse(r.shifts as string),
    voiceShare: JSON.parse(r.voice_share as string),
  };
}

export async function saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO user_refresh_tokens (user_id, refresh_token, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            refresh_token = excluded.refresh_token,
            updated_at    = excluded.updated_at`,
    args: [userId, refreshToken, new Date().toISOString()],
  });
}

export async function getRefreshToken(userId: string): Promise<string | null> {
  const c = await db();
  const { rows } = await c.execute({
    sql: "SELECT refresh_token FROM user_refresh_tokens WHERE user_id = ?",
    args: [userId],
  });
  return rows.length ? (rows[0].refresh_token as string) : null;
}

// ── Feed cache ────────────────────────────────────────────────────────────────

export async function getFeedCache(userId: string): Promise<{ cachedAt: Date; videos: unknown[] } | null> {
  const c = await db();
  const { rows } = await c.execute({
    sql: "SELECT cached_at, videos FROM feed_cache WHERE user_id = ?",
    args: [userId],
  });
  if (!rows.length) return null;
  return {
    cachedAt: new Date(rows[0].cached_at as string),
    videos: JSON.parse(rows[0].videos as string) as unknown[],
  };
}

export async function setFeedCache(userId: string, videos: unknown[]): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO feed_cache (user_id, cached_at, videos)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET cached_at = excluded.cached_at, videos = excluded.videos`,
    args: [userId, new Date().toISOString(), JSON.stringify(videos)],
  });
}

// ── Generic KV cache (used for persistent config values, e.g. curated channel IDs) ──

export async function getKV(key: string): Promise<string | null> {
  const c = await db();
  const { rows } = await c.execute({
    sql: "SELECT value FROM kv_cache WHERE key = ?",
    args: [key],
  });
  return rows.length ? (rows[0].value as string) : null;
}

export async function setKV(key: string, value: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO kv_cache (key, value, cached_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, cached_at = excluded.cached_at`,
    args: [key, value, new Date().toISOString()],
  });
}

// ── Creator authority ─────────────────────────────────────────────────────────

export type CreatorProfile = {
  channel_name: string;
  video_count: number;
  data_point_count: number;
  high_signal_count: number;
  category_count: number;
  authority_score: number;
  top_categories: string[];
  updated_at: string;
};

export type CreatorPosition = {
  channel_name: string;
  category: string;
  stance: "support" | "oppose" | "nuance";
  confidence: number;
  data_point_count: number;
  contrarian_count: number;
};

export async function upsertCreatorProfile(p: CreatorProfile): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO creator_profiles
            (channel_name, video_count, data_point_count, high_signal_count,
             category_count, authority_score, top_categories, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(channel_name) DO UPDATE SET
            video_count       = excluded.video_count,
            data_point_count  = excluded.data_point_count,
            high_signal_count = excluded.high_signal_count,
            category_count    = excluded.category_count,
            authority_score   = excluded.authority_score,
            top_categories    = excluded.top_categories,
            updated_at        = excluded.updated_at`,
    args: [
      p.channel_name, p.video_count, p.data_point_count, p.high_signal_count,
      p.category_count, p.authority_score, JSON.stringify(p.top_categories), p.updated_at,
    ],
  });
}

export async function upsertCreatorPosition(p: CreatorPosition): Promise<void> {
  const c = await db();
  const id = `${p.channel_name}__${p.category}`.replace(/\s+/g, "_").toLowerCase();
  await c.execute({
    sql: `INSERT INTO creator_positions
            (id, channel_name, category, stance, confidence, data_point_count, contrarian_count, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(channel_name, category) DO UPDATE SET
            stance           = excluded.stance,
            confidence       = excluded.confidence,
            data_point_count = excluded.data_point_count,
            contrarian_count = excluded.contrarian_count,
            updated_at       = excluded.updated_at`,
    args: [id, p.channel_name, p.category, p.stance, p.confidence, p.data_point_count, p.contrarian_count, new Date().toISOString()],
  });
}

export async function getCreatorProfilesForNames(names: string[]): Promise<CreatorProfile[]> {
  if (!names.length) return [];
  const c = await db();
  const placeholders = names.map(() => "?").join(",");
  const { rows } = await c.execute({
    sql: `SELECT * FROM creator_profiles WHERE channel_name IN (${placeholders})`,
    args: names,
  });
  return rows.map(r => ({
    channel_name:      r.channel_name as string,
    video_count:       r.video_count as number,
    data_point_count:  r.data_point_count as number,
    high_signal_count: r.high_signal_count as number,
    category_count:    r.category_count as number,
    authority_score:   r.authority_score as number,
    top_categories:    JSON.parse(r.top_categories as string) as string[],
    updated_at:        r.updated_at as string,
  }));
}

export async function getCreatorPositionsByCategory(category: string): Promise<CreatorPosition[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT * FROM creator_positions WHERE category = ?`,
    args: [category],
  });
  return rows.map(r => ({
    channel_name:    r.channel_name as string,
    category:        r.category as string,
    stance:          r.stance as "support" | "oppose" | "nuance",
    confidence:      r.confidence as number,
    data_point_count: r.data_point_count as number,
    contrarian_count: r.contrarian_count as number,
  }));
}

export async function getAllCreatorProfiles(): Promise<CreatorProfile[]> {
  const c = await db();
  const { rows } = await c.execute({ sql: `SELECT * FROM creator_profiles ORDER BY authority_score DESC`, args: [] });
  return rows.map(r => ({
    channel_name:      r.channel_name as string,
    video_count:       r.video_count as number,
    data_point_count:  r.data_point_count as number,
    high_signal_count: r.high_signal_count as number,
    category_count:    r.category_count as number,
    authority_score:   r.authority_score as number,
    top_categories:    JSON.parse(r.top_categories as string) as string[],
    updated_at:        r.updated_at as string,
  }));
}

// ── Pipeline cache ─────────────────────────────────────────────────────────────

export async function getUserPipelineCache(userId: string): Promise<{
  aiScores: Record<string, unknown>;
  consensusData: unknown;
  cachedAt: number;
} | null> {
  const c = await db();
  const row = await c.execute({
    sql: "SELECT ai_scores_cache, consensus_cache, pipeline_cached_at FROM intelligence_snapshot WHERE user_id = ?",
    args: [userId],
  });
  const r = row.rows[0];
  if (!r?.ai_scores_cache) return null;
  try {
    return {
      aiScores:      JSON.parse(r.ai_scores_cache as string) as Record<string, unknown>,
      consensusData: r.consensus_cache ? JSON.parse(r.consensus_cache as string) : null,
      cachedAt:      r.pipeline_cached_at ? new Date(r.pipeline_cached_at as string).getTime() : 0,
    };
  } catch { return null; }
}

export async function deleteUserPipelineCache(userId: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "UPDATE intelligence_snapshot SET ai_scores_cache = NULL, consensus_cache = NULL, pipeline_cached_at = NULL WHERE user_id = ?",
    args: [userId],
  });
}

export async function upsertUserPipelineCache(
  userId: string,
  aiScores: Record<string, unknown>,
  consensusData: unknown,
): Promise<void> {
  const c = await db();
  const now = new Date().toISOString();
  // Upsert into intelligence_snapshot — creates row if missing, otherwise updates cache columns
  await c.execute({
    sql: `INSERT INTO intelligence_snapshot (id, user_id, computed_at, meta_data, brief, alerts, shifts, voice_share, ai_scores_cache, consensus_cache, pipeline_cached_at)
          VALUES (?, ?, ?, '{}', '[]', '[]', '[]', '[]', ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            ai_scores_cache   = excluded.ai_scores_cache,
            consensus_cache   = excluded.consensus_cache,
            pipeline_cached_at = excluded.pipeline_cached_at`,
    args: [randomUUID(), userId, now, JSON.stringify(aiScores), JSON.stringify(consensusData), now],
  });
}

// ── Waitlist ──────────────────────────────────────────────────────────────────

export async function saveWaitlistEmail(email: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT OR IGNORE INTO waitlist (id, email, created_at) VALUES (?, ?, ?)`,
    args: [randomUUID(), email, new Date().toISOString()],
  });
}

// ── Beta events (signups + activations) ───────────────────────────────────────
// UNIQUE(event, user_id) ensures each event type is recorded once per user.

export async function recordBetaEvent(event: "signup" | "activation" | "first_analysis_generated", userId: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT OR IGNORE INTO beta_events (id, event, user_id, created_at) VALUES (?, ?, ?, ?)`,
    args: [randomUUID(), event, userId, new Date().toISOString()],
  });
}

export async function getBetaStats(): Promise<{ waitlist: number; signups: number; activations: number; firstAnalyses: number }> {
  const c = await db();
  const [w, s, a, f] = await Promise.all([
    c.execute(`SELECT COUNT(*) as n FROM waitlist`),
    c.execute(`SELECT COUNT(*) as n FROM beta_events WHERE event = 'signup'`),
    c.execute(`SELECT COUNT(*) as n FROM beta_events WHERE event = 'activation'`),
    c.execute(`SELECT COUNT(*) as n FROM beta_events WHERE event = 'first_analysis_generated'`),
  ]);
  return {
    waitlist:      Number(w.rows[0]?.n ?? 0),
    signups:       Number(s.rows[0]?.n ?? 0),
    activations:   Number(a.rows[0]?.n ?? 0),
    firstAnalyses: Number(f.rows[0]?.n ?? 0),
  };
}

// ── Team Workspace Waitlist ───────────────────────────────────────────────────

export async function joinTeamWorkspaceWaitlist(
  email: string,
  teamSize: string,
  company: string | null,
  userId: string | null,
): Promise<{ alreadyJoined: boolean }> {
  const c = await db();
  try {
    await c.execute({
      sql: `INSERT INTO team_workspace_waitlist (id, email, company, team_size, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), email, company, teamSize, userId, new Date().toISOString()],
    });
    return { alreadyJoined: false };
  } catch {
    return { alreadyJoined: true };
  }
}

// ── Research Index ────────────────────────────────────────────────────────────

export interface ResearchRow {
  id: string;
  analysis_id: string;
  video_id: string;
  video_title: string | null;
  channel_name: string | null;
  upload_date: string | null;
  type: string;
  quote: string | null;
  timestamp_str: string | null;
  insight: string | null;
  why_matters: string | null;
  takeaway: string | null;
  signal_strength: string | null;
  contrarian: string | null;
  category: string | null;
  embedding: number[] | null;
  indexed_at: string;
}

export async function upsertResearchRows(rows: Omit<ResearchRow, "indexed_at">[]): Promise<void> {
  if (!rows.length) return;
  const c = await db();
  const now = new Date().toISOString();
  await c.batch(
    rows.map(r => ({
      sql: `INSERT INTO research_index
              (id, analysis_id, video_id, video_title, channel_name, upload_date,
               type, quote, timestamp_str, insight, why_matters, takeaway,
               signal_strength, contrarian, category, embedding, indexed_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              embedding = excluded.embedding,
              indexed_at = excluded.indexed_at`,
      args: [
        r.id, r.analysis_id, r.video_id, r.video_title ?? null, r.channel_name ?? null,
        r.upload_date ?? null, r.type, r.quote ?? null, r.timestamp_str ?? null,
        r.insight ?? null, r.why_matters ?? null, r.takeaway ?? null,
        r.signal_strength ?? null, r.contrarian ?? null, r.category ?? null,
        r.embedding ? JSON.stringify(r.embedding) : null, now,
      ],
    })),
    "write",
  );
}

export async function getResearchRowsByAnalysis(analysisId: string): Promise<string[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT id FROM research_index WHERE analysis_id = ?`,
    args: [analysisId],
  });
  return rows.map(r => r.id as string);
}

export async function loadResearchIndex(limit = 3000): Promise<ResearchRow[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT * FROM research_index WHERE embedding IS NOT NULL ORDER BY indexed_at DESC LIMIT ?`,
    args: [limit],
  });
  return rows.map(r => ({
    id: r.id as string,
    analysis_id: r.analysis_id as string,
    video_id: r.video_id as string,
    video_title: r.video_title as string | null,
    channel_name: r.channel_name as string | null,
    upload_date: r.upload_date as string | null,
    type: r.type as string,
    quote: r.quote as string | null,
    timestamp_str: r.timestamp_str as string | null,
    insight: r.insight as string | null,
    why_matters: r.why_matters as string | null,
    takeaway: r.takeaway as string | null,
    signal_strength: r.signal_strength as string | null,
    contrarian: r.contrarian as string | null,
    category: r.category as string | null,
    embedding: r.embedding ? safeJsonParse(r.embedding as string, null) as number[] | null : null,
    indexed_at: r.indexed_at as string,
  }));
}

export async function getResearchIndexStats(): Promise<{ total: number; withEmbeddings: number; channels: string[] }> {
  const c = await db();
  const [tot, emb, ch] = await Promise.all([
    c.execute(`SELECT COUNT(*) as n FROM research_index`),
    c.execute(`SELECT COUNT(*) as n FROM research_index WHERE embedding IS NOT NULL`),
    c.execute(`SELECT DISTINCT channel_name FROM research_index WHERE channel_name IS NOT NULL ORDER BY channel_name`),
  ]);
  return {
    total: Number(tot.rows[0]?.n ?? 0),
    withEmbeddings: Number(emb.rows[0]?.n ?? 0),
    channels: ch.rows.map(r => r.channel_name as string),
  };
}

export async function getTeamWorkspaceWaitlistCount(): Promise<number> {
  const c = await db();
  const r = await c.execute(`SELECT COUNT(*) as n FROM team_workspace_waitlist`);
  return Number(r.rows[0]?.n ?? 0);
}

export async function upsertIntelligenceSnapshot(data: SnapshotUpsertData): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO intelligence_snapshot
            (id, user_id, computed_at, meta_data, brief, alerts, shifts, voice_share)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            computed_at = excluded.computed_at,
            meta_data   = excluded.meta_data,
            brief       = excluded.brief,
            alerts      = excluded.alerts,
            shifts      = excluded.shifts,
            voice_share = excluded.voice_share`,
    args: [
      randomUUID(),
      data.userId,
      new Date().toISOString(),
      JSON.stringify(data.metaData),
      JSON.stringify(data.brief),
      JSON.stringify(data.alerts),
      JSON.stringify(data.shifts),
      JSON.stringify(data.voiceShare),
    ],
  });
}
