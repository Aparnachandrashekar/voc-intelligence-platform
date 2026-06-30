"use client";

import { useSearchParams } from "next/navigation";
import { InsightPanel } from "@/app/components/InsightPanel";
import type { ReportFilters } from "@/lib/types/reports";

export function DashboardQualitativeInsights({
  filters,
}: {
  filters: ReportFilters;
}) {
  const params = useSearchParams();
  const range = params.get("range") ?? "30d";

  return (
    <InsightPanel
      section="dashboard"
      filters={filters}
      range={range}
      premium
      showFilters
    />
  );
}
