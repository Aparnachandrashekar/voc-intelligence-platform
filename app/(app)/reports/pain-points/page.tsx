import { Suspense } from "react";
import { ReportFilters } from "@/app/components/ReportFilters";
import { VocIntelligenceView } from "@/app/components/intelligence/IntelligenceViews";
import { formatPersona } from "@/lib/intelligence/format";
import { getVocIntelligenceReport } from "@/lib/intelligence/aggregations";
import { parseReportFilters } from "@/lib/reports/filters";
import {
  emptyVocIntelligenceReport,
  safeServerLoad,
} from "@/lib/server-fallbacks";

export const dynamic = "force-dynamic";

export default async function PainPointsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseReportFilters(
    new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][]
    )
  );
  const report = await safeServerLoad(
    "pain-points",
    () => getVocIntelligenceReport(filters),
    emptyVocIntelligenceReport(filters)
  );
  const segmentLabel = filters.segment
    ? formatPersona(filters.segment)
    : null;

  return (
    <main className="page dashboard-page">
        <header className="premium-hero">
          <p className="premium-eyebrow">Spotify Review Engine</p>
          <h1 className="premium-display">
            {segmentLabel
              ? `${segmentLabel} — what users say`
              : "What users are telling us"}
          </h1>
          <p className="premium-subhead">
            {segmentLabel
              ? `Theme clusters and quotes filtered to the ${segmentLabel} persona segment.`
              : "Theme clusters ranked by volume, growth, and sentiment — not individual review dumps."}
          </p>
        </header>
        {segmentLabel && (
          <div className="explore-segment-banner">
            <p>
              Persona deep-dive: <strong>{segmentLabel}</strong>
            </p>
          </div>
        )}
        <Suspense>
          <ReportFilters
            basePath="/reports/pain-points"
            variant="compact"
            showPersonaFilter
          />
        </Suspense>
        <VocIntelligenceView key={JSON.stringify(filters)} report={report} />
      </main>
  );
}
