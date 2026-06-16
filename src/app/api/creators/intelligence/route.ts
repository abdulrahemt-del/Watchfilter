import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getAllCreatorProfiles, getAllCreatorPositions } from "@/lib/db";

export const runtime = "nodejs";

export type DebateEntry = {
  category: string;
  creator_count: number;
  supporters: string[];
  challengers: string[];
  nuanced: string[];
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profiles, positions] = await Promise.all([
    getAllCreatorProfiles(),
    getAllCreatorPositions(),
  ]);

  // Group positions by category to find debates
  const byCategory = new Map<string, { supporters: string[]; challengers: string[]; nuanced: string[] }>();
  for (const pos of positions) {
    if (!pos.category) continue;
    if (!byCategory.has(pos.category)) {
      byCategory.set(pos.category, { supporters: [], challengers: [], nuanced: [] });
    }
    const entry = byCategory.get(pos.category)!;
    if (pos.stance === "support") entry.supporters.push(pos.channel_name);
    else if (pos.stance === "oppose") entry.challengers.push(pos.channel_name);
    else entry.nuanced.push(pos.channel_name);
  }

  const debates: DebateEntry[] = [...byCategory.entries()]
    .filter(([, { supporters, challengers, nuanced }]) =>
      supporters.length > 0 && (challengers.length > 0 || nuanced.length > 0),
    )
    .map(([category, { supporters, challengers, nuanced }]) => ({
      category,
      creator_count: supporters.length + challengers.length + nuanced.length,
      supporters,
      challengers,
      nuanced,
    }))
    .sort((a, b) =>
      (b.challengers.length + b.nuanced.length) - (a.challengers.length + a.nuanced.length) ||
      b.creator_count - a.creator_count,
    )
    .slice(0, 8);

  return NextResponse.json({ profiles, debates });
}
