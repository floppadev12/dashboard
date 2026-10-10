// Roblox has no API for Creator Rewards, so the owner's real amounts for some days are
// saved in the dashboard state. From those we learn "rewards as a share of that day's real
// sales" and use it to estimate the days that were not entered. Used by the dashboard and
// by the Discord report, so both always show the same numbers.

/** Creator Rewards the owner entered: game id → UTC day → Robux. */
export type RewardEntries = Record<string, Record<string, number>>;
/** Real sales for a game: UTC day → Robux. */
export type SalesLookup = (gameId: string) => Record<string, number> | undefined;

export const creatorRewardsStateKey = "gameops-dashboard-creator-rewards";
const SAMPLE_DAYS = 14;

function dayNumber(key: string) {
  return Date.parse(`${key}T00:00:00Z`) / 86_400_000;
}

/** Share of sales learned from the entered days closest to `day`: this game's own, else all games'. */
export function rewardRate(entries: RewardEntries, salesOf: SalesLookup, gameIds: string[], gameId: string, day: string) {
  const learn = (ids: string[]) => {
    const samples: { day: string; robux: number; sales: number }[] = [];
    ids.forEach((id) => {
      const real = salesOf(id);
      Object.entries(entries[id] ?? {}).forEach(([entered, robux]) => {
        const sales = real?.[entered] ?? 0;
        if (sales > 0) samples.push({ day: entered, robux, sales });
      });
    });
    if (samples.length === 0) return undefined;
    const at = dayNumber(day);
    const nearest = samples.sort((a, b) => Math.abs(dayNumber(a.day) - at) - Math.abs(dayNumber(b.day) - at)).slice(0, SAMPLE_DAYS);
    const sales = nearest.reduce((sum, sample) => sum + sample.sales, 0);
    return { rate: nearest.reduce((sum, sample) => sum + sample.robux, 0) / sales, samples: nearest.length };
  };
  const own = learn([gameId]);
  if (own) return { ...own, own: true };
  const shared = learn(gameIds);
  return shared ? { ...shared, own: false } : undefined;
}

/** Creator Rewards in Robux for one game and day: the entered amount, or an estimate. */
export function dayRewardsRobux(entries: RewardEntries, salesOf: SalesLookup, gameIds: string[], gameId: string, day: string) {
  const entered = entries[gameId]?.[day];
  if (entered !== undefined) return { robux: entered, estimated: false };
  const sales = salesOf(gameId)?.[day] ?? 0;
  const learned = sales > 0 ? rewardRate(entries, salesOf, gameIds, gameId, day) : undefined;
  return { robux: learned ? sales * learned.rate : 0, estimated: true };
}
