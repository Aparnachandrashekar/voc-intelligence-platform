"use client";

import { useGsapHero } from "./useGsapReveal";

export function DashboardHero({ totalReviews }: { totalReviews: number }) {
  const heroRef = useGsapHero();

  return (
    <header className="premium-hero dashboard-hero-compact" ref={heroRef}>
      <p className="premium-eyebrow">Spotify Review Engine</p>
      <h1 className="premium-display">Spotify Review Engine</h1>
      <p className="premium-subhead">
        {totalReviews.toLocaleString()}+ user conversations analyzed across App
        Store, Play Store, Reddit, Communities and Social channels.
      </p>
    </header>
  );
}
