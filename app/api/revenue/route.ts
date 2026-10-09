import { NextRequest, NextResponse } from "next/server";
import { allTimeForGames, isRobloxConfigured, revenueForGames } from "@/lib/roblox-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/revenue?universeIds=1,2,3 → real Robux per day for each game (last ~13 months)
// plus each game's all-time total split by revenue source
export async function GET(request: NextRequest) {
  if (!isRobloxConfigured()) return NextResponse.json({ configured: false, revenue: {}, allTime: {}, errors: {} });

  const ids = (request.nextUrl.searchParams.get("universeIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 50);
  if (ids.length === 0) return NextResponse.json({ configured: true, revenue: {}, allTime: {}, errors: {} });

  const [{ revenue, errors }, allTime] = await Promise.all([revenueForGames(ids, 400), allTimeForGames(ids)]);
  return NextResponse.json({ configured: true, revenue, allTime, errors });
}
