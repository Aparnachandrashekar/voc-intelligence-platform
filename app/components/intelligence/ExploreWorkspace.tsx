"use client";

import { RagPanel } from "@/app/components/RagPanel";
import { formatCorpusSearchIntro } from "@/lib/intelligence/copy";
import type { ActiveCorpusStats } from "@/lib/corpus-stats";

export function ExploreWorkspace({
  corpusStats,
}: {
  corpusStats: ActiveCorpusStats;
}) {
  return (
    <main className="page dashboard-page explore-workspace">
      <header className="premium-hero">
        <p className="premium-eyebrow">Research Workspace</p>
        <h1 className="premium-display">Explore user conversations</h1>
        <p className="premium-subhead">
          {formatCorpusSearchIntro(corpusStats)} — results appear inline using
          the same research pipeline as Conversational Research.
        </p>
      </header>

      <RagPanel compact prominent hideHeader corpusStats={corpusStats} />
    </main>
  );
}
