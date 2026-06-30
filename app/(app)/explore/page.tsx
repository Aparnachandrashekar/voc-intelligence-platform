import { ExploreWorkspace } from "@/app/components/intelligence/ExploreWorkspace";
import { getActiveCorpusStats } from "@/lib/corpus-stats";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const corpusStats = await getActiveCorpusStats();
  return <ExploreWorkspace corpusStats={corpusStats} />;
}
