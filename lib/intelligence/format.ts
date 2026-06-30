/** Minimum mentions before a theme/cluster appears in intelligence views. */
export const MIN_MENTIONS = 5;

/** Minimum growth delta (current vs prior) to qualify as "fastest growing". */
export const MIN_GROWTH_MENTIONS = 3;

const SOURCE_LABELS: Record<string, string> = {
  play_store: "Play Store",
  app_store: "App Store",
  reddit: "Reddit",
  quora: "Quora",
  twitter: "Twitter",
  forum: "Reddit",
  kaggle: "Historical Archive",
  static: "Historical Archive",
  live: "Live Scrape",
  huggingface: "Hugging Face",
};

const THEME_CLUSTER_LABELS: Record<string, string> = {
  discovery: "Discovery & Recommendations",
  recommendations: "Discovery & Recommendations",
  playback: "Playback & Audio Quality",
  performance: "Performance & Reliability",
  pricing: "Pricing & Premium Value",
  ads: "Ads & Free Tier",
  ui_ux: "App Experience & Design",
  offline: "Offline & Downloads",
  podcasts: "Podcasts & Audio Shows",
  account: "Account & Login",
  shuffle: "Shuffle & Playback Controls",
  library: "Library & Organization",
  social: "Social & Sharing",
  search: "Search & Discovery",
  general: "Other Topics",
  uncategorized_feedback: "Uncategorized Feedback",
  account_access: "Account & Login",
  customer_support: "Customer Support",
  car_integration: "Car & Bluetooth Playback",
  audio_quality: "Audio Quality & EQ",
  lyrics: "Lyrics & Sing-Along",
  sharing_social: "Sharing & Social",
  notifications: "Notifications & Alerts",
  battery_data: "Battery & Data Usage",
  library_management: "Library Management",
  catalog_gaps: "Missing Catalog & Search Gaps",
  artist_creators: "Artist & Creator Tools",
  accessibility: "Accessibility",
  region_availability: "Regional Availability",
  app_updates: "App Updates & Regressions",
  smart_devices: "Smart Speakers & Casting",
  crossfade_gapless: "Crossfade & Gapless Playback",
  sleep_timer: "Sleep Timer & Bedtime",
  explicit_content: "Explicit & Family Content",
  video_canvas: "Video & Canvas",
  student_offers: "Student & Bundle Offers",
  competitor_comparison: "Competitor Comparisons",
  widgets_shortcuts: "Widgets & Voice Shortcuts",
  queue_controls: "Queue & Up Next",
  skip_limits: "Skip Limits (Free Tier)",
  shuffle_controls: "Shuffle Controls",
  premium_value: "Premium Value Perception",
  ad_frequency: "Ad Frequency & Placement",
  dark_mode_ui: "Dark Mode & Visual Theme",
  navigation_ui: "Navigation & Findability",
  download_reliability: "Download Reliability",
  podcast_playback: "Podcast Playback Issues",
  general_positive: "Broad Positive Sentiment",
  general_negative: "Broad Negative Sentiment",
  uncategorized_positive: "Positive General Feedback",
  uncategorized_negative: "Negative General Feedback",
  uncategorized_neutral: "Neutral General Feedback",
  uncategorized_mixed: "Mixed General Feedback",
  music_catalog: "Songs, Artists & Catalog",
  streaming_reliability: "Streaming & Connectivity",
  subscription_flow: "Subscription & Billing Flow",
  overall_experience: "Overall App Experience",
  app_stability_general: "General Bugs & Issues",
  search_music: "Music Search",
  focus_study: "Focus & Study Listening",
  localization: "Language & Localization",
  praise_discovery: "Praise: Discovery & Playlists",
  praise_catalog: "Praise: Music & Library",
  praise_experience: "Praise: App Experience",
  praise_audio: "Praise: Sound Quality",
};

const PERSONA_LABELS: Record<string, string> = {
  discovery_seeker: "Discovery Enthusiasts",
  podcast_listener: "Podcast Listeners",
  feature_advocate: "Feature Advocates",
  happy_promoter: "Satisfied Promoters",
  price_sensitive: "Price & Ad-Sensitive Users",
  technical_issues: "Reliability-Focused Users",
  dissatisfied_critic: "Frustrated Critics",
  neutral_observer: "Neutral Observers",
  general: "General Users",
};

export function formatSource(value: string): string {
  const key = value.toLowerCase().trim();
  return SOURCE_LABELS[key] ?? titleCase(key.replace(/_/g, " "));
}

export function formatSentiment(value: string): string {
  return titleCase(value.replace(/_/g, " "));
}

/** Generic snake_case → Title Case for any display label. */
export function formatLabel(value: string): string {
  const key = value.toLowerCase().trim();
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  if (THEME_CLUSTER_LABELS[key]) return THEME_CLUSTER_LABELS[key];
  if (PERSONA_LABELS[key]) return PERSONA_LABELS[key];
  return titleCase(key.replace(/_/g, " "));
}

export function formatThemeCluster(raw: string): string {
  const key = raw.toLowerCase().trim();
  if (THEME_CLUSTER_LABELS[key]) return THEME_CLUSTER_LABELS[key];
  return titleCase(key.replace(/_/g, " "));
}

export function formatPersona(segment: string): string {
  return PERSONA_LABELS[segment] ?? titleCase(segment.replace(/_/g, " "));
}

export function formatFeatureRequest(raw: string): string {
  const key = raw.toLowerCase().trim();
  if (THEME_CLUSTER_LABELS[key]) return THEME_CLUSTER_LABELS[key];
  return titleCase(key.replace(/_/g, " "));
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function meetsThreshold(count: number): boolean {
  return count >= MIN_MENTIONS;
}
