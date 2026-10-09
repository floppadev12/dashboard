import { prisma } from "@/lib/prisma";
import { revenueForGames } from "@/lib/roblox-analytics";

const ROBUX_TO_USD = 0.0038;
type ReportGame = { name: string; universeId: string };

/** Games for Discord reports: the games saved in your dashboard, or ROBLOX_UNIVERSE_IDS as a fallback. */
async function reportGames(): Promise<ReportGame[]> {
  if (process.env.DATABASE_URL) {
    try {
      const row = await prisma.appState.findUnique({ where: { key: "gameops-dashboard-games" } });
      const value = row?.value;
      const games = Array.isArray(value) ? (value as unknown as Array<{ title?: string; universeId?: number }>) : [];
      const list = games
        .filter((g) => typeof g.universeId === "number")
        .map((g) => ({ name: g.title || String(g.universeId), universeId: String(g.universeId) }));
      if (list.length) return list;
    } catch {
      // fall through to the env list
    }
  }
  const ids = (process.env.ROBLOX_UNIVERSE_IDS ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
  if (!ids.length) return [];
  const names: Record<string, string> = {};
  try {
    const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${ids.join(",")}`, { cache: "no-store" });
    const json = (await res.json()) as { data?: { id: number; name: string }[] };
    json.data?.forEach((g) => (names[String(g.id)] = g.name));
  } catch {
    // names are optional
  }
  return ids.map((id) => ({ universeId: id, name: names[id] ?? id }));
}

const utcKey = (offsetDays: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const label = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const robux = (n: number) => Math.round(n).toLocaleString("en-US");
const usd = (n: number) => `$${Math.round(n * ROBUX_TO_USD).toLocaleString("en-US")}`;

/** Discord embed: the last `period` complete UTC days vs the `period` days before. */
export async function buildRevenueEmbed(period: number) {
  const games = await reportGames();
  if (!games.length) {
    return { title: "No games to report", description: "Add games with a Roblox link in the dashboard, or set ROBLOX_UNIVERSE_IDS.", color: 0x8b42ff };
  }

  const { revenue, errors } = await revenueForGames(games.map((g) => g.universeId), period * 2 + 2);
  const current = Array.from({ length: period }, (_, i) => utcKey(-1 - i));
  const previous = Array.from({ length: period }, (_, i) => utcKey(-1 - period - i));
  const sumDays = (id: string, keys: string[]) => keys.reduce((t, k) => t + (revenue[id]?.[k] ?? 0), 0);

  const rows = games
    .filter((g) => revenue[g.universeId])
    .map((g) => ({ name: g.name, now: sumDays(g.universeId, current), before: sumDays(g.universeId, previous) }))
    .sort((a, b) => b.now - a.now);
  const total = rows.reduce((t, r) => t + r.now, 0);
  const totalBefore = rows.reduce((t, r) => t + r.before, 0);
  const change = totalBefore > 0 ? ((total - totalBefore) / totalBefore) * 100 : null;
  const arrow = change == null ? "" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs ${period === 1 ? label(previous[0]) : `previous ${period} days`}`;

  const fields = rows.slice(0, 20).map((r) => ({
    name: r.name,
    value: `${robux(r.now)} Robux (${usd(r.now)})${total ? ` · ${Math.round((r.now / total) * 100)}%` : ""}`,
    inline: false,
  }));
  const failed = games.filter((g) => errors[g.universeId]);
  if (failed.length) {
    fields.push({ name: "Couldn't load", value: failed.map((g) => `${g.name}: ${errors[g.universeId]}`).join("\n").slice(0, 1000), inline: false });
  }

  return {
    title: period === 1 ? `Revenue for ${label(current[0])}` : `Revenue, last ${period} days`,
    description: `**${robux(total)} Robux** (${usd(total)})${arrow ? `\n${arrow}` : ""}`,
    color: change != null && change < 0 ? 0xef3d75 : 0x73f28f,
    fields,
    url: process.env.DASHBOARD_URL || undefined,
    footer: { text: "Roblox Analytics API · UTC days · USD at DevEx rate $0.0038" },
    timestamp: new Date().toISOString(),
  };
}
