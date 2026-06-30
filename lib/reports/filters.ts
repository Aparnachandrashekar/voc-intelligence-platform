import type { ReportFilters } from "@/lib/types/reports";
import { liveStoreScopeClause } from "@/lib/data-scope";
import {
  DISCOVERY_SCOPE_SQL,
  SEGMENT_CASE_SQL,
} from "@/lib/segments/segment-sql";

export function parseReportFilters(
  searchParams: URLSearchParams
): ReportFilters {
  return {
    source: (searchParams.get("source") as ReportFilters["source"]) || undefined,
    sentiment:
      (searchParams.get("sentiment") as ReportFilters["sentiment"]) || undefined,
    dateFrom: searchParams.get("date_from") || undefined,
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
