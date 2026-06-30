"use client";

import { useEffect, useState } from "react";
import type { ExecutiveBriefing } from "@/lib/types/briefing";
import { ExecutiveBriefingPanel } from "@/app/components/premium/ExecutiveBriefingPanel";
import { useGsapHero } from "@/app/components/premium/useGsapReveal";

export function ExecutiveBriefingView({ range = "30d" }: { range?: string }) {
  const heroRef = useGsapHero();
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/briefing?range=${range}`)
      .then((r) => r.json())
      .then(setBriefing)
      .catch(() => setBriefing(null))
      .finally(() => setLoading(false));
  }, [range]);

  if (!loading && briefing?.status === "unavailable") {
    return (
      <div className="intel-empty-hero">
        <p className="premium-headline-focal">
          Executive briefing will appear once reviews are AI-analyzed.
        </p>
      </div>
    );
  }

  const headline =
    briefing?.executive_headline ??
    "Synthesizing what Spotify users are telling us.";

  return (
    <div ref={heroRef}>
      {!loading && (
        <p className="premium-headline-focal">{headline}</p>
      )}
      <ExecutiveBriefingPanel briefing={briefing} loading={loading} />
    </div>
  );
}
