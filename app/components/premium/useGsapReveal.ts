"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function useGsapReveal(deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targets = el.querySelectorAll("[data-reveal]");
    gsap.fromTo(
      targets,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 0.65,
        stagger: 0.08,
        ease: "power3.out",
      }
    );
  }, deps);

  return ref;
}

export function useGsapHero() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { opacity: 0, y: 32 },
      { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }
    );
  }, []);

  return ref;
}
