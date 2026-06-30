"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/dashboard", label: "Executive Briefing" },
  { href: "/ask", label: "Conversational Research" },
  { href: "/discovery", label: "Discovery Deep Dive" },
  { href: "/reports/pain-points", label: "What Users Say" },
  { href: "/reports/segments", label: "User Personas" },
  { href: "/explore", label: "Research Workspace" },
] as const;

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <div className={`app-shell ${navOpen ? "nav-open" : "nav-collapsed"}`}>
      {!navOpen && (
        <div className="main-brand-bar">
          <button
            type="button"
            className="sidebar-toggle sidebar-toggle-fab"
            onClick={() => setNavOpen(true)}
            aria-expanded={false}
            aria-label="Open navigation"
          >
            <span />
            <span />
            <span />
          </button>
          <Link href="/dashboard" className="main-brand">
            <Image
              src="/brand/spotify-app-icon.png"
              alt=""
              width={40}
              height={40}
              className="main-brand-logo"
              priority
            />
            <span className="main-brand-title">Review Engine</span>
          </Link>
        </div>
      )}

      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-header">
          <Link href="/dashboard" className="sidebar-brand">
            <Image
              src="/brand/spotify-app-icon.png"
              alt=""
              width={52}
              height={52}
              className="sidebar-logo"
              priority
            />
            <span className="sidebar-title">Review Engine</span>
          </Link>
          <button
            type="button"
            className="sidebar-toggle sidebar-toggle-inline"
            onClick={() => setNavOpen(false)}
            aria-expanded={navOpen}
            aria-label="Collapse navigation"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <nav className="sidebar-nav">
          {links.map((link) => {
            const active =
              isNavActive(pathname, link.href) || pendingHref === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch
                className={`sidebar-link${active ? " sidebar-link-active" : ""}`}
                aria-current={isNavActive(pathname, link.href) ? "page" : undefined}
                onClick={() => setPendingHref(link.href)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <p className="sidebar-disclaimer">
          Unofficial analysis project — not affiliated with Spotify.
        </p>
      </aside>

      <div className="main-wrap">{children}</div>
    </div>
  );
}
