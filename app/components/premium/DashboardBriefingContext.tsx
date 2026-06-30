"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ExecutiveBriefing } from "@/lib/types/briefing";

interface BriefingContextValue {
  briefing: ExecutiveBriefing | null;
  loading: boolean;
  headline: string;
}

const BriefingContext = createContext<BriefingContextValue>({
  briefing: null,
  loading: true,
  headline: "Synthesizing what Spotify users are telling us.",
});

export function DashboardBriefingProvider({
  range,
  children,
}: {
  range: string;
  children: ReactNode;
}) {
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

  const headline =
    briefing?.executive_headline ??
    "Synthesizing what Spotify users are telling us.";

  return (
    <BriefingContext.Provider value={{ briefing, loading, headline }}>
      {children}
    </BriefingContext.Provider>
  );
}

export function useDashboardBriefing() {
  return useContext(BriefingContext);
}
