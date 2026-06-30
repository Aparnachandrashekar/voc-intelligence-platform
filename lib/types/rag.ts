export interface RagResearchSection {
  title: string;
  body: string;
}

export interface RagResponse {
  status: "completed" | "insufficient_evidence" | "failed";
  executive_summary: string;
  detailed_analysis: string;
  /** Single synthesis sentence — not repeated per quote in the UI. */
  research_summary?: string;
  research_sections?: RagResearchSection[];
  key_findings: string[];
  /** Each insight paired with the review quote and store source that supports it. */
  findings?: Array<{
    insight: string;
    quote: string;
    source: string;
    theme: string;
    date: string;
    feedback_item_id: string;
  }>;
  supporting_quotes: Array<{
    quote: string;
    theme: string;
    source: string;
    date: string;
    feedback_item_id: string;
  }>;
  theme_breakdown: Array<{ theme: string; count: number; sentiment: string }>;
  source_attribution: Array<{ source: string; count: number }>;
  product_recommendations: string[];
  meta?: Record<string, unknown>;
}
