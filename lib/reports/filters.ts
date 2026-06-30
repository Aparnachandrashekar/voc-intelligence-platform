import type { DashboardRange } from "@/lib/types/dashboard";
import type { ReportFilters } from "@/lib/types/reports";
import { liveStoreScopeClause } from "@/lib/data-scope";
import {
  DISCOVERY_SCOPE_SQL,
  SEGMENT_CASE_SQL,
} from "@/lib/segments/segment-sql";

function rangeToDateFrom(range: string): string | undefined {
  const days: Record<string, number | null> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    all: null,
  };
  const d = days[range as DashboardRange];
  if (d == null) return undefined;
  const start = new Date();
  start.setDate(start.getDate() - d);
  return start.toISOString().slice(0, 10);
}

export function parseReportFilters(
  searchParams: URLSearchParams
): ReportFilters {
  const range = searchParams.get("range");
  const dateFrom =
    searchParams.get("date_from") ||
    (range ? rangeToDateFrom(range) : undefined) ||
    undefined;

  return {
    source: (searchParams.get("source") as ReportFilters["source"]) || undefined,
    sentiment:
      (searchParams.get("sentiment") as ReportFilters["sentiment"]) || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: searchParams.get("date_to") || undefined,
    segment: searchParams.get("segment") || undefined,
  };
}

export interface FilterClauseOptions {
  liveStoreOnly?: boolean;
}

export function buildFilterClause(
  filters: ReportFilters,
  alias = "f",
  options?: FilterClauseOptions
): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  const scopeLive = options?.liveStoreOnly !== false;
  if (scopeLive) {
    const scope = liveStoreScopeClause(alias, i);
    clauses.push(scope.clause);
    params.push(...scope.params);
    i += scope.params.length;
  }

  if (filters.source) {
    clauses.push(`${alias}.source = $${i++}`);
    params.push(filters.source);
  }
  if (filters.dateFrom) {
    clauses.push(`COALESCE(${alias}.created_at, ${alias}.ingested_at) >= $${i++}`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push(`COALESCE(${alias}.created_at, ${alias}.ingested_at) <= $${i++}`);
    params.push(filters.dateTo);
  }
  if (filters.sentiment) {
    clauses.push(`e.sentiment = $${i++}`);
    params.push(filters.sentiment);
  }
  if (filters.segment) {
    clauses.push(`(${SEGMENT_CASE_SQL}) = $${i++}`);
    params.push(filters.segment);
  }
  if (filters.discoveryScope) {
    clauses.push(DISCOVERY_SCOPE_SQL);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

/** True when enrichment join is required for active filters. */
export function needsEnrichmentJoin(filters: ReportFilters): boolean {
  return Boolean(
    filters.sentiment ||
      filters.segment ||
      filters.discoveryScope
  );
}
