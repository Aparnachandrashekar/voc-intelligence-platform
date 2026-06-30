export type PersonaConfidence = "high" | "medium" | "low";

export function getPersonaConfidence(volume: number): PersonaConfidence {
  if (volume >= 500) return "high";
  if (volume >= 200) return "medium";
  return "low";
}

export function formatPersonaConfidenceLabel(volume: number): string {
  const level = getPersonaConfidence(volume);
  switch (level) {
    case "high":
      return "High confidence (500+ reviews)";
    case "medium":
      return "Medium confidence (200–500 reviews)";
    default:
      return "Low confidence (under 200 reviews)";
  }
}
