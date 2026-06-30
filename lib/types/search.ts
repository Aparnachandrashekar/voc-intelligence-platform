export type SearchMode = "semantic" | "keyword" | "hybrid";

export interface SearchResultMeta {
  mode: SearchMode;
  query: string;
  count: number;
}
