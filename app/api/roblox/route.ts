import { NextRequest, NextResponse } from "next/server";

type RobloxUniverseResponse = {
  universeId?: number;
};

type RobloxGameResponse = {
  data?: Array<{
    id: number;
    playing: number;
    visits: number;
    created?: string;
    creator?: {
      name?: string;
      type?: string;
    };
  }>;
};

function getPlaceId(link: string) {
  const url = new URL(link);
  const pathMatch = url.pathname.match(/\/games\/(\d+)/);
  if (pathMatch) return pathMatch[1];
  const placeId = url.searchParams.get("placeId");
  if (placeId) return placeId;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { link } = (await request.json()) as { link?: string };
    if (!link) {
      return NextResponse.json({ error: "Game link is required." }, { status: 400 });
    }

    const placeId = getPlaceId(link);
    if (!placeId) {
      return NextResponse.json({ error: "Could not find a Roblox place ID in that link." }, { status: 400 });
    }

    const universeResponse = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, {
      next: { revalidate: 60 }
    });

    if (!universeResponse.ok) {
      return NextResponse.json({ error: "Roblox universe lookup failed." }, { status: universeResponse.status });
    }

    const universe = (await universeResponse.json()) as RobloxUniverseResponse;
    if (!universe.universeId) {
      return NextResponse.json({ error: "Roblox did not return a universe ID." }, { status: 404 });
    }

    const gameResponse = await fetch(`https://games.roblox.com/v1/games?universeIds=${universe.universeId}`, {
      next: { revalidate: 60 }
    });

    if (!gameResponse.ok) {
      return NextResponse.json({ error: "Roblox game lookup failed." }, { status: gameResponse.status });
    }

    const game = (await gameResponse.json()) as RobloxGameResponse;
    const details = game.data?.[0];

    return NextResponse.json({
      universeId: universe.universeId,
      ccu: details?.playing ?? 0,
      visits: details?.visits ?? 0,
      createdAt: details?.created,
      groupName: details?.creator?.name ?? "Unknown Creator"
    });
  } catch {
    return NextResponse.json({ error: "Invalid Roblox game link." }, { status: 400 });
  }
}
