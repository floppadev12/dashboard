// Real revenue from Roblox's official Open Cloud Analytics Query API (beta).
// Docs: https://create.roblox.com/docs/cloud/guides/analytics
const API_BASE = "https://apis.roblox.com/analytics-query-api";
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 45_000;
const CACHE_MS = 10 * 60_000;

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
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 160);
    throw new Error(`${HINTS[res.status] ?? `Roblox returned HTTP ${res.status}.`} ${detail}`.trim());
  }
  return (await res.json()) as Operation;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

type Series = NonNullable<NonNullable<Operation["response"]>["values"]>;

/** Runs one DailyRevenue query and waits for the result. */
async function queryRevenue(universeId: string, body: Record<string, unknown>): Promise<Series> {
  const apiKey = apiKeyFor(universeId);
  if (!apiKey) throw new Error("No API key for this game.");

  let op = await call(`${API_BASE}/v1/universes/${encodeURIComponent(universeId)}/metrics`, apiKey, {
    metric: "DailyRevenue",
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

export async function revenueForGames(universeIds: string[], days: number) {
  const revenue: Record<string, Record<string, number>> = {};
  const errors: Record<string, string> = {};
  await Promise.all(
    universeIds.map(async (id) => {
      const cacheKey = `${id}:${days}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < CACHE_MS) {
        revenue[id] = hit.data;
        return;
      }
      try {
        const data = await dailyRevenue(id, days);
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
  const allTime: Record<string, AllTimeRevenue> = {};
  await Promise.all(
    universeIds.map(async (id) => {
      const hit = allTimeCache.get(id);
      if (hit && Date.now() - hit.at < CACHE_MS) {
        allTime[id] = hit.data;
        return;
      }
      try {
        const data = await allTimeRevenue(id);
        allTimeCache.set(id, { at: Date.now(), data });
        allTime[id] = data;
      } catch {
        // The dashboard falls back to adding up the daily numbers.
      }
    }),
  );
  return allTime;
}
