import { getPool } from "@/lib/db";
import { getGroqClient, isGroqConfigured } from "@/lib/groq";
import { getEnv } from "@/lib/env";
import { retrieveForQuestion, classifyRetrievalSentimentMode } from "@/lib/search";
import { detectSegmentRetrievalIntent } from "@/lib/retrieval/segment-intent";
import {
  evaluateEvidenceGate,
  insufficientEvidenceResponse,
} from "@/lib/guardrails/evidence-gate";
import {
  evaluateQuestionScope,
  evaluateRetrievalRelevance,
} from "@/lib/guardrails/relevance-gate";
import { validateAllQuotes } from "@/lib/guardrails/quote-validator";
import { CLOSED_WORLD_RAG_SYSTEM_PROMPT } from "@/lib/guardrails/prompts";
import {
  buildResearchSections,
  coerceToText,
  filterInsightBullets,
  parseDetailedBullets,
} from "@/lib/rag-synthesis";
import {
  buildQuoteBackedFindings,
  findingsToRagFields,
  reconcileGroqFindings,
} from "@/lib/quote-backed-findings";
import { UI_FILTER_SOURCES } from "@/lib/sources/ui-sources";
import {
  computeSampleSentiment,
  computeVerifiedStats,
  formatVerifiedStatsBlock,
  type SampleSentiment,
  type VerifiedStat,
} from "@/lib/rag-stats";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";
import type { RagResponse } from "@/lib/types/rag";
import type { ReportFilters } from "@/lib/types/reports";

export type { RagResponse };

function scopeRefusal(reason: string, meta: Record<string, unknown>): RagResponse {
  return {
    status: "insufficient_evidence",
    executive_summary: reason,
    detailed_analysis: "",
    key_findings: [],
    supporting_quotes: [],
    theme_breakdown: [],
    source_attribution: [],
    product_recommendations: [],
    meta,
  };
}

function computeAttribution(
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>
) {
  const sourceMap = new Map<string, number>();
  const themeSentiment = new Map<
    string,
    { count: number; sentiments: Record<string, number> }
  >();

  for (const item of items) {
    sourceMap.set(item.source, (sourceMap.get(item.source) ?? 0) + 1);
    const e = enrichment.get(item.id);
    const themes = (e?.themes as string[] | undefined) ?? [];
    const sentiment = (e?.sentiment as string | undefined) ?? "neutral";
    for (const theme of themes) {
      if (!theme) continue;
      const entry = themeSentiment.get(theme) ?? {
        count: 0,
        sentiments: {},
      };
      entry.count++;
      entry.sentiments[sentiment] = (entry.sentiments[sentiment] ?? 0) + 1;
      themeSentiment.set(theme, entry);
    }
  }

  return {
    source_attribution: [...sourceMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count })),
    theme_breakdown: [...themeSentiment.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([theme, v]) => {
        const topSentiment = Object.entries(v.sentiments).sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0];
        return {
          theme,
          count: v.count,
          sentiment: topSentiment ?? "mixed",
        };
      }),
  };
}

function filterSourceAttribution(
  sources: RagResponse["source_attribution"]
): RagResponse["source_attribution"] {
  const allowed = new Set<string>(UI_FILTER_SOURCES);
  return sources.filter((s) => allowed.has(s.source));
}

async function loadEnrichmentForItems(ids: string[]) {
  if (ids.length === 0) return new Map<string, Record<string, unknown>>();
  const result = await getPool().query(
    `SELECT e.feedback_item_id, e.sentiment, e.themes, e.pain_points, e.feature_requests,
            emb.persona_segment
     FROM enrichment_results e
     LEFT JOIN embeddings emb ON emb.feedback_item_id = e.feedback_item_id
     WHERE e.feedback_item_id = ANY($1)`,
    [ids]
  );
  const map = new Map<string, Record<string, unknown>>();
  for (const row of result.rows) {
    map.set(row.feedback_item_id, row);
  }
  return map;
}

function attachEnrichment(
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>
) {
  for (const item of items) {
    const e = enrichment.get(item.id);
    if (e) {
      item.metadata = { ...item.metadata, ...e };
      if (e.persona_segment) {
        item.metadata.persona_segment = e.persona_segment;
      }
    }
  }
}

function buildContextBlock(
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>
): string {
  return items
    .map((item, i) => {
      const e = enrichment.get(item.id);
      return `[${i + 1}] id=${item.id} source=${item.source} sentiment=${e?.sentiment ?? "unknown"} segment=${e?.persona_segment ?? item.metadata?.persona_segment ?? "unknown"} themes=${JSON.stringify(e?.themes ?? [])}\n${item.content.slice(0, 400)}`;
    })
    .join("\n\n---\n\n");
}

function parseGroqResponse(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      executive_summary: parsed.executive_summary,
      detailed_analysis: parsed.detailed_analysis,
      research_sections: Array.isArray(parsed.research_sections)
        ? (parsed.research_sections as Array<{ title: string; body: string }>)
        : undefined,
      supporting_quotes: Array.isArray(parsed.supporting_quotes)
        ? (parsed.supporting_quotes as Array<{
            quote: string;
            theme?: string;
            source?: string;
            feedback_item_id?: string;
          }>)
        : undefined,
      product_recommendations: Array.isArray(parsed.product_recommendations)
        ? parsed.product_recommendations.map(String)
        : undefined,
    };
  } catch {
    return null;
  }
}

export async function answerQuestion(
  question: string,
  filters: ReportFilters = {},
  options: { excludeIds?: string[] } = {}
): Promise<RagResponse> {
  const env = getEnv();
  const poolLimit = env.RAG_RETRIEVE_POOL;
  const topK = env.RAG_TOP_K;

  const scope = evaluateQuestionScope(question);
  if (!scope.allowed) {
    const response = scopeRefusal(scope.reason!, {
      refusal: "out_of_scope",
    });
    await logQuerySession(question, response, "insufficient_evidence", 0);
    return response;
  }

  let retrieved: RetrievedFeedbackItem[];
  try {
    retrieved = await retrieveForQuestion({
      query: question,
      limit: poolLimit,
      excludeIds: options.excludeIds,
      ...filters,
    });
  } catch (error) {
    console.error("[rag] hybridSearch failed:", error);
    return scopeRefusal(
      "Search failed temporarily. Wait a moment and try again.",
      { refusal: "search_error" }
    );
  }

  const gate = evaluateEvidenceGate(retrieved);
  if (!gate.allowed) {
    const response = {
      ...insufficientEvidenceResponse(gate.meta),
      status: "insufficient_evidence" as const,
    };
    await logQuerySession(
      question,
      response,
      "insufficient_evidence",
      gate.meta.retrieved_count
    );
    return response;
  }

  const relevance = evaluateRetrievalRelevance(gate.items, question);
  if (!relevance.allowed) {
    const response = scopeRefusal(relevance.reason!, {
      ...gate.meta,
      max_similarity: relevance.max_similarity,
      avg_top_similarity: relevance.avg_top_similarity,
      refusal: "weak_retrieval",
    });
    await logQuerySession(
      question,
      response,
      "insufficient_evidence",
      gate.meta.retrieved_count
    );
    return response;
  }

  const [enrichmentAll, verifiedStats] = await Promise.all([
    loadEnrichmentForItems(gate.items.map((i) => i.id)),
    computeVerifiedStats(question),
  ]);

  attachEnrichment(gate.items, enrichmentAll);

  const allQualifying = gate.items;
  const itemsForAnalysis = allQualifying.slice(0, topK);

  const { source_attribution: rawAttribution, theme_breakdown } = computeAttribution(
    allQualifying,
    enrichmentAll
  );
  const source_attribution = filterSourceAttribution(rawAttribution);

  const sampleSentiment = computeSampleSentiment(
    allQualifying.map(
      (i) => enrichmentAll.get(i.id)?.sentiment as string | undefined
    )
  );

  const meta = {
    ...gate.meta,
    max_similarity: relevance.max_similarity,
    avg_top_similarity: relevance.avg_top_similarity,
    verified_stats: verifiedStats,
    sample_sentiment: sampleSentiment,
    retrieval_pool_limit: poolLimit,
    retrieval_sample_size: allQualifying.length,
    analysis_context_size: itemsForAnalysis.length,
    min_retrieval_score: gate.meta.min_retrieval_score,
    retrieval_sentiment_mode: classifyRetrievalSentimentMode(question),
    segment_retrieval_mode: detectSegmentRetrievalIntent(question).mode,
    insight_mode: true,
  };

  if (!isGroqConfigured()) {
    return buildHeuristicResponse(
      question,
      itemsForAnalysis,
      allQualifying,
      enrichmentAll,
      source_attribution,
      theme_breakdown,
      verifiedStats,
      sampleSentiment,
      meta
    );
  }

  const groq = getGroqClient();
  const context = buildContextBlock(itemsForAnalysis, enrichmentAll);
  const statsBlock = formatVerifiedStatsBlock(verifiedStats);

  let parsed: ReturnType<typeof parseGroqResponse> = null;
  try {
    const response = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CLOSED_WORLD_RAG_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Question: ${question}`,
            statsBlock
              ? `<verified_stats>\n${statsBlock}\n</verified_stats>`
              : `<verified_stats>No corpus-wide count available — use retrieval sample only (${allQualifying.length} reviews).</verified_stats>`,
            `<sample_sentiment>From ${allQualifying.length} retrieved reviews: ${sampleSentiment.positive_pct}% positive, ${sampleSentiment.negative_pct}% negative, ${sampleSentiment.neutral_pct}% neutral.</sample_sentiment>`,
            `<context>\n${context}\n</context>`,
            `Return JSON with: executive_summary (2-3 sentences — synthesize patterns, no long quotes), detailed_analysis (4-6 paraphrased insight bullets, one per line — each MUST have a matching supporting_quotes entry), supporting_quotes (array of {quote, theme, source, feedback_item_id} — exact substrings from context only; one quote per insight), product_recommendations (array).`,
          ].join("\n\n"),
        },
      ],
    });

    parsed = parseGroqResponse(
      response.choices[0]?.message?.content ?? "{}"
    );
  } catch {
    return buildHeuristicResponse(
      question,
      itemsForAnalysis,
      allQualifying,
      enrichmentAll,
      source_attribution,
      theme_breakdown,
      verifiedStats,
      sampleSentiment,
      meta
    );
  }

  if (!parsed) {
    return buildHeuristicResponse(
      question,
      itemsForAnalysis,
      allQualifying,
      enrichmentAll,
      source_attribution,
      theme_breakdown,
      verifiedStats,
      sampleSentiment,
      meta
    );
  }

  const contents = itemsForAnalysis.map((i) => i.content);
  const quoteStrings = (parsed.supporting_quotes ?? []).map((q) =>
    coerceToText(q.quote)
  );
  const validated = validateAllQuotes(quoteStrings, contents);

  const rawSupportingQuotes = (parsed.supporting_quotes ?? [])
    .filter((_, idx) => validated[idx]?.valid)
    .map((q) => {
      const item =
        itemsForAnalysis.find((i) => i.id === q.feedback_item_id) ??
        itemsForAnalysis.find((i) =>
          i.content.includes(coerceToText(q.quote).slice(0, 40))
        ) ??
        itemsForAnalysis[0];
      return {
        quote: coerceToText(q.quote),
        theme: q.theme ?? "general",
        source: q.source ?? item?.source ?? "unknown",
        date: item?.created_at?.toISOString?.() ?? "",
        feedback_item_id: q.feedback_item_id ?? item?.id ?? "",
      };
    });

  const groqInsights = filterInsightBullets(
    parseDetailedBullets(parsed.detailed_analysis)
  );
  let findings = buildQuoteBackedFindings(
    question,
    allQualifying,
    enrichmentAll
  );

  if (findings.length < 2) {
    const groqFindings = reconcileGroqFindings(groqInsights, rawSupportingQuotes);
    if (groqFindings.length > findings.length) {
      findings = groqFindings;
    }
  }

  if (findings.length === 0) {
    return buildHeuristicResponse(
      question,
      itemsForAnalysis,
      allQualifying,
      enrichmentAll,
      source_attribution,
      theme_breakdown,
      verifiedStats,
      sampleSentiment,
      meta
    );
  }

  const fields = findingsToRagFields(findings, question);

  const executive_summary = fields.executive_summary;
  const detailed_analysis = fields.detailed_analysis;
  const supporting_quotes = fields.supporting_quotes;
  const research_sections =
    parsed.research_sections?.filter((s) => s.title && s.body) ??
    buildResearchSections(
      allQualifying,
      enrichmentAll,
      verifiedStats,
      sampleSentiment,
      allQualifying.length
    );

  if (!executive_summary.trim() || !detailed_analysis.trim()) {
    return buildHeuristicResponse(
      question,
      itemsForAnalysis,
      allQualifying,
      enrichmentAll,
      source_attribution,
      theme_breakdown,
      verifiedStats,
      sampleSentiment,
      meta
    );
  }

  const result: RagResponse = {
    status: "completed",
    executive_summary,
    detailed_analysis,
    research_summary: fields.research_summary,
    research_sections,
    key_findings: [],
    findings: fields.findings,
    supporting_quotes,
    theme_breakdown,
    source_attribution,
    product_recommendations: parsed.product_recommendations ?? [],
    meta,
  };

  await logQuerySession(question, result, "completed", allQualifying.length);
  return result;
}

function buildHeuristicResponse(
  question: string,
  items: RetrievedFeedbackItem[],
  allItems: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>,
  source_attribution: RagResponse["source_attribution"],
  theme_breakdown: RagResponse["theme_breakdown"],
  verifiedStats: VerifiedStat[],
  sampleSentiment: SampleSentiment,
  meta: Record<string, unknown>
): RagResponse {
  const sampleSize = allItems.length;
  const findings = buildQuoteBackedFindings(question, allItems, enrichment);

  if (findings.length === 0) {
    return {
      status: "insufficient_evidence",
      executive_summary:
        "Not enough recommendation-related review quotes matched this question to support grounded insights.",
      detailed_analysis: "",
      key_findings: [],
      supporting_quotes: [],
      theme_breakdown,
      source_attribution,
      product_recommendations: [],
      meta,
    };
  }

  const fields = findingsToRagFields(findings, question);

  return {
    status: "completed",
    executive_summary: fields.executive_summary,
    detailed_analysis: fields.detailed_analysis,
    research_summary: fields.research_summary,
    research_sections: buildResearchSections(
      allItems,
      enrichment,
      verifiedStats,
      sampleSentiment,
      sampleSize
    ),
    key_findings: [],
    findings: fields.findings,
    supporting_quotes: fields.supporting_quotes,
    theme_breakdown,
    source_attribution,
    product_recommendations: [],
    meta,
  };
}

async function logQuerySession(
  question: string,
  response: RagResponse | null,
  status: string,
  retrieved_count: number
) {
  try {
    await getPool().query(
      `INSERT INTO query_sessions (question, response, status, retrieved_count)
       VALUES ($1, $2, $3, $4)`,
      [
        question,
        response ? JSON.stringify(response) : null,
        status,
        retrieved_count,
      ]
    );
  } catch {
    // Logging must not break the user-facing response.
  }
}
