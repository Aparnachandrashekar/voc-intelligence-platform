"use client";

import { RagPanel } from "@/app/components/RagPanel";

export function ExploreWorkspace() {
  return (
    <main className="page dashboard-page explore-workspace">
      <header className="premium-hero">
        <p className="premium-eyebrow">Research Workspace</p>
        <h1 className="premium-display">Explore user conversations</h1>
        <p className="premium-subhead">
          Search across 5,162 App Store and Play Store reviews — results appear
          inline using the same research pipeline as Conversational Research.
        </p>
      </header>

      <RagPanel compact prominent hideHeader />
    </main>
  );
}
