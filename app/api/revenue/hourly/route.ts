import { NextRequest, NextResponse } from "next/server";
import { hourlyRobuxSpent, isRobloxConfigured } from "@/lib/roblox-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/revenue/hourly?universeIds=1,2,3 → Robux spent per hour, all games added up (last 144 hours)
export async function GET(request: NextRequest) {
  if (!isRobloxConfigured()) return NextResponse.json({ configured: false, points: [], errors: {}, unknownTypes: [] });

  const ids = (request.nextUrl.searchParams.get("universeIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 50);
  if (ids.length === 0) return NextResponse.json({ configured: true, points: [], errors: {}, unknownTypes: [] });

  return NextResponse.json({ configured: true, ...(await hourlyRobuxSpent(ids)) });
}
