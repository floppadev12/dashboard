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
  response?: { values?: { dataPoints?: { time?: string; value?: number | string }[] }[] };
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

/** Robux per UTC day for one game: { "YYYY-MM-DD": robux }. Days without sales are absent. */
export async function dailyRevenue(universeId: string, days: number): Promise<Record<string, number>> {
  const apiKey = apiKeyFor(universeId);
  if (!apiKey) throw new Error("No API key for this game.");

  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);

  let op = await call(`${API_BASE}/v1/universes/${encodeURIComponent(universeId)}/metrics`, apiKey, {
    metric: "DailyRevenue",
    granularity: "OneDay",
    startTime: iso(start),
    endTime: iso(end),
  });
  const started = Date.now();
  while (!op.done) {
    if (!op.path) throw new Error("Unexpected response from Roblox.");
    if (Date.now() - started > POLL_TIMEOUT_MS) throw new Error("Roblox took too long to answer.");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    op = await call(`${API_BASE}/${op.path.replace(/^\//, "")}`, apiKey);
  }
  if (op.error) throw new Error(JSON.stringify(op.error).slice(0, 160));

  const out: Record<string, number> = {};
  for (const series of op.response?.values ?? []) {
    for (const point of series.dataPoints ?? []) {
      const day = String(point.time ?? "").slice(0, 10);
      if (day) out[day] = (out[day] ?? 0) + Number(point.value ?? 0);
    }
  }
  return out;
}

const cache = new Map<string, { at: number; data: Record<string, number> }>();

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
