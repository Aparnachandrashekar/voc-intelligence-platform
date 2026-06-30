import { getPool } from "@/lib/db";
import { getGroqClient, isGroqConfigured } from "@/lib/groq";
import { getEnv } from "@/lib/env";
import { evaluateQuestionScope } from "@/lib/guardrails/relevance-gate";
import { validateAllQuotes } from "@/lib/guardrails/quote-validator";
import { CLOSED_WORLD_RAG_SYSTEM_PROMPT } from "@/lib/guardrails/prompts";
import {
  buildResearchSections,
  coerceToText,
  filterInsightBullets,
  parseDetailedBullets,
} from "@/lib/rag-synthesis";
import { findingsToRagFields } from "@/lib/quote-backed-findings";
import { UI_FILTER_SOURCES } from "@/lib/sources/ui-sources";
import {
  buildCorpusAnswerContext,
  buildCorpusDetailedAnalysis,
  buildCorpusFindings,
  computeSourceAttributionFromQuotes,
  corpusBucketsToThemeBreakdown,
  formatCorpusStatsBlock,
  formatIllustrativeQuotesBlock,
  type CorpusAnswerContext,
} from "@/lib/rag-corpus-aggregate";
import type { QuoteBackedFinding } from "@/lib/quote-backed-findings";
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

function filterSourceAttribution(
  sources: RagResponse["source_attribution"]
): RagResponse["source_attribution"] {
  const allowed = new Set<string>(UI_FILTER_SOURCES);
  return sources.filter((s) => allowed.has(s.source));
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

function summaryOptions(ctx: CorpusAnswerContext) {
  return {
    total_analyzed: ctx.total_analyzed,
    bucketStats: ctx.buckets,
  };
}

function buildCorpusResearchSections(
  ctx: CorpusAnswerContext,
  question: string
): RagResponse["research_sections"] {
  const sections = buildResearchSections(
    [],
    new Map(),
    ctx.buckets.map((b) => ({
      topic: b.id,
      label: b.label,
      matching_reviews: b.count,
      total_reviews: ctx.total_analyzed,
      enriched_total: ctx.total_analyzed,
      pct_of_enriched: b.pct,
    })),
    {
      positive_pct: 0,
      negative_pct: 0,
      neutral_pct: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
      mixed: 0,
    },
    ctx.total_analyzed
  );

  return [
    {
      title: "Corpus coverage",
      body: formatCorpusStatsBlock(ctx),
    },
    ...(sections ?? []),
  ];
}

function buildHeuristicCorpusResponse(
  question: string,
  ctx: CorpusAnswerContext,
  meta: Record<string, unknown>
): RagResponse {
  const findings = buildCorpusFindings(ctx) as QuoteBackedFinding[];
  const opts = summaryOptions(ctx);
  const fields = findingsToRagFields(findings, question, opts);
  const theme_breakdown = corpusBucketsToThemeBreakdown(ctx.buckets);
  const source_attribution = filterSourceAttribution(
    computeSourceAttributionFromQuotes(ctx)
  );

  if (findings.length === 0 && ctx.buckets.length === 0) {
    return {
      status: "insufficient_evidence",
      executive_summary:
        "Not enough tagged reviews matched this question in the analyzed corpus.",
      detailed_analysis: "",
      key_findings: [],
      supporting_quotes: [],
      theme_breakdown,
      source_attribution,
      product_recommendations: [],
      meta,
    };
  }

  return {
    status: "completed",
    executive_summary: fields.executive_summary,
    detailed_analysis:
      fields.detailed_analysis || buildCorpusDetailedAnalysis(ctx),
    research_summary: fields.research_summary,
    research_sections: buildCorpusResearchSections(ctx, question),
    key_findings: [],
    findings: fields.findings,
    supporting_quotes: fields.supporting_quotes,
    theme_breakdown,
    source_attribution,
    product_recommendations: [],
    meta,
  };
}

/**
 * Answer a user question from corpus-wide tag aggregation (Part A),
 * illustrative quotes per theme (Part B), and an optional single Groq summary (Part C).
 */
export async function answerQuestion(
  question: string,
  filters: ReportFilters = {},
  _options: { excludeIds?: string[] } = {}
): Promise<RagResponse> {
  const scope = evaluateQuestionScope(question);
  if (!scope.allowed) {
    const response = scopeRefusal(scope.reason!, { refusal: "out_of_scope" });
    await logQuerySession(question, response, "insufficient_evidence", 0);
    return response;
  }

  let ctx: CorpusAnswerContext;
  try {
    ctx = await buildCorpusAnswerContext(question, filters, {
      maxBuckets: 5,
      quotesPerBucket: 3,
    });
  } catch (error) {
    console.error("[rag] corpus aggregation failed:", error);
    return scopeRefusal(
      "Analysis failed temporarily. Wait a moment and try again.",
      { refusal: "aggregation_error" }
    );
  }

  if (ctx.total_analyzed === 0) {
    const response = scopeRefusal(
      "No analyzed reviews are available yet. Run enrichment on ingested reviews first.",
      { refusal: "empty_corpus", total_analyzed: 0 }
    );
    await logQuerySession(question, response, "insufficient_evidence", 0);
    return response;
  }

  if (ctx.buckets.length === 0 || ctx.buckets.every((b) => b.count === 0)) {
    const response = scopeRefusal(
      "No tagged reviews matched this question in the analyzed corpus. Try rephrasing or broadening the topic.",
      {
        refusal: "no_matching_tags",
        total_analyzed: ctx.total_analyzed,
      }
    );
    await logQuerySession(question, response, "insufficient_evidence", 0);
    return response;
  }

  const findings = buildCorpusFindings(ctx) as QuoteBackedFinding[];
  const opts = summaryOptions(ctx);
  const theme_breakdown = corpusBucketsToThemeBreakdown(ctx.buckets);
  const source_attribution = filterSourceAttribution(
    computeSourceAttributionFromQuotes(ctx)
  );
  const illustrativeQuoteCount = Object.values(ctx.quotesByBucket).reduce(
    (n, qs) => n + qs.length,
    0
  );

  const meta: Record<string, unknown> = {
    total_analyzed: ctx.total_analyzed,
    corpus_aggregation: true,
    corpus_buckets: ctx.buckets,
    illustrative_quote_count: illustrativeQuoteCount,
    theme_breakdown_source: "corpus",
  };

  if (!isGroqConfigured()) {
    const response = buildHeuristicCorpusResponse(question, ctx, meta);
    await logQuerySession(
      question,
      response,
      "completed",
      ctx.total_analyzed
    );
    return response;
  }

  const groq = getGroqClient();
  const env = getEnv();
  const statsBlock = formatCorpusStatsBlock(ctx);
  const quotesBlock = formatIllustrativeQuotesBlock(ctx);
  const allQuoteTexts = findings.map((f) => f.quote);

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
            `<corpus_stats>\n${statsBlock}\n</corpus_stats>`,
            `<illustrative_quotes>\n${quotesBlock}\n</illustrative_quotes>`,
            `Use ONLY the pre-computed counts in corpus_stats — do not invent numbers or sample sizes.`,
            `Executive summary MUST begin with "Analyzed ${ctx.total_analyzed.toLocaleString()} reviews" and include the top theme percentages from corpus_stats.`,
            `Return JSON with: executive_summary (2-3 sentences using corpus_stats percentages), detailed_analysis (one bullet per top theme with % and count from corpus_stats), supporting_quotes (array of {quote, theme, source, feedback_item_id} — exact substrings from illustrative_quotes only), product_recommendations (array).`,
          ].join("\n\n"),
        },
      ],
    });

    parsed = parseGroqResponse(
      response.choices[0]?.message?.content ?? "{}"
    );
  } catch {
    const fallback = buildHeuristicCorpusResponse(question, ctx, meta);
    await logQuerySession(
      question,
      fallback,
      "completed",
      ctx.total_analyzed
    );
    return fallback;
  }

  if (!parsed?.executive_summary) {
    const fallback = buildHeuristicCorpusResponse(question, ctx, meta);
    await logQuerySession(
      question,
      fallback,
      "completed",
      ctx.total_analyzed
    );
    return fallback;
  }

  const quoteStrings = (parsed.supporting_quotes ?? []).map((q) =>
    coerceToText(q.quote)
  );
  const validated = validateAllQuotes(quoteStrings, allQuoteTexts);

  const groqQuotes = (parsed.supporting_quotes ?? [])
    .filter((_, idx) => validated[idx]?.valid)
    .map((q) => {
      const match =
        findings.find((f) => f.feedback_item_id === q.feedback_item_id) ??
        findings.find((f) =>
          f.quote.includes(coerceToText(q.quote).slice(0, 40))
        ) ??
        findings[0];
      return {
        quote: coerceToText(q.quote),
        theme: q.theme ?? match?.theme ?? "general",
        source: q.source ?? match?.source ?? "unknown",
        date: match?.date ?? "",
        feedback_item_id: q.feedback_item_id ?? match?.feedback_item_id ?? "",
      };
    });

  const heuristicFields = findingsToRagFields(findings, question, opts);
  const supporting_quotes =
    groqQuotes.length > 0 ? groqQuotes : heuristicFields.supporting_quotes;

  const detailedBullets = filterInsightBullets(
    parseDetailedBullets(parsed.detailed_analysis)
  );
  const detailed_analysis =
    detailedBullets.length > 0
      ? detailedBullets.join("\n")
      : heuristicFields.detailed_analysis || buildCorpusDetailedAnalysis(ctx);

  const result: RagResponse = {
    status: "completed",
    executive_summary: coerceToText(parsed.executive_summary).trim(),
    detailed_analysis,
    research_summary: heuristicFields.research_summary,
    research_sections: buildCorpusResearchSections(ctx, question),
    key_findings: [],
    findings: heuristicFields.findings,
    supporting_quotes,
    theme_breakdown,
    source_attribution,
    product_recommendations: parsed.product_recommendations ?? [],
    meta,
  };

  await logQuerySession(question, result, "completed", ctx.total_analyzed);
  return result;
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
