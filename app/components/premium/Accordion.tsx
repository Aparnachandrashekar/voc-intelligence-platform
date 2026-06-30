"use client";

import { useState, type ReactNode } from "react";

export function Accordion({
  title,
  icon,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: ReactNode;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`accordion ${open ? "accordion-open" : ""}`}>
      <button
        type="button"
        className="accordion-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="accordion-trigger-left">
          {icon && <span className="accordion-icon">{icon}</span>}
          <span className="accordion-title">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="accordion-count">{count}</span>
          )}
        </span>
        <span className="accordion-chevron" aria-hidden />
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}
