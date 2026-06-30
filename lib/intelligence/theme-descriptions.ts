import { formatThemeCluster } from "@/lib/intelligence/format";

/** Unique, theme-specific insight lines — no shared templates. */
const FRUSTRATION_INSIGHTS: Record<string, string> = {
  discovery: "Users struggle to find fresh music beyond what Spotify already surfaces in feeds.",
  recommendations: "Personalized picks feel repetitive or misaligned with actual listening taste.",
  playback: "Core listening controls and audio playback fail during everyday use.",
  performance: "Crashes, lag, and freezes undermine trust during sessions.",
  pricing: "Subscription cost feels disconnected from the reliability users experience.",
  ads: "Ad interruptions break listening flow and push users toward canceling or upgrading.",
  ui_ux: "Navigation and layout changes make common tasks harder to complete.",
  offline: "Downloads and offline mode fail when users need reliability without connectivity.",
  podcasts: "Podcast playback and discovery behave inconsistently compared with music.",
  shuffle: "Shuffle feels predictable or loops the same tracks too quickly.",
  account_access: "Login, verification, and account recovery block access to paid libraries.",
  customer_support: "Billing and cancellation support loops leave users without resolution.",
  car_integration: "In-car playback via CarPlay or Android Auto is unreliable on the road.",
  audio_quality: "Sound output quality does not match expectations for a premium streamer.",
  lyrics: "Lyrics display and sync are missing or inaccurate during playback.",
  catalog_gaps: "Tracks users expect are missing, removed, or hard to locate in search.",
  library_management: "Organizing saved music and liked songs is cumbersome at scale.",
  download_reliability: "Offline downloads disappear or fail silently after syncing.",
  skip_limits: "Skip caps on free tier frustrate users who want control over queues.",
  ad_frequency: "Ad density during free listening feels excessive relative to session length.",
  general_negative: "Broad negative sentiment signals systemic dissatisfaction beyond a single feature.",
  uncategorized_feedback: "Miscellaneous feedback still points to unmet expectations in core listening.",
};

const OPPORTUNITY_INSIGHTS: Record<string, string> = {
  discovery: "Users praise discovery features when recommendations surface artists they would not find alone.",
  recommendations: "Strong algorithm fit drives loyalty — users cite Daily Mix and Discover Weekly as differentiators.",
  playback: "Reliable playback and queue control are cited as reasons users stay on Spotify daily.",
  offline: "Offline listening is a valued Premium capability when downloads work consistently.",
  lyrics: "Lyrics and sing-along features delight users who want deeper engagement with tracks.",
  sharing_social: "Social and family features create shared listening moments users want expanded.",
  audio_quality: "High-quality audio is a retention lever for audiophile segments.",
  library_management: "Power listeners want richer library tools to curate large collections.",
  crossfade_gapless: "Seamless transitions between tracks are requested for continuous listening.",
  sleep_timer: "Sleep timer and bedtime listening modes are explicit quality-of-life asks.",
  widgets_shortcuts: "Home-screen widgets and voice shortcuts reduce friction for quick playback.",
  general_positive: "Broad praise highlights brand love — an opportunity to reinforce what already works.",
  praise_discovery: "Users celebrate discovery and playlist features as reasons they stay subscribed.",
  praise_catalog: "Positive feedback on music depth and library access signals catalog strength.",
  praise_experience: "Users praise ease of use — the app feels intuitive for everyday listening.",
  praise_audio: "Sound quality compliments indicate audio output meets listener expectations.",
  uncategorized_positive: "Diffuse positive sentiment without a single feature anchor — worth qualitative follow-up.",
  uncategorized_negative: "Diffuse negative sentiment spanning multiple product areas.",
};

const TEMPLATED_PATTERNS = [
  /^a recurring frustration theme in recent spotify reviews\.?$/i,
  /^consistent request signal worth validating in product research\.?$/i,
  /^mentions grew \d/i,
  /^user demand increased \d/i,
  /^users consistently cite this when describing friction/i,
  /^would directly address user friction around/i,
  /^evaluate demand for/i,
  /^address rising friction around/i,
  /^run a targeted diary study on/i,
  /^define success metrics and ship a focused iteration/i,
];

export function themeKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function frustrationInsightFor(label: string, risingPct?: number | null): string {
  const key = themeKey(label);
  const base =
    FRUSTRATION_INSIGHTS[key] ??
    FRUSTRATION_INSIGHTS[themeKey(formatThemeCluster(label))] ??
    null;

  if (base) {
    if (risingPct && risingPct > 0) {
      return `${base} Mentions rose ${risingPct}% versus the prior period.`;
    }
    return base;
  }

  return `Reviewers repeatedly flag issues tied to ${label.toLowerCase()} in recent app store feedback.`;
}

export function opportunityInsightFor(
  label: string,
  source: "praise" | "request" | "gap",
  risingPct?: number | null
): string {
  const key = themeKey(label);
  let base =
    OPPORTUNITY_INSIGHTS[key] ??
    OPPORTUNITY_INSIGHTS[themeKey(formatThemeCluster(label))];

  if (!base) {
    if (source === "praise") {
      base = `Users explicitly praise ${label.toLowerCase()} — a signal to protect and expand.`;
    } else if (source === "request") {
      base = `Reviewers directly request improvements to ${label.toLowerCase()} in their feedback.`;
    } else {
      base = `Users describe an unmet need around ${label.toLowerCase()} that product could address.`;
    }
  }

  if (risingPct && risingPct > 0) {
    return `${base} Signal volume grew ${risingPct}% period-over-period.`;
  }
  return base;
}

export function themeSummaryFor(
  theme: string,
  count: number,
  changePct: number | null,
  sentiment?: string
): string {
  const label = formatThemeCluster(theme);
  const key = themeKey(theme);
  const change =
    changePct !== null
      ? ` Volume shifted ${changePct > 0 ? "+" : ""}${changePct}% versus the prior period.`
      : "";

  const summaries: Record<string, string> = {
    discovery: `Discovery feedback (${count} reviews) centers on whether Spotify helps users find new artists or keeps them in a narrow rotation.${change}`,
    recommendations: `${count} reviews discuss recommendation quality — trust in the algorithm and variety of suggested tracks.${change}`,
    playback: `Playback themes (${count} mentions) reflect day-to-day listening reliability — skips, queues, and audio continuity.${change}`,
    performance: `Performance complaints (${count}) cite crashes, lag, and instability during normal app use.${change}`,
    pricing: `${count} reviews tie subscription value to what Premium and free tiers actually deliver.${change}`,
    car_integration: `${count} users report in-car experience issues — CarPlay, Android Auto, and Bluetooth connectivity.${change}`,
    catalog_gaps: `${count} reviews flag missing tracks or catalog holes that break expected listening.${change}`,
    account_access: `Account and login friction appears in ${count} reviews, blocking access to libraries and subscriptions.${change}`,
    lyrics: `${count} users discuss lyrics features — accuracy, availability, and sing-along experience.${change}`,
    general_positive: `${count} broadly positive reviews highlight what Spotify gets right at a brand level.${change}`,
    uncategorized_feedback: `${count} reviews remain diffuse but still surface unaddressed product expectations.${change}`,
    discovery_enthusiasts: `${count.toLocaleString()} users actively seeking new music — frustrated when the algorithm recycles familiar tracks.${change}`,
  };

  const base =
    summaries[key] ??
    `${label} appears in ${count} reviews${sentiment ? ` with predominantly ${sentiment} tone` : ""}.${change}`;

  return base.trim();
}

/** Remove duplicate or templated filler insight strings. */
export function dedupeInsights(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of texts) {
    const t = raw.trim();
    if (t.length < 16) continue;
    if (TEMPLATED_PATTERNS.some((p) => p.test(t))) continue;

    const key = t.toLowerCase().slice(0, 72);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }

  return out;
}

export function buildExecutiveHeadlineFromStats(stats: {
  enriched_count: number;
  negative_pct: number;
  frustration_items: Array<{ label: string; count: number; pct: number }>;
}): string {
  const top = stats.frustration_items[0];
  if (!top) {
    return `${stats.enriched_count.toLocaleString()} Spotify app reviews analyzed — sentiment mix is ${stats.negative_pct}% negative.`;
  }

  const second = stats.frustration_items[1];
  if (second && second.pct >= top.pct * 0.6) {
    return `${top.label} and ${second.label} drive the most user frustration — ${top.pct}% and ${second.pct}% of analyzed reviews respectively.`;
  }

  return `${top.label} is the leading frustration at ${top.pct}% of analyzed reviews, outpacing other complaint themes in the corpus.`;
}
