import trendingConfig from "@/config/trending-searches.json";

export function getTrendingSearches(): string[] {
  return trendingConfig.queries;
}
