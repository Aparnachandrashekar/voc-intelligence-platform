import { Suspense } from "react";
import { ReportFilters } from "@/app/components/ReportFilters";
import { SegmentsPersonasView } from "@/app/components/intelligence/IntelligenceViews";
import { getSegmentsPersonasReport } from "@/lib/segments/aggregations";
import { parseReportFilters } from "@/lib/reports/filters";

export default async function SegmentsReportPage({
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
  const report = await getSegmentsPersonasReport(filters);

  return (
    <main className="page dashboard-page">
        <header className="premium-hero">
          <p className="premium-eyebrow">User Personas</p>
          <h1 className="premium-display">Who is speaking</h1>
          <p className="premium-subhead">
            Segments derived from AI clustering of 5,162 App Store and Play Store
            reviews.
          </p>
        </header>
        <Suspense>
          <ReportFilters basePath="/reports/segments" variant="compact" />
        </Suspense>
        <SegmentsPersonasView report={report} />
      </main>
  );
}
