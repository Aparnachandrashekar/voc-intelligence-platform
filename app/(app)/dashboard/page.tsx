import { Suspense } from "react";
import { DashboardMetricsGrid } from "@/app/components/dashboard/DashboardMetricsGrid";
import { ExecutiveSummary } from "@/app/components/dashboard/ExecutiveSummary";
import { PipelineUtilityBar } from "@/app/components/dashboard/PipelineStatusBar";
import { DashboardClientShell } from "@/app/components/premium/DashboardClientShell";
import { DashboardQualitativeInsights } from "@/app/components/premium/DashboardQualitativeInsights";
import { RagPanel } from "@/app/components/RagPanel";
import {
  getDashboardMetrics,
  getDashboardSummary,
  getEmptyDashboardMetrics,
  getEmptyDashboardSummary,
  getEmptyPipelineStatus,
  getPipelineStatus,
  parseDashboardRange,
} from "@/lib/dashboard/aggregations";
import { getActiveCorpusStats } from "@/lib/corpus-stats";
import { parseReportFilters } from "@/lib/reports/filters";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const urlParams = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][]
  );
  const range = parseDashboardRange(params.range);
  const filters = parseReportFilters(urlParams);

  let status = getEmptyPipelineStatus();
  let summary = getEmptyDashboardSummary(range, filters);
  let metrics = getEmptyDashboardMetrics(range, filters);
  let corpusStats = await getActiveCorpusStats();

  try {
    [status, summary, metrics, corpusStats] = await Promise.all([
      getPipelineStatus(),
      getDashboardSummary(range, filters),
      getDashboardMetrics(range, filters),
      getActiveCorpusStats(),
    ]);
  } catch (error) {
    console.error("[dashboard] database unavailable:", error);
  }

  return (
    <main className="page dashboard-page">
        <PipelineUtilityBar status={status} corpusStats={corpusStats} />

        <Suspense>
          <DashboardClientShell range={range}>
            <section className="dashboard-section dashboard-section-primary">
              <ExecutiveSummary
                summary={summary}
                basePath="/dashboard"
                hideRange
              />
            </section>

            <section className="dashboard-section">
              <DashboardMetricsGrid metrics={metrics} />
            </section>
          </DashboardClientShell>
        </Suspense>

        <section className="dashboard-section">
          <Suspense>
            <DashboardQualitativeInsights filters={filters} />
          </Suspense>
        </section>

        <section className="dashboard-section ask-dashboard-section">
          <p className="premium-eyebrow">Conversational Research</p>
          <h2 className="premium-section-title">Ask the data</h2>
          <p className="premium-section-sub ask-dashboard-section-sub">
            Natural-language research with structured answers and evidence.
          </p>
          <RagPanel compact prominent hideHeader corpusStats={corpusStats} />
        </section>
      </main>
  );
}
