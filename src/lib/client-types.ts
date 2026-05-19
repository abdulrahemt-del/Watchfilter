import type { SavedAnalysis } from "./db/schema";
import type { AnalysisSummary } from "./db/schema";

export type { SavedAnalysis, AnalysisSummary };

export type AnalyzeResponse = SavedAnalysis;

export type HistoryResponse = {
  analyses: AnalysisSummary[];
};

export type ApiErrorBody = {
  error: string;
  code?: string;
  attempts?: Array<{ strategy: string; proxy: string | null; error: string }>;
};
