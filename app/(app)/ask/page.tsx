import { RagPanel } from "@/app/components/RagPanel";
import { getActiveCorpusStats } from "@/lib/corpus-stats";

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const corpusStats = await getActiveCorpusStats();
  return (
    <main className="page dashboard-page ask-flagship">
      <RagPanel corpusStats={corpusStats} />
    </main>
  );
}
