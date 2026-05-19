import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AnalyzeVideoResult } from "../types";
import type { AnalysisRow, AnalysisSummary, SavedAnalysis } from "./schema";

const DEFAULT_DB_PATH = join(process.cwd(), "data", "watchfilter.db");

function getDbPath(): string {
  return process.env.DATABASE_PATH?.trim() || DEFAULT_DB_PATH;
}

let db: DatabaseSync | null = null;

function initSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS analyses (
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
    );

    CREATE INDEX IF NOT EXISTS idx_analyses_created_at
      ON analyses (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_analyses_video_id
      ON analyses (video_id);
  `);

  // Migration: add audio_path for databases created before this column existed.
  // SQLite does not support ADD COLUMN IF NOT EXISTS, so we catch the error if it already exists.
  try {
    database.exec(`ALTER TABLE analyses ADD COLUMN audio_path TEXT`);
  } catch {
    // column already present — nothing to do
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;

  const dbPath = getDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  initSchema(db);
  return db;
}

function rowToSavedAnalysis(row: AnalysisRow): SavedAnalysis {
  return {
    id: row.id,
    videoId: row.video_id,
    youtubeUrl: row.youtube_url,
    title: row.title,
    clickbait_score: row.clickbait_score,
    primary_subject: row.primary_subject,
    hard_data_points: JSON.parse(row.hard_data_points) as string[],
    actionable_takeaways: JSON.parse(row.actionable_takeaways) as string[],
    timestamps: JSON.parse(row.timestamps) as SavedAnalysis["timestamps"],
    transcriptSource: row.transcript_source ?? "unknown",
    transcriptCharCount: row.transcript_char_count ?? 0,
    audioPath: row.audio_path ?? null,
    createdAt: row.created_at,
  };
}

export function saveAnalysis(
  youtubeUrl: string,
  result: AnalyzeVideoResult,
  opts: { id?: string; audioPath?: string | null } = {},
): SavedAnalysis {
  const database = getDb();
  const id = opts.id ?? crypto.randomUUID();
  const audioPath = opts.audioPath ?? null;
  const createdAt = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO analyses (
        id, video_id, youtube_url, title,
        clickbait_score, primary_subject,
        hard_data_points, actionable_takeaways, timestamps,
        transcript_source, transcript_char_count, audio_path, created_at
      ) VALUES (
        @id, @video_id, @youtube_url, @title,
        @clickbait_score, @primary_subject,
        @hard_data_points, @actionable_takeaways, @timestamps,
        @transcript_source, @transcript_char_count, @audio_path, @created_at
      )`,
    )
    .run({
      id,
      video_id: result.videoId,
      youtube_url: youtubeUrl,
      title: result.title,
      clickbait_score: result.clickbait_score,
      primary_subject: result.primary_subject,
      hard_data_points: JSON.stringify(result.hard_data_points),
      actionable_takeaways: JSON.stringify(result.actionable_takeaways),
      timestamps: JSON.stringify(result.timestamps),
      transcript_source: result.transcriptSource,
      transcript_char_count: result.transcriptCharCount,
      audio_path: audioPath,
      created_at: createdAt,
    });

  return {
    ...result,
    id,
    youtubeUrl,
    audioPath,
    createdAt,
  };
}

export function listAnalyses(limit = 50): AnalysisSummary[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT id, video_id, youtube_url, title, clickbait_score, primary_subject, created_at
       FROM analyses
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    video_id: string;
    youtube_url: string;
    title: string | null;
    clickbait_score: number;
    primary_subject: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    videoId: row.video_id,
    youtubeUrl: row.youtube_url,
    title: row.title,
    clickbaitScore: row.clickbait_score,
    primarySubject: row.primary_subject,
    createdAt: row.created_at,
  }));
}

export function getAnalysisById(id: string): SavedAnalysis | null {
  const database = getDb();
  const row = database
    .prepare(`SELECT * FROM analyses WHERE id = ?`)
    .get(id) as AnalysisRow | undefined;

  return row ? rowToSavedAnalysis(row) : null;
}

export function deleteAnalysis(id: string): boolean {
  const database = getDb();
  const result = database
    .prepare(`DELETE FROM analyses WHERE id = ?`)
    .run(id);
  return (result.changes as number) > 0;
}
