import { NextRequest, NextResponse } from "next/server";
import { isRobloxConfigured, revenueForGames } from "@/lib/roblox-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/revenue?universeIds=1,2,3 → real Robux per day for each game (last ~13 months)
export async function GET(request: NextRequest) {
  if (!isRobloxConfigured()) return NextResponse.json({ configured: false, revenue: {}, errors: {} });

  const ids = (request.nextUrl.searchParams.get("universeIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 50);
  if (ids.length === 0) return NextResponse.json({ configured: true, revenue: {}, errors: {} });

  const { revenue, errors } = await revenueForGames(ids, 400);
  return NextResponse.json({ configured: true, revenue, errors });
}
