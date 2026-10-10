import { NextRequest, NextResponse } from "next/server";
import { sendWebhook } from "@/lib/discord";
import { postDailyReport } from "@/lib/daily-report-timer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The server posts the report by itself (lib/daily-report-timer.ts). This endpoint posts it
// again on demand: GET with "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await postDailyReport(true)) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await sendWebhook({ content: `Couldn't build the revenue report: ${message}` });
    } catch {
      // nothing else to do
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
