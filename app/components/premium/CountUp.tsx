"use client";

import { useEffect, useRef, useState } from "react";

export function CountUp({
  value,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      setDisplay(value);
      return;
    }
    started.current = true;
    const duration = 700;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  return (
    <span className="count-up">
      {display.toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
