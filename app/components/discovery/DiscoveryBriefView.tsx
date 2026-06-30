"use client";

import Link from "next/link";
import { PersonaPanel } from "@/app/components/intelligence/IntelligenceViews";
import { useGsapReveal } from "@/app/components/premium/useGsapReveal";
import { discoverySentimentHeadline } from "@/lib/discovery/copy";
import { formatPctOfAnalyzed } from "@/lib/intelligence/copy";
import { reviewDisplaySummary } from "@/lib/intelligence/display";
import { formatSource } from "@/lib/intelligence/format";
import type { DiscoveryBriefReport } from "@/lib/types/discovery";

export function DiscoveryBriefView({ report }: { report: DiscoveryBriefReport }) {
  const ref = useGsapReveal([report.has_insights]);

  if (!report.has_insights) {
    return (
      <div className="discovery-brief-empty" ref={ref}>
        <p className="premium-headline-focal">
          Not enough discovery-tagged reviews yet to build a research brief.
        </p>
      </div>
    );
  }

  const { sentiment } = report;
  const headline = discoverySentimentHeadline(sentiment);

  return (
    <div className="discovery-brief" ref={ref}>
      <section className="discovery-brief-metric" data-reveal>
        <p className="premium-eyebrow">Discovery sentiment</p>
        <div className="discovery-score-row">
          <p className="discovery-score-value">
            {sentiment.net_score > 0 ? "+" : ""}
            {sentiment.net_score}
          </p>
          <p className="discovery-score-label">net sentiment score</p>
        </div>
        <p className="discovery-score-detail">
          {formatPctOfAnalyzed(sentiment.positive_pct, sentiment.total_reviews)}{" "}
          positive ·{" "}
          {formatPctOfAnalyzed(sentiment.negative_pct, sentiment.total_reviews)}{" "}
          negative · {sentiment.total_reviews.toLocaleString()} discovery-related
          reviews
        </p>
        <p className="discovery-brief-lead">{headline}</p>
      </section>

      {report.top_complaints.length > 0 && (
        <section className="discovery-brief-section" data-reveal>
          <p className="premium-eyebrow">Top discovery complaints</p>
          <h2 className="premium-section-title">Where discovery breaks down</h2>
          <ol className="discovery-complaint-list">
            {report.top_complaints.map((item, i) => (
              <li key={item.label} className="discovery-complaint-item">
                <div className="discovery-complaint-header">
                  <span className="discovery-complaint-rank">{i + 1}</span>
                  <div>
                    <h3 className="discovery-complaint-title">{item.label}</h3>
                    <p className="discovery-complaint-count">
                      {item.count.toLocaleString()} mentions in discovery-tagged
                      reviews
                    </p>
                  </div>
                </div>
                {item.quote && (
                  <blockquote className="discovery-complaint-quote">
                    <p>
                      {reviewDisplaySummary(item.quote.content, item.quote.sentiment)}
                    </p>
                    <footer className="discovery-quote-meta">
                      <span className="badge badge-green">
                        {formatSource(item.quote.source)}
                      </span>
                    </footer>
                  </blockquote>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {report.discovery_persona && (
        <section className="discovery-brief-section" data-reveal>
          <p className="premium-eyebrow">Primary audience</p>
          <h2 className="premium-section-title">Discovery Enthusiasts</h2>
          <div className="discovery-persona-single">
            <PersonaPanel
              persona={report.discovery_persona}
              summaryOverride={`${report.discovery_persona.volume.toLocaleString()} users actively seeking new music — frustrated when the algorithm recycles familiar tracks.`}
              skipBriefingFetch
            />
          </div>
          <p className="discovery-persona-clarification">
            While Discovery Enthusiasts express the most desire for new music, the
            broader discovery frustration is felt across all segments.
          </p>
        </section>
      )}

      {report.negative_discovery_complaints.length > 0 && (
        <section className="discovery-brief-section" data-reveal>
          <p className="premium-eyebrow">From negative discovery reviews</p>
          <h2 className="premium-section-title">Top discovery complaints</h2>
          <p className="discovery-complaint-scope muted">
            Pulled from the{" "}
            {formatPctOfAnalyzed(
              sentiment.negative_pct,
              sentiment.total_reviews
            )}{" "}
            of discovery-tagged reviews with negative sentiment.
          </p>
          <ol className="discovery-complaint-list">
            {report.negative_discovery_complaints.map((item, i) => (
              <li key={item.label} className="discovery-complaint-item">
                <div className="discovery-complaint-header">
                  <span className="discovery-complaint-rank">{i + 1}</span>
                  <div>
                    <h3 className="discovery-complaint-title">{item.label}</h3>
                    <p className="discovery-complaint-count">
                      {item.count.toLocaleString()} mentions in negative
                      discovery reviews
                    </p>
                  </div>
                </div>
                {item.quote && (
                  <blockquote className="discovery-complaint-quote">
                    <p>
                      {reviewDisplaySummary(item.quote.content, item.quote.sentiment)}
                    </p>
                    <footer className="discovery-quote-meta">
                      <span className="badge badge-green">
                        {formatSource(item.quote.source)}
                      </span>
                    </footer>
                  </blockquote>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {report.feature_requests.length > 0 && (
        <section className="discovery-brief-section" data-reveal>
          <p className="premium-eyebrow">What users actually want</p>
          <h2 className="premium-section-title">
            Most requested from discovery-tagged reviews
          </h2>
          <ul className="discovery-wants-list">
            {report.feature_requests.map((item) => (
              <li key={item.label} className="discovery-wants-item">
                <span className="discovery-wants-label">{item.label}</span>
                <span className="discovery-wants-count">
                  {item.count.toLocaleString()} mentions
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="discovery-brief-footer muted">
        Scoped to reviews tagged Discovery & Recommendations or classified as
        Discovery Enthusiasts.{" "}
        <Link href="/reports/pain-points?segment=discovery_seeker">
          View all discovery segment reviews
        </Link>
      </p>
    </div>
  );
}
