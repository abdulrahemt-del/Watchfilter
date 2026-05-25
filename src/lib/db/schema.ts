import type { VideoAnalysis } from "../types";

export type WorthWatchingData = {
  score: number;
  educational_value: number;
  uniqueness: number;
  fluff_ratio: number;
  practicality: number;
  time_sensitivity: number;
  verdict: string;
  skip_to: string | null;
};

export type AnalysisRow = {
  id: string;
  video_id: string;
  youtube_url: string;
  title: string | null;
  channel_name: string | null;
  view_count: number | null;
  upload_date: string | null;
  duration_seconds: number | null;
  clickbait_score: number;
  primary_subject: string;
  hard_data_points: string;
  actionable_takeaways: string;
  timestamps: string;
  speaker_name: string | null;
  off_script_nuggets: string | null;
  transcript_source: string | null;
  transcript_char_count: number | null;
  audio_path: string | null;
  worth_watching: string | null;
  created_at: string;
};

export type AnalysisSummary = {
  id: string;
  videoId: string;
  youtubeUrl: string;
  title: string | null;
  channelName: string | null;
  clickbaitScore: number;
  primarySubject: string;
  audioPath: string | null;
  dataPointsCount: number;
  keyAnchorPreview: string | null;
  contextExamplePreview: string | null;
  durationSeconds: number | null;
  transcriptCharCount: number;
  uploadDate: string | null;
  createdAt: string;
};

export type SavedAnalysis = Omit<VideoAnalysis, "worth_watching"> & {
  id: string;
  videoId: string;
  youtubeUrl: string;
  title: string | null;
  channelName: string | null;
  viewCount: number | null;
  uploadDate: string | null;
  durationSeconds: number | null;
  transcriptCharCount: number;
  transcriptSource: string;
  audioPath: string | null;
  createdAt: string;
  worth_watching?: WorthWatchingData;
};
