/**
 * Secondary clustering for reviews tagged "general" (Other Topics) and
 * share-cap enforcement so no theme bucket exceeds MAX_THEME_SHARE_PCT.
 */

export const MAX_THEME_SHARE_PCT = 15;

export interface SubThemeRule {
  id: string;
  pattern: RegExp;
  /** Higher = checked first when multiple match */
  priority: number;
  /** Optional parent theme — used to subdivide oversized primary buckets */
  parent?: string;
}

/** Granular themes for reviews that would otherwise land in "general". */
export const SUB_THEME_RULES: SubThemeRule[] = [
  { id: "account_access", pattern: /log\s?in|password|sign\s?in|account|verify|2fa|authentication|locked out/i, priority: 10 },
  { id: "customer_support", pattern: /customer service|support team|refund|cancel subscription|contact us|help desk/i, priority: 10 },
  { id: "car_integration", pattern: /carplay|android auto|bluetooth|car stereo|vehicle|driving/i, priority: 9 },
  { id: "audio_quality", pattern: /sound quality|audio quality|\bbass\b|treble|equalizer|\beq\b|loudness|bitrate/i, priority: 9 },
  { id: "lyrics", pattern: /\blyrics\b|sing along|karaoke|lyric sync/i, priority: 9 },
  { id: "sharing_social", pattern: /family plan|\bduo\b|blend|friend activity|social|wrapped/i, priority: 8 },
  { id: "notifications", pattern: /notification|push alert|reminder/i, priority: 8 },
  { id: "battery_data", pattern: /battery|data usage|cellular|drain|background data/i, priority: 8 },
  { id: "library_management", pattern: /\blibrary\b|local file|import music|organize|liked songs|saved songs/i, priority: 8 },
  { id: "catalog_gaps", pattern: /missing song|not found|removed from|unavailable track|catalog|can't find.*song/i, priority: 8 },
  { id: "artist_creators", pattern: /spotify for artists|upload music|creator|musician portal/i, priority: 7 },
  { id: "accessibility", pattern: /accessibility|screen reader|blind|dyslexia|voiceover/i, priority: 7 },
  { id: "region_availability", pattern: /not available in|country|region|geo.?block|vpn/i, priority: 7 },
  { id: "app_updates", pattern: /after update|new version|latest update|update broke|rollback/i, priority: 7 },
  { id: "smart_devices", pattern: /alexa|google home|smart speaker|cast|airplay|connect.*device/i, priority: 7 },
  { id: "crossfade_gapless", pattern: /crossfade|gapless|fade between|transition/i, priority: 7 },
  { id: "sleep_timer", pattern: /sleep timer|sleep mode|timer/i, priority: 6 },
  { id: "explicit_content", pattern: /explicit|clean version|parental|kids mode|child/i, priority: 6 },
  { id: "video_canvas", pattern: /music video|\bcanvas\b|video loop/i, priority: 6 },
  { id: "student_offers", pattern: /student discount|university|education plan|hulu bundle/i, priority: 6 },
  { id: "competitor_comparison", pattern: /apple music|youtube music|amazon music|tidal|deezer|switch to|better than spotify/i, priority: 5 },
  { id: "widgets_shortcuts", pattern: /widget|shortcut|siri|google assistant/i, priority: 6 },
  { id: "music_catalog", pattern: /\b(song|songs|track|tracks|album|albums|artist|artists|band|genre)\b/i, priority: 4 },
  { id: "streaming_reliability", pattern: /stream|buffer|buffering|load|loading|connect|sync|internet connection/i, priority: 4 },
  { id: "subscription_flow", pattern: /subscribe|subscription|trial|member|plan|billing|invoice/i, priority: 4 },
  { id: "overall_experience", pattern: /experience|every day|daily driver|using spotify|listen to music/i, priority: 3 },
  { id: "app_stability_general", pattern: /\b(bug|bugs|issue|issues|problem|problems|broken|doesn't work|not working)\b/i, priority: 3 },
  { id: "search_music", pattern: /\bsearch\b|find music|look for/i, priority: 4 },
  { id: "focus_study", pattern: /study|studying|focus|concentration|work music|homework/i, priority: 3 },
  { id: "localization", pattern: /language|region|country|local|translate/i, priority: 3 },
  { id: "queue_controls", pattern: /\bqueue\b|up next|play next|add to queue/i, priority: 7, parent: "playback" },
  { id: "skip_limits", pattern: /skip limit|skips|can't skip|limited skips/i, priority: 8, parent: "playback" },
  { id: "shuffle_controls", pattern: /shuffle|shuffling|random play/i, priority: 8, parent: "playback" },
  { id: "premium_value", pattern: /not worth|value for money|worth the price|paying for/i, priority: 7, parent: "pricing" },
  { id: "ad_frequency", pattern: /too many ads|ad frequency|ads every|interrupt/i, priority: 8, parent: "pricing" },
  { id: "dark_mode_ui", pattern: /dark mode|theme color|font size|icon/i, priority: 7, parent: "ui_ux" },
  { id: "navigation_ui", pattern: /hard to find|confusing|cluttered|menu|navigation/i, priority: 7, parent: "ui_ux" },
  { id: "download_reliability", pattern: /download fail|won't download|download disappear|offline fail/i, priority: 8, parent: "offline" },
  { id: "podcast_playback", pattern: /podcast.*stop|episode.*pause|podcast.*crash/i, priority: 8, parent: "podcasts" },
  { id: "praise_discovery", pattern: /\b(love|great|awesome).*(discover|recommend|playlist|daily mix|weekly)\b/i, priority: 6 },
  { id: "praise_catalog", pattern: /\b(love|great|awesome).*(music|songs|artists|library|catalog)\b/i, priority: 6 },
  { id: "praise_experience", pattern: /\b(love|great|awesome).*(app|experience|easy|simple|intuitive)\b/i, priority: 6 },
  { id: "praise_audio", pattern: /\b(love|great|awesome).*(sound|audio|quality|bass)\b/i, priority: 6 },
  { id: "general_positive", pattern: /\b(love|great|best|awesome|perfect|excellent|amazing|fantastic|wonderful|brilliant)\b/i, priority: 2 },
  { id: "general_negative", pattern: /\b(hate|worst|terrible|awful|garbage|useless|horrible|disappointing)\b/i, priority: 2 },
];

const PRIMARY_THEMES = new Set([
  "discovery",
  "recommendations",
  "pricing",
  "ui_ux",
  "offline",
  "podcasts",
  "performance",
  "playback",
  "ads",
  "shuffle",
  "library",
  "search",
  "account",
  "general",
]);

export function inferSubThemesFromContent(
  content: string,
  options?: { parent?: string; exclude?: string }
): string[] {
  const lower = content.toLowerCase();
  const matches = SUB_THEME_RULES.filter((rule) => {
    if (options?.exclude && rule.id === options.exclude) return false;
    if (options?.parent && rule.parent && rule.parent !== options.parent) {
      return false;
    }
    if (options?.parent && !rule.parent) {
      return false;
    }
    return rule.pattern.test(lower);
  }).sort((a, b) => b.priority - a.priority);

  if (matches.length === 0) return [];
  return [matches[0].id];
}

/** Single primary theme for share-cap clustering (one bucket per review). */
export function resolvePrimaryTheme(
  content: string,
  existingThemes: string[],
  sentiment?: string
): string {
  const withoutGeneral = existingThemes.filter((t) => t !== "general");
  if (withoutGeneral.length > 0) return withoutGeneral[0];

  const sub = inferSubThemesFromContent(content);
  if (sub.length > 0) return sub[0];

  if (sentiment && ["positive", "negative", "neutral", "mixed"].includes(sentiment)) {
    return `uncategorized_${sentiment}`;
  }
  return "uncategorized_feedback";
}

/** Replace bare "general" with specific sub-themes when patterns match. */
export function resolveThemesForContent(
  content: string,
  existingThemes: string[]
): string[] {
  return [resolvePrimaryTheme(content, existingThemes)];
}

export interface ThemeCountRow {
  theme: string;
  count: number;
}

export interface ReviewThemeInput {
  id: string;
  content: string;
  themes: string[];
  sentiment?: string;
  resolvedThemes?: string[];
}

function countThemes(reviews: ReviewThemeInput[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const review of reviews) {
    const primary = (review.resolvedThemes ?? [resolvePrimaryTheme(review.content, review.themes, review.sentiment)])[0];
    counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }
  return counts;
}

function assignResolvedThemes(reviews: ReviewThemeInput[]): void {
  for (const review of reviews) {
    review.resolvedThemes = [
      resolvePrimaryTheme(review.content, review.themes, review.sentiment),
    ];
  }
}

function subdivideBucket(
  reviews: ReviewThemeInput[],
  theme: string
): boolean {
  let split = false;
  for (const review of reviews) {
    const active = review.resolvedThemes ?? [];
    if (!active.includes(theme)) continue;

    if (theme === "uncategorized_feedback" && review.sentiment) {
      review.resolvedThemes = [`uncategorized_${review.sentiment}`];
      split = true;
      continue;
    }

    if (theme.startsWith("uncategorized_")) {
      const sub = inferSubThemesFromContent(review.content);
      if (sub.length > 0 && sub[0] !== theme) {
        review.resolvedThemes = [sub[0]];
        split = true;
        continue;
      }
    }

    const sub = inferSubThemesFromContent(review.content, {
      parent: PRIMARY_THEMES.has(theme) ? theme : undefined,
    });
    if (sub.length > 0) {
      review.resolvedThemes = [sub[0]];
      split = true;
      continue;
    }

    const genericSub = inferSubThemesFromContent(review.content, { exclude: theme });
    if (genericSub.length > 0) {
      review.resolvedThemes = [genericSub[0]];
      split = true;
    }
  }
  return split;
}

/**
 * Secondary clustering pass: resolve general → sub-themes, then iteratively
 * subdivide any bucket above maxSharePct until stable (or max iterations).
 */
export function refineThemeDistribution(
  reviews: ReviewThemeInput[],
  maxSharePct = MAX_THEME_SHARE_PCT,
  maxIterations = 12
): ThemeCountRow[] {
  if (reviews.length === 0) return [];

  assignResolvedThemes(reviews);

  const total = reviews.length;

  for (let iter = 0; iter < maxIterations; iter++) {
    const counts = countThemes(reviews);
    const oversized = [...counts.entries()]
      .filter(([, count]) => (count / total) * 100 > maxSharePct)
      .sort((a, b) => b[1] - a[1]);

    if (oversized.length === 0) break;

    let anySplit = false;
    for (const [theme] of oversized) {
      if (subdivideBucket(reviews, theme)) anySplit = true;
    }
    if (!anySplit) break;
  }

  const finalCounts = countThemes(reviews);
  return [...finalCounts.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count);
}
