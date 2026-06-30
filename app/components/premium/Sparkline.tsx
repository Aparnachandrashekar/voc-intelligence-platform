"use client";

export function Sparkline({
  data,
  color = "#1ed760",
}: {
  data: number[];
  color?: string;
}) {
  if (data.length < 2) return null;
  const w = 80;
  const h = 28;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="sparkline" aria-hidden>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
