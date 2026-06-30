import type { QuoteEvidence } from "@/lib/types/reports";

export interface BriefingBullet {
  label: string;
  pct: number;
  count: number;
  insight: string;
}

export interface ActionBullet {
  label: string;
  insight: string;
}

export interface ExecutiveBriefing {
  status: "completed" | "unavailable" | "failed";
  executive_headline: string;
  what_changed: string;
  biggest_frustrations: string[];
  emerging_opportunities: string[];
  recommended_actions: string[];
  frustration_bullets: BriefingBullet[];
  opportunity_bullets: BriefingBullet[];
  action_bullets: ActionBullet[];
  supporting_evidence: QuoteEvidence[];
  generated_at: string;
  groq_used: boolean;
}

export interface ThemeBriefing {
  theme: string;
  ai_summary: string;
  suggested_actions: string[];
  quotes: QuoteEvidence[];
}
