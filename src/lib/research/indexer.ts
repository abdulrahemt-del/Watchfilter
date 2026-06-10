import { getAnalysisById, upsertResearchRows, getResearchRowsByAnalysis } from "@/lib/db";
import { embedText } from "./embed";

export async function indexAnalysis(analysisId: string): Promise<{ indexed: number }> {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis) throw new Error(`Analysis ${analysisId} not found`);

  const existing = new Set(await getResearchRowsByAnalysis(analysisId));
  const rows: Parameters<typeof upsertResearchRows>[0] = [];

  for (const [i, dp] of (analysis.hard_data_points ?? []).entries()) {
    const id = `${analysisId}-dp-${i}`;
    const textToEmbed = [dp.metric_title, dp.why_it_matters, dp.direct_quote]
      .filter(Boolean).join(". ");

    let embedding: number[] | null = null;
    if (textToEmbed && !existing.has(id)) {
      try { embedding = await embedText(textToEmbed); } catch { /* skip */ }
    }

    rows.push({
      id,
      analysis_id: analysisId,
      video_id: analysis.videoId,
      video_title: analysis.title ?? null,
      channel_name: analysis.channelName ?? null,
      upload_date: analysis.uploadDate ?? null,
      type: "data_point",
      quote: dp.direct_quote ?? null,
      timestamp_str: dp.exact_timestamp ?? null,
      insight: dp.metric_title ?? null,
      why_matters: dp.why_it_matters ?? null,
      takeaway: dp.actionable_takeaway ?? null,
      signal_strength: dp.signal_strength ?? null,
      contrarian: dp.contrarian_view ?? null,
      category: analysis.primary_subject ?? null,
      embedding,
    });
  }

  for (const [i, nugget] of (analysis.off_script_nuggets ?? []).entries()) {
    const id = `${analysisId}-nugget-${i}`;
    let embedding: number[] | null = null;
    if (nugget && !existing.has(id)) {
      try { embedding = await embedText(nugget); } catch { /* skip */ }
    }
    rows.push({
      id,
      analysis_id: analysisId,
      video_id: analysis.videoId,
      video_title: analysis.title ?? null,
      channel_name: analysis.channelName ?? null,
      upload_date: analysis.uploadDate ?? null,
      type: "nugget",
      quote: nugget,
      timestamp_str: null,
      insight: nugget,
      why_matters: null,
      takeaway: null,
      signal_strength: null,
      contrarian: null,
      category: analysis.primary_subject ?? null,
      embedding,
    });
  }

  if (rows.length) await upsertResearchRows(rows);
  return { indexed: rows.length };
}
