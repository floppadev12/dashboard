import { NextRequest, NextResponse } from "next/server";
import { concurrentPlayers, isCcuRange, isRobloxConfigured } from "@/lib/roblox-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/ccu?universeIds=1,2,3&range=3h → real players online over time, all games added up
export async function GET(request: NextRequest) {
  if (!isRobloxConfigured()) return NextResponse.json({ configured: false, points: [] });

  const range = request.nextUrl.searchParams.get("range") ?? "3h";
  const ids = (request.nextUrl.searchParams.get("universeIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "" && [...id].every((char) => char >= "0" && char <= "9"))
    .slice(0, 50);
  if (ids.length === 0 || !isCcuRange(range)) return NextResponse.json({ configured: true, points: [] });

  try {
    return NextResponse.json({ configured: true, range, points: await concurrentPlayers(ids, range) });
  } catch (e) {
    return NextResponse.json({ configured: true, points: [], error: e instanceof Error ? e.message : String(e) });
  }
}
