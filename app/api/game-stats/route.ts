import { NextRequest, NextResponse } from "next/server";
import { gameStats, isRobloxConfigured } from "@/lib/roblox-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/game-stats?universeId=1 → last 30 days of engagement, retention and payer stats for one game
export async function GET(request: NextRequest) {
  if (!isRobloxConfigured()) return NextResponse.json({ configured: false, stats: {} });

  const id = (request.nextUrl.searchParams.get("universeId") ?? "").trim();
  if (id === "" || ![...id].every((char) => char >= "0" && char <= "9")) return NextResponse.json({ configured: true, stats: {} });

  try {
    return NextResponse.json({ configured: true, stats: await gameStats(id) });
  } catch (e) {
    return NextResponse.json({ configured: true, stats: {}, error: e instanceof Error ? e.message : String(e) });
  }
}
