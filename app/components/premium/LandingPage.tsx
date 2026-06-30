"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    title: "Executive Insights",
    body: "AI-generated briefings distill thousands of reviews into a single narrative — what changed, what's rising, and what leadership should act on.",
    icon: "◆",
  },
  {
    title: "Customer Friction",
    body: "Ranked pain point themes with growth signals, representative quotes, and product actions — not another spreadsheet of complaints.",
    icon: "◇",
  },
  {
    title: "Product Opportunities",
    body: "Feature request mining surfaces demand, sentiment, and opportunity scores so roadmap decisions are evidence-backed.",
    icon: "○",
  },
  {
    title: "Conversational Research",
    body: "Ask anything about Spotify users. Every answer reads like a research report with evidence, stats, and suggested actions.",
    icon: "▣",
  },
  {
    title: "Emerging Signals",
    body: "Track sentiment shifts, rising themes, and source mix over time — before issues become headlines.",
    icon: "△",
  },
];

export function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (hero) {
      gsap.fromTo(
        hero.querySelectorAll("[data-anim]"),
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.75,
          stagger: 0.12,
          ease: "power3.out",
        }
      );
    }

    const sections = sectionsRef.current;
    if (sections) {
      sections.querySelectorAll(".landing-feature").forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 48 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: "power3.out",
            scrollTrigger: {
              trigger: el,
              start: "top 85%",
              toggleActions: "play none none none",
            },
          }
        );
      });
    }

    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  }, []);

  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link href="/" className="landing-nav-brand">
          <Image
            src="/brand/spotify-app-icon.png"
            alt=""
            width={52}
            height={52}
            className="landing-nav-logo"
            priority
          />
          <span className="landing-nav-title">Review Engine</span>
        </Link>
        <Link href="/dashboard" className="landing-cta">
          Enter platform
        </Link>
      </nav>

      <section className="landing-hero" ref={heroRef}>
        <p className="premium-eyebrow" data-anim>
          Spotify user reviews
        </p>
        <h1 data-anim>Spotify User Review Engine</h1>
        <p data-anim>
          An in-depth analysis of user reviews for Spotify — built from app
          store reviews, communities, and public feedback.
        </p>
        <Link href="/dashboard" className="landing-cta" data-anim>
          Open Executive Briefing →
        </Link>
      </section>

      <div className="landing-sections" ref={sectionsRef}>
        {FEATURES.map((f, i) => (
          <article
            key={f.title}
            className="landing-feature"
            style={{ direction: i % 2 === 1 ? "rtl" : "ltr" }}
          >
            <div style={{ direction: "ltr" }}>
              <p className="premium-eyebrow">{f.title}</p>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </div>
            <div className="landing-feature-visual" style={{ direction: "ltr" }}>
              {f.icon}
            </div>
          </article>
        ))}
      </div>

      <footer className="landing-footer">
        Unofficial analysis project — not affiliated with Spotify AB.
      </footer>
    </div>
  );
}
