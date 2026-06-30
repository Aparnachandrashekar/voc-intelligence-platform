import { DiscoveryBriefView } from "@/app/components/discovery/DiscoveryBriefView";
import { getDiscoveryBriefReport } from "@/lib/discovery/brief";
import { parseReportFilters } from "@/lib/reports/filters";
import {
  emptyDiscoveryBriefReport,
  safeServerLoad,
} from "@/lib/server-fallbacks";

export default async function DiscoveryDeepDivePage({
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
    "discovery",
    () => getDiscoveryBriefReport(filters),
    emptyDiscoveryBriefReport(filters)
  );

  return (
    <main className="page dashboard-page discovery-page">
        <header className="premium-hero">
          <p className="premium-eyebrow">Discovery Deep Dive</p>
          <h1 className="premium-display">The discovery problem</h1>
          <p className="premium-subhead">
            A focused research brief on music discovery and recommendations —
            drawn from discovery-tagged App Store and Play Store reviews.
          </p>
        </header>

        <DiscoveryBriefView report={report} />
      </main>
  );
}
