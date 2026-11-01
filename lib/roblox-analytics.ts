// Real revenue from Roblox's official Open Cloud Analytics Query API (beta).
// Docs: https://create.roblox.com/docs/cloud/guides/analytics
import { prisma } from "@/lib/prisma";

const API_BASE = "https://apis.roblox.com/analytics-query-api";
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 45_000;
const CACHE_MS = 10 * 60_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

type Operation = {
  path?: string;
  done?: boolean;
  error?: unknown;
  response?: { values?: { breakdowns?: { dimension?: string; value?: string }[]; dataPoints?: { time?: string; value?: number | string }[] }[] };
};

/** One key for all games (ROBLOX_API_KEY), or per-game keys (ROBLOX_API_KEYS={"universeId":"key"}). */
export function apiKeyFor(universeId: string) {
  try {
    const perGame = JSON.parse(process.env.ROBLOX_API_KEYS || "{}") as Record<string, string>;
    if (perGame[universeId]) return perGame[universeId];
  } catch {
    // ignore malformed ROBLOX_API_KEYS and fall back to the shared key
  }
  return process.env.ROBLOX_API_KEY || "";
}

export function isRobloxConfigured() {
  return Boolean(process.env.ROBLOX_API_KEY || process.env.ROBLOX_API_KEYS);
}

const HINTS: Record<number, string> = {
  401: "API key rejected. Check it was copied fully and is enabled.",
  403: "This key doesn't have universe.analytics:read for this game.",
  404: "Universe not found.",
  429: "Too many requests to Roblox. Try again in a minute.",
};

async function call(url: string, apiKey: string, body?: unknown): Promise<Operation> {
  let res: Response;
  for (let attempt = 0; ; attempt += 1) {
    res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (res.status !== 429 || attempt >= MAX_RETRIES) break;
    // Too many requests: wait as long as Roblox asks, or a little longer each time.
    const retryAfter = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, retryAfter > 0 ? retryAfter * 1000 : RETRY_BASE_MS * 2 ** attempt));
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 160);
    throw new Error(`${HINTS[res.status] ?? `Roblox returned HTTP ${res.status}.`} ${detail}`.trim());
  }
  return (await res.json()) as Operation;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

type Series = NonNullable<NonNullable<Operation["response"]>["values"]>;

/** Runs one DailyRevenue query and waits for the result. */
function queryRevenue(universeId: string, body: Record<string, unknown>) {
  return queryMetric(universeId, "DailyRevenue", body);
}

/** Runs one metric query and waits for the result. */
async function queryMetric(universeId: string, metric: string, body: Record<string, unknown>): Promise<Series> {
  const apiKey = apiKeyFor(universeId);
  if (!apiKey) throw new Error("No API key for this game.");

  let op = await call(`${API_BASE}/v1/universes/${encodeURIComponent(universeId)}/metrics`, apiKey, {
    metric,
    ...body,
  });
  const started = Date.now();
  while (!op.done) {
    if (!op.path) throw new Error("Unexpected response from Roblox.");
    if (Date.now() - started > POLL_TIMEOUT_MS) throw new Error("Roblox took too long to answer.");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    op = await call(`${API_BASE}/${op.path.replace(/^\//, "")}`, apiKey);
  }
  if (op.error) throw new Error(JSON.stringify(op.error).slice(0, 160));
  return op.response?.values ?? [];
}

/** Start/end of the last `days` UTC days, including today. */
function range(days: number) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { startTime: iso(start), endTime: iso(end) };
}

/** Robux per UTC day for one game: { "YYYY-MM-DD": robux }. Days without sales are absent. */
export async function dailyRevenue(universeId: string, days: number): Promise<Record<string, number>> {
  const values = await queryRevenue(universeId, { granularity: "OneDay", ...range(days) });
  const out: Record<string, number> = {};
  for (const series of values) {
    for (const point of series.dataPoints ?? []) {
      const day = String(point.time ?? "").slice(0, 10);
      if (day) out[day] = (out[day] ?? 0) + Number(point.value ?? 0);
    }
  }
  return out;
}

// Roblox keeps 1468 days of revenue history; stay a little inside that.
const ALL_TIME_DAYS = 1460;
export type AllTimeRevenue = { total: number; sources: Record<string, number> };

/**
 * All-time Robux for one game, split by revenue source (in-experience sales,
 * Creator Rewards, ...) so every source Roblox reports is counted.
 */
export async function allTimeRevenue(universeId: string): Promise<AllTimeRevenue> {
  const body = { granularity: "None", ...range(ALL_TIME_DAYS) };
  let values: Series;
  try {
    values = await queryRevenue(universeId, { ...body, breakdown: ["RevenueSource"] });
  } catch {
    values = await queryRevenue(universeId, body);
  }
  const sources: Record<string, number> = {};
  let total = 0;
  for (const series of values) {
    const name = series.breakdowns?.map((b) => b.value).filter(Boolean).join(" / ") || "Total";
    const amount = (series.dataPoints ?? []).reduce((sum, point) => sum + Number(point.value ?? 0), 0);
    sources[name] = (sources[name] ?? 0) + amount;
    total += amount;
  }
  return { total, sources };
}

const cache = new Map<string, { at: number; data: Record<string, number> }>();
const allTimeCache = new Map<string, { at: number; data: AllTimeRevenue }>();

// Once something has been loaded, visitors get the saved copy straight away; if it is older
// than the cache time, a fresh copy is fetched in the background for the next visitor.
const refreshing = new Set<string>();
function refreshInBackground(key: string, work: () => Promise<unknown>) {
  if (refreshing.has(key)) return;
  refreshing.add(key);
  work()
    .catch(() => undefined)
    .finally(() => refreshing.delete(key));
}

// The same request already on its way to Roblox is shared instead of sent twice.
const inflight = new Map<string, Promise<unknown>>();
function shared<T>(key: string, work: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const promise = work().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export async function revenueForGames(universeIds: string[], days: number) {
  await restoreSavedCaches();
  const revenue: Record<string, Record<string, number>> = {};
  const errors: Record<string, string> = {};
  await Promise.all(
    universeIds.map(async (id) => {
      const cacheKey = `${id}:${days}`;
      const hit = cache.get(cacheKey);
      if (hit) {
        revenue[id] = hit.data;
        if (Date.now() - hit.at >= CACHE_MS) {
          refreshInBackground(`revenue:${cacheKey}`, async () => cache.set(cacheKey, { at: Date.now(), data: await dailyRevenue(id, days) }));
        }
        return;
      }
      try {
        const data = await shared(`revenue:${cacheKey}`, () => dailyRevenue(id, days));
        cache.set(cacheKey, { at: Date.now(), data });
        revenue[id] = data;
      } catch (e) {
        errors[id] = e instanceof Error ? e.message : String(e);
      }
    }),
  );
  return { revenue, errors };
}

export async function allTimeForGames(universeIds: string[]) {
  await restoreSavedCaches();
  const allTime: Record<string, AllTimeRevenue> = {};
  await Promise.all(
    universeIds.map(async (id) => {
      const hit = allTimeCache.get(id);
      if (hit) {
        allTime[id] = hit.data;
        if (Date.now() - hit.at >= CACHE_MS) {
          refreshInBackground(`allTime:${id}`, async () => allTimeCache.set(id, { at: Date.now(), data: await allTimeRevenue(id) }));
        }
        return;
      }
      try {
        const data = await shared(`allTime:${id}`, () => allTimeRevenue(id));
        allTimeCache.set(id, { at: Date.now(), data });
        allTime[id] = data;
      } catch {
        // The dashboard falls back to adding up the daily numbers.
      }
    }),
  );
  return allTime;
}

// ---- Concurrent players history ---------------------------------------------
// PeakConcurrentPlayers, kept by Roblox for 28 days. `step` thins minute data out
// so long ranges stay light (the highest value in each step is kept).
const CCU_RANGES = {
  "3h": { hours: 3, granularity: "OneMinute", step: 1, cacheMs: 60_000 },
  "12h": { hours: 12, granularity: "OneMinute", step: 3, cacheMs: 5 * 60_000 },
  "1d": { hours: 24, granularity: "OneMinute", step: 5, cacheMs: 10 * 60_000 },
  "7d": { hours: 7 * 24, granularity: "OneHour", step: 1, cacheMs: 15 * 60_000 },
  "14d": { hours: 14 * 24, granularity: "OneHour", step: 1, cacheMs: 15 * 60_000 },
} as const;
export type CcuRange = keyof typeof CCU_RANGES;
export const isCcuRange = (value: string): value is CcuRange => value in CCU_RANGES;
export type CcuPoint = { t: number; players: number };

export type CcuHistory = { points: CcuPoint[]; missing: string[] };
const ccuCache = new Map<string, { at: number; data: CcuHistory }>();
// Roblox has no player history for some games (very new or very small ones). Remember
// that for a while instead of asking again every minute.
const noCcuHistory = new Map<string, number>();
const NO_HISTORY_MS = 30 * 60_000;

/**
 * Players online over time, added up across the given games. `missing` lists the games
 * Roblox has no history for; they are left out of the points.
 */
export async function concurrentPlayers(universeIds: string[], range: CcuRange): Promise<CcuHistory> {
  const { hours, granularity, step, cacheMs } = CCU_RANGES[range];
  const cacheKey = `${range}:${universeIds.join(",")}`;
  const hit = ccuCache.get(cacheKey);
  if (hit && Date.now() - hit.at < cacheMs) return hit.data;

  const end = new Date();
  const start = new Date(end.getTime() - hours * 3_600_000);
  const missing: string[] = [];
  const perGame = await Promise.all(
    universeIds.map(async (id) => {
      if (Date.now() - (noCcuHistory.get(id) ?? 0) < NO_HISTORY_MS) {
        missing.push(id);
        return [];
      }
      try {
        return await queryMetric(id, "PeakConcurrentPlayers", { granularity, startTime: iso(start), endTime: iso(end) });
      } catch (e) {
        if (String(e).includes("not available")) noCcuHistory.set(id, Date.now());
        missing.push(id);
        return [];
      }
    }),
  );
  if (missing.length === universeIds.length) throw new Error("Roblox has no player history for these games.");

  const stepMs = step * 60_000;
  const totals = new Map<number, number>();
  for (const values of perGame) {
    const game = new Map<number, number>();
    for (const series of values) {
      for (const point of series.dataPoints ?? []) {
        const time = Date.parse(String(point.time ?? ""));
        if (!Number.isFinite(time)) continue;
        const bucket = step > 1 ? Math.floor(time / stepMs) * stepMs : time;
        game.set(bucket, Math.max(game.get(bucket) ?? 0, Number(point.value ?? 0)));
      }
    }
    game.forEach((players, bucket) => totals.set(bucket, (totals.get(bucket) ?? 0) + players));
  }

  const points = [...totals].sort((a, b) => a[0] - b[0]).map(([t, players]) => ({ t, players: Math.round(players) }));
  const data = { points, missing };
  ccuCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

// ---- Hourly Robux spent for the 72 Hours page --------------------------------
// ItemMonetizationRevenue ("Robux Spent (Realtime)"), added up across the given games.
// Two periods are returned so the page can compare the last 72 hours to the 72 before.
const HOURLY_HOURS = 144;
const HOURLY_CACHE_MS = 5 * 60_000;
export type HourlyRobuxCategory = "developerProducts" | "passes" | "privateServers" | "avatarCommissions";
export type HourlyRobuxPoint = { t: number; total: number } & Record<HourlyRobuxCategory, number>;

/** Roblox doesn't document the ProductType values, so match on the words in them. */
function hourlyCategory(productType: string): HourlyRobuxCategory | null {
  const name = productType.toLowerCase().replace(/[^a-z]/g, "");
  if (name.includes("developer") || name.includes("devproduct")) return "developerProducts";
  if (name.includes("privateserver") || name.includes("vipserver")) return "privateServers";
  if (name.includes("pass")) return "passes";
  if (name.includes("avatar") || name.includes("commission") || name.includes("collectible")) return "avatarCommissions";
  return null;
}

const hourlyCache = new Map<string, { at: number; data: Series }>();

// ---- A copy of the caches in the database ------------------------------------
// After a restart (every deploy) the memory caches are empty and Roblox needs about
// 30 seconds to answer for all games. Restoring the last copy lets the first visitor
// see numbers right away; old entries are refreshed in the background as usual.
export const SERVER_CACHE_KEY = "server-cache:roblox";
type SavedCaches = {
  revenue?: [string, { at: number; data: Record<string, number> }][];
  allTime?: [string, { at: number; data: AllTimeRevenue }][];
  hourly?: [string, { at: number; data: Series }][];
};
let restoring: Promise<void> | null = null;

export function restoreSavedCaches() {
  restoring ??= (async () => {
    if (!process.env.DATABASE_URL) return;
    try {
      const row = await prisma.appState.findUnique({ where: { key: SERVER_CACHE_KEY } });
      const saved = (row?.value ?? {}) as unknown as SavedCaches;
      saved.revenue?.forEach(([key, entry]) => { if (!cache.has(key)) cache.set(key, entry); });
      saved.allTime?.forEach(([key, entry]) => { if (!allTimeCache.has(key)) allTimeCache.set(key, entry); });
      saved.hourly?.forEach(([key, entry]) => { if (!hourlyCache.has(key)) hourlyCache.set(key, entry); });
    } catch {
      // Start with empty caches.
    }
  })();
  return restoring;
}

export async function saveCachesCopy() {
  if (!process.env.DATABASE_URL) return;
  const value = { revenue: [...cache], allTime: [...allTimeCache], hourly: [...hourlyCache] };
  try {
    await prisma.appState.upsert({
      where: { key: SERVER_CACHE_KEY },
      update: { value: value as never },
      create: { key: SERVER_CACHE_KEY, value: value as never },
    });
  } catch {
    // The memory caches still work.
  }
}

export async function hourlyRobuxSpent(universeIds: string[]) {
  await restoreSavedCaches();
  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(end.getUTCHours() + 1);
  const start = new Date(end.getTime() - HOURLY_HOURS * 3_600_000);

  const points = new Map<number, HourlyRobuxPoint>();
  for (let t = start.getTime(); t < end.getTime(); t += 3_600_000) {
    points.set(t, { t, total: 0, developerProducts: 0, passes: 0, privateServers: 0, avatarCommissions: 0 });
  }

  const errors: Record<string, string> = {};
  const unknownTypes = new Set<string>();
  const loadHourly = async (id: string) => {
    const data = await queryMetric(id, "ItemMonetizationRevenue", {
      granularity: "OneHour",
      breakdown: ["ProductType"],
      startTime: iso(start),
      endTime: iso(end),
    });
    hourlyCache.set(id, { at: Date.now(), data });
  };
  const stale = universeIds.filter((id) => {
    const saved = hourlyCache.get(id);
    return saved && Date.now() - saved.at >= HOURLY_CACHE_MS;
  });
  if (stale.length) {
    // One game at a time: asking for them all at once makes Roblox answer 429.
    refreshInBackground(`hourly:${stale.join(",")}`, async () => {
      for (const id of stale) await loadHourly(id).catch(() => undefined);
    });
  }

  // One game at a time: asking for them all at once makes Roblox answer 429.
  for (const id of universeIds) {
    let values = hourlyCache.get(id);
    if (!values) {
      try {
        values = {
          at: Date.now(),
          data: await queryMetric(id, "ItemMonetizationRevenue", {
            granularity: "OneHour",
            breakdown: ["ProductType"],
            startTime: iso(start),
            endTime: iso(end),
          }),
        };
        hourlyCache.set(id, values);
      } catch (e) {
        // Keep showing this game's last answer if there is one.
        if (!values) {
          errors[id] = e instanceof Error ? e.message : String(e);
          continue;
        }
      }
    }
    for (const series of values.data) {
      const productType = series.breakdowns?.find((b) => b.dimension === "ProductType")?.value ?? "";
      const category = hourlyCategory(productType);
      if (!category) unknownTypes.add(productType || "(none)");
      for (const dataPoint of series.dataPoints ?? []) {
        const point = points.get(Date.parse(String(dataPoint.time ?? "")));
        if (!point) continue;
        const robux = Number(dataPoint.value ?? 0);
        point.total += robux;
        if (category) point[category] += robux;
      }
    }
  }

  return { points: [...points.values()], errors, unknownTypes: [...unknownTypes] };
}

// ---- Per-game stats for the game detail page ---------------------------------
const GAME_STAT_DAYS = 30;
const GAME_STAT_METRICS = [
  "DailyActiveUsers",
  "MonthlyActiveUsers",
  "Visits",
  "AveragePlayTimeMinutesPerDAU",
  "PayingUsers",
  "PayingUsersCVR",
  "AverageRevenuePerPayingUser",
  "D1Retention",
  "D7Retention",
] as const;
/** { metric: { "YYYY-MM-DD": value } }. PeakConcurrentPlayers covers the last 28 days. */
export type GameStats = Record<string, Record<string, number>>;

const gameStatsCache = new Map<string, { at: number; data: GameStats }>();

export async function gameStats(universeId: string): Promise<GameStats> {
  const hit = gameStatsCache.get(universeId);
  if (hit) {
    if (Date.now() - hit.at >= CACHE_MS) refreshInBackground(`stats:${universeId}`, () => loadGameStats(universeId));
    return hit.data;
  }
  return loadGameStats(universeId);
}

async function loadGameStats(universeId: string): Promise<GameStats> {

  const data: GameStats = {};
  const load = async (metric: string, days: number) => {
    try {
      const values = await queryMetric(universeId, metric, { granularity: "OneDay", ...range(days) });
      const byDay: Record<string, number> = {};
      for (const series of values) {
        for (const point of series.dataPoints ?? []) {
          const day = String(point.time ?? "").slice(0, 10);
          if (day) byDay[day] = Number(point.value ?? 0);
        }
      }
      data[metric] = byDay;
    } catch {
      // A missing metric just leaves its tile empty.
    }
  };
  await Promise.all([...GAME_STAT_METRICS.map((metric) => load(metric, GAME_STAT_DAYS)), load("PeakConcurrentPlayers", 27)]);

  if (Object.keys(data).length === 0) throw new Error("Roblox returned no stats for this game.");
  gameStatsCache.set(universeId, { at: Date.now(), data });
  return data;
}
