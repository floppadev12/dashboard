"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Info, MoreVertical } from "lucide-react";
import type { GameCard } from "@/lib/types";
import type { HourlyRobuxPoint } from "@/lib/roblox-analytics";

// Matches the "Hourly Robux spent" card on Roblox's Creator Hub, not the rest of the dashboard.
const fontFamily = '"Builder Sans", Helvetica, Arial, sans-serif';
const HOURS = 72;
const CHART_HEIGHT = 300;
const MARGIN_TOP = 8;
const X_AXIS_HEIGHT = 44;
const PILL_HEIGHT = 24;
const PILL_STEP = 30;
const REFRESH_MS = 5 * 60_000;
const RETRY_MS = 60_000;

type SeriesKey = Exclude<keyof HourlyRobuxPoint, "t">;
type Shape = "circle" | "diamond" | "square" | "triangle" | "triangleDown";

const series: { key: SeriesKey; label: string; statLabel: string; color: string; shape: Shape }[] = [
  { key: "total", label: "Total", statLabel: "Total over selected period", color: "#3366ff", shape: "circle" },
  { key: "developerProducts", label: "Developer Products", statLabel: "Developer Products", color: "#16d68a", shape: "diamond" },
  { key: "passes", label: "Passes", statLabel: "Passes", color: "#e23bf0", shape: "square" },
  { key: "privateServers", label: "Private Servers", statLabel: "Private Servers", color: "#f9d67a", shape: "triangle" },
  { key: "avatarCommissions", label: "Third-party avatar item commissions", statLabel: "Third-party avatar item commissions", color: "#17c4e6", shape: "triangleDown" }
];

function Marker({ cx, cy, color, shape, size = 3.5 }: { cx: number; cy: number; color: string; shape: Shape; size?: number }) {
  if (shape === "circle") return <circle cx={cx} cy={cy} r={size} fill={color} />;
  if (shape === "square") return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} fill={color} />;
  const points = {
    diamond: [[0, -size - 1], [size, 0], [0, size + 1], [-size, 0]],
    triangle: [[0, -size], [size, size], [-size, size]],
    triangleDown: [[0, size], [size, -size], [-size, -size]]
  }[shape];
  return <polygon points={points.map(([x, y]) => `${cx + x},${cy + y}`).join(" ")} fill={color} />;
}

function RobuxIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 2.6 20.2 7.3v9.4L12 21.4l-8.2-4.7V7.3z" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M12 8.2 15.3 10.1v3.8L12 15.8l-3.3-1.9v-3.8z" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function ChangeBadge({ current, previous }: { current: number; previous: number }) {
  if (current === 0 && previous === 0) return null;
  const percent = previous === 0 ? Infinity : ((current - previous) / previous) * 100;
  const down = percent < 0;
  const text = Math.abs(percent) > 1000 ? ">1,000.0%" : `${Math.abs(percent).toFixed(1)}%`;
  const Arrow = down ? ArrowDown : ArrowUp;
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded px-2 text-xs ${down ? "bg-[#3b1416] text-[#ff8a8a]" : "bg-[#0f3a2c] text-[#b9f5da]"}`}>
      {percent !== 0 ? <Arrow className="h-3 w-3" /> : null}
      {text}
    </span>
  );
}

function niceTicks(max: number) {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= rough) ?? 10) * magnitude);
  const ticks = [];
  for (let value = 0; value < max + step; value += step) ticks.push(value);
  return ticks;
}

const formatTick = (value: number) => (value >= 1000 ? `${Number((value / 1000).toFixed(1))}K` : String(value));
const formatRobux = (value: number) => Math.round(value).toLocaleString("en-US");
const formatHour = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const formatDate = (t: number) => `${new Date(t).getMonth() + 1}/${new Date(t).getDate()}`;
const formatDateTime = (t: number) =>
  new Date(t).toLocaleString("en-US", { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" });

// The last numbers, so reopening the page draws the chart right away while new ones load.
let lastLoad: { ids: string; points: HourlyRobuxPoint[] } | null = null;

/** One pill per line, next to where that line is, moved apart only as far as needed to stay readable. */
function HoverPills({ point, x, yMax }: { point: HourlyRobuxPoint; x: number; yMax: number }) {
  const plotHeight = CHART_HEIGHT - MARGIN_TOP - X_AXIS_HEIGHT;
  const lowest = MARGIN_TOP + plotHeight - PILL_HEIGHT / 2;
  const rows = series
    .map((item) => ({ ...item, value: point[item.key], y: MARGIN_TOP + (1 - point[item.key] / yMax) * plotHeight - PILL_HEIGHT / 2 }))
    .sort((a, b) => b.value - a.value);
  rows.forEach((row, index) => {
    if (index > 0) row.y = Math.max(row.y, rows[index - 1].y + PILL_STEP);
  });
  rows[rows.length - 1].y = Math.min(rows[rows.length - 1].y, lowest);
  for (let index = rows.length - 2; index >= 0; index -= 1) rows[index].y = Math.min(rows[index].y, rows[index + 1].y - PILL_STEP);
  const flip = x < 340;

  return (
    <div className="pointer-events-none absolute inset-0" style={{ fontFamily }}>
      {rows.map((row) => (
        <div
          key={row.key}
          className="absolute flex items-center gap-2 whitespace-nowrap rounded bg-white px-2 text-[13px] text-[#111216] shadow-lg"
          style={{ top: row.y, height: PILL_HEIGHT, left: flip ? x + 12 : x - 12, transform: flip ? undefined : "translateX(-100%)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: row.color }} />
          <span className="font-medium">{row.label}</span>
          <span>{formatRobux(row.value)}</span>
        </div>
      ))}
      <div
        className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-white px-2 text-[13px] leading-6 text-[#111216] shadow-lg"
        style={{ top: MARGIN_TOP + plotHeight + 6, height: PILL_HEIGHT, left: Math.max(x, 60) }}
      >
        {formatDateTime(point.t)}
      </div>
    </div>
  );
}

function downloadCsv(points: HourlyRobuxPoint[]) {
  const rows = [["Time (UTC)", ...series.map((item) => item.label)].join(",")];
  points.forEach((point) => rows.push([new Date(point.t).toISOString(), ...series.map((item) => point[item.key])].join(",")));
  const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "hourly-robux-spent.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function HourlyRobuxView({ games }: { games: GameCard[] }) {
  const universeIdsKey = games
    .map((game) => game.universeId)
    .filter((id): id is number => typeof id === "number" && id > 0)
    .sort((a, b) => a - b)
    .join(",");

  const [points, setPoints] = useState<HourlyRobuxPoint[] | null>(lastLoad?.ids === universeIdsKey ? lastLoad.points : null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [chartWidth, setChartWidth] = useState(1000);

  useEffect(() => {
    if (!universeIdsKey) return;
    let cancelled = false;
    let timer: number;

    const load = async () => {
      let nextLoad = REFRESH_MS;
      try {
        const response = await fetch(`/api/revenue/hourly?universeIds=${universeIdsKey}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = (await response.json()) as { configured?: boolean; points?: HourlyRobuxPoint[]; errors?: Record<string, string>; unknownTypes?: string[] };
        if (cancelled) return;
        if (result.unknownTypes?.length) console.warn("Roblox product types only counted in Total:", result.unknownTypes);
        setNotConfigured(!result.configured);
        setLoadFailed(false);
        setErrors(result.errors ?? {});
        setPoints(result.points ?? []);
        lastLoad = { ids: universeIdsKey, points: result.points ?? [] };
        if (Object.keys(result.errors ?? {}).length) nextLoad = RETRY_MS;
      } catch {
        if (!cancelled) setLoadFailed(true);
        nextLoad = RETRY_MS;
      }
      if (!cancelled) timer = window.setTimeout(load, nextLoad);
    };

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [universeIdsKey]);

  const current = useMemo(() => (points ?? []).slice(-HOURS), [points]);
  const previous = useMemo(() => (points ?? []).slice(-HOURS * 2, -HOURS), [points]);
  const sum = (rows: HourlyRobuxPoint[], key: SeriesKey) => rows.reduce((total, point) => total + point[key], 0);

  const yTicks = niceTicks(Math.max(0, ...current.map((point) => point.total)));
  const yMax = yTicks[yTicks.length - 1];

  // A label every 6 hours (fewer on narrow screens); the date only under the first label of each day.
  const tickHours = chartWidth >= 780 ? 6 : chartWidth >= 400 ? 12 : 24;
  const xTicks = current.map((point) => point.t).filter((t) => new Date(t).getMinutes() === 0 && new Date(t).getHours() % tickHours === 1);
  const showsDate = (t: number) => t === xTicks[0] || formatDate(t) !== formatDate(t - tickHours * 3_600_000);

  const failedGames = games.filter((game) => errors[String(game.universeId)]);
  const message = !universeIdsKey
    ? "Add a game with a Roblox link to see its Robux spent."
    : notConfigured
      ? "No Roblox API key is set, so real Robux data can't load."
      : loadFailed
        ? "Couldn't reach Roblox. Trying again in a minute."
        : points === null
          ? "Loading..."
          : null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#111216] p-6 text-white" style={{ fontFamily }}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="flex items-center gap-1 text-lg font-semibold">
          Hourly Robux spent
          <span title="Robux spent per hour over the last 72 hours, added up across all your games. Changes compare to the 72 hours before.">
            <Info className="h-4 w-4" />
          </span>
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="https://create.roblox.com/dashboard/creations"
            target="_blank"
            rel="noreferrer"
            className="flex h-8 items-center rounded-md bg-[#2c2d32] px-2.5 text-xs font-medium transition hover:bg-[#393a40]"
          >
            Explore
          </a>
          <button
            type="button"
            aria-label="Download CSV"
            title="Download CSV"
            disabled={current.length === 0}
            onClick={() => downloadCsv(current)}
            className="grid h-8 w-8 place-items-center rounded-md bg-[#2c2d32] transition hover:bg-[#393a40]"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
        {series.map((item) => (
          <div key={item.key}>
            <div className="text-sm font-thin text-[#d9dadd]">{item.statLabel}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[24px] font-bold not-italic leading-[32.4px] tracking-[-0.24px] text-[rgb(247,247,248)]">
                <RobuxIcon />
                {formatRobux(sum(current, item.key))}
              </span>
              <ChangeBadge current={sum(current, item.key)} previous={sum(previous, item.key)} />
            </div>
          </div>
        ))}
      </div>

      {message ? <p className="mt-3 text-sm text-[#d9dadd]">{message}</p> : null}
      {failedGames.length ? (
        <p className="mt-3 text-sm text-[#ff8a8a]">
          Not included: {failedGames.map((game) => game.title).join(", ")}. {errors[String(failedGames[0].universeId)]}
        </p>
      ) : null}

      <div className="relative mt-4 w-full" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%" onResize={(width) => setChartWidth(width)}>
          <LineChart data={current} margin={{ top: MARGIN_TOP, right: 28, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,.2)" strokeDasharray="3 3" />
            <ReferenceLine y={0} stroke="rgba(255,255,255,.85)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={xTicks}
              height={X_AXIS_HEIGHT}
              axisLine={false}
              tickLine={false}
              interval={0}
              tick={({ x, y, payload }: { x: number; y: number; payload: { value: number } }) => (
                <text x={x} y={y + 8} textAnchor="middle" fill="#d9dadd" fontSize={12}>
                  <tspan x={x}>{formatHour(payload.value)}</tspan>
                  {showsDate(payload.value) ? <tspan x={x} dy={15}>{formatDate(payload.value)}</tspan> : null}
                </text>
              )}
            />
            <YAxis width={40} domain={[0, yMax]} ticks={yTicks} axisLine={false} tickLine={false} tickFormatter={formatTick} tick={{ fill: "#d9dadd", fontSize: 12 }} />
            <Tooltip
              cursor={false}
              isAnimationActive={false}
              position={{ x: 0, y: 0 }}
              wrapperStyle={{ width: "100%", height: "100%", pointerEvents: "none", zIndex: 10 }}
              content={({ active, payload, coordinate }) => {
                const point = payload?.[0]?.payload as HourlyRobuxPoint | undefined;
                return active && point && coordinate?.x != null ? <HoverPills point={point} x={coordinate.x} yMax={yMax} /> : null;
              }}
            />
            {[...series].reverse().map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                className="hourly-robux-line"
                isAnimationActive={false}
                dot={({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) => (
                  <g key={`${item.key}-${index}`}>{cx != null && cy != null ? <Marker cx={cx} cy={cy} color={item.color} shape={item.shape} /> : null}</g>
                )}
                activeDot={({ cx, cy }: { cx?: number; cy?: number }) => (
                  <g>{cx != null && cy != null ? <Marker cx={cx} cy={cy} color={item.color} shape={item.shape} size={5} /> : null}</g>
                )}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-[#d9dadd]">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5">
            <svg width="22" height="10" aria-hidden="true">
              <line x1="0" x2="22" y1="5" y2="5" stroke={item.color} strokeWidth="2" />
              <Marker cx={11} cy={5} color={item.color} shape={item.shape} />
            </svg>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
