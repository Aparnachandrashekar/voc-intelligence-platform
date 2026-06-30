"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGsapReveal } from "@/app/components/premium/useGsapReveal";
import { formatLabel } from "@/lib/intelligence/format";
import { PersonaIcon } from "@/app/components/premium/KpiIcons";
import type { ThemeBriefing } from "@/lib/types/briefing";
import type {
  RoadmapItem,
  SegmentPersona,
  SegmentsIntelligenceReport,
  ThemeCluster,
} from "@/lib/types/intelligence";

const MAX_CLUSTERS = 3;

function IntelTabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="intel-tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`intel-tab ${active === tab.id ? "intel-tab-active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count > 0 && <span className="intel-tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

function ClusterCardCompact({
  cluster,
  variant = "friction",
}: {
  cluster: ThemeCluster;
  variant?: "friction" | "opportunity" | "growth" | "polarizing";
}) {
  const [briefing, setBriefing] = useState<ThemeBriefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/briefing/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: cluster.display_name,
        count: cluster.count,
        change_pct: cluster.change_pct,
        quotes: cluster.quotes.map((q) => ({
          content: q.content,
          source: q.source,
          sentiment: q.sentiment,
        })),
      }),
    })
      .then((r) => r.json())
      .then(setBriefing)
      .catch(() => setBriefing(null))
      .finally(() => setLoading(false));
  }, [cluster.id, cluster.count, cluster.display_name, cluster.change_pct, cluster.quotes]);

  const sentimentLabel =
    variant === "opportunity"
      ? `${cluster.sentiment.positive_pct}% positive`
      : `${cluster.sentiment.negative_pct}% negative`;

  return (
    <article className="intel-cluster-card intel-cluster-compact" data-reveal>
      <header className="intel-cluster-header">
        <h3 className="intel-cluster-title">{cluster.display_name}</h3>
        <div className="intel-cluster-stats">
          <span>{cluster.count.toLocaleString()} mentions</span>
          {cluster.change_pct !== null && cluster.change_pct !== 0 && (
            <span className={cluster.change_pct > 0 ? "theme-rank-growth up" : "theme-rank-growth down"}>
              {cluster.change_pct > 0 ? "+" : ""}
              {cluster.change_pct}%
            </span>
          )}
          <span>{sentimentLabel}</span>
        </div>
      </header>

      {loading ? (
        <div className="skeleton-line wide" />
      ) : (
        <>
          <p className="intel-cluster-summary">{briefing?.ai_summary}</p>
          {(briefing?.suggested_actions ?? []).slice(0, 2).length > 0 && (
            <ul className="intel-actions intel-actions-compact">
              {briefing!.suggested_actions.slice(0, 2).map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}

function ClusterGrid({
  clusters,
  variant,
}: {
  clusters: ThemeCluster[];
  variant?: "friction" | "opportunity" | "growth" | "polarizing";
}) {
  if (!clusters.length) {
    return <p className="muted intel-tab-empty">No themes meet the volume threshold for this view.</p>;
  }

  return (
    <div className="intel-cluster-grid">
      {clusters.slice(0, MAX_CLUSTERS).map((c) => (
        <ClusterCardCompact key={`${variant}-${c.id}`} cluster={c} variant={variant} />
      ))}
    </div>
  );
}

export function VocIntelligenceView({
  report,
}: {
  report: {
    top_frictions: ThemeCluster[];
    top_opportunities: ThemeCluster[];
    fastest_growing: ThemeCluster[];
    most_polarizing: ThemeCluster[];
    has_insights: boolean;
  };
}) {
  const ref = useGsapReveal([report.has_insights]);

  const sections = [
    { id: "frictions", label: "Frictions", clusters: report.top_frictions, variant: "friction" as const },
    { id: "opportunities", label: "Opportunities", clusters: report.top_opportunities, variant: "opportunity" as const },
    { id: "growing", label: "Fastest Growing", clusters: report.fastest_growing, variant: "growth" as const },
    { id: "polarizing", label: "Polarizing", clusters: report.most_polarizing, variant: "polarizing" as const },
  ];

  const available = sections.filter((s) => s.clusters.length > 0);
  const [active, setActive] = useState(available[0]?.id ?? "frictions");

  useEffect(() => {
    if (!available.find((s) => s.id === active) && available[0]) {
      setActive(available[0].id);
    }
  }, [active, available]);

  if (!report.has_insights) {
    return (
      <div className="intel-empty-hero" ref={ref}>
        <p className="premium-headline-focal">
          No theme clusters meet the volume threshold yet. Run enrichment on more
          reviews, or widen filters if a persona segment is selected.
        </p>
      </div>
    );
  }

  const current = sections.find((s) => s.id === active) ?? available[0];

  return (
    <div className="intel-tabbed-page" ref={ref}>
      <IntelTabBar
        tabs={available.map((s) => ({ id: s.id, label: s.label, count: s.clusters.length }))}
        active={current?.id ?? ""}
        onChange={setActive}
      />
      {current && (
        <section className="intel-tab-panel">
          <ClusterGrid clusters={current.clusters} variant={current.variant} />
        </section>
      )}
    </div>
  );
}

export function RoadmapIntelligenceView({
  report,
}: {
  report: {
    most_requested: RoadmapItem[];
    fastest_growing: RoadmapItem[];
    most_loved: RoadmapItem[];
    most_controversial: RoadmapItem[];
    has_insights: boolean;
  };
}) {
  const ref = useGsapReveal([report.has_insights]);

  const sections = [
    { id: "requested", label: "Most Requested", items: report.most_requested },
    { id: "growing", label: "Fastest Growing", items: report.fastest_growing },
    { id: "loved", label: "Most Loved", items: report.most_loved },
    { id: "controversial", label: "Controversial", items: report.most_controversial },
  ];

  const available = sections.filter((s) => s.items.length > 0);
  const [active, setActive] = useState(available[0]?.id ?? "requested");

  if (!report.has_insights) {
    return (
      <div className="intel-empty-hero" ref={ref}>
        <p className="premium-headline-focal">
          Feature request clusters need more analyzed data before roadmap signals are reliable.
        </p>
      </div>
    );
  }

  const current = sections.find((s) => s.id === active) ?? available[0];

  return (
    <div className="intel-tabbed-page" ref={ref}>
      <IntelTabBar
        tabs={available.map((s) => ({ id: s.id, label: s.label, count: s.items.length }))}
        active={current?.id ?? ""}
        onChange={setActive}
      />
      {current && (
        <div className="intel-cluster-grid">
          {current.items.slice(0, MAX_CLUSTERS).map((item) => (
            <RoadmapCardCompact key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoadmapCardCompact({ item }: { item: RoadmapItem }) {
  const [briefing, setBriefing] = useState<ThemeBriefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/briefing/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: item.display_name,
        count: item.count,
        change_pct: item.change_pct,
        quotes: item.quotes.map((q) => ({
          content: q.content,
          source: q.source,
          sentiment: q.sentiment,
        })),
      }),
    })
      .then((r) => r.json())
      .then(setBriefing)
      .catch(() => setBriefing(null))
      .finally(() => setLoading(false));
  }, [item]);

  return (
    <article className="intel-cluster-card intel-cluster-compact" data-reveal>
      <header className="intel-cluster-header">
        <h3 className="intel-cluster-title">{item.display_name}</h3>
        <div className="intel-cluster-stats">
          <span>{item.count.toLocaleString()} mentions</span>
          <span>{item.sentiment.positive_pct}% positive · {item.sentiment.negative_pct}% negative</span>
        </div>
      </header>
      {loading ? (
        <div className="skeleton-line wide" />
      ) : (
        <p className="intel-cluster-summary">{briefing?.ai_summary}</p>
      )}
    </article>
  );
}

export function SegmentsPersonasView({
  report,
}: {
  report: SegmentsIntelligenceReport;
}) {
  const ref = useGsapReveal([report.personas.length]);

  if (!report.has_insights) {
    return (
      <div className="intel-empty-hero" ref={ref}>
        <p className="premium-headline-focal">
          Persona clusters require at least five reviews per segment to appear.
        </p>
      </div>
    );
  }

  return (
    <div className="persona-grid-page" ref={ref}>
      {report.personas.map((persona) => (
        <PersonaPanel
          key={persona.segment}
          persona={persona}
          deprioritized={persona.segment === "podcast_listener"}
        />
      ))}
    </div>
  );
}

export function PersonaPanel({
  persona,
  deprioritized = false,
  summaryOverride,
  skipBriefingFetch = false,
}: {
  persona: SegmentPersona;
  deprioritized?: boolean;
  /** When set, replaces the AI theme summary (e.g. on Discovery Deep Dive). */
  summaryOverride?: string;
  skipBriefingFetch?: boolean;
}) {
  const [summary, setSummary] = useState<string | null>(
    summaryOverride ?? null
  );

  useEffect(() => {
    if (skipBriefingFetch || summaryOverride) {
      setSummary(summaryOverride ?? null);
      return;
    }

    fetch("/api/briefing/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: persona.label,
        count: persona.volume,
        change_pct: null,
        quotes: persona.quotes.map((q) => ({
          content: q.content,
          source: q.source,
          sentiment: q.sentiment,
        })),
      }),
    })
      .then((r) => r.json())
      .then((d: ThemeBriefing) => setSummary(d.ai_summary))
      .catch(() => setSummary(null));
  }, [persona, summaryOverride, skipBriefingFetch]);

  return (
    <article
      className={[
        "intel-persona-panel intel-persona-card",
        deprioritized ? "intel-persona-deprioritized" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-reveal
    >
      <header className="intel-persona-header">
        <div className="intel-persona-title-row">
          <span className="persona-icon-wrap">
            <PersonaIcon segment={persona.segment} />
          </span>
          <div>
            <h3 className="intel-cluster-title">{persona.label}</h3>
            <p className="persona-desc">{persona.description}</p>
            <span className="persona-confidence-badge">
              {persona.confidence_label}
            </span>
          </div>
        </div>
        <div className="intel-persona-stats">
          <span>{persona.volume.toLocaleString()} reviews ({persona.percentage}%)</span>
          <span>{persona.sentiment.negative_pct}% negative · {persona.sentiment.positive_pct}% positive</span>
        </div>
      </header>

      {summary && <p className="intel-cluster-summary">{summary}</p>}

      <div className="intel-persona-columns">
        {persona.top_complaints.length > 0 && (
          <div className="intel-persona-col">
            <h4>Top Complaints</h4>
            <ul className="intel-tag-list">
              {persona.top_complaints.slice(0, 4).map((c) => (
                <li key={c.label}>{formatLabel(c.label)} · {c.count}</li>
              ))}
            </ul>
          </div>
        )}
        {persona.top_requests.length > 0 && (
          <div className="intel-persona-col">
            <h4>Top Requests</h4>
            <ul className="intel-tag-list">
              {persona.top_requests.slice(0, 4).map((r) => (
                <li key={r.label}>{formatLabel(r.label)} · {r.count}</li>
              ))}
            </ul>
          </div>
        )}
        {persona.top_opportunities.length > 0 && (
          <div className="intel-persona-col">
            <h4>Opportunities</h4>
            <ul className="intel-actions intel-actions-compact">
              {persona.top_opportunities.slice(0, 3).map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Link
        href={`/reports/pain-points?segment=${encodeURIComponent(persona.segment)}`}
        className="btn-secondary persona-view-reviews-btn"
      >
        View reviews from this segment
      </Link>
    </article>
  );
}
