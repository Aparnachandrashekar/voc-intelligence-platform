"use client";

import { DashboardBriefingProvider } from "@/app/components/premium/DashboardBriefingContext";
import { DashboardExecutiveBriefing } from "@/app/components/premium/DashboardExecutiveBriefing";
import { DashboardPageHeader } from "@/app/components/premium/DashboardPageHeader";
import type { ReactNode } from "react";

export function DashboardClientShell({
  range,
  children,
}: {
  range: string;
  children: ReactNode;
}) {
  return (
    <DashboardBriefingProvider range={range}>
      <DashboardPageHeader />
      {children}
      <DashboardExecutiveBriefing />
    </DashboardBriefingProvider>
  );
}
