"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { QuoteList } from "@/app/components/ReportSections";
import { useGsapReveal } from "@/app/components/premium/useGsapReveal";
import type { QuoteEvidence } from "@/lib/types/reports";
import type { RisingItem } from "@/lib/types/insights";
import type { ThemeBriefing } from "@/lib/types/briefing";

const TOOLTIP_STYLE = {
  background: "#151517",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#fff",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

function growthFor(
  label: string,
  rising: RisingItem[]
): { pct: number | null; text: string; up: boolean } {
  const item = rising.find((r) => r.label === label);
  if (!item || item.change_pct === null) {
    return { pct: null, text: "—", up: false };
  }
  const up = item.change_pct > 0;
  return {
    pct: item.change_pct,
    text: `${up ? "+" : ""}${item.change_pct}%`,
    up,
  };
}

export function PainPointsThemes({
  items,
  rising,
}: {
  items: { label: string; count: number; quotes: QuoteEvidence[] }[];
  rising: RisingItem[];
}) {
  const ref = useGsapReveal([items.length]);
  const [selected, setSelected] = useState(items[0]?.label ?? "");
  const [briefing, setBriefing] = useState<ThemeBriefing | null>(null);
  const [loading, setLoading] = useState(false);

  const active = items.find((i) => i.label === selected) ?? items[0];

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    const g = growthFor(active.label, rising);
    fetch("/api/briefing/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: active.label,
        count: active.count,
        change_pct: g.pct,
        quotes: active.quotes.map((q) => ({
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
  }, [active, rising]);

  if (!items.length) {
    return <p className="muted">No friction themes for current filters.</p>;
  }

  return (
    <div ref={ref}>
      <div className="theme-rank-list">
        {items.map((item) => {
          const g = growthFor(item.label, rising);
          return (
            <button
              key={item.label}
              type="button"
              className={`theme-rank-item ${selected === item.label ? "active" : ""}`}
              onClick={() => setSelected(item.label)}
              data-reveal
            >
              <span className="theme-rank-name">{item.label}</span>
              <span className="theme-rank-meta">
                <span className="theme-rank-count">
                  {item.count.toLocaleString()} mentions
                </span>
                {g.pct !== null && (
                  <span className={`theme-rank-growth ${g.up ? "up" : "down"}`}>
                    {g.text} growth
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="theme-detail">
          {loading ? (
            <div className="skeleton-block">
              <div className="skeleton-line wide" />
              <div className="skeleton-line" />
            </div>
          ) : (
            <>
              <h3>AI Summary</h3>
              <p>{briefing?.ai_summary}</p>

              <h3>Representative Quotes</h3>
              <QuoteList quotes={active.quotes} />

              <h3>Suggested Product Actions</h3>
              <ul>
                {(briefing?.suggested_actions ?? []).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function FeatureRoadmapView({
  items,
  rising,
}: {
  items: { label: string; count: number; quotes: QuoteEvidence[] }[];
  rising: RisingItem[];
}) {
  const ref = useGsapReveal([items.length]);

  if (!items.length) {
    return <p className="muted">No feature requests for current filters.</p>;
  }

  const withMeta = items.map((item) => {
    const g = growthFor(item.label, rising);
    const neg = item.quotes.filter((q) => q.sentiment === "negative").length;
    const pos = item.quotes.filter((q) => q.sentiment === "positive").length;
    const polarizing = neg > 0 && pos > 0 ? neg + pos : 0;
    const opportunity =
      Math.round(item.count * (1 + (g.pct ?? 0) / 100) * 10) / 10;
    return { ...item, g, polarizing, opportunity, neg, pos };
  });

  const mostRequested = withMeta[0];
  const fastestGrowing = [...withMeta].sort(
    (a, b) => (b.g.pct ?? 0) - (a.g.pct ?? 0)
  )[0];
  const mostPolarizing = [...withMeta].sort(
    (a, b) => b.polarizing - a.polarizing
  )[0];

  return (
    <div ref={ref}>
      <div className="roadmap-highlights">
        <div className="roadmap-highlight" data-reveal>
          <p className="roadmap-highlight-label">Most Requested</p>
          <p className="roadmap-highlight-value">{mostRequested?.label}</p>
        </div>
        <div className="roadmap-highlight" data-reveal>
          <p className="roadmap-highlight-label">Fastest Growing</p>
          <p className="roadmap-highlight-value">{fastestGrowing?.label}</p>
        </div>
        <div className="roadmap-highlight" data-reveal>
          <p className="roadmap-highlight-label">Most Polarizing</p>
          <p className="roadmap-highlight-value">{mostPolarizing?.label}</p>
        </div>
      </div>

      {withMeta.map((item) => (
        <article key={item.label} className="roadmap-card" data-reveal>
          <div className="roadmap-card-header">
            <h3>{item.label}</h3>
            <span className="roadmap-score">
              Score {item.opportunity.toLocaleString()}
            </span>
          </div>
          <div className="roadmap-stats">
            <span>{item.count} mentions</span>
            {item.g.pct !== null && (
              <span className={item.g.up ? "theme-rank-growth up" : "theme-rank-growth down"}>
                {item.g.text} growth
              </span>
            )}
            <span>
              Sentiment: {item.pos} positive · {item.neg} negative
            </span>
          </div>
          <QuoteList quotes={item.quotes.slice(0, 2)} />
        </article>
      ))}
    </div>
  );
}

export function OverviewNarrative({
  report,
  risingPain,
  risingRequests,
}: {
  report: {
    sentiment_distribution: { label: string; count: number; percentage?: number }[];
    source_breakdown: { label: string; count: number; percentage?: number }[];
    top_themes: { label: string; count: number }[];
  };
  risingPain: RisingItem[];
  risingRequests: RisingItem[];
}) {
  const ref = useGsapReveal();
  const [commentary, setCommentary] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "overview" }),
    })
      .then((r) => r.json())
      .then((d) => {
        setCommentary({
          sentiment: d.summary ?? "",
          themes: d.narrative_bullets?.[0] ?? "",
          complaints: d.narrative_bullets?.[1] ?? "",
          praise: d.opportunities?.[0] ?? "",
          sources: d.narrative_bullets?.[2] ?? d.summary ?? "",
        });
      })
      .catch(() => setCommentary({}))
      .finally(() => setLoading(false));
  }, []);

  const sections = [
    {
      id: "sentiment",
      title: "Sentiment Distribution",
      content: (
        <div className="premium-kpi-grid" style={{ marginBottom: 0 }}>
          {report.sentiment_distribution.map((s) => (
            <div key={s.label} className="premium-kpi">
              <p className="premium-kpi-label">{s.label}</p>
              <p className="premium-kpi-value">{s.percentage ?? 0}%</p>
              <p className="premium-kpi-delta">{s.count.toLocaleString()} reviews</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "themes",
      title: "Top Emerging Themes",
      content: (
        <div className="theme-rank-list">
          {report.top_themes.slice(0, 6).map((t) => (
            <div key={t.label} className="theme-rank-item" style={{ cursor: "default" }}>
              <span className="theme-rank-name">{t.label}</span>
              <span className="theme-rank-count">{t.count} mentions</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "complaints",
      title: "Fastest Growing Complaints",
      content: (
        <ul>
          {risingPain.length === 0 ? (
            <li className="muted">No rising complaints in this period.</li>
          ) : (
            risingPain.map((r) => (
              <li key={r.label}>
                {r.label} — {r.current_count} mentions
                {r.change_pct !== null ? ` (+${r.change_pct}%)` : ""}
              </li>
            ))
          )}
        </ul>
      ),
    },
    {
      id: "praise",
      title: "Fastest Growing Praise",
      content: (
        <ul>
          {risingRequests.length === 0 ? (
            <li className="muted">No rising requests in this period.</li>
          ) : (
            risingRequests.map((r) => (
              <li key={r.label}>
                {r.label} — {r.current_count} requests
                {r.change_pct !== null ? ` (+${r.change_pct}%)` : ""}
              </li>
            ))
          )}
        </ul>
      ),
    },
    {
      id: "sources",
      title: "Source Breakdown",
      content: (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={report.source_breakdown.map((s) => ({
              name: s.label.replace("_", " "),
              count: s.count,
            }))}
            layout="vertical"
          >
            <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
            <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" fill="#1ed760" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ),
    },
  ];

  return (
    <div ref={ref}>
      {sections.map((sec) => (
        <section key={sec.id} className="narrative-section" data-reveal>
          <h2>{sec.title}</h2>
          {loading ? (
            <div className="skeleton-line wide" />
          ) : (
            commentary[sec.id] && (
              <p className="narrative-commentary">{commentary[sec.id]}</p>
            )
          )}
          {sec.content}
        </section>
      ))}
    </div>
  );
}
