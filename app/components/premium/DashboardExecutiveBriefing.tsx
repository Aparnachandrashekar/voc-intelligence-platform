"use client";

import { ExecutiveBriefingPanel } from "./ExecutiveBriefingPanel";
import { useDashboardBriefing } from "./DashboardBriefingContext";

export function DashboardExecutiveBriefing() {
  const { briefing, loading } = useDashboardBriefing();

  if (!loading && briefing?.status === "unavailable") return null;

  return (
    <section className="dashboard-section dashboard-briefing-section">
      <p className="premium-eyebrow">Executive Briefing</p>
      <h2 className="premium-section-title">Key signals</h2>
      <p className="premium-section-sub briefing-section-intro">
        Top frustrations and opportunities ranked by share of AI-analyzed conversations.
      </p>
      <div className="briefing-section-divider" aria-hidden />
      <ExecutiveBriefingPanel briefing={briefing} loading={loading} />
    </section>
  );
}
