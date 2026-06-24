import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type StatePayload = Record<string, Prisma.JsonValue>;
const gamesKey = "gameops-dashboard-games";

type PersistedGame = {
  id?: string;
  link?: string;
  linkUpdatedAt?: number;
  [key: string]: unknown;
};

function isPersistedGame(value: unknown): value is PersistedGame {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof (value as PersistedGame).id === "string";
}

function mergeGames(existingValue: Prisma.JsonValue | undefined, incomingValue: Prisma.JsonValue) {
  if (!Array.isArray(existingValue) || !Array.isArray(incomingValue)) return incomingValue;

  const existingById = new Map<string, PersistedGame>();
  existingValue.forEach((game) => {
    if (isPersistedGame(game) && game.id) existingById.set(game.id, game);
  });

  return incomingValue.map((incoming) => {
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return incoming;
    const incomingGame = incoming as PersistedGame;
    const existingGame = incomingGame.id ? existingById.get(incomingGame.id) : undefined;
    if (!existingGame) return incomingGame;

    const incomingLinkUpdatedAt = Number(incomingGame.linkUpdatedAt ?? 0);
    const existingLinkUpdatedAt = Number(existingGame.linkUpdatedAt ?? 0);
    if (existingLinkUpdatedAt > incomingLinkUpdatedAt) {
      return {
        ...incomingGame,
        link: existingGame.link,
        linkUpdatedAt: existingGame.linkUpdatedAt
      };
    }

    return incomingGame;
  });
}

export async function GET() {
  try {
    const rows = await prisma.appState.findMany();
    const state = rows.reduce<StatePayload>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Database state is unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const updates = (await request.json()) as StatePayload;
    await Promise.all(
      Object.entries(updates).map(async ([key, value]) => {
        const existing = key === gamesKey
          ? await prisma.appState.findUnique({ where: { key } })
          : null;
        const mergedValue = key === gamesKey ? mergeGames(existing?.value, value) : value;
        const jsonValue = mergedValue as Prisma.InputJsonValue;
        return (
        prisma.appState.upsert({
          where: { key },
          update: { value: jsonValue },
          create: { key, value: jsonValue }
        })
        );
      })
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save database state." }, { status: 500 });
  }
}
