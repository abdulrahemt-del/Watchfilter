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
    { sql: `CREATE TABLE IF NOT EXISTS creator_predictions (
      prediction_id              TEXT PRIMARY KEY,
      creator                    TEXT NOT NULL,
      topic                      TEXT NOT NULL,
      prediction_text            TEXT NOT NULL,
      created_at                 TEXT NOT NULL,
      confidence                 REAL NOT NULL DEFAULT 0.5,
      measurable_outcome         TEXT,
      evidence_source            TEXT,
      prediction_accuracy_score  REAL,
      evaluation_evidence        TEXT,
      evaluated_at               TEXT,
      status                     TEXT NOT NULL DEFAULT 'pending'
    )`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_predictions_creator ON creator_predictions (creator)`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_predictions_status  ON creator_predictions (status)`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS creator_accuracy (
      creator                TEXT PRIMARY KEY,
      predictions_total      INTEGER NOT NULL DEFAULT 0,
      predictions_resolved   INTEGER NOT NULL DEFAULT 0,
      predictions_correct    INTEGER NOT NULL DEFAULT 0,
      predictions_incorrect  INTEGER NOT NULL DEFAULT 0,
      predictions_mixed      INTEGER NOT NULL DEFAULT 0,
      accuracy_score         REAL NOT NULL DEFAULT 0,
      updated_at             TEXT NOT NULL
    )`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS domain_accuracy (
      domain               TEXT PRIMARY KEY,
      predictions_total    INTEGER NOT NULL DEFAULT 0,
      predictions_resolved INTEGER NOT NULL DEFAULT 0,
      accuracy_score       REAL NOT NULL DEFAULT 0,
      updated_at           TEXT NOT NULL
    )`, args: [] },
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
    // v3 attribution fields for creator_predictions
    `ALTER TABLE creator_predictions ADD COLUMN speaker_name TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN speaker_role TEXT NOT NULL DEFAULT 'HOST'`,
    `ALTER TABLE creator_predictions ADD COLUMN speaker_confidence TEXT NOT NULL DEFAULT 'MEDIUM'`,
    `ALTER TABLE creator_predictions ADD COLUMN entity_name TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN entity_type TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN attribution_strength TEXT NOT NULL DEFAULT 'IMPLIED'`,
    `ALTER TABLE creator_predictions ADD COLUMN outcome_tier INTEGER`,
    `ALTER TABLE creator_predictions ADD COLUMN is_evaluable INTEGER NOT NULL DEFAULT 0`,
    // v1 prediction engine fields
    `ALTER TABLE creator_predictions ADD COLUMN normalized_statement TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN prediction_type TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN domain TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN time_horizon_json TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN resolution_json TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN falsifiability_score REAL`,
    `ALTER TABLE creator_predictions ADD COLUMN specificity_score REAL`,
    `ALTER TABLE creator_predictions ADD COLUMN importance_score REAL`,
    `ALTER TABLE creator_predictions ADD COLUMN trackable INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE creator_predictions ADD COLUMN evidence_quote TEXT`,
    // v2 intelligence engine fields
    `ALTER TABLE creator_predictions ADD COLUMN forecast_json TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN relationships_json TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN market_consensus_position TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN calibration_confidence_style TEXT`,
    // v2.1 prediction engine fields
    `ALTER TABLE creator_predictions ADD COLUMN prediction_key TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN resolver_priority TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN creator_confidence_signal_json TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN evaluation_json TEXT`,
    // v3 resolver fields
    `ALTER TABLE creator_predictions ADD COLUMN resolved_at TEXT`,
    `ALTER TABLE creator_predictions ADD COLUMN resolver_notes TEXT`,
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

export async function deleteRefreshToken(userId: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "DELETE FROM user_refresh_tokens WHERE user_id = ?",
    args: [userId],
  });
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

export async function deleteFeedCache(userId: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "DELETE FROM feed_cache WHERE user_id = ?",
    args: [userId],
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

export async function getAllCreatorPositions(): Promise<CreatorPosition[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT * FROM creator_positions ORDER BY confidence DESC`,
    args: [],
  });
  return rows.map(r => ({
    channel_name:     r.channel_name as string,
    category:         r.category as string,
    stance:           r.stance as "support" | "oppose" | "nuance",
    confidence:       r.confidence as number,
    data_point_count: r.data_point_count as number,
    contrarian_count: r.contrarian_count as number,
  }));
}

// ── Temporal intelligence ─────────────────────────────────────────────────────

export type TemporalCreatorRow = {
  year: string;
  channel_name: string;
  data_point_count: number;
  contrarian_count: number;
};

export async function getCreatorTemporalData(creatorNames: string[]): Promise<TemporalCreatorRow[]> {
  if (!creatorNames.length) return [];
  const c = await db();
  const placeholders = creatorNames.map(() => "?").join(",");
  const { rows } = await c.execute({
    sql: `
      SELECT
        SUBSTR(COALESCE(upload_date, indexed_at), 1, 4)     AS year,
        channel_name,
        COUNT(CASE WHEN type = 'data_point' THEN 1 END)     AS data_point_count,
        COUNT(CASE WHEN contrarian IS NOT NULL
                    AND contrarian != '' THEN 1 END)        AS contrarian_count
      FROM research_index
      WHERE channel_name IN (${placeholders})
        AND (upload_date IS NOT NULL OR indexed_at IS NOT NULL)
      GROUP BY year, channel_name
      HAVING year GLOB '[0-9][0-9][0-9][0-9]'
      ORDER BY year, channel_name
    `,
    args: creatorNames,
  });
  return rows.map(r => ({
    year:              r.year as string,
    channel_name:      r.channel_name as string,
    data_point_count:  r.data_point_count as number,
    contrarian_count:  r.contrarian_count as number,
  }));
}

// ── Deep Research evidence retrieval ─────────────────────────────────────────

export type DeepResearchRow = {
  quote: string;
  insight: string | null;
  channel_name: string;
  video_title: string | null;
  video_id: string | null;
  timestamp_str: string | null;
  type: string;
  signal_strength: string | null;
  contrarian: string | null;
  category: string | null;
  takeaway: string | null;
  upload_date: string | null;
};

// Returns total count of matching creator segments — no LIMIT cap.
// Used to distinguish corpus gaps (count = 0) from retrieval failures (count > 0 but nothing surfaced).
export async function countCreatorCorpusMatches(keywords: string[]): Promise<number> {
  if (keywords.length === 0) return 0;
  const c = await db();
  const kws = keywords.slice(0, 8);
  const conditions = kws
    .map(() => `(LOWER(ri.quote) LIKE ? OR LOWER(COALESCE(ri.insight,'')) LIKE ? OR LOWER(COALESCE(ri.category,'')) LIKE ? OR LOWER(COALESCE(ri.video_title,'')) LIKE ?)`)
    .join(" OR ");
  const args = kws.flatMap(kw => [`%${kw}%`, `%${kw}%`, `%${kw}%`, `%${kw}%`]);
  const { rows } = await c.execute({
    sql: `SELECT COUNT(*) as n FROM research_index ri WHERE ri.quote IS NOT NULL AND ri.quote != '' AND (${conditions})`,
    args,
  });
  return Number(rows[0]?.n ?? 0);
}

let _gapsTableCreated = false;

// Logs queries where creator coverage was missing or retrieval failed.
// Data becomes the ingestion roadmap for expanding the creator corpus.
export async function logCreatorCoverageGap(
  query: string,
  topic: string,
  coverageStatus: string,
  corpusMatches: number,
): Promise<void> {
  const c = await db();
  if (!_gapsTableCreated) {
    await c.execute({
      sql: `CREATE TABLE IF NOT EXISTS creator_coverage_gaps (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        topic TEXT NOT NULL,
        coverage_status TEXT NOT NULL,
        corpus_matches INTEGER NOT NULL DEFAULT 0,
        queried_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    });
    _gapsTableCreated = true;
  }
  await c.execute({
    sql: `INSERT INTO creator_coverage_gaps (id, query, topic, coverage_status, corpus_matches) VALUES (?, ?, ?, ?, ?)`,
    args: [randomUUID(), query, topic, coverageStatus, corpusMatches],
  });
}

let _outcomeLogTableCreated = false;

export async function logCreatorOutcome(params: {
  query: string;
  outcome: string;
  corpus_matches: number;
  retrieved: number;
  accepted: number;
  high_alignment_claims: number;
  themes_generated: number;
  alignment_percentage: number;
  primary_failure_stage?: string;
}): Promise<void> {
  const c = await db();
  if (!_outcomeLogTableCreated) {
    await c.execute({
      sql: `CREATE TABLE IF NOT EXISTS creator_outcome_log (
        id                    TEXT PRIMARY KEY,
        query                 TEXT NOT NULL,
        timestamp             TEXT NOT NULL DEFAULT (datetime('now')),
        outcome               TEXT NOT NULL,
        corpus_matches        INTEGER NOT NULL DEFAULT 0,
        retrieved             INTEGER NOT NULL DEFAULT 0,
        accepted              INTEGER NOT NULL DEFAULT 0,
        high_alignment_claims INTEGER NOT NULL DEFAULT 0,
        themes_generated      INTEGER NOT NULL DEFAULT 0,
        alignment_percentage  INTEGER NOT NULL DEFAULT 0,
        primary_failure_stage TEXT
      )`,
      args: [],
    });
    _outcomeLogTableCreated = true;
  }
  await c.execute({
    sql: `INSERT INTO creator_outcome_log
          (id, query, outcome, corpus_matches, retrieved, accepted, high_alignment_claims, themes_generated, alignment_percentage, primary_failure_stage)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      params.query,
      params.outcome,
      params.corpus_matches,
      params.retrieved,
      params.accepted,
      params.high_alignment_claims,
      params.themes_generated,
      params.alignment_percentage,
      params.primary_failure_stage ?? null,
    ],
  });
}

export async function getDeepResearchEvidence(
  keywords: string[],
  limit = 60,
): Promise<DeepResearchRow[]> {
  const c = await db();

  let sql: string;
  let args: (string | number)[];

  if (keywords.length === 0) {
    sql = `
      SELECT ri.quote, ri.insight, ri.channel_name, ri.video_title, ri.video_id,
             ri.timestamp_str, ri.type, ri.signal_strength, ri.contrarian,
             ri.category, ri.takeaway,
             COALESCE(a.upload_date, ri.indexed_at) AS upload_date
      FROM research_index ri
      LEFT JOIN analyses a ON ri.analysis_id = a.id
      WHERE ri.quote IS NOT NULL AND ri.quote != ''
      ORDER BY CASE ri.signal_strength WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
               ri.indexed_at DESC
      LIMIT ${limit}
    `;
    args = [];
  } else {
    const kws = keywords.slice(0, 6);
    const conditions = kws
      .map(() => `(LOWER(ri.quote) LIKE ? OR LOWER(COALESCE(ri.insight,'')) LIKE ? OR LOWER(COALESCE(ri.category,'')) LIKE ? OR LOWER(COALESCE(ri.video_title,'')) LIKE ?)`)
      .join(" OR ");
    sql = `
      SELECT ri.quote, ri.insight, ri.channel_name, ri.video_title, ri.video_id,
             ri.timestamp_str, ri.type, ri.signal_strength, ri.contrarian,
             ri.category, ri.takeaway,
             COALESCE(a.upload_date, ri.indexed_at) AS upload_date
      FROM research_index ri
      LEFT JOIN analyses a ON ri.analysis_id = a.id
      WHERE ri.quote IS NOT NULL AND ri.quote != ''
        AND (${conditions})
      ORDER BY CASE ri.signal_strength WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
               ri.indexed_at DESC
      LIMIT ${limit}
    `;
    args = kws.flatMap(kw => [`%${kw}%`, `%${kw}%`, `%${kw}%`, `%${kw}%`]);
  }

  const { rows } = await c.execute({ sql, args });
  return rows.map(r => ({
    quote:          r.quote as string,
    insight:        r.insight as string | null,
    channel_name:   r.channel_name as string,
    video_title:    r.video_title as string | null,
    video_id:       r.video_id as string | null,
    timestamp_str:  r.timestamp_str as string | null,
    type:           r.type as string,
    signal_strength: r.signal_strength as string | null,
    contrarian:     r.contrarian as string | null,
    category:       r.category as string | null,
    takeaway:       r.takeaway as string | null,
    upload_date:    r.upload_date as string | null,
  }));
}

// ── Upload-date backfill (updates analyses + research_index for existing rows) ─

export async function getAnalysesWithNullUploadDate(): Promise<Array<{ id: string; video_id: string }>> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT id, video_id FROM analyses WHERE upload_date IS NULL`,
    args: [],
  });
  return rows.map(r => ({ id: r.id as string, video_id: r.video_id as string }));
}

export async function setAnalysisUploadDate(id: string, uploadDate: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE analyses SET upload_date = ? WHERE id = ?`,
    args: [uploadDate, id],
  });
  await c.execute({
    sql: `UPDATE research_index SET upload_date = ? WHERE analysis_id = ?`,
    args: [uploadDate, id],
  });
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

// ── Creator Predictions ───────────────────────────────────────────────────────

export type SpeakerRole = "HOST" | "GUEST" | "THIRD_PARTY";
export type AttributionStrength = "EXPLICIT" | "IMPLIED" | "PARAPHRASED";
export type OutcomeTier = 1 | 2 | 3 | 4;

export type PredictionRow = {
  prediction_id: string;
  creator: string;
  topic: string;
  prediction_text: string;
  created_at: string;
  confidence: number;
  measurable_outcome: string | null;
  evidence_source: string | null;
  // v3 structural attribution
  speaker_name: string | null;
  speaker_role: SpeakerRole;
  speaker_confidence: "HIGH" | "MEDIUM" | "LOW";
  entity_name: string | null;
  entity_type: string | null;
  attribution_strength: AttributionStrength;
  outcome_tier: OutcomeTier | null;
  is_evaluable: boolean;
  // evaluation output
  prediction_accuracy_score: number | null;
  evaluation_evidence: string | null;
  evaluated_at: string | null;
  status: "pending" | "accurate" | "inaccurate" | "unknown" | "unlinked" | "correct" | "incorrect" | "mixed";
  // resolver fields
  resolved_at: string | null;
  resolver_notes: string | null;
  // v1 engine fields
  normalized_statement: string | null;
  prediction_type: string | null;
  domain: string | null;
  time_horizon: { explicit: boolean; target_date: string | null; timeframe_text: string | null } | null;
  resolution: { metric: string | null; threshold: string | null; resolution_method: string; resolver_sources?: string[] } | null;
  falsifiability_score: number | null;
  specificity_score: number | null;
  importance_score: number | null;
  trackable: boolean;
  evidence_quote: string | null;
  // v2 intelligence engine fields
  forecast: { direction: string; estimated_probability: number } | null;
  relationships: Array<{ type: "supports" | "contradicts" | "depends_on"; target_prediction: string; confidence: number }> | null;
  market_consensus_position: "supportive" | "contrarian" | "neutral" | null;
  calibration_confidence_style: "low" | "medium" | "high" | null;
  // v2.1 fields
  prediction_key: string | null;
  resolver_priority: "low" | "medium" | "high" | null;
  creator_confidence_signal: { explicit_confidence: boolean; language_strength: number } | null;
  evaluation: { status: string; last_checked_at: string | null; resolver_confidence: number | null } | null;
};

export type PredictionAccuracyStat = {
  creator: string;
  total: number;
  evaluated: number;
  accuracy_score: number;
};

export async function upsertPrediction(p: PredictionRow): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO creator_predictions
            (prediction_id, creator, topic, prediction_text, created_at, confidence,
             measurable_outcome, evidence_source,
             speaker_name, speaker_role, speaker_confidence,
             entity_name, entity_type, attribution_strength,
             outcome_tier, is_evaluable,
             prediction_accuracy_score, evaluation_evidence, evaluated_at, status,
             normalized_statement, prediction_type, domain,
             time_horizon_json, resolution_json,
             falsifiability_score, specificity_score, importance_score,
             trackable, evidence_quote,
             forecast_json, relationships_json,
             market_consensus_position, calibration_confidence_style,
             prediction_key, resolver_priority,
             creator_confidence_signal_json, evaluation_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(prediction_id) DO UPDATE SET
            speaker_name              = excluded.speaker_name,
            speaker_role              = excluded.speaker_role,
            speaker_confidence        = excluded.speaker_confidence,
            entity_name               = excluded.entity_name,
            entity_type               = excluded.entity_type,
            attribution_strength      = excluded.attribution_strength,
            outcome_tier              = excluded.outcome_tier,
            is_evaluable              = excluded.is_evaluable,
            prediction_accuracy_score = excluded.prediction_accuracy_score,
            evaluation_evidence       = excluded.evaluation_evidence,
            evaluated_at              = excluded.evaluated_at,
            status                    = excluded.status,
            normalized_statement      = excluded.normalized_statement,
            prediction_type           = excluded.prediction_type,
            domain                    = excluded.domain,
            time_horizon_json         = excluded.time_horizon_json,
            resolution_json           = excluded.resolution_json,
            falsifiability_score      = excluded.falsifiability_score,
            specificity_score         = excluded.specificity_score,
            importance_score          = excluded.importance_score,
            trackable                 = excluded.trackable,
            evidence_quote            = excluded.evidence_quote,
            forecast_json             = excluded.forecast_json,
            relationships_json        = excluded.relationships_json,
            market_consensus_position = excluded.market_consensus_position,
            calibration_confidence_style = excluded.calibration_confidence_style,
            prediction_key               = excluded.prediction_key,
            resolver_priority            = excluded.resolver_priority,
            creator_confidence_signal_json = excluded.creator_confidence_signal_json,
            evaluation_json              = excluded.evaluation_json`,
    args: [
      p.prediction_id, p.creator, p.topic, p.prediction_text, p.created_at,
      p.confidence, p.measurable_outcome ?? null, p.evidence_source ?? null,
      p.speaker_name ?? null, p.speaker_role, p.speaker_confidence,
      p.entity_name ?? null, p.entity_type ?? null, p.attribution_strength,
      p.outcome_tier ?? null, p.is_evaluable ? 1 : 0,
      p.prediction_accuracy_score ?? null, p.evaluation_evidence ?? null,
      p.evaluated_at ?? null, p.status,
      p.normalized_statement ?? null, p.prediction_type ?? null, p.domain ?? null,
      p.time_horizon ? JSON.stringify(p.time_horizon) : null,
      p.resolution ? JSON.stringify(p.resolution) : null,
      p.falsifiability_score ?? null, p.specificity_score ?? null, p.importance_score ?? null,
      p.trackable ? 1 : 0, p.evidence_quote ?? null,
      p.forecast ? JSON.stringify(p.forecast) : null,
      p.relationships ? JSON.stringify(p.relationships) : null,
      p.market_consensus_position ?? null, p.calibration_confidence_style ?? null,
      p.prediction_key ?? null, p.resolver_priority ?? null,
      p.creator_confidence_signal ? JSON.stringify(p.creator_confidence_signal) : null,
      p.evaluation ? JSON.stringify(p.evaluation) : null,
    ],
  });
}

function rowToPrediction(r: Record<string, unknown>): PredictionRow {
  return {
    prediction_id:            r.prediction_id as string,
    creator:                  r.creator as string,
    topic:                    r.topic as string,
    prediction_text:          r.prediction_text as string,
    created_at:               r.created_at as string,
    confidence:               r.confidence as number,
    measurable_outcome:       r.measurable_outcome as string | null,
    evidence_source:          r.evidence_source as string | null,
    speaker_name:             r.speaker_name as string | null,
    speaker_role:             (r.speaker_role as SpeakerRole) ?? "HOST",
    speaker_confidence:       (r.speaker_confidence as "HIGH" | "MEDIUM" | "LOW") ?? "MEDIUM",
    entity_name:              r.entity_name as string | null,
    entity_type:              r.entity_type as string | null,
    attribution_strength:     (r.attribution_strength as AttributionStrength) ?? "IMPLIED",
    outcome_tier:             r.outcome_tier as OutcomeTier | null,
    is_evaluable:             Boolean(r.is_evaluable),
    prediction_accuracy_score: r.prediction_accuracy_score as number | null,
    evaluation_evidence:      r.evaluation_evidence as string | null,
    evaluated_at:             r.evaluated_at as string | null,
    status:                   (r.status as PredictionRow["status"]) ?? "pending",
    normalized_statement:     r.normalized_statement as string | null,
    prediction_type:          r.prediction_type as string | null,
    domain:                   r.domain as string | null,
    time_horizon:             r.time_horizon_json ? (() => { try { return JSON.parse(r.time_horizon_json as string) as PredictionRow["time_horizon"]; } catch { return null; } })() : null,
    resolution:               r.resolution_json ? (() => { try { return JSON.parse(r.resolution_json as string) as PredictionRow["resolution"]; } catch { return null; } })() : null,
    falsifiability_score:     r.falsifiability_score as number | null,
    specificity_score:        r.specificity_score as number | null,
    importance_score:         r.importance_score as number | null,
    trackable:                Boolean(r.trackable),
    evidence_quote:           r.evidence_quote as string | null,
    forecast:                 r.forecast_json ? (() => { try { return JSON.parse(r.forecast_json as string) as PredictionRow["forecast"]; } catch { return null; } })() : null,
    relationships:            r.relationships_json ? (() => { try { return JSON.parse(r.relationships_json as string) as PredictionRow["relationships"]; } catch { return null; } })() : null,
    market_consensus_position: (r.market_consensus_position as PredictionRow["market_consensus_position"]) ?? null,
    calibration_confidence_style: (r.calibration_confidence_style as PredictionRow["calibration_confidence_style"]) ?? null,
    prediction_key:               r.prediction_key as string | null,
    resolver_priority:            (r.resolver_priority as PredictionRow["resolver_priority"]) ?? null,
    creator_confidence_signal:    r.creator_confidence_signal_json ? (() => { try { return JSON.parse(r.creator_confidence_signal_json as string) as PredictionRow["creator_confidence_signal"]; } catch { return null; } })() : null,
    evaluation:                   r.evaluation_json ? (() => { try { return JSON.parse(r.evaluation_json as string) as PredictionRow["evaluation"]; } catch { return null; } })() : null,
    resolved_at:                  r.resolved_at as string | null,
    resolver_notes:               r.resolver_notes as string | null,
  };
}

export async function listPredictions(limit = 100): Promise<PredictionRow[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT * FROM creator_predictions ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  });
  return rows.map(r => rowToPrediction(r as Record<string, unknown>));
}

export async function getPredictionById(id: string): Promise<PredictionRow | null> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT * FROM creator_predictions WHERE prediction_id = ?`,
    args: [id],
  });
  if (!rows.length) return null;
  return rowToPrediction(rows[0] as Record<string, unknown>);
}

export async function updatePredictionScore(
  predictionId: string,
  score: number,
  evidence: string,
  status: "accurate" | "inaccurate" | "unknown" | "unlinked",
  outcomeTier?: OutcomeTier,
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE creator_predictions SET
            prediction_accuracy_score = ?,
            evaluation_evidence       = ?,
            evaluated_at              = ?,
            status                    = ?,
            outcome_tier              = COALESCE(?, outcome_tier)
          WHERE prediction_id = ?`,
    args: [score, evidence, new Date().toISOString(), status, outcomeTier ?? null, predictionId],
  });
}

export type AttributionContaminationReport = {
  total: number;
  host_claims: number;
  guest_claims: number;
  third_party_claims: number;
  unlinked_claims: number;
  evaluable: number;
  guest_contamination_pct: number;
  attribution_ambiguity_pct: number;
  tier_distribution: { tier1: number; tier2: number; tier3: number; tier4: number };
  weighted_accuracy: number | null;
};

export async function getAttributionContaminationReport(): Promise<AttributionContaminationReport> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT speaker_role, attribution_strength, is_evaluable, outcome_tier,
                 prediction_accuracy_score, status
          FROM creator_predictions`,
    args: [],
  });

  let host = 0, guest = 0, third = 0, unlinked = 0;
  let evaluable = 0;
  let implied = 0, paraphrased = 0;
  let t1 = 0, t2 = 0, t3 = 0, t4 = 0;
  let weightedSum = 0, weightedCount = 0;

  for (const r of rows) {
    const role = r.speaker_role as string;
    const strength = r.attribution_strength as string;
    const status = r.status as string;
    const tier = r.outcome_tier as number | null;
    const score = r.prediction_accuracy_score as number | null;
    const isEval = Boolean(r.is_evaluable);

    if (role === "HOST") host++;
    else if (role === "GUEST") guest++;
    else if (role === "THIRD_PARTY") third++;
    if (status === "unlinked") unlinked++;
    if (isEval) evaluable++;
    if (strength === "IMPLIED") implied++;
    else if (strength === "PARAPHRASED") paraphrased++;

    if (tier === 1) t1++;
    else if (tier === 2) t2++;
    else if (tier === 3) t3++;
    else t4++;

    // Weighted accuracy: Tier1=1.0, Tier2=0.6, Tier3=0.3, Tier4=excluded
    if (score !== null && tier !== null && tier < 4) {
      const w = tier === 1 ? 1.0 : tier === 2 ? 0.6 : 0.3;
      weightedSum += (score / 100) * w;
      weightedCount += w;
    }
  }

  const total = rows.length;
  return {
    total,
    host_claims: host,
    guest_claims: guest,
    third_party_claims: third,
    unlinked_claims: unlinked,
    evaluable,
    guest_contamination_pct: total > 0 ? Math.round((guest / total) * 100) : 0,
    attribution_ambiguity_pct: total > 0 ? Math.round(((implied + paraphrased) / total) * 100) : 0,
    tier_distribution: { tier1: t1, tier2: t2, tier3: t3, tier4: t4 },
    weighted_accuracy: weightedCount > 0 ? Math.round((weightedSum / weightedCount) * 100) : null,
  };
}

export async function getCreatorPredictionStats(creators?: string[]): Promise<PredictionAccuracyStat[]> {
  const c = await db();
  let sql: string;
  let args: (string | number)[];

  if (creators?.length) {
    const ph = creators.map(() => "?").join(",");
    sql = `
      SELECT creator,
             COUNT(*) as total,
             COUNT(CASE WHEN evaluated_at IS NOT NULL THEN 1 END) as evaluated,
             COALESCE(AVG(CASE WHEN prediction_accuracy_score IS NOT NULL THEN prediction_accuracy_score END), 0) as accuracy_score
      FROM creator_predictions WHERE creator IN (${ph})
      GROUP BY creator ORDER BY accuracy_score DESC
    `;
    args = creators;
  } else {
    sql = `
      SELECT creator,
             COUNT(*) as total,
             COUNT(CASE WHEN evaluated_at IS NOT NULL THEN 1 END) as evaluated,
             COALESCE(AVG(CASE WHEN prediction_accuracy_score IS NOT NULL THEN prediction_accuracy_score END), 0) as accuracy_score
      FROM creator_predictions
      GROUP BY creator ORDER BY accuracy_score DESC
    `;
    args = [];
  }

  const { rows } = await c.execute({ sql, args });
  return rows.map(r => ({
    creator: r.creator as string,
    total: r.total as number,
    evaluated: r.evaluated as number,
    accuracy_score: Math.round(r.accuracy_score as number),
  }));
}

export type DomainAccuracyStat = {
  domain: string;
  total: number;
  evaluated: number;
  accuracy_score: number;
  supporting: number;
  opposing: number;
};

export async function getCreatorAccuracyByDomain(): Promise<DomainAccuracyStat[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT
            COALESCE(domain, topic, 'General') AS domain,
            COUNT(*) AS total,
            COUNT(CASE WHEN evaluated_at IS NOT NULL THEN 1 END) AS evaluated,
            COALESCE(AVG(CASE WHEN prediction_accuracy_score IS NOT NULL THEN prediction_accuracy_score END), 0) AS accuracy_score,
            COUNT(CASE WHEN confidence >= 0.55 THEN 1 END) AS supporting,
            COUNT(CASE WHEN confidence < 0.45 THEN 1 END) AS opposing
          FROM creator_predictions
          GROUP BY COALESCE(domain, topic, 'General')
          HAVING COUNT(*) >= 2
          ORDER BY total DESC
          LIMIT 10`,
    args: [],
  });
  return rows.map(r => ({
    domain: r.domain as string,
    total: r.total as number,
    evaluated: r.evaluated as number,
    accuracy_score: Math.round(r.accuracy_score as number),
    supporting: r.supporting as number,
    opposing: r.opposing as number,
  }));
}

// ── Prediction Resolver ───────────────────────────────────────────────────────

export type ResolutionStatus = "correct" | "incorrect" | "mixed";

export type CreatorAccuracyRow = {
  creator: string;
  predictions_total: number;
  predictions_resolved: number;
  predictions_correct: number;
  predictions_incorrect: number;
  predictions_mixed: number;
  accuracy_score: number;
  leaderboard_score: number;
  updated_at: string;
};

export type DomainAccuracyTableRow = {
  domain: string;
  predictions_total: number;
  predictions_resolved: number;
  accuracy_score: number;
  updated_at: string;
};

export async function listPredictionsFiltered(opts: {
  status?: string;
  creator?: string;
  domain?: string;
  priority?: string;
  limit?: number;
} = {}): Promise<PredictionRow[]> {
  const c = await db();
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (opts.status) {
    if (opts.status === "unresolved") {
      conditions.push(`(status = 'pending' OR status IS NULL)`);
    } else {
      conditions.push(`status = ?`);
      args.push(opts.status);
    }
  }
  if (opts.creator) { conditions.push(`creator = ?`); args.push(opts.creator); }
  if (opts.domain) { conditions.push(`COALESCE(domain, topic) = ?`); args.push(opts.domain); }
  if (opts.priority) { conditions.push(`resolver_priority = ?`); args.push(opts.priority); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 200;
  args.push(limit);

  const { rows } = await c.execute({
    sql: `SELECT * FROM creator_predictions ${where}
          ORDER BY
            CASE resolver_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
            created_at DESC
          LIMIT ?`,
    args,
  });
  return rows.map(r => rowToPrediction(r as Record<string, unknown>));
}

export async function resolvePrediction(
  predictionId: string,
  resolution: {
    status: ResolutionStatus;
    resolver_notes: string | null;
    resolver_confidence: number | null;
  },
): Promise<void> {
  const c = await db();
  const now = new Date().toISOString();

  // Fetch the prediction to get creator + domain for accuracy recalculation
  const pred = await getPredictionById(predictionId);
  if (!pred) throw new Error(`Prediction not found: ${predictionId}`);

  await c.execute({
    sql: `UPDATE creator_predictions SET
            status         = ?,
            resolved_at    = ?,
            resolver_notes = ?,
            evaluation_json = ?
          WHERE prediction_id = ?`,
    args: [
      resolution.status,
      now,
      resolution.resolver_notes ?? null,
      JSON.stringify({
        status: resolution.status,
        last_checked_at: now,
        resolver_confidence: resolution.resolver_confidence ?? null,
      }),
      predictionId,
    ],
  });

  await recalculateCreatorAccuracy(pred.creator);
  const domain = pred.domain ?? pred.topic;
  if (domain) await recalculateDomainAccuracy(domain);
}

async function recalculateCreatorAccuracy(creator: string): Promise<void> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT status FROM creator_predictions WHERE creator = ?`,
    args: [creator],
  });

  let correct = 0, incorrect = 0, mixed = 0;
  for (const r of rows) {
    const s = r.status as string;
    if (s === "correct") correct++;
    else if (s === "incorrect") incorrect++;
    else if (s === "mixed") mixed++;
  }

  const total = rows.length;
  const resolved = correct + incorrect + mixed;
  const accuracyScore = resolved > 0 ? (correct + mixed * 0.5) / resolved : 0;
  const leaderboardScore = accuracyScore * Math.log(resolved + 1);
  const now = new Date().toISOString();

  await c.execute({
    sql: `INSERT INTO creator_accuracy
            (creator, predictions_total, predictions_resolved, predictions_correct,
             predictions_incorrect, predictions_mixed, accuracy_score, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(creator) DO UPDATE SET
            predictions_total     = excluded.predictions_total,
            predictions_resolved  = excluded.predictions_resolved,
            predictions_correct   = excluded.predictions_correct,
            predictions_incorrect = excluded.predictions_incorrect,
            predictions_mixed     = excluded.predictions_mixed,
            accuracy_score        = excluded.accuracy_score,
            updated_at            = excluded.updated_at`,
    args: [creator, total, resolved, correct, incorrect, mixed, accuracyScore, now],
  });

  void leaderboardScore; // used in getCreatorAccuracyLeaderboard, computed on read
}

async function recalculateDomainAccuracy(domain: string): Promise<void> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT status FROM creator_predictions WHERE COALESCE(domain, topic) = ?`,
    args: [domain],
  });

  let correct = 0, incorrect = 0, mixed = 0;
  for (const r of rows) {
    const s = r.status as string;
    if (s === "correct") correct++;
    else if (s === "incorrect") incorrect++;
    else if (s === "mixed") mixed++;
  }

  const total = rows.length;
  const resolved = correct + incorrect + mixed;
  const accuracyScore = resolved > 0 ? (correct + mixed * 0.5) / resolved : 0;

  await c.execute({
    sql: `INSERT INTO domain_accuracy
            (domain, predictions_total, predictions_resolved, accuracy_score, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(domain) DO UPDATE SET
            predictions_total    = excluded.predictions_total,
            predictions_resolved = excluded.predictions_resolved,
            accuracy_score       = excluded.accuracy_score,
            updated_at           = excluded.updated_at`,
    args: [domain, total, resolved, accuracyScore, new Date().toISOString()],
  });
}

export async function getCreatorAccuracyLeaderboard(limit = 20): Promise<CreatorAccuracyRow[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT * FROM creator_accuracy
          WHERE predictions_resolved >= 3
          ORDER BY (accuracy_score * log(predictions_resolved + 1)) DESC
          LIMIT ?`,
    args: [limit],
  });
  return rows.map(r => ({
    creator:               r.creator as string,
    predictions_total:     r.predictions_total as number,
    predictions_resolved:  r.predictions_resolved as number,
    predictions_correct:   r.predictions_correct as number,
    predictions_incorrect: r.predictions_incorrect as number,
    predictions_mixed:     r.predictions_mixed as number,
    accuracy_score:        r.accuracy_score as number,
    leaderboard_score:     (r.accuracy_score as number) * Math.log((r.predictions_resolved as number) + 1),
    updated_at:            r.updated_at as string,
  }));
}

export async function getDomainAccuracyLeaderboard(limit = 20): Promise<DomainAccuracyTableRow[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT * FROM domain_accuracy
          WHERE predictions_resolved >= 2
          ORDER BY accuracy_score DESC, predictions_resolved DESC
          LIMIT ?`,
    args: [limit],
  });
  return rows.map(r => ({
    domain:               r.domain as string,
    predictions_total:    r.predictions_total as number,
    predictions_resolved: r.predictions_resolved as number,
    accuracy_score:       r.accuracy_score as number,
    updated_at:           r.updated_at as string,
  }));
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
