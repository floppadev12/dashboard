import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type StatePayload = Record<string, Prisma.JsonValue>;

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
      Object.entries(updates).map(([key, value]) => {
        const jsonValue = value as Prisma.InputJsonValue;
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
