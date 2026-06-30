import { NextResponse } from "next/server";
import { getPipelineStatus } from "@/lib/dashboard/aggregations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getPipelineStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Status failed" },
      { status: 500 }
    );
  }
}
