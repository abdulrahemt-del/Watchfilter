import type { VideoAnalysis } from "../types";

export type AnalysisRow = {
  id: string;
  video_id: string;
  youtube_url: string;
  title: string | null;
  clickbait_score: number;
  primary_subject: string;
  hard_data_points: string;
  actionable_takeaways: string;
  timestamps: string;
  transcript_source: string | null;
  transcript_char_count: number | null;
  audio_path: string | null;
  created_at: string;
};

export type AnalysisSummary = {
  id: string;
  videoId: string;
  youtubeUrl: string;
  title: string | null;
  clickbaitScore: number;
  primarySubject: string;
  createdAt: string;
};

export type SavedAnalysis = VideoAnalysis & {
  id: string;
  videoId: string;
  youtubeUrl: string;
  title: string | null;
  transcriptCharCount: number;
  transcriptSource: string;
  audioPath: string | null;
  createdAt: string;
};
