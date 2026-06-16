import { db, upsertCreatorProfile, upsertCreatorPosition } from "./db";

// ── Authority scoring ──────────────────────────────────────────────────────────
// Computed purely from library data — no YouTube API calls required.
// Score breakdown (0–100):
//   video presence  0–40  (12pts × video_count, capped at 40)
//   evidence density 0–30 (2pts × data_point_count, capped at 30)
//   signal quality  0–20  (3pts × high_signal_count, capped at 20)
//   topic breadth   0–10  (2pts × category_count, capped at 10)

export function computeAuthorityScore(
  videoCount: number,
  dataPointCount: number,
  highSignalCount: number,
  categoryCount: number,
): number {
  return (
    Math.min(videoCount * 12, 40) +
    Math.min(dataPointCount * 2, 30) +
    Math.min(highSignalCount * 3, 20) +
    Math.min(categoryCount * 2, 10)
  );
}

export function authorityTier(score: number): "High" | "Medium" | "Low" {
  if (score >= 65) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}

// ── Stance classification ──────────────────────────────────────────────────────
// Heuristic from existing contrarian field in research_index.
// contrarian_ratio > 0.5 → oppose, > 0 → nuance, else → support.

function classifyStance(
  dataPointCount: number,
  contradianCount: number,
): "support" | "oppose" | "nuance" {
  if (dataPointCount === 0) return "support";
  const ratio = contradianCount / dataPointCount;
  if (ratio > 0.5) return "oppose";
  if (ratio > 0) return "nuance";
  return "support";
}

function stanceConfidence(dataPointCount: number): number {
  return Math.min(dataPointCount * 20, 100);
}

// ── Main sync function ─────────────────────────────────────────────────────────

type RawCreatorRow = {
  channel_name: string;
  video_count: number;
  data_point_count: number;
  high_signal_count: number;
  contrarian_count: number;
  categories: string; // JSON array string
};

type RawPositionRow = {
  channel_name: string;
  category: string;
  data_point_count: number;
  contrarian_count: number;
};

export async function syncCreatorAuthority(): Promise<{
  creators: number;
  positions: number;
}> {
  const c = await db();

  // Aggregate per-creator stats from research_index
  const { rows: creatorRows } = await c.execute({
    sql: `
      SELECT
        channel_name,
        COUNT(DISTINCT analysis_id)                                    AS video_count,
        COUNT(CASE WHEN type = 'data_point' THEN 1 END)               AS data_point_count,
        COUNT(CASE WHEN signal_strength = 'HIGH' THEN 1 END)          AS high_signal_count,
        COUNT(CASE WHEN contrarian IS NOT NULL AND contrarian != '' THEN 1 END) AS contrarian_count,
        json_group_array(DISTINCT category)                            AS categories
      FROM research_index
      WHERE channel_name IS NOT NULL AND channel_name != ''
      GROUP BY channel_name
    `,
    args: [],
  });

  // Aggregate per creator × category for position mapping
  const { rows: positionRows } = await c.execute({
    sql: `
      SELECT
        channel_name,
        category,
        COUNT(CASE WHEN type = 'data_point' THEN 1 END)               AS data_point_count,
        COUNT(CASE WHEN contrarian IS NOT NULL AND contrarian != '' THEN 1 END) AS contrarian_count
      FROM research_index
      WHERE channel_name IS NOT NULL AND channel_name != ''
        AND category IS NOT NULL AND category != ''
        AND type = 'data_point'
      GROUP BY channel_name, category
    `,
    args: [],
  });

  const now = new Date().toISOString();
  let creatorCount = 0;
  let positionCount = 0;

  for (const row of creatorRows as unknown as RawCreatorRow[]) {
    const categories: string[] = (() => {
      try {
        const parsed = JSON.parse(row.categories) as (string | null)[];
        return parsed.filter((c): c is string => !!c);
      } catch {
        return [];
      }
    })();

    const score = computeAuthorityScore(
      row.video_count,
      row.data_point_count,
      row.high_signal_count,
      categories.length,
    );

    // Top 3 categories by appearance in the json_group_array
    const topCategories = categories.slice(0, 3);

    await upsertCreatorProfile({
      channel_name: row.channel_name,
      video_count: row.video_count,
      data_point_count: row.data_point_count,
      high_signal_count: row.high_signal_count,
      category_count: categories.length,
      authority_score: score,
      top_categories: topCategories,
      updated_at: now,
    });
    creatorCount++;
  }

  for (const row of positionRows as unknown as RawPositionRow[]) {
    const stance = classifyStance(row.data_point_count, row.contrarian_count);
    const confidence = stanceConfidence(row.data_point_count);

    await upsertCreatorPosition({
      channel_name: row.channel_name,
      category: row.category,
      stance,
      confidence,
      data_point_count: row.data_point_count,
      contrarian_count: row.contrarian_count,
    });
    positionCount++;
  }

  return { creators: creatorCount, positions: positionCount };
}
