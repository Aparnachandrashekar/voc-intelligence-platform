export function KpiIconConversations() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 16 13.5H8l-3.5 2.5V4.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KpiIconRating() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 3.5 12.2 8l4.8.7-3.5 3.4.8 4.8L10 14.8 5.7 16.9l.8-4.8L3 8.7 7.8 8 10 3.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KpiIconSentiment() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M7 8.25h.01M13 8.25h.01M7.5 12.25c.9.75 2.1 1.25 2.5 1.25s1.6-.5 2.5-1.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PersonaIcon({ segment }: { segment: string }) {
  const props = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none" as const, "aria-hidden": true };

  switch (segment) {
    case "price_sensitive":
      return (
        <svg {...props}>
          <path d="M12 3v18M8 7h6a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "technical_issues":
      return (
        <svg {...props}>
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l2 2 5.3-5.3a4 4 0 0 0 5.4-5.4l-2-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case "feature_advocate":
      return (
        <svg {...props}>
          <path
            d="M9 18V7.5a2.5 2.5 0 1 1 2 0V18M9 18H7M9 18h2.5M15 6.5V18M15 18h2M15 18h-2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "discovery_seeker":
      return (
        <svg {...props}>
          <path
            d="M4 14v-3a8 8 0 0 1 16 0v3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M6 14h12v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "podcast_listener":
      return (
        <svg {...props}>
          <rect x="9" y="4" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "happy_promoter":
      return (
        <svg {...props}>
          <path d="M12 4 14.5 9 20 9.7 16 13.5l1 5.8L12 16.8 7 19.3l1-5.8L4 9.7 9.5 9 12 4Z" stroke="#1ed760" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case "dissatisfied_critic":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 10h.01M15 10h.01M9 15c1-1 2-1.5 3-1.5s2 .5 3 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "neutral_observer":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 10h.01M15 10h.01M9 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}
