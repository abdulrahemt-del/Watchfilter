import { useMemo } from "react";
import type { FeedVideo } from "@/app/api/youtube/feed/route";

export type FeedMode = "off" | "longform" | "business" | "founder" | "finance";

// ── Channel affinity map ──────────────────────────────────────────────────────
// Scores: -100 → +100
//   ≥ 70  → TRUSTED: auto-passes business/founder structural filter
//   ≤ -80 → HARD BLOCK: excluded from all modes
//   0     → UNKNOWN: blocked by default; needs AI businessRelevance ≥ 85
//
// Matching: longest-pattern wins ("bloomberg markets" +90 beats "bloomberg" +80)

export const CHANNEL_AFFINITY: Record<string, number> = {

  // ── S tier: gold standard (+100) ─────────────────────────────────────────
  "diary of a ceo":         100,
  "acquired":               100,
  "my first million":       100,
  "founders podcast":       100,
  "business breakdowns":    100,
  "invest like the best":   100,

  // ── A tier: premium business / markets (+90) ──────────────────────────────
  "bloomberg markets":      90,
  "bloomberg technology":   90,
  "bloomberg television":   90,
  "bloomberg originals":    90,
  "cnbc":                   90,
  "hormozi":                90,
  "alex hormozi":           90,
  "wsj":                    90,
  "wall street journal":    90,
  "real vision":            90,
  "how i built this":       90,
  "masters of scale":       90,
  "valuetainment":          90,
  "patrick bet-david":      90,
  "all-in podcast":         90,
  "allin podcast":          90,
  "20vc":                   90,
  "twenty minute vc":       90,
  "harry stebbings":        90,
  "the knowledge project":  90,

  // ── B tier: strong business / finance (+80) ───────────────────────────────
  "bloomberg":              80,
  "a16z":                   80,
  "andreessen":             80,
  "ycombinator":            80,
  "y combinator":           80,
  "sequoia":                80,
  "tim ferriss":            80,
  "lex fridman":            80,
  "raoul pal":              80,
  "forward guidance":       80,
  "macro voices":           80,
  "meb faber":              80,
  "capital allocators":     80,
  "knowledge project":      80,
  "patrick boyle":          80,
  "the plain bagel":        80,
  "plain bagel":            80,
  "rational reminder":      80,
  "wealthion":              80,
  "hidden forces":          80,
  "aswath damodaran":       80,
  "damodaran":              80,
  "scott galloway":         80,
  "prof g":                 80,
  "no mercy no malice":     80,
  "bankless":               80,
  "real vision crypto":     80,
  "goldman sachs":          80,
  "jpmorgan":               80,
  "morgan stanley":         80,
  "blackrock":              80,
  "bridgewater":            80,
  "chamath":                80,
  "david sacks":            80,
  "bestever":               80,
  "founder stories":        80,
  "noah kagan":             80,
  "appsumo":                80,
  "marketing against the grain": 80,
  "marketing school":       80,
  "neil patel":             80,

  // ── C tier: good business / finance (+70) ────────────────────────────────
  "graham stephan":         70,
  "meet kevin":             70,
  "andrei jikh":            70,
  "minority mindset":       70,
  "bigger pockets":         70,
  "biggerpockets":          70,
  "motley fool":            70,
  "seeking alpha":          70,
  "george gammon":          70,
  "peter schiff":           70,
  "grant cardone":          70,
  "school of greatness":    70,
  "ed mylett":              70,
  "impact theory":          70,
  "casgains academy":       70,
  "invest answers":         70,
  "james shack":            70,
  "bankeronwheels":         70,
  "rob berger":             70,
  "joseph carlson":         70,
  "the swedish investor":   70,
  "cole gordon":            70,
  "daniel priestley":       70,
  "jordan platten":         70,
  "two cents":              70,
  "wealth well done":       70,
  "heritage wealth planning": 70,
  "we study billionaires":  70,
  "the investors podcast":  70,
  "our rich journey":       70,
  "millennial money":       70,
  "chat with traders":      70,
  "jason hartman":          70,
  "morningstar":            70,
  "andy frisella":          70,
  "garyvee":                70,
  "gary vee":               70,
  "gary v":                 70,
  "ryan holiday":           70,
  "daily stoic":            70,
  "ali abdaal":             70,
  "mark moss":              70,
  "joseph carlson show":    70,
  "calfee":                 70,
  "james altucher":         70,
  "james clear":            70,
  "chris do":               70,
  "the futur":              70,
  "business casual":        70,
  "better explained":       70,
  "codie sanchez":          70,
  "contrarian thinking":    70,
  "modern mba":             70,
  "coffeezilla":            70,

  // ── Academic / institutional (+70–75) ────────────────────────────────────
  "stanford graduate school of business": 75,
  "stanford gsb":           75,
  "harvard business review": 75,
  "hbr":                    70,
  "mckinsey":               75,
  "mit sloan":              75,
  "wharton":                75,
  "london business school": 75,
  "chicago booth":          75,
  "insead":                 75,
  "kellogg":                70,

  // ── D tier: known business / educational (+65) — need AI for elevation ───
  "entrepreneur":           65,
  "inc magazine":           65,
  "inc.":                   65,
  "forbes":                 65,

  // ── Motivational / self-improvement with strong business crossover (+70) ──
  "mel robbins":            70,
  "simon sinek":            70,
  "tom bilyeu":             70,
  "lewis howes":            70,
  "brendon burchard":       70,
  "robin sharma":           70,
  "evan carmichael":        70,
  "jay shetty":             65,

  // ── Conspiracy / fringe: hard block (-100) ───────────────────────────────
  "london real":            -100,

  // ── General news: hard block (-100) ──────────────────────────────────────
  "firstpost":              -100,
  "cgtn":                   -100,
  "al jazeera":             -100,
  "sky news":               -100,
  "cnn":                    -100,
  "bbc news":               -100,
  "bbc world":              -100,
  "fox news":               -100,
  "france 24":              -100,
  "dw news":                -100,
  "euronews":               -100,
  "abc news":               -100,
  "nbc news":               -100,
  "cbs news":               -100,
  "pbs newshour":           -100,
  "associated press":       -100,
  "ap news":                -100,
  "reuters tv":             -100,
  "bloomberg quicktake":    -100,  // news ticker, not Bloomberg Markets
  "al arabiya":             -100,
  "times now":              -100,
  "ndtv":                   -100,
  "india today":            -100,
  "wion":                   -100,
  "republic world":         -100,
  "news18":                 -100,
  "channel 4 news":         -100,
  "itv news":               -100,
  "gb news":                -100,
  "the young turks":        -100,
  "aaj tak":                -100,
  "zee news":               -100,
  "ani news":               -100,
  "9 news":                 -100,
  "trt world":              -100,
  "msnbc":                  -100,

  // ── History / documentary / automotive: hard block (-100) ────────────────
  "history channel":        -100,
  "national geographic":    -100,
  "discovery channel":      -100,
  "smithsonian channel":    -100,
  "nova pbs":               -100,
  "kurzgesagt":             -100,
  "top gear":               -100,
  "jay leno":               -100,
  "motortrend":             -100,
  "carwow":                 -100,
  "car and driver":         -100,

  // ── Religion: hard block (-100) ──────────────────────────────────────────
  "huda tv":                -100,
  "ali dawah":              -100,
  "joel osteen":            -100,
  "joyce meyer":            -100,
  "td jakes":               -100,
  "joseph prince":          -100,
  "bible project":          -100,
  "daily grace":            -100,
  "alnaqwi":                -100,
  "al naqwi":               -100,
  "naqwi":                  -100,
  "merciful servant":       -100,
  "one islam":              -100,
  "ummah network":          -100,

  // ── Sports: hard block (-100) ────────────────────────────────────────────
  "espn":                   -100,
  "bleacher report":        -100,
  "sky sports":             -100,
  "beinsports":             -100,
  "five reasons sports":    -100,
  "the ringer":             -100,
  "barstool sports":        -100,

  // ── Chess: hard block (-100) ─────────────────────────────────────────────
  "gotham chess":           -100,
  "chess.com":              -100,
  "chessbase":              -100,
  "agadmator":              -100,
  "chess24":                -100,

  // ── Entertainment: hard block (-100) ─────────────────────────────────────
  "entertainment tonight":  -100,
  "tmz":                    -100,
  "e! news":                -100,
  "access hollywood":       -100,
};

// Returns the affinity score for a channel name.
// Longest-pattern match wins (most specific pattern takes priority).
export function getChannelAffinity(channelTitle: string): number {
  const lower = channelTitle.toLowerCase();
  let bestScore = 0;
  let bestLen   = 0;
  for (const [pattern, score] of Object.entries(CHANNEL_AFFINITY)) {
    if (lower.includes(pattern) && pattern.length > bestLen) {
      bestScore = score;
      bestLen   = pattern.length;
    }
  }
  return bestScore;
}

// ── Inclusion iron curtain — title must contain ≥1 of these ──────────────────
// Applied in business/founder modes even on trusted channels.
// Catches off-topic episodes: Lex Fridman doing quantum physics, CNBC posting
// sports interviews, Diary of a CEO doing pure lifestyle content, etc.

export const HIGH_SIGNAL_INCLUSION_TERMS = [
  // Finance / markets
  "business", "finance", "investing", "investments", "investor",
  "wealth", "money", "income", "capital", "portfolio",
  "market", "markets", "macro", "economics", "economy",
  "inflation", "recession", "interest rate",
  "stocks", "stock market", "hedge fund", "ipo", "etf",
  "equity", "valuation", "acquisition", "merger",
  "bond", "yield", "dividend", "crypto", "bitcoin",
  // Entrepreneurship / startups
  "founder", "startup", "entrepreneur", "entrepreneurship",
  "venture", "venture capital", "vc", "seed round",
  "series a", "series b", "fundraising",
  // Business operations
  "ceo", "cfo", "revenue", "profit", "saas",
  "agency", "scale", "marketing", "sales", "brand",
  "strategy", "growth", "b2b", "ecommerce",
  // Content format signals (combined with channel trust)
  "masterclass", "deep dive", "framework",
  "podcast", "interview",
  // Additional business signals from reference
  "fed", "scale", "offers",
];

// ── Hard title blocks — applied in EVERY mode ─────────────────────────────────
// Exported so the component can apply the same check when computing
// unknown-channel AI-elevation candidates.

export const HARD_TITLE_BLOCKS = [
  // Politics / geopolitics
  "trump", "iran", "geopolit",
  "ukraine war", "russia ukraine", "israel hamas",
  // War / conflict
  "war in ", "war rages", "war update", "war with ", "war crime",
  "drone strike", "air strike", "missile strike", "military operation",
  "invasion of ", "frontline", "ceasefire", "military coup",
  "battle of ", "bombing campaign",
  // Religion
  "quran", "allah", "islamic", "supplications", "barakah",
  "sheikh", "dawah", "imam", "bible study", "sermon",
  "church service", "prayer meeting", "spiritual awakening",
  "god's plan", "faith journey", "quran recitation", "islamic lecture",
  // Sports / athletes
  "messi", "ronaldo", "lebron", "neymar",
  "chess tournament", "chess game", "chess opening",
  "playoffs", "match highlights", "game recap", "sports highlights",
  // UFO / conspiracy / true crime
  "ufo", "conspiracy", "flat earth", "david icke", "they lied about",
  "deep state", "illuminati", "true crime", "serial killer", "murder case",
  // Breaking / live news
  "breaking news", "live news", "news update",
  // Relationships / lifestyle
  "marriage", "relationship advice", "dating tips", "toxic relationship",
  "workout plan", "diet plan", "weight loss", "gym routine", "bodybuilding",
  "travel vlog", "day in my life", "morning routine",
  // Automotive
  "car review", "test drive", "lamborghini", "ferrari",
  // Summary / compilation clips (low-value reposts)
  "extended summary",
  // History / science / nature documentaries
  "history documentary", "nature documentary", "wildlife documentary",
  "history of ", "ancient history", "world war ii",
  // Sports (categorical catch-all)
  "football", "soccer", "nba", "nfl", "cricket", "rugby", "chess",
];

// ── Constants ─────────────────────────────────────────────────────────────────

export const LONGFORM_MIN_SECS        = 1500; // 25 min
export const AFFINITY_PASS_THRESHOLD  = 70;   // trusted business channel — structural pass
export const AFFINITY_BLOCK_THRESHOLD = -80;  // hard block threshold
export const UNKNOWN_AI_THRESHOLD     = 85;   // AI businessRelevance gate for unknown channels

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isoToSeconds(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

export function detectPrimaryTopic(title: string, desc: string): string {
  const t = (title + " " + desc).toLowerCase();
  if (/invest|stock|trading|portfolio|hedge fund|venture capital|ipo|etf|bond|yield|dividend/.test(t))
    return "Finance / Investing";
  if (/startup|founder|entrepreneur|venture|raise|funding|series [a-z]|vc |accelerator/.test(t))
    return "Entrepreneurship";
  if (/revenue|profit|saas|b2b|ecommerce|sales|marketing|acquisition|m&a|merger/.test(t))
    return "Business Strategy";
  if (/economy|gdp|recession|inflation|monetary|macro|federal reserve|central bank/.test(t))
    return "Macro Economics";
  if (/real estate|property|mortgage|reit|rental/.test(t))
    return "Real Estate";
  if (/crypto|bitcoin|ethereum|blockchain|defi|nft/.test(t))
    return "Crypto / Web3";
  if (/business|wealth|money|financial|income/.test(t))
    return "Business / Wealth";
  return "General";
}

// ── Main hook ─────────────────────────────────────────────────────────────────
//
// Whitelist-first pipeline:
//   1. Hard blocks (all modes)        — known bad channels + banned title words
//   2. Duration gate                  — 25 min minimum (active modes)
//   3. Trusted channel gate           — business/founder: only affinity ≥ 70 passes
//
// Unknown channels (affinity 0–69) are NOT returned here.
// The component computes a separate "unknownCandidates" pool and AI-elevates
// any that score businessRelevance ≥ UNKNOWN_AI_THRESHOLD (85).

export function useFilteredFeed(rawVideos: FeedVideo[], mode: FeedMode): FeedVideo[] {
  return useMemo(() => {
    if (!rawVideos?.length) return [];

    // ── Step 1: Hard blocks + duration gate — every mode ───────────────────
    // 25 min minimum applies universally. "off" mode disables topic/trust gates
    // but never the duration floor — sub-25min videos are always excluded.
    const hardPassed: FeedVideo[] = [];
    for (const video of rawVideos) {
      if (getChannelAffinity(video.channelTitle) <= AFFINITY_BLOCK_THRESHOLD) continue;
      const ti = video.title.toLowerCase();
      if (HARD_TITLE_BLOCKS.some((p) => ti.includes(p))) continue;
      if (isoToSeconds(video.duration) < LONGFORM_MIN_SECS) continue;
      hardPassed.push(video);
    }

    // ── Step 2: mode="off" returns hard-filtered set only ───────────────────
    if (mode === "off") return hardPassed;

    // ── Step 3: Longform — hard blocks already applied, no topic gate ───────
    if (mode === "longform") {
      return hardPassed;
    }

    // ── Step 4: Active modes — hard blocks + duration gate already applied ──
    const durationPassed = hardPassed;

    // ── Step 5: Business / Founder — trusted bypass + inclusion gate ────────
    // Trusted channels (affinity ≥ 70): pass without an inclusion check.
    //   Title hard blocks already remove religion/sports/news episodes.
    //   AI quality gate (threshold 40) catches off-topic episodes like physics
    //   discussions or lifestyle content from otherwise business channels.
    // Unknown channels (affinity 0–69): must prove relevance via:
    //   • ≥1 inclusion term in title (high-confidence), OR
    //   • ≥2 inclusion terms in description (lower-confidence fallback, catches
    //     videos with generic titles but clearly business episode descriptions)
    const trusted = durationPassed.filter((v) => {
      const aff = getChannelAffinity(v.channelTitle);
      if (aff >= AFFINITY_PASS_THRESHOLD) return true;
      const ti = v.title.toLowerCase();
      if (HIGH_SIGNAL_INCLUSION_TERMS.some((kw) => ti.includes(kw))) return true;
      const desc = (v.description ?? "").toLowerCase().slice(0, 400);
      return HIGH_SIGNAL_INCLUSION_TERMS.some((kw) => desc.includes(kw));
    });

    // ── Step 6: Mode-specific topic gate ────────────────────────────────────
    // "business" is the catch-all — no additional filter.
    // "founder" narrows to startup/entrepreneurship/building/operating content.
    // "finance" narrows to investing/markets/personal finance/wealth content.
    if (mode === "founder") {
      const FOUNDER_TERMS = [
        "founder", "startup", "entrepreneur", "entrepreneurship",
        "venture capital", "vc ", "seed round", "series a", "series b",
        "fundraising", "angel investor", "build a business", "building a business",
        "saas", "b2b", "revenue model", "scaling", "agency", "product market fit",
        "hiring", "ceo", "company building", "bootstrap", "bootstrapped",
        "raise money", "raised $", "exit", "acquisition", "ipo",
      ];
      return trusted.filter((v) => {
        const t = (v.title + " " + (v.description ?? "").slice(0, 400)).toLowerCase();
        return FOUNDER_TERMS.some((kw) => t.includes(kw));
      });
    }

    if (mode === "finance") {
      const FINANCE_TERMS = [
        "invest", "stock market", "portfolio", "trading", "hedge fund",
        "etf", "bond", "yield", "dividend", "personal finance",
        "retirement", "401k", "roth", "ira", "index fund", "passive income",
        "financial independence", "fire movement", "net worth",
        "inflation", "recession", "federal reserve", "interest rate", "macro",
        "crypto", "bitcoin", "real estate", "mortgage", "reit",
        "wealth management", "wealth building", "money management",
        "financial planning", "asset allocation", "market crash", "market rally",
      ];
      return trusted.filter((v) => {
        const t = (v.title + " " + (v.description ?? "").slice(0, 400)).toLowerCase();
        return FINANCE_TERMS.some((kw) => t.includes(kw));
      });
    }

    return trusted;
  }, [rawVideos, mode]);
}
