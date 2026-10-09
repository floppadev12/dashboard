import { NextRequest, NextResponse } from "next/server";
import { sendWebhook } from "@/lib/discord";
import { buildRevenueEmbed } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron calls this daily (vercel.json) with "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    await sendWebhook({ username: "Project Floppa", embeds: [await buildRevenueEmbed(1)] });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await sendWebhook({ content: `Couldn't build today's revenue report: ${message}` });
    } catch {
      // nothing else to do
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
