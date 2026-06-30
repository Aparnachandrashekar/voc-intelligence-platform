"use client";

import type {
  ActionBullet,
  BriefingBullet,
  ExecutiveBriefing,
} from "@/lib/types/briefing";
import { Accordion } from "./Accordion";

function displaySharePct(pct: number, count: number): string {
  if (count <= 0) return "0%";
  if (pct <= 0) return "<0.1%";
  return `${pct}%`;
}

const MAX_ITEMS = 5;

function FrustrationIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 6.5h.01M10.5 6.5h.01M5.5 10s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function OpportunityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2M4.2 4.2l1.4 1.4M10.4 10.4l1.4 1.4M4.2 11.8l1.4-1.4M10.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ActionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8.5 6.5 12 13 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatBullets({ items }: { items: BriefingBullet[] }) {
  const list = items.slice(0, MAX_ITEMS);
  if (!list.length) return null;

  return (
    <ul className="briefing-stat-bullets">
      {list.map((item) => (
        <li key={item.label} className="briefing-stat-item">
          <p className="briefing-stat-line">
            <span className="briefing-stat-label">{item.label}</span>
            <span className="briefing-stat-sep"> — </span>
            <span className="briefing-stat-pct">{displaySharePct(item.pct, item.count)}</span>
            <span className="briefing-stat-count"> ({item.count.toLocaleString()})</span>
          </p>
          <p className="briefing-stat-insight">{item.insight}</p>
        </li>
      ))}
    </ul>
  );
}

function ActionBullets({ items }: { items: ActionBullet[] }) {
  const list = items.slice(0, MAX_ITEMS);
  if (!list.length) return null;

  return (
    <ul className="briefing-stat-bullets">
      {list.map((item) => (
        <li key={item.label} className="briefing-stat-item">
          <p className="briefing-stat-line">
            <span className="briefing-stat-label">{item.label}</span>
          </p>
          <p className="briefing-stat-insight">{item.insight}</p>
        </li>
      ))}
    </ul>
  );
}

export function ExecutiveBriefingPanel({
  briefing,
  loading,
}: {
  briefing: ExecutiveBriefing | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="premium-briefing briefing-accordions skeleton-block">
        <div className="skeleton-line wide" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    );
  }

  if (!briefing || briefing.status === "unavailable") return null;

  const frustrations = briefing.frustration_bullets ?? [];
  const opportunities = briefing.opportunity_bullets ?? [];
  const actions = briefing.action_bullets ?? [];

  const hasContent =
    frustrations.length > 0 ||
    opportunities.length > 0 ||
    actions.length > 0;

  if (!hasContent) return null;

  return (
    <div className="premium-briefing briefing-accordions">
      {frustrations.length > 0 && (
        <Accordion
          title="Biggest Frustrations"
          icon={<FrustrationIcon />}
          count={Math.min(frustrations.length, MAX_ITEMS)}
          defaultOpen
        >
          <StatBullets items={frustrations} />
        </Accordion>
      )}
      {opportunities.length > 0 && (
        <Accordion
          title="Emerging Opportunities"
          icon={<OpportunityIcon />}
          count={Math.min(opportunities.length, MAX_ITEMS)}
        >
          <StatBullets items={opportunities} />
        </Accordion>
      )}
      {actions.length > 0 && (
        <Accordion
          title="Recommended Actions"
          icon={<ActionIcon />}
          count={Math.min(actions.length, MAX_ITEMS)}
        >
          <ActionBullets items={actions} />
        </Accordion>
      )}
    </div>
  );
}
