import { after, NextRequest, NextResponse } from "next/server";
import { editInteractionReply, isAllowedUser, verifyDiscordRequest } from "@/lib/discord";
import { buildRevenueEmbed } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EPHEMERAL = 64; // only the person who ran the command sees the reply

type Interaction = {
  type: number;
  token: string;
  data?: { name?: string; options?: { name: string; value: number | string }[] };
  member?: { user?: { id?: string } };
  user?: { id?: string };
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!verifyDiscordRequest(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"))) {
    return new NextResponse("Invalid request signature", { status: 401 });
  }
  const interaction = JSON.parse(body) as Interaction;
  if (interaction.type === 1) return NextResponse.json({ type: 1 }); // Discord's endpoint check

  if (interaction.type === 2 && interaction.data?.name === "revenue") {
    if (!isAllowedUser(interaction.member?.user?.id ?? interaction.user?.id)) {
      return NextResponse.json({ type: 4, data: { content: "You don't have access to revenue reports.", flags: EPHEMERAL } });
    }
    const requested = Number(interaction.data.options?.find((o) => o.name === "period")?.value ?? 1);
    const period = [1, 7, 30].includes(requested) ? requested : 1;
    after(async () => {
      try {
        await editInteractionReply(interaction.token, { embeds: [await buildRevenueEmbed(period)] });
      } catch (e) {
        await editInteractionReply(interaction.token, { content: `Couldn't load revenue: ${e instanceof Error ? e.message : String(e)}` });
      }
    });
    return NextResponse.json({ type: 5, data: { flags: EPHEMERAL } }); // "thinking…" while Roblox answers
  }
  return NextResponse.json({ type: 4, data: { content: "Unknown command.", flags: EPHEMERAL } });
}
