import { Suspense } from "react";
import { ReportFilters } from "@/app/components/ReportFilters";
import { SegmentsPersonasView } from "@/app/components/intelligence/IntelligenceViews";
import { getActiveCorpusStats } from "@/lib/corpus-stats";
import { formatCorpusSegmentsIntro } from "@/lib/intelligence/copy";
import { getSegmentsPersonasReport } from "@/lib/segments/aggregations";
import { parseReportFilters } from "@/lib/reports/filters";
import {
  emptySegmentsPersonasReport,
  safeServerLoad,
} from "@/lib/server-fallbacks";

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
  const [report, corpusStats] = await Promise.all([
    safeServerLoad(
      "segments",
      () => getSegmentsPersonasReport(filters),
      emptySegmentsPersonasReport(filters)
    ),
    getActiveCorpusStats(),
  ]);

  return (
    <main className="page dashboard-page">
        <header className="premium-hero">
          <p className="premium-eyebrow">User Personas</p>
          <h1 className="premium-display">Who is speaking</h1>
          <p className="premium-subhead">
            {formatCorpusSegmentsIntro(corpusStats)}
          </p>
        </header>
        <Suspense>
          <ReportFilters basePath="/reports/segments" variant="compact" />
        </Suspense>
        <SegmentsPersonasView report={report} />
      </main>
  );
}
