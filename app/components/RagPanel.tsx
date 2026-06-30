"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  formatPctOfAnalyzed,
  formatRagMethodologyCaption,
  formatCorpusRagIntro,
  RAG_REDDIT_FOOTNOTE,
} from "@/lib/intelligence/copy";
import { formatSource, formatPersona, formatThemeCluster } from "@/lib/intelligence/format";
import { formatReviewExcerpt } from "@/lib/intelligence/quote-display";
import { coerceToText } from "@/lib/rag-synthesis";
import { parseDetailedBullets } from "@/lib/rag-synthesis";
import { UI_FILTER_SOURCES } from "@/lib/sources/ui-sources";
import { getTrendingSearches } from "@/lib/trending-searches";
import type { ActiveCorpusStats } from "@/lib/corpus-stats";
import type { RagResponse } from "@/lib/types/rag";

const QUERY_TIMEOUT_MS = 120_000;
const WARM_TIMEOUT_MS = 45_000;

interface VerifiedStatMeta {
  label: string;
  matching_reviews: number;
  pct_of_enriched: number;
}

interface SampleSentimentMeta {
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
}

interface RagMeta {
  verified_stats?: VerifiedStatMeta[];
  sample_sentiment?: SampleSentimentMeta;
  retrieval_pool_limit?: number;
  retrieval_sample_size?: number;
  analysis_context_size?: number;
  retrieved_count?: number;
}

function DetailedBullets({ text }: { text: string }) {
  const bullets = parseDetailedBullets(text);
  if (bullets.length === 0) return null;
  return (
    <ul className="research-detailed-list">
      {bullets.map((bullet, i) => (
        <li key={i}>{bullet}</li>
      ))}
    </ul>
  );
}

function ResearchReport({
  response,
  loading,
}: {
  response: RagResponse;
  loading?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || loading) return;

    const ctx = gsap.context(() => {
      const blocks = el.querySelectorAll(".research-block");
      if (blocks.length === 0) return;
      gsap.fromTo(
        blocks,
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          stagger: 0.06,
          ease: "power3.out",
          clearProps: "opacity,transform",
        }
      );
    }, el);

    return () => ctx.revert();
  }, [response, loading]);

  if (response.status === "insufficient_evidence") {
    return (
      <div className="research-report">
        <div className="research-block">
          <h3>Executive Answer</h3>
          <p className="research-answer">{response.executive_summary}</p>
          <p className="muted" style={{ marginTop: "1rem" }}>
            Try a Spotify-specific question (e.g. ads, shuffle, Premium, playlists).
          </p>
        </div>
      </div>
    );
  }

  const meta = (response.meta ?? {}) as RagMeta;
  const verifiedStats = meta.verified_stats ?? [];
  const sampleSentiment = meta.sample_sentiment;
  const sampleSize =
    meta.retrieval_sample_size ??
    meta.retrieved_count ??
    response.source_attribution.reduce((n, s) => n + s.count, 0);

  const allowedSources = new Set<string>(UI_FILTER_SOURCES);
  const filteredSources = response.source_attribution.filter((s) =>
    allowedSources.has(s.source)
  );
  const hasRedditInSample = filteredSources.some((s) => s.source === "forum");

  const hasMethodology =
    verifiedStats.length > 0 ||
    sampleSize > 0 ||
    filteredSources.length > 0;

  return (
    <div className="research-report" ref={ref}>
      <div className="research-block">
        <h3>Executive Answer</h3>
        <p className="research-answer">{response.executive_summary}</p>
      </div>

      {response.findings && response.findings.length > 0 ? (
        <div className="research-block research-block-detailed">
          <h3>Detailed Research</h3>
          {(response.research_summary || response.detailed_analysis) && (
            <p className="research-summary">
              {response.research_summary || response.detailed_analysis}
            </p>
          )}
          <ul className="quote-list findings-quotes-only">
            {response.findings.map((f, i) => (
              <li key={i} className="quote-item">
                <blockquote className="finding-quote">
                  {formatReviewExcerpt(f.quote)}
                </blockquote>
                <div className="quote-meta">
                  <span className="badge badge-green">
                    {formatSource(f.source)}
                  </span>
                  {f.segment && (
                    <span className="badge badge-segment">
                      {formatPersona(f.segment)}
                    </span>
                  )}
                  <span className="badge">
                    {formatThemeCluster(f.theme)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : response.detailed_analysis ? (
        <div className="research-block research-block-detailed">
          <h3>Detailed Research</h3>
          <DetailedBullets text={response.detailed_analysis} />
        </div>
      ) : null}

      {(!response.findings || response.findings.length === 0) &&
        response.supporting_quotes.length > 0 && (
        <div className="research-block">
          <h3>Supporting signals</h3>
          <ul className="quote-list">
            {response.supporting_quotes.map((q, i) => (
              <li key={i} className="quote-item">
                <p className="quote-summary">
                  {formatReviewExcerpt(coerceToText(q.quote))}
                </p>
                <div className="quote-meta">
                  <span className="badge badge-green">
                    {formatSource(q.source)}
                  </span>
                  <span className="badge">
                    {formatThemeCluster(q.theme)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {response.product_recommendations.length > 0 && (
        <div className="research-block">
          <h3>Recommended product actions</h3>
          <ul>
            {response.product_recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {hasMethodology && (
        <details className="research-methodology-fold">
          <summary>How we know this</summary>
          <div className="research-methodology-body">
            {verifiedStats.length > 0 && (
              <div className="research-block research-block-nested">
                <h4>Corpus statistics (SQL-verified)</h4>
                <div className="research-stats-grid">
                  {verifiedStats.map((s) => (
                    <div key={s.label} className="research-stat research-stat-verified">
                      <div className="research-stat-value">
                        {s.matching_reviews.toLocaleString()}
                      </div>
                      <div className="research-stat-label">
                        {s.label} · {formatPctOfAnalyzed(s.pct_of_enriched)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(sampleSentiment || sampleSize > 0) && (
              <div className="research-block research-block-nested">
                <h4>Retrieval sample ({sampleSize.toLocaleString()} reviews)</h4>
                <p className="chart-caption muted research-methodology-caption">
                  {formatRagMethodologyCaption(meta)}
                </p>
                <div className="research-stats-grid">
                  <div className="research-stat">
                    <div className="research-stat-value">{sampleSize}</div>
                    <div className="research-stat-label">Passed relevance threshold</div>
                  </div>
                  {sampleSentiment && (
                    <>
                      <div className="research-stat">
                        <div className="research-stat-value">
                          {sampleSentiment.positive_pct}%
                        </div>
                        <div className="research-stat-label">Positive in sample</div>
                      </div>
                      <div className="research-stat">
                        <div className="research-stat-value">
                          {sampleSentiment.negative_pct}%
                        </div>
                        <div className="research-stat-label">Negative in sample</div>
                      </div>
                    </>
                  )}
                </div>
                {filteredSources.length > 0 && (
                  <p className="research-source-breakdown muted">
                    {filteredSources
                      .map((s) => `${formatSource(s.source)} · ${s.count}`)
                      .join(" · ")}
                  </p>
                )}
                {hasRedditInSample && (
                  <p className="chart-caption muted research-footnote">
                    {RAG_REDDIT_FOOTNOTE}
                  </p>
                )}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

export function RagPanel({
  compact = false,
  prominent = false,
  hideHeader = false,
  segmentFilter,
  hideExamples = false,
  corpusStats,
}: {
  compact?: boolean;
  prominent?: boolean;
  hideHeader?: boolean;
  segmentFilter?: string;
  hideExamples?: boolean;
  corpusStats?: ActiveCorpusStats;
}) {
  const trendingSearches = getTrendingSearches();
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<RagResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchReady, setSearchReady] = useState(false);
  const [warmNote, setWarmNote] = useState<string | null>("Preparing search index…");
  const [error, setError] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const queryAbortRef = useRef<AbortController | null>(null);
  const sessionSeenIdsRef = useRef<Set<string>>(new Set());

  function collectResponseIds(data: RagResponse): string[] {
    const ids = new Set<string>();
    for (const f of data.findings ?? []) {
      if (f.feedback_item_id) ids.add(f.feedback_item_id);
    }
    for (const q of data.supporting_quotes ?? []) {
      if (q.feedback_item_id) ids.add(q.feedback_item_id);
    }
    return [...ids];
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WARM_TIMEOUT_MS);

    fetch("/api/warm", { signal: controller.signal })
      .then(async (r) => {
        const d = (await r.json()) as { ready?: boolean; error?: string };
        if (cancelled) return;
        setSearchReady(Boolean(d.ready));
        if (d.ready) {
          setWarmNote(null);
        } else {
          setWarmNote(
            "Search index still loading — your first question may take a moment."
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Allow queries; /api/query warms the model server-side.
        setSearchReady(true);
        setWarmNote(null);
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  async function ask(q?: string) {
    const text = q ?? question;
    if (!text.trim()) return;

    queryAbortRef.current?.abort();
    const controller = new AbortController();
    queryAbortRef.current = controller;

    setLoading(true);
    setError("");
    setStatusLine("Searching conversations and synthesizing research report…");

    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          segment: segmentFilter || undefined,
          excludeIds: [...sessionSeenIdsRef.current],
        }),
        signal: controller.signal,
      });
      const data = (await res.json()) as RagResponse & { error?: string };
      if (!res.ok) {
        const msg = data.error ?? `Server error (${res.status})`;
        throw new Error(
          res.status === 500
            ? `${msg} If this persists, refresh the page after the dev server finishes compiling.`
            : msg
        );
      }
      setResponse(data);
      for (const id of collectResponseIds(data)) {
        sessionSeenIdsRef.current.add(id);
      }
      if (!q) setQuestion(text);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (queryAbortRef.current === controller) {
          setError(
            "Request timed out. The search model may still be loading — wait a few seconds and try again."
          );
        }
      } else {
        setError(err instanceof Error ? err.message : "Query failed");
      }
    } finally {
      clearTimeout(timer);
      if (queryAbortRef.current === controller) {
        setLoading(false);
        setStatusLine("");
        queryAbortRef.current = null;
      }
    }
  }

  return (
    <section
      className={[
        "rag-panel",
        compact ? "rag-panel-compact" : "ask-flagship-panel",
        prominent ? "ask-dashboard-panel" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!compact && (
        <header className="research-hero ask-flagship-hero">
          <p className="premium-eyebrow">Conversational Research</p>
          <h1>Ask Spotify users anything</h1>
          <p className="premium-subhead">
            {corpusStats
              ? formatCorpusRagIntro(corpusStats)
              : "Ask anything about what Spotify users feel, want, and struggle with."}
          </p>
        </header>
      )}

      {compact && !hideHeader && (
        <header className="ask-dashboard-header">
          <p className="premium-eyebrow">Conversational Research</p>
          <h2 className="ask-dashboard-title">Ask the data</h2>
          <p className="ask-dashboard-sub">
            Insight-first research on what users say, with evidence on demand.
          </p>
        </header>
      )}

      <div className={prominent ? "ask-dashboard-input-card" : undefined}>
        {warmNote && !loading && (
          <div className="ask-status">
            <span className="spinner" aria-hidden />
            {warmNote}
          </div>
        )}

        {!hideExamples && (
          <div className="research-examples">
            {trendingSearches.map((ex) => (
              <button
                key={ex}
                type="button"
                className="research-example"
                onClick={() => ask(ex)}
                disabled={loading || !searchReady}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className={`research-input-wrap ${prominent ? "ask-green-input-wrap" : ""}`}
        >
          <input
            type="text"
            className={`research-input ${prominent ? "ask-green-input" : ""}`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What are users saying about music discovery?"
            maxLength={500}
            disabled={loading || !searchReady}
            required
          />
          <button
            type="submit"
            className="btn-primary research-submit"
            disabled={loading || !searchReady}
          >
            {loading ? "Researching…" : searchReady ? "Research" : "Preparing…"}
          </button>
        </form>

        {loading && statusLine && (
          <div className="ask-status">
            <span className="spinner" aria-hidden />
            {statusLine}
          </div>
        )}

        {error && !loading && <p className="status-error">{error}</p>}
      </div>

      {response && (
        <div className={loading ? "research-report-wrap is-loading" : "research-report-wrap"}>
          <ResearchReport response={response} loading={loading} />
        </div>
      )}
    </section>
  );
}
