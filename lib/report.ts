import { prisma } from "@/lib/prisma";
import { revenueForGames } from "@/lib/roblox-analytics";
import { creatorRewardsStateKey, dayRewardsRobux, type RewardEntries } from "@/lib/creator-rewards";

const ROBUX_TO_USD = 0.0038;
// Same window as the dashboard, so both share one cached answer from Roblox.
const HISTORY_DAYS = 400;
type ReportGame = { id: string; name: string; universeId: string };

/** Games for Discord reports: the games saved in your dashboard, or ROBLOX_UNIVERSE_IDS as a fallback. */
async function reportGames(): Promise<ReportGame[]> {
  if (process.env.DATABASE_URL) {
    try {
      const row = await prisma.appState.findUnique({ where: { key: "gameops-dashboard-games" } });
      const value = row?.value;
      const games = Array.isArray(value) ? (value as unknown as Array<{ id?: string; title?: string; universeId?: number }>) : [];
      const list = games
        .filter((g) => typeof g.universeId === "number")
        .map((g) => ({ id: g.id ?? String(g.universeId), name: g.title || String(g.universeId), universeId: String(g.universeId) }));
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
  return ids.map((id) => ({ id, universeId: id, name: names[id] ?? id }));
}

/** Creator Rewards days the owner saved in the dashboard. */
async function rewardEntries(): Promise<RewardEntries> {
  if (!process.env.DATABASE_URL) return {};
  try {
    const row = await prisma.appState.findUnique({ where: { key: creatorRewardsStateKey } });
    const value = row?.value;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as unknown as RewardEntries) : {};
  } catch {
    return {};
  }
}

const shiftDay = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const label = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const robux = (n: number) => Math.round(n).toLocaleString("en-US");
const usd = (n: number) => `$${Math.round(n * ROBUX_TO_USD).toLocaleString("en-US")}`;

/**
 * Discord embed for the newest `period` days Roblox has reported (it runs about two days
 * behind) vs the `period` days before. Revenue is real sales plus Creator Rewards.
 * `latestDay` is that newest day, or "" when there is nothing to report.
 */
export async function buildRevenueReport(period: number) {
  const games = await reportGames();
  if (!games.length) {
    return {
      latestDay: "",
      embed: { title: "No games to report", description: "Add games with a Roblox link in the dashboard, or set ROBLOX_UNIVERSE_IDS.", color: 0x8b42ff },
    };
  }

  const [{ revenue, errors }, entries] = await Promise.all([revenueForGames(games.map((g) => g.universeId), HISTORY_DAYS), rewardEntries()]);
  const latestDay = Object.values(revenue).reduce((latest, series) => Object.keys(series).reduce((max, day) => (day > max ? day : max), latest), "");
  if (!latestDay) {
    const failed = Object.values(errors)[0];
    return { latestDay: "", embed: { title: "No revenue data yet", description: failed ?? "Roblox has not reported any revenue for these games.", color: 0x8b42ff } };
  }

  const current = Array.from({ length: period }, (_, i) => shiftDay(latestDay, -i));
  const previous = Array.from({ length: period }, (_, i) => shiftDay(latestDay, -period - i));
  const gameIds = games.map((g) => g.id);
  const universeOf = new Map(games.map((g) => [g.id, g.universeId]));
  const salesOf = (gameId: string) => revenue[universeOf.get(gameId) ?? ""];
  const sum = (game: ReportGame, days: string[]) =>
    days.reduce(
      (total, day) => {
        const rewards = dayRewardsRobux(entries, salesOf, gameIds, game.id, day);
        return {
          sales: total.sales + (revenue[game.universeId]?.[day] ?? 0),
          rewards: total.rewards + rewards.robux,
          estimated: total.estimated || (rewards.estimated && rewards.robux > 0),
        };
      },
      { sales: 0, rewards: 0, estimated: false },
    );

  const rows = games
    .filter((g) => revenue[g.universeId])
    .map((g) => {
      const now = sum(g, current);
      const before = sum(g, previous);
      return { name: g.name, sales: now.sales, rewards: now.rewards, estimated: now.estimated, now: now.sales + now.rewards, before: before.sales + before.rewards };
    })
    .sort((a, b) => b.now - a.now);
  const total = rows.reduce((t, r) => t + r.now, 0);
  const totalSales = rows.reduce((t, r) => t + r.sales, 0);
  const totalRewards = rows.reduce((t, r) => t + r.rewards, 0);
  const anyEstimated = rows.some((r) => r.estimated);
  const totalBefore = rows.reduce((t, r) => t + r.before, 0);
  const change = totalBefore > 0 ? ((total - totalBefore) / totalBefore) * 100 : null;
  const arrow = change == null ? "" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs ${period === 1 ? label(previous[0]) : `previous ${period} days`}`;
  const rewardsNote = (amount: number, estimated: boolean) => (amount > 0 ? ` · Creator Rewards ${estimated ? "~" : ""}${robux(amount)}` : "");

  const fields = rows.slice(0, 20).map((r) => ({
    name: r.name,
    value: `${robux(r.now)} Robux (${usd(r.now)})${total ? ` · ${Math.round((r.now / total) * 100)}%` : ""}\nSales ${robux(r.sales)}${rewardsNote(r.rewards, r.estimated)}`,
    inline: false,
  }));
  const failed = games.filter((g) => errors[g.universeId]);
  if (failed.length) {
    fields.push({ name: "Couldn't load", value: failed.map((g) => `${g.name}: ${errors[g.universeId]}`).join("\n").slice(0, 1000), inline: false });
  }

  return {
    latestDay,
    embed: {
      title: period === 1 ? `Revenue for ${label(latestDay)}` : `Revenue, ${label(current[period - 1])} to ${label(latestDay)}`,
      description: `**${robux(total)} Robux** (${usd(total)})\nSales ${robux(totalSales)}${rewardsNote(totalRewards, anyEstimated)}${arrow ? `\n${arrow}` : ""}`,
      color: change != null && change < 0 ? 0xef3d75 : 0x73f28f,
      fields,
      url: process.env.DASHBOARD_URL || undefined,
      footer: { text: `Sales from Roblox (about 2 days behind) · ${anyEstimated ? "~ = estimated Creator Rewards · " : ""}USD at $0.0038 per Robux` },
      timestamp: new Date().toISOString(),
    },
  };
}

export async function buildRevenueEmbed(period: number) {
  return (await buildRevenueReport(period)).embed;
}
