import { prisma } from "@/lib/prisma";
import { allTimeForGames, concurrentPlayers, hourlyRobuxSpent, isRobloxConfigured, revenueForGames } from "@/lib/roblox-analytics";

// Keeps the Roblox numbers loaded on the server, so opening the dashboard never has to
// wait for Roblox. Uses the same requests the dashboard makes, so they share one cache.
const WARM_MS = 5 * 60_000;
let started = false;

async function savedUniverseIds() {
  if (!process.env.DATABASE_URL) return [];
  try {
    const row = await prisma.appState.findUnique({ where: { key: "gameops-dashboard-games" } });
    const games = Array.isArray(row?.value) ? (row.value as Array<{ universeId?: unknown }>) : [];
    return games
      .map((game) => game.universeId)
      .filter((id): id is number => typeof id === "number" && id > 0)
      .sort((a, b) => a - b)
      .map(String);
  } catch {
    return [];
  }
}

async function warm() {
  if (!isRobloxConfigured()) return;
  const ids = await savedUniverseIds();
  if (ids.length === 0) return;
  await Promise.all([revenueForGames(ids, 400), allTimeForGames(ids)]);
  await concurrentPlayers(ids, "3h").catch(() => undefined);
  await hourlyRobuxSpent(ids);
}

export function startCacheWarmer() {
  if (started) return;
  started = true;
  const tick = () => {
    warm().catch((error) => console.error("Warming the Roblox cache failed:", error));
  };
  setTimeout(tick, 5_000);
  setInterval(tick, WARM_MS);
}
