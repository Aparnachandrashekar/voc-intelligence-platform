"use client";

import { Suspense } from "react";
import { ReportFilters } from "@/app/components/ReportFilters";
import { useDashboardBriefing } from "./DashboardBriefingContext";
import { useGsapHero } from "./useGsapReveal";

export function DashboardPageHeader() {
  const heroRef = useGsapHero();
  const { headline, loading } = useDashboardBriefing();

  return (
    <header className="dashboard-page-header" ref={heroRef}>
      <h1 className="premium-display dashboard-title">Spotify User Review Engine</h1>
      <p className="dashboard-subtitle">
        An in-depth analysis of user reviews for Spotify
      </p>
      <p className="dashboard-insight-line">{loading ? "…" : headline}</p>
      <Suspense>
        <ReportFilters basePath="/dashboard" variant="compact" />
      </Suspense>
    </header>
  );
}
