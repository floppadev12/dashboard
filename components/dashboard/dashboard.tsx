"use client";

import { type ChangeEvent, type FormEvent, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Box,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Edit3,
  Gamepad2,
  LayoutGrid,
  Megaphone,
  MoreVertical,
  Plus,
  Power,
  Search,
  ServerCog,
  Settings,
  Shield,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  X,
  Zap
} from "lucide-react";
import type { ChartPoint, DashboardData, GameCard, Niche } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  ["Overview", Shield],
  ["Games", Gamepad2],
  ["Revenue", CircleDollarSign]
] as const;
const monthlyPages = [
  { key: "2026-06", label: "June 2026" },
  { key: "2026-07", label: "July 2026" },
  { key: "2026-08", label: "August 2026" },
  { key: "2026-09", label: "September 2026" },
  { key: "2026-10", label: "October 2026" },
  { key: "2026-11", label: "November 2026" },
  { key: "2026-12", label: "December 2026" }
] as const;
type ViewName = (typeof nav)[number][0];
type MonthKey = (typeof monthlyPages)[number]["key"];
type ActiveView = ViewName | `month-${MonthKey}`;

const gamesStorageKey = "gameops-dashboard-games";
const nichesStorageKey = "gameops-dashboard-niches";
const revenueSnapshotsStorageKey = "gameops-dashboard-revenue-snapshots";
const alertsStorageKey = "gameops-dashboard-alerts";
const firedMilestonesStorageKey = "gameops-dashboard-fired-milestones";
const firedRevenueAlertsStorageKey = "gameops-dashboard-fired-revenue-alerts";
const ccuSnapshotsStorageKey = "gameops-dashboard-ccu-snapshots";
const ccuRecordStorageKey = "gameops-dashboard-ccu-record";
const firedCcuRecordDatesStorageKey = "gameops-dashboard-fired-ccu-record-dates";
const closedMonthsStorageKey = "gameops-dashboard-closed-months";
const playerRanges = ["3h", "12h", "1d", "7d", "14d"] as const;
const revenueRanges = ["1d", "7d", "30d", "90d", "365d"] as const;
type PlayerRange = (typeof playerRanges)[number];
type RevenueRange = (typeof revenueRanges)[number];
type NicheMetric = "CCU" | "Revenue" | "Winstreak" | "Overall";
type RevenueSnapshots = Record<string, Record<string, number>>;
type CcuSnapshot = { timestamp: number; players: number };
type AlertItem = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  time?: string;
  severity: "High" | "Medium";
  medal?: "bronze" | "silver" | "gold" | "revenue" | "ccupeak" | "closed";
};
type FiredMilestones = Record<string, number[]>;
type FiredRevenueAlerts = Record<string, boolean>;
type FiredCcuRecordDates = Record<string, boolean>;
type ClosedMonths = Record<string, boolean>;
type RenderAlert = AlertItem | DashboardData["alerts"][number];
type PersistedState = {
  [gamesStorageKey]?: Array<Partial<GameCard> & { onlineCount?: string }>;
  [nichesStorageKey]?: Niche[];
  [revenueSnapshotsStorageKey]?: RevenueSnapshots;
  [ccuSnapshotsStorageKey]?: CcuSnapshot[];
  [alertsStorageKey]?: Array<Partial<AlertItem> & { time?: string }>;
  [firedMilestonesStorageKey]?: FiredMilestones;
  [firedRevenueAlertsStorageKey]?: FiredRevenueAlerts;
  [ccuRecordStorageKey]?: number;
  [firedCcuRecordDatesStorageKey]?: FiredCcuRecordDates;
  [closedMonthsStorageKey]?: ClosedMonths;
};
const milestones = [
  { value: 1000, label: "1K", medal: "bronze", icon: "/medals/bronze.png" },
  { value: 5000, label: "5K", medal: "silver", icon: "/medals/silver.png" },
  { value: 10000, label: "10K", medal: "gold", icon: "/medals/gold.png" }
] as const;

const alertIcons = [
  ...milestones,
  { value: 0, label: "Revenue", medal: "revenue", icon: "/medals/revenue.png" },
  { value: 0, label: "CCU Peak", medal: "ccupeak", icon: "/medals/ccupeak.png" },
  { value: 0, label: "Month Closed", medal: "closed", icon: "/medals/closed.png" }
] as const;

function normalizeGame(game: Partial<GameCard> & { onlineCount?: string }): GameCard {
  const ccuFromOldValue = Number((game.onlineCount ?? "").replace(/[^\d]/g, ""));
  return {
    id: game.id ?? crypto.randomUUID(),
    title: game.title ?? "Untitled Game",
    link: game.link ?? "https://www.roblox.com/games",
    thumbnail: game.thumbnail ?? "",
    groupName: game.groupName ?? "Your Studio",
    arpdau: game.arpdau ?? "0",
    ccu: Number.isFinite(game.ccu) ? Number(game.ccu) : ccuFromOldValue,
    visits: Number.isFinite(game.visits) ? Number(game.visits) : 0,
    addedAt: game.addedAt ?? dateKey(new Date()),
    createdAt: game.createdAt,
    universeId: game.universeId,
    nicheId: game.nicheId,
    online: game.online ?? true
  };
}

function normalizeNiche(niche: Niche): Niche {
  return {
    ...niche,
    icon: niche.icon || niche.label.slice(0, 3),
    iconImage: niche.iconImage,
    id: niche.id ?? niche.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  };
}

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalState(state: Partial<PersistedState>) {
  Object.entries(state).forEach(([key, value]) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  });
}

async function writeRemoteState(state: Partial<PersistedState>) {
  try {
    await fetch("/api/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
  } catch {
    // Keep local fallback available if the database is temporarily unreachable.
  }
}

function normalizeAlerts(alerts: Array<Partial<AlertItem> & { time?: string }> = []) {
  return alerts
    .map((alert) => ({
      id: alert.id ?? crypto.randomUUID(),
      title: alert.title ?? "Alert",
      body: alert.body ?? "",
      createdAt: Number.isFinite(alert.createdAt) ? Number(alert.createdAt) : Date.now(),
      time: alert.time,
      severity: alert.severity ?? "Medium",
      medal: alert.medal
    }) as AlertItem)
    .filter((alert) => alert.title !== "ðŸŽ‰ First Revenue CCU!" && alert.medal !== undefined);
}

function hasSharedState(state: PersistedState) {
  return [
    gamesStorageKey,
    nichesStorageKey,
    revenueSnapshotsStorageKey,
    ccuSnapshotsStorageKey,
    alertsStorageKey,
    firedMilestonesStorageKey,
    firedRevenueAlertsStorageKey,
    ccuRecordStorageKey,
    firedCcuRecordDatesStorageKey,
    closedMonthsStorageKey
  ].some((key) => key in state);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0
  }).format(Math.max(0, Math.round(value)));
}

function formatPlainNumber(value: number) {
  return String(Math.max(0, Math.round(value)));
}

function formatUsd(value: number) {
  return `$${formatPlainNumber(value)}`;
}

function growthPercent(seed: number) {
  return `+${(6 + (seed % 13) + ((seed % 7) / 10)).toFixed(1)}%`;
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousDateKey(key: string) {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

function isAfterRevenueCheckpoint(date: Date) {
  return date.getHours() > 8 || (date.getHours() === 8 && date.getMinutes() >= 30);
}

function parseArpdau(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRevenueRangeDays(range: RevenueRange) {
  if (range === "1d") return 1;
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  if (range === "365d") return 365;
  return 90;
}

function buildRevenueData(games: GameCard[], snapshots: RevenueSnapshots, range: RevenueRange): ChartPoint[] {
  const days = getRevenueRangeDays(range);
  const today = new Date();

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const key = dateKey(date);
    const previousKey = previousDateKey(key);
    const currentSnapshot = snapshots[key] ?? {};
    const previousSnapshot = snapshots[previousKey] ?? {};

    const revenue = games.reduce((total, game) => {
      const currentVisits = currentSnapshot[game.id];
      const previousVisits = previousSnapshot[game.id];
      if (currentVisits === undefined || previousVisits === undefined) return total;
      return total + Math.max(0, currentVisits - previousVisits) * parseArpdau(game.arpdau) * 0.0038;
    }, 0);

    return {
      label: range === "1d" ? "Today" : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`,
      players: 0,
      sessions: 0,
      revenue: Math.round(revenue)
    };
  });
}

function formatDateLabel(value?: string) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function monthStart(monthKey: string) {
  return new Date(`${monthKey}-01T00:00:00`);
}

function nextMonthStart(monthKey: string) {
  const date = monthStart(monthKey);
  date.setMonth(date.getMonth() + 1);
  return date;
}

function monthClosed(monthKey: string, closedMonths: ClosedMonths) {
  return Boolean(closedMonths[monthKey]) || new Date() >= nextMonthStart(monthKey);
}

function daysInMonth(monthKey: string) {
  const date = monthStart(monthKey);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthDayKeys(monthKey: string) {
  return Array.from({ length: daysInMonth(monthKey) }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, "0")}`);
}

function monthRevenueRows(games: GameCard[], snapshots: RevenueSnapshots, monthKey: string) {
  return monthDayKeys(monthKey).map((key) => {
    const currentSnapshot = snapshots[key] ?? {};
    const previousSnapshot = snapshots[previousDateKey(key)] ?? {};
    const visits = games.reduce((total, game) => {
      const current = currentSnapshot[game.id];
      const previous = previousSnapshot[game.id];
      if (current === undefined || previous === undefined) return total;
      return total + Math.max(0, current - previous);
    }, 0);
    const revenue = games.reduce((total, game) => {
      const current = currentSnapshot[game.id];
      const previous = previousSnapshot[game.id];
      if (current === undefined || previous === undefined) return total;
      return total + Math.max(0, current - previous) * parseArpdau(game.arpdau) * 0.0038;
    }, 0);
    return { key, label: key.slice(5), revenue, visits };
  });
}

function monthReportStats(games: GameCard[], snapshots: RevenueSnapshots, ccuSnapshots: CcuSnapshot[], monthKey: string) {
  const rows = monthRevenueRows(games, snapshots, monthKey);
  const earningRows = rows.filter((row) => row.revenue > 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const visits = rows.reduce((sum, row) => sum + row.visits, 0);
  const highestDay = rows.reduce((best, row) => row.revenue > best.revenue ? row : best, { key: "N/A", label: "N/A", revenue: 0, visits: 0 });
  const start = monthStart(monthKey).getTime();
  const end = nextMonthStart(monthKey).getTime();
  const peakCcu = ccuSnapshots
    .filter((snapshot) => snapshot.timestamp >= start && snapshot.timestamp < end)
    .reduce((peak, snapshot) => Math.max(peak, snapshot.players), 0);
  const releasedGames = games.filter((game) => (game.addedAt ?? "").startsWith(monthKey));
  const winners = releasedGames.filter((game) => game.visits >= 1_000_000).length;
  return {
    rows,
    totalRevenue,
    highestDay,
    avgDay: earningRows.length ? totalRevenue / earningRows.length : 0,
    peakCcu,
    releasedGames,
    winrate: releasedGames.length ? (winners / releasedGames.length) * 100 : 0,
    visits
  };
}

function gameDailyRevenue(game: GameCard, snapshots: RevenueSnapshots) {
  const todayKey = dateKey(new Date());
  const previousKey = previousDateKey(todayKey);
  const currentVisits = snapshots[todayKey]?.[game.id] ?? game.visits;
  const previousVisits = snapshots[previousKey]?.[game.id] ?? game.visits;
  return Math.max(0, currentVisits - previousVisits) * parseArpdau(game.arpdau) * 0.0038;
}

function buildNicheMetricData(niches: Niche[], games: GameCard[], snapshots: RevenueSnapshots, metric: NicheMetric) {
  const raw = niches.map((niche) => {
    const nicheGames = games.filter((game) => game.nicheId === niche.id);
    const ccu = nicheGames.reduce((sum, game) => sum + game.ccu, 0);
    const revenue = nicheGames.reduce((sum, game) => sum + gameDailyRevenue(game, snapshots), 0);
    const wins = nicheGames.filter((game) => game.visits >= 1_000_000).length;
    const winrate = nicheGames.length > 0 ? wins / nicheGames.length : 0;
    return { ...niche, ccu, revenue, wins, winrate };
  });

  const totalCcu = raw.reduce((sum, niche) => sum + niche.ccu, 0);
  const totalRevenue = raw.reduce((sum, niche) => sum + niche.revenue, 0);
  const totalWins = raw.reduce((sum, niche) => sum + niche.wins, 0);
  const maxOverall = Math.max(
    1,
    ...raw.map((niche) => {
      const ccuScore = totalCcu > 0 ? niche.ccu / totalCcu : 0;
      const revenueScore = totalRevenue > 0 ? niche.revenue / totalRevenue : 0;
      return ccuScore * 0.4 + revenueScore * 0.4 + niche.winrate * 0.2;
    })
  );

  const scored = raw.map((niche) => {
    const ccuShare = totalCcu > 0 ? (niche.ccu / totalCcu) * 100 : niche.value;
    const revenueShare = totalRevenue > 0 ? (niche.revenue / totalRevenue) * 100 : 0;
    const winShare = totalWins > 0 ? (niche.wins / totalWins) * 100 : 0;
    const overallScore = ((totalCcu > 0 ? niche.ccu / totalCcu : 0) * 0.4 + (totalRevenue > 0 ? niche.revenue / totalRevenue : 0) * 0.4 + niche.winrate * 0.2) / maxOverall * 100;
    const value = metric === "CCU" ? ccuShare : metric === "Revenue" ? revenueShare : metric === "Winstreak" ? winShare : overallScore;
    return { ...niche, value: Math.round(value) };
  });

  return scored.sort((a, b) => b.value - a.value);
}

function isMilestoneAlert(alert: RenderAlert): alert is AlertItem {
  return "medal" in alert && Boolean(alert.medal);
}

function alertIconBackground(alert: RenderAlert) {
  if (isMilestoneAlert(alert)) return "bg-transparent";
  return alert.tone === "orange" ? "bg-orange-600" : alert.tone === "yellow" ? "bg-yellow-600" : "bg-purple-700";
}

function useOutsideClick<T extends HTMLElement>(ref: RefObject<T | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      onOutside();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [active, onOutside, ref]);
}

function formatAlertTime(alert: RenderAlert, now: number) {
  if (!isMilestoneAlert(alert)) return alert.time;
  if (!Number.isFinite(alert.createdAt)) return alert.time ?? "now";
  const elapsedMinutes = Math.max(0, Math.floor((now - alert.createdAt) / 60_000));
  if (elapsedMinutes < 60) {
    const rounded = Math.max(0, Math.floor(elapsedMinutes / 2) * 2);
    return rounded <= 0 ? "now" : `${rounded}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function buildRangeData(data: ChartPoint[], range: PlayerRange | RevenueRange, key: "players" | "revenue") {
  const multipliers: Record<string, number> = { "3h": 0.72, "12h": 0.82, "1d": 0.9, "7d": 1, "14d": 1.08, "30d": 1.18, "90d": 1.34 };
  if (key === "players") {
    const now = new Date();
    const points = range === "3h" ? 6 : range === "12h" ? 12 : data.length;
    return Array.from({ length: points }, (_, index) => {
      const date = new Date(now);
      if (range === "3h") date.setMinutes(now.getMinutes() - (points - 1 - index) * 30);
      else if (range === "12h") date.setHours(now.getHours() - (points - 1 - index));
      else date.setDate(now.getDate() - (points - 1 - index));

      const basePoint = data[index % data.length];
      const peak = Math.round(basePoint.players * multipliers[range] * (1 + ((index % 5) * 0.035)));
      return {
        ...basePoint,
        label: range.includes("h")
          ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
          : `${date.getMonth() + 1}/${date.getDate()}`,
        players: peak
      };
    });
  }
  return data.map((point, index) => ({
    ...point,
    label: point.label,
    [key]: Math.round(point[key] * multipliers[range] * (0.92 + ((index % 4) * 0.035)))
  }));
}

function buildCcuChartData(snapshots: CcuSnapshot[], currentPlayers: number, range: PlayerRange): ChartPoint[] {
  const now = Date.now();
  const rangeMs = range === "3h" ? 3 * 60 * 60_000 : range === "12h" ? 12 * 60 * 60_000 : range === "1d" ? 24 * 60 * 60_000 : range === "7d" ? 7 * 24 * 60 * 60_000 : 14 * 24 * 60 * 60_000;
  const relevant = snapshots.filter((snapshot) => snapshot.timestamp >= now - rangeMs);
  const source = relevant.length > 0 ? relevant : [{ timestamp: now, players: currentPlayers }];

  if (range.includes("h")) {
    return source.map((snapshot) => {
      const date = new Date(snapshot.timestamp);
      return {
        label: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        players: snapshot.players,
        revenue: 0,
        sessions: 0
      };
    });
  }

  const byDay = new Map<string, number>();
  source.forEach((snapshot) => {
    const date = new Date(snapshot.timestamp);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    byDay.set(label, Math.max(byDay.get(label) ?? 0, snapshot.players));
  });

  return Array.from(byDay, ([label, players]) => ({ label, players, revenue: 0, sessions: 0 }));
}

export function Dashboard({ data }: { data: DashboardData }) {
  const [games, setGames] = useState<GameCard[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<GameCard | null>(null);
  const [editingNiche, setEditingNiche] = useState<Niche | null>(null);
  const [isNicheOpen, setIsNicheOpen] = useState(false);
  const [playerRange, setPlayerRange] = useState<PlayerRange>("3h");
  const [revenueRange, setRevenueRange] = useState<RevenueRange>("30d");
  const [nicheMetric, setNicheMetric] = useState<NicheMetric>("CCU");
  const [revenueSnapshots, setRevenueSnapshots] = useState<RevenueSnapshots>({});
  const [ccuSnapshots, setCcuSnapshots] = useState<CcuSnapshot[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [firedMilestones, setFiredMilestones] = useState<FiredMilestones>({});
  const [firedRevenueAlerts, setFiredRevenueAlerts] = useState<FiredRevenueAlerts>({});
  const [ccuRecord, setCcuRecord] = useState(0);
  const [firedCcuRecordDates, setFiredCcuRecordDates] = useState<FiredCcuRecordDates>({});
  const [now, setNow] = useState(Date.now());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [allAlertsOpen, setAllAlertsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("Overview");
  const [seenAlertCount, setSeenAlertCount] = useState(0);
  const [closedMonths, setClosedMonths] = useState<ClosedMonths>({});
  const [stateLoaded, setStateLoaded] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(notificationRef, notificationsOpen, () => setNotificationsOpen(false));
  useOutsideClick(searchRef, searchOpen, () => setSearchOpen(false));

  const sortedGames = useMemo(() => [...games].sort((a, b) => b.ccu - a.ccu), [games]);
  const visibleGames = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedGames;
    return sortedGames.filter((game) => {
      const niche = niches.find((item) => item.id === game.nicheId)?.label ?? "";
      return [game.title, game.groupName, niche].some((value) => value.toLowerCase().includes(query));
    });
  }, [niches, searchQuery, sortedGames]);
  const totalCcu = games.reduce((sum, game) => sum + game.ccu, 0);
  const totalVisits = games.reduce((sum, game) => sum + game.visits, 0);
  const playersOnline = totalCcu > 0 ? formatNumber(totalCcu) : data.metrics[0]?.value ?? "0";
  const totalVisitsLabel = totalVisits > 0 ? formatCompact(totalVisits) : "0";
  const totalGamesLabel = formatCompact(games.length);
  const revenueData = useMemo(() => buildRevenueData(games, revenueSnapshots, revenueRange), [games, revenueSnapshots, revenueRange]);
  const revenueTotal = revenueData.reduce((sum, point) => sum + point.revenue, 0);
  const nicheMetricData = useMemo(() => buildNicheMetricData(niches, games, revenueSnapshots, nicheMetric), [niches, games, revenueSnapshots, nicheMetric]);
  const nicheDonutData = nicheMetricData.some((niche) => niche.value > 0)
    ? nicheMetricData
    : [{ id: "empty", label: "No data", value: 100, icon: "", color: "#3b3b4a" }];
  const ccuChartData = useMemo(() => buildCcuChartData(ccuSnapshots, totalCcu, playerRange), [ccuSnapshots, totalCcu, playerRange]);

  useEffect(() => {
    let cancelled = false;

    const localState: PersistedState = {
      [gamesStorageKey]: readStoredJson(gamesStorageKey, data.games),
      [nichesStorageKey]: readStoredJson(nichesStorageKey, data.niches),
      [revenueSnapshotsStorageKey]: readStoredJson(revenueSnapshotsStorageKey, {}),
      [ccuSnapshotsStorageKey]: readStoredJson(ccuSnapshotsStorageKey, []),
      [alertsStorageKey]: readStoredJson(alertsStorageKey, []),
      [firedMilestonesStorageKey]: readStoredJson(firedMilestonesStorageKey, {}),
      [firedRevenueAlertsStorageKey]: readStoredJson(firedRevenueAlertsStorageKey, {}),
      [ccuRecordStorageKey]: Number(window.localStorage.getItem(ccuRecordStorageKey) ?? "0"),
      [firedCcuRecordDatesStorageKey]: readStoredJson(firedCcuRecordDatesStorageKey, {}),
      [closedMonthsStorageKey]: readStoredJson(closedMonthsStorageKey, {})
    };

    async function loadState() {
      let sharedState: PersistedState = {};
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (response.ok) sharedState = await response.json() as PersistedState;
      } catch {
        sharedState = {};
      }

      const selectedState = hasSharedState(sharedState) ? sharedState : localState;
      if (cancelled) return;

      const selectedGames = selectedState[gamesStorageKey] ?? data.games;
      const selectedNiches = selectedState[nichesStorageKey] ?? data.niches;
      const selectedAlerts = normalizeAlerts(selectedState[alertsStorageKey] ?? []);
      setGames(selectedGames.map(normalizeGame));
      setNiches(selectedNiches.map(normalizeNiche));
      setRevenueSnapshots(selectedState[revenueSnapshotsStorageKey] ?? {});
      setCcuSnapshots(selectedState[ccuSnapshotsStorageKey] ?? []);
      setAlerts(selectedAlerts);
      setFiredMilestones(selectedState[firedMilestonesStorageKey] ?? {});
      setFiredRevenueAlerts(selectedState[firedRevenueAlertsStorageKey] ?? {});
      setCcuRecord(Number(selectedState[ccuRecordStorageKey] ?? 0));
      setFiredCcuRecordDates(selectedState[firedCcuRecordDatesStorageKey] ?? {});
      setClosedMonths(selectedState[closedMonthsStorageKey] ?? {});
      setStateLoaded(true);

      if (!hasSharedState(sharedState) && hasSharedState(localState)) {
        void writeRemoteState({
          ...localState,
          [alertsStorageKey]: selectedAlerts
        });
      }
      writeLocalState(selectedState);
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, [data.games, data.niches]);

  useEffect(() => {
    if (!stateLoaded || games.length === 0 || totalCcu <= 0) return;
    const lastSnapshot = ccuSnapshots[ccuSnapshots.length - 1];
    if (lastSnapshot && Date.now() - lastSnapshot.timestamp < 60_000 && lastSnapshot.players === totalCcu) return;
    const cutoff = Date.now() - 14 * 24 * 60 * 60_000;
    const nextSnapshots = [...ccuSnapshots.filter((snapshot) => snapshot.timestamp >= cutoff), { timestamp: Date.now(), players: totalCcu }];
    setCcuSnapshots(nextSnapshots);
    writeLocalState({ [ccuSnapshotsStorageKey]: nextSnapshots });
    void writeRemoteState({ [ccuSnapshotsStorageKey]: nextSnapshots });
  }, [ccuSnapshots, games.length, stateLoaded, totalCcu]);

  useEffect(() => {
    if (!stateLoaded || totalCcu <= 0 || totalCcu <= ccuRecord) return;
    const todayKey = dateKey(new Date());
    setCcuRecord(totalCcu);
    writeLocalState({ [ccuRecordStorageKey]: totalCcu });
    void writeRemoteState({ [ccuRecordStorageKey]: totalCcu });

    if (firedCcuRecordDates[todayKey]) return;
    const nextAlert: AlertItem = {
      id: `ccu-record-${todayKey}-${Date.now()}`,
      title: "🔥 New CCU Record",
      body: `An all-time peak of ${formatNumber(totalCcu)} concurrent players has been recorded.`,
      createdAt: Date.now(),
      severity: "High",
      medal: "ccupeak"
    };
    const nextAlerts = [nextAlert, ...alerts].slice(0, 20);
    const nextFiredDates = { ...firedCcuRecordDates, [todayKey]: true };
    setAlerts(nextAlerts);
    setFiredCcuRecordDates(nextFiredDates);
    writeLocalState({ [alertsStorageKey]: nextAlerts, [ccuRecordStorageKey]: totalCcu, [firedCcuRecordDatesStorageKey]: nextFiredDates });
    void writeRemoteState({ [alertsStorageKey]: nextAlerts, [ccuRecordStorageKey]: totalCcu, [firedCcuRecordDatesStorageKey]: nextFiredDates });
  }, [alerts, ccuRecord, firedCcuRecordDates, stateLoaded, totalCcu]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 120_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return;
    try {
      const storedAlerts = (JSON.parse(window.localStorage.getItem(alertsStorageKey) ?? "[]") as Array<Partial<AlertItem> & { time?: string }>)
        .map((alert) => ({
          id: alert.id ?? crypto.randomUUID(),
          title: alert.title ?? "Alert",
          body: alert.body ?? "",
          createdAt: Number.isFinite(alert.createdAt) ? Number(alert.createdAt) : Date.now(),
          time: alert.time,
          severity: alert.severity ?? "Medium",
          medal: alert.medal
        }) as AlertItem)
        .filter((alert) => alert.title !== "🎉 First Revenue CCU!" && alert.medal !== undefined);
      setAlerts(storedAlerts);
      window.localStorage.setItem(alertsStorageKey, JSON.stringify(storedAlerts));
      setFiredMilestones(JSON.parse(window.localStorage.getItem(firedMilestonesStorageKey) ?? "{}") as FiredMilestones);
      setFiredRevenueAlerts(JSON.parse(window.localStorage.getItem(firedRevenueAlertsStorageKey) ?? "{}") as FiredRevenueAlerts);
      setCcuRecord(Number(window.localStorage.getItem(ccuRecordStorageKey) ?? "0"));
      setFiredCcuRecordDates(JSON.parse(window.localStorage.getItem(firedCcuRecordDatesStorageKey) ?? "{}") as FiredCcuRecordDates);
    } catch {
      setAlerts([]);
      setFiredMilestones({});
      setFiredRevenueAlerts({});
      setCcuRecord(0);
      setFiredCcuRecordDates({});
    }
  }, []);

  useEffect(() => {
    if (!stateLoaded || games.length === 0) return;
    const nextAlerts: AlertItem[] = [];
    const nextFired: FiredMilestones = { ...firedMilestones };

    games.forEach((game) => {
      const firedForGame = nextFired[game.id] ?? [];
      milestones.forEach((milestone) => {
        if (game.ccu >= milestone.value && !firedForGame.includes(milestone.value)) {
          nextAlerts.push({
            id: `${game.id}-${milestone.value}-${Date.now()}`,
            title: `🎉 First ${milestone.label} CCU!`,
            body: `${game.title} has reached ${formatNumber(milestone.value)} concurrent players for the first time.`,
            createdAt: Date.now(),
            severity: milestone.value >= 10000 ? "High" : "Medium",
            medal: milestone.medal
          });
          firedForGame.push(milestone.value);
        }
      });
      nextFired[game.id] = firedForGame;
    });

    if (nextAlerts.length === 0) return;
    const mergedAlerts = [...nextAlerts, ...alerts].slice(0, 20);
    setAlerts(mergedAlerts);
    setFiredMilestones(nextFired);
    writeLocalState({ [alertsStorageKey]: mergedAlerts, [firedMilestonesStorageKey]: nextFired });
    void writeRemoteState({ [alertsStorageKey]: mergedAlerts, [firedMilestonesStorageKey]: nextFired });
  }, [games, alerts, firedMilestones, stateLoaded]);

  useEffect(() => {
    if (!stateLoaded || games.length === 0 || !isAfterRevenueCheckpoint(new Date())) return;
    const todayKey = dateKey(new Date());
    const existingToday = revenueSnapshots[todayKey] ?? {};
    const nextToday = { ...existingToday };
    let changed = false;

    games.forEach((game) => {
      if (nextToday[game.id] === undefined && game.visits > 0) {
        nextToday[game.id] = game.visits;
        changed = true;
      }
    });

    if (!changed) return;
    const nextSnapshots = { ...revenueSnapshots, [todayKey]: nextToday };
    setRevenueSnapshots(nextSnapshots);
    writeLocalState({ [revenueSnapshotsStorageKey]: nextSnapshots });
    void writeRemoteState({ [revenueSnapshotsStorageKey]: nextSnapshots });
    if (!firedRevenueAlerts[todayKey]) {
      const nextAlert: AlertItem = {
        id: `revenue-${todayKey}`,
        title: "💰 Revenue Updated",
        body: "The latest revenue data has been processed and is now available.",
        createdAt: Date.now(),
        severity: "Medium",
        medal: "revenue"
      };
      const nextAlerts = [nextAlert, ...alerts].slice(0, 20);
      const nextFiredRevenueAlerts = { ...firedRevenueAlerts, [todayKey]: true };
      setAlerts(nextAlerts);
      setFiredRevenueAlerts(nextFiredRevenueAlerts);
      writeLocalState({ [alertsStorageKey]: nextAlerts, [firedRevenueAlertsStorageKey]: nextFiredRevenueAlerts });
      void writeRemoteState({ [alertsStorageKey]: nextAlerts, [firedRevenueAlertsStorageKey]: nextFiredRevenueAlerts });
    }
  }, [alerts, firedRevenueAlerts, games, revenueSnapshots, stateLoaded]);

  useEffect(() => {
    if (!stateLoaded || games.length === 0) return;

    const refresh = async () => {
      const refreshed = await Promise.all(
        games.map(async (game) => {
          try {
            const response = await fetch("/api/roblox", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ link: game.link })
            });
            if (!response.ok) return game;
            const live = (await response.json()) as { ccu?: number; visits?: number; universeId?: number; groupName?: string; createdAt?: string };
            return {
              ...game,
              ccu: live.ccu ?? game.ccu,
              visits: live.visits ?? game.visits,
              groupName: live.groupName ?? game.groupName,
              createdAt: live.createdAt ?? game.createdAt,
              universeId: live.universeId ?? game.universeId
            };
          } catch {
            return game;
          }
        })
      );
      saveGames(refreshed);
    };

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games.length, stateLoaded]);

  function saveGames(nextGames: GameCard[]) {
    setGames(nextGames);
    writeLocalState({ [gamesStorageKey]: nextGames });
    void writeRemoteState({ [gamesStorageKey]: nextGames });
  }

  function saveNiches(nextNiches: Niche[]) {
    setNiches(nextNiches);
    writeLocalState({ [nichesStorageKey]: nextNiches });
    void writeRemoteState({ [nichesStorageKey]: nextNiches });
  }

  function upsertGame(game: GameCard) {
    const exists = games.some((current) => current.id === game.id);
    saveGames(exists ? games.map((current) => (current.id === game.id ? game : current)) : [game, ...games]);
    setIsAddOpen(false);
    setEditingGame(null);
  }

  function deleteGame(gameId: string) {
    saveGames(games.filter((game) => game.id !== gameId));
  }

  function upsertNiche(niche: Niche) {
    const normalized = normalizeNiche(niche);
    const exists = niches.some((current) => current.id === normalized.id);
    saveNiches(exists ? niches.map((current) => (current.id === normalized.id ? normalized : current)) : [...niches, normalized]);
    setIsNicheOpen(false);
    setEditingNiche(null);
  }

  function deleteNiche(nicheId?: string) {
    if (!nicheId) return;
    saveNiches(niches.filter((niche) => niche.id !== nicheId));
  }

  function closeMonth(monthKey: MonthKey) {
    const nextClosedMonths = { ...closedMonths, [monthKey]: true };
    const monthLabel = monthlyPages.find((month) => month.key === monthKey)?.label ?? monthKey;
    const nextAlert: AlertItem = {
      id: `month-closed-${monthKey}-${Date.now()}`,
      title: `📅 ${monthLabel} Closed`,
      body: `The ${monthLabel} monthly report has been finalized and is now available.`,
      createdAt: Date.now(),
      severity: "Medium",
      medal: "closed"
    };
    const nextAlerts = [nextAlert, ...alerts].slice(0, 20);
    setClosedMonths(nextClosedMonths);
    setAlerts(nextAlerts);
    writeLocalState({ [closedMonthsStorageKey]: nextClosedMonths, [alertsStorageKey]: nextAlerts });
    void writeRemoteState({ [closedMonthsStorageKey]: nextClosedMonths, [alertsStorageKey]: nextAlerts });
  }

  return (
    <main className="dashboard-shell min-h-screen text-white">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[150px_1fr]">
        <aside className="hidden border-r border-white/8 bg-black/20 px-3 py-5 lg:flex lg:flex-col">
          <div className="mb-8 flex flex-col items-center gap-2">
            <img src="/brand/project-floppa.jpg" alt="" className="h-12 w-12 rounded-md object-cover shadow-glow" />
            <div className="text-center text-xs font-semibold text-white">Project Floppa</div>
          </div>
          <nav className="space-y-2">
            {nav.map(([label, Icon], index) => (
              <button
                key={label}
                onClick={() => setActiveView(label)}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white",
                  activeView === label && "bg-[#24105c] text-white shadow-glow ring-1 ring-purple-500/40"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
            <div className="my-3 border-t border-white/10" />
            {monthlyPages.map((month) => (
              <button
                key={month.key}
                onClick={() => setActiveView(`month-${month.key}`)}
                className={cn(
                  "flex h-9 w-full items-center rounded-md px-3 text-left text-xs font-medium text-slate-500 transition hover:bg-white/5 hover:text-white",
                  activeView === `month-${month.key}` && "bg-[#24105c] text-white shadow-glow ring-1 ring-purple-500/40"
                )}
              >
                {month.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-5">
          <header className="mb-4 flex items-center justify-end gap-4">
            <div ref={searchRef} className="relative">
              <Button variant="ghost" size="icon" aria-label="Search" onClick={() => setSearchOpen((open) => !open)}>
                <Search className="h-5 w-5" />
              </Button>
              {searchOpen ? (
                <div className="absolute right-0 top-12 z-40 w-72 rounded-lg bg-[#0d0d20] p-3 shadow-2xl ring-1 ring-white/10">
                  <div className="mb-2 text-xs font-semibold text-slate-400">Search games</div>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    autoFocus
                    placeholder="Game, group, niche..."
                    className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition focus:border-purple-400"
                  />
                  {searchQuery ? <div className="mt-2 text-xs text-slate-500">{visibleGames.length} result{visibleGames.length === 1 ? "" : "s"}</div> : null}
                </div>
              ) : null}
            </div>
            <div ref={notificationRef} className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setSeenAlertCount(alerts.length);
                }}
              >
                <Bell className="h-5 w-5" />
                {alerts.length > seenAlertCount ? (
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {Math.min(9, alerts.length - seenAlertCount)}
                  </span>
                ) : null}
              </Button>
              {notificationsOpen ? <NotificationsPanel alerts={alerts} now={now} /> : null}
            </div>
          </header>

          {activeView === "Games" ? (
            <GamesView games={visibleGames} snapshots={ccuSnapshots} revenueSnapshots={revenueSnapshots} onAddGame={() => setIsAddOpen(true)} />
          ) : activeView === "Revenue" ? (
            <RevenueView games={games} snapshots={revenueSnapshots} />
          ) : activeView.startsWith("month-") ? (
            <MonthlyReportView
              games={games}
              niches={niches}
              revenueSnapshots={revenueSnapshots}
              ccuSnapshots={ccuSnapshots}
              monthKey={activeView.replace("month-", "") as MonthKey}
              closed={monthClosed(activeView.replace("month-", ""), closedMonths)}
              onCloseMonth={() => closeMonth(activeView.replace("month-", "") as MonthKey)}
            />
          ) : (
          <>
          <div className="grid gap-3 xl:grid-cols-[1.05fr_.95fr]">
            <Card>
              <CardHeader><CardTitle>Games Overview</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleGames.map((game) => (
                  <GameOverviewCard key={game.id} game={game} rank={sortedGames.findIndex((rankedGame) => rankedGame.id === game.id) + 1} onEdit={() => setEditingGame(game)} onDelete={() => deleteGame(game.id)} />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Live Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="min-h-[176px]">
                  <ServerField ccu={totalCcu || 1000} />
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <MetricRow iconType="players" label="Concurrent Players" value={playersOnline} change="live" />
                    <MetricRow iconType="visits" label="Total Visits" value={totalVisitsLabel} change={growthPercent(totalVisits || 3)} />
                    <MetricRow iconType="games" label="Total Games" value={totalGamesLabel} change={growthPercent(games.length || 1)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[1.05fr_.45fr_.5fr]">
            <TrendCard
              title="Current Players"
              value={`${playersOnline} Players`}
              color="#8f3fff"
              dataKey="players"
              data={ccuChartData}
              ranges={playerRanges}
              activeRange={playerRange}
              onRangeChange={(range) => setPlayerRange(range as PlayerRange)}
            />
            <Card className="group">
              <CardHeader>
                <CardTitle>Top Niches</CardTitle>
                <button type="button" onClick={() => setIsNicheOpen(true)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 opacity-0 transition hover:bg-white/5 hover:text-white group-hover:opacity-100" aria-label="Add niche">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </CardHeader>
              <CardContent className="space-y-4">
                {nicheMetricData.map((item) => (
                  <NicheRow key={item.id ?? item.label} item={item} onEdit={() => setEditingNiche(item)} onDelete={() => deleteNiche(item.id)} />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{nicheMetric}</CardTitle>
                <RangeSwitch
                  ranges={["CCU", "Revenue", "Winstreak", "Overall"]}
                  activeRange={nicheMetric}
                  onRangeChange={(range) => setNicheMetric(range as NicheMetric)}
                />
              </CardHeader>
              <CardContent className="grid h-full min-h-[176px] grid-cols-[1fr_120px] items-center gap-2 pt-2">
                <ResponsiveContainer width="100%" height={175}>
                  <PieChart>
                    <Pie data={nicheDonutData} innerRadius={52} outerRadius={82} dataKey="value" stroke="none">
                      {nicheDonutData.map((entry) => <Cell key={entry.id ?? entry.label} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 text-sm">
                  {nicheMetricData.map((niche) => (
                    <div key={niche.id ?? niche.label} className="grid grid-cols-[10px_1fr_34px] items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: niche.color }} />
                      <span className="truncate text-slate-300">{niche.label}</span>
                      <span className="text-right">{niche.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[1.05fr_.95fr]">
            <TrendCard
              title="Revenue Over Time"
              value={<><span>{formatUsd(revenueTotal)}</span><span className="ml-2 text-sm font-semibold text-emerald-400">{growthPercent(revenueTotal || 4)}</span></>}
              color="#73f28f"
              dataKey="revenue"
              data={revenueData}
              money
              ranges={revenueRanges}
              activeRange={revenueRange}
              onRangeChange={(range) => setRevenueRange(range as RevenueRange)}
            />
            <Card>
              <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.title + formatAlertTime(alert, now)} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-md bg-white/[0.035] p-3">
                    <span className={cn("grid h-9 w-9 place-items-center overflow-hidden rounded-md", alertIconBackground(alert))}>
                        <img src={alertIcons.find((milestone) => milestone.medal === alert.medal)?.icon} alt="" className="h-9 w-9 object-contain" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{alert.title}</p>
                      <p className="truncate text-xs text-slate-400">{alert.body}</p>
                    </div>
                    <span className="text-xs text-slate-400">{formatAlertTime(alert, now)}</span>
                  </div>
                ))}
                <button type="button" onClick={() => setAllAlertsOpen(true)} className="flex items-center gap-2 pt-2 text-sm font-medium text-purple-400">View All Alerts <ArrowRight className="h-4 w-4" /></button>
              </CardContent>
            </Card>
          </div>
          </>
          )}
        </section>
      </div>
      {isAddOpen ? <GameDialog niches={niches} onClose={() => setIsAddOpen(false)} onSubmit={upsertGame} /> : null}
      {editingGame ? <GameDialog game={editingGame} niches={niches} onClose={() => setEditingGame(null)} onSubmit={upsertGame} /> : null}
      {isNicheOpen ? <NicheDialog onClose={() => setIsNicheOpen(false)} onSubmit={upsertNiche} /> : null}
      {editingNiche ? <NicheDialog niche={editingNiche} onClose={() => setEditingNiche(null)} onSubmit={upsertNiche} /> : null}
      {allAlertsOpen ? <AllAlertsDialog alerts={alerts} now={now} onClose={() => setAllAlertsOpen(false)} /> : null}
    </main>
  );
}

function MetricRow({ iconType, label, value, change }: { iconType: "players" | "visits" | "games"; label: string; value: string; change: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-white/[0.035] p-3">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-black/90">
        <DarkMetricIcon type={iconType} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] text-slate-400">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
      </div>
      <span className="ml-auto text-xs font-semibold text-emerald-400">{change}</span>
    </div>
  );
}

function NotificationsPanel({ alerts, now }: { alerts: AlertItem[]; now: number }) {
  return (
    <div className="absolute right-0 top-12 z-40 w-80 rounded-lg bg-[#0d0d20] p-3 shadow-2xl ring-1 ring-white/10">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Notifications</h3>
        <span className="text-xs text-slate-500">{alerts.length}</span>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="rounded-md bg-white/[0.035] p-4 text-center text-sm text-slate-400">No alerts yet</div>
        ) : alerts.slice(0, 8).map((alert) => (
          <div key={alert.id} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-md bg-white/[0.035] p-2.5">
            <img src={alertIcons.find((milestone) => milestone.medal === alert.medal)?.icon} alt="" className="h-8 w-8 object-contain" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{alert.title}</p>
              <p className="truncate text-xs text-slate-400">{alert.body}</p>
            </div>
            <span className="text-xs text-slate-500">{formatAlertTime(alert, now)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function gameCreatedDate(game: GameCard) {
  return formatDateLabel(game.createdAt);
}

function gameRevenueStats(game: GameCard, snapshots: RevenueSnapshots) {
  const rows = Object.keys(snapshots).sort().map((key) => {
    const previous = snapshots[previousDateKey(key)]?.[game.id];
    const current = snapshots[key]?.[game.id];
    if (previous === undefined || current === undefined) return { key, revenue: 0 };
    return { key, revenue: Math.max(0, current - previous) * parseArpdau(game.arpdau) * 0.0038 };
  });
  const earningRows = rows.filter((row) => row.revenue > 0);
  const total = earningRows.reduce((sum, row) => sum + row.revenue, 0);
  const highest = earningRows.reduce((best, row) => row.revenue > best.revenue ? row : best, { key: "N/A", revenue: 0 });
  return {
    average: earningRows.length ? total / earningRows.length : 0,
    highest
  };
}

function revenueRows(games: GameCard[], snapshots: RevenueSnapshots) {
  const keys = Object.keys(snapshots).sort();
  return keys.map((key) => {
    const previousKey = previousDateKey(key);
    const revenue = games.reduce((total, game) => {
      const current = snapshots[key]?.[game.id];
      const previous = snapshots[previousKey]?.[game.id];
      if (current === undefined || previous === undefined) return total;
      return total + Math.max(0, current - previous) * parseArpdau(game.arpdau) * 0.0038;
    }, 0);
    return { key, revenue };
  });
}

function RevenueView({ games, snapshots }: { games: GameCard[]; snapshots: RevenueSnapshots }) {
  const [chartRange, setChartRange] = useState<RevenueRange>("30d");
  const rows = revenueRows(games, snapshots);
  const todayKey = dateKey(new Date());
  const today = rows.find((row) => row.key === todayKey)?.revenue ?? 0;
  const currentMonth = todayKey.slice(0, 7);
  const previousMonthDate = new Date(`${todayKey}T00:00:00`);
  previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
  const previousMonth = dateKey(previousMonthDate).slice(0, 7);
  const monthRows = rows.filter((row) => row.key.startsWith(currentMonth));
  const previousMonthRows = rows.filter((row) => row.key.startsWith(previousMonth));
  const thisMonth = monthRows.reduce((sum, row) => sum + row.revenue, 0);
  const previousMonthEarnings = previousMonthRows.reduce((sum, row) => sum + row.revenue, 0);
  const allTime = rows.reduce((sum, row) => sum + row.revenue, 0);
  const highestDay = rows.reduce((best, row) => row.revenue > best.revenue ? row : best, { key: "N/A", revenue: 0 });
  const avgDay = rows.length ? allTime / rows.length : 0;
  const monthTotals = rows.reduce<Record<string, number>>((acc, row) => {
    const month = row.key.slice(0, 7);
    acc[month] = (acc[month] ?? 0) + row.revenue;
    return acc;
  }, {});
  const highestMonth = Object.entries(monthTotals).sort((a, b) => b[1] - a[1])[0] ?? ["N/A", 0];
  const previousDays = rows.filter((row) => row.key !== todayKey).slice(-10).reverse();
  const previousMonths = Object.entries(monthTotals)
    .filter(([month]) => month !== currentMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8);
  const topGames = games
    .map((game) => ({ game, revenue: gameRevenueStats(game, snapshots).average }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const chartData = buildRevenueData(games, snapshots, chartRange);
  const chartTotal = chartData.reduce((sum, point) => sum + point.revenue, 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-3">
        <RevenueMetric label="Money made today" value={formatUsd(today)} size="large" />
        <RevenueMetric label="This month" value={formatUsd(thisMonth)} size="large" />
        <RevenueMetric label="All time earnings" value={formatUsd(allTime)} size="large" />
      </div>
      <div className="grid gap-3 xl:grid-cols-[1.15fr_.85fr]">
        <TrendCard
          title="Revenue"
          value={<span>{formatUsd(chartTotal)}</span>}
          color="#73f28f"
          dataKey="revenue"
          data={chartData}
          money
          ranges={revenueRanges}
          activeRange={chartRange}
          onRangeChange={(range) => setChartRange(range as RevenueRange)}
        />
        <Card>
          <CardHeader><CardTitle>Highest Earning Games</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topGames.length === 0 ? (
              <div className="rounded-md bg-white/[0.035] p-6 text-center text-sm text-slate-400">No game revenue yet</div>
            ) : topGames.map(({ game, revenue }) => (
              <div key={game.id} className="flex items-center gap-3 rounded-md bg-white/[0.035] p-3">
                <img src={game.thumbnail} alt="" className="h-10 w-10 rounded-md object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{game.title}</p>
                  <p className="truncate text-xs text-slate-400">{game.groupName}</p>
                </div>
                <span className="ml-auto text-sm font-semibold text-emerald-400">{formatUsd(revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Previous Days</CardTitle>
            <span className="text-xs text-slate-400">Avg {formatUsd(avgDay)}</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {previousDays.length === 0 ? (
              <div className="rounded-md bg-white/[0.035] p-5 text-center text-sm text-slate-400">No previous daily revenue yet</div>
            ) : previousDays.map((row) => (
              <RevenueListRow key={row.key} label={row.key} value={formatUsd(row.revenue)} />
            ))}
            <RevenueListRow label="Highest earning day" value={highestDay.key === "N/A" ? "N/A" : `${highestDay.key} · ${formatUsd(highestDay.revenue)}`} highlight />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Previous Months Earnings</CardTitle>
            <span className="text-xs text-slate-400">Best {highestMonth[0] === "N/A" ? "N/A" : `${highestMonth[0]} · ${formatUsd(highestMonth[1])}`}</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {previousMonths.length === 0 ? (
              <div className="rounded-md bg-white/[0.035] p-5 text-center text-sm text-slate-400">No previous month revenue yet</div>
            ) : previousMonths.map(([month, revenue]) => (
              <RevenueListRow key={month} label={month} value={formatUsd(revenue)} />
            ))}
            <RevenueListRow label="Highest earning month" value={highestMonth[0] === "N/A" ? "N/A" : `${highestMonth[0]} · ${formatUsd(highestMonth[1])}`} highlight />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MonthlyReportView({
  games,
  niches,
  revenueSnapshots,
  ccuSnapshots,
  monthKey,
  closed,
  onCloseMonth
}: {
  games: GameCard[];
  niches: Niche[];
  revenueSnapshots: RevenueSnapshots;
  ccuSnapshots: CcuSnapshot[];
  monthKey: MonthKey;
  closed: boolean;
  onCloseMonth: () => void;
}) {
  const monthLabel = monthlyPages.find((month) => month.key === monthKey)?.label ?? monthKey;
  const stats = monthReportStats(games, revenueSnapshots, ccuSnapshots, monthKey);
  const releaseMarkers = stats.releasedGames.reduce<Record<string, string[]>>((acc, game) => {
    const label = (game.addedAt ?? "").slice(5);
    if (!label) return acc;
    acc[label] = [...(acc[label] ?? []), game.title];
    return acc;
  }, {});
  const revenueChart = stats.rows.map((row) => ({ label: row.label, revenue: Math.round(row.revenue), players: 0, sessions: 0 }));
  const start = monthStart(monthKey).getTime();
  const end = nextMonthStart(monthKey).getTime();
  const ccuByDay = new Map<string, number>();
  ccuSnapshots
    .filter((snapshot) => snapshot.timestamp >= start && snapshot.timestamp < end)
    .forEach((snapshot) => {
      const label = dateKey(new Date(snapshot.timestamp)).slice(5);
      ccuByDay.set(label, Math.max(ccuByDay.get(label) ?? 0, snapshot.players));
    });
  const ccuChart = stats.rows.map((row) => ({ label: row.label, players: ccuByDay.get(row.label) ?? 0, revenue: 0, sessions: 0 }));

  if (!closed) {
    return (
      <Card>
        <CardContent className="grid min-h-[520px] place-items-center p-8 text-center">
          <div className="max-w-sm">
            <h1 className="text-2xl font-semibold">{monthLabel}</h1>
            <p className="mt-2 text-sm text-slate-400">Awaiting Month End...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>{monthLabel} Report</CardTitle>
          <span className="text-xs font-semibold text-emerald-400">Finalized</span>
        </CardHeader>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <RevenueMetric label="Highest earning day" value={stats.highestDay.key === "N/A" ? "N/A" : `${stats.highestDay.label} · ${formatUsd(stats.highestDay.revenue)}`} />
        <RevenueMetric label="Avg earning day" value={formatUsd(stats.avgDay)} />
        <RevenueMetric label="Peak CCU" value={formatNumber(stats.peakCcu)} />
        <RevenueMetric label="Visits achieved" value={formatCompact(stats.visits)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <RevenueMetric label="Winrate this month" value={`${Math.round(stats.winrate)}%`} />
        <RevenueMetric label="Total revenue" value={formatUsd(stats.totalRevenue)} />
        <RevenueMetric label="Games released this month" value={formatNumber(stats.releasedGames.length)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Games Released This Month</CardTitle>
          <span className="text-sm text-slate-400">{stats.releasedGames.length} tracked</span>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.releasedGames.length === 0 ? (
            <div className="col-span-full rounded-md bg-white/[0.035] p-6 text-center text-sm text-slate-400">No games released this month</div>
          ) : stats.releasedGames.map((game) => (
            <GameOverviewCard key={game.id} game={game} rank={games.findIndex((rankedGame) => rankedGame.id === game.id) + 1} onEdit={() => undefined} onDelete={() => undefined} readonly />
          ))}
        </CardContent>
      </Card>
      <MonthlyTopNiches games={games} niches={niches} snapshots={revenueSnapshots} />
      <div className="grid gap-3 xl:grid-cols-2">
        <TrendCard title="Monthly Revenue" value={<span>{formatUsd(stats.totalRevenue)}</span>} color="#73f28f" dataKey="revenue" data={revenueChart} money />
        <TrendCard title="Monthly Peak CCU" value={<span>{formatNumber(stats.peakCcu)}</span>} color="#8b5cff" dataKey="players" data={ccuChart} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Drop Chart</CardTitle>
          <span className="text-xs text-slate-400">Revenue with tracked game release markers</span>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChart} margin={{ left: 0, right: 18, top: 18, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-drop-chart" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#73f28f" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#73f28f" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical horizontal={false} stroke="rgba(255,255,255,0.16)" strokeDasharray="3 5" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#85849c", fontSize: 12 }} minTickGap={14} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#85849c", fontSize: 12 }} tickFormatter={(value) => formatUsd(Number(value))} />
                <Tooltip contentStyle={{ background: "#101025", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} />
                {Object.entries(releaseMarkers).map(([label, titles]) => (
                  <ReferenceLine
                    key={label}
                    x={label}
                    stroke="#a855f7"
                    strokeWidth={2}
                    label={{ value: titles.join(", "), fill: "#c4b5fd", fontSize: 11, position: "top" }}
                  />
                ))}
                <Area
                  style={{ filter: `drop-shadow(0 0 5px ${hexToRgba("#73f28f", 0.35)})` }}
                  type="monotone"
                  dataKey="revenue"
                  stroke="#73f28f"
                  strokeWidth={4}
                  fill="url(#grad-drop-chart)"
                  dot={false}
                  activeDot={{ r: 5, fill: "#73f28f" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MonthlyTopNiches({ games, niches, snapshots }: { games: GameCard[]; niches: Niche[]; snapshots: RevenueSnapshots }) {
  const [metric, setMetric] = useState<NicheMetric>("CCU");
  const data = useMemo(() => buildNicheMetricData(niches, games, snapshots, metric), [games, metric, niches, snapshots]);
  const donutData = data.some((niche) => niche.value > 0)
    ? data
    : [{ id: "empty", label: "No data", value: 100, icon: "", color: "#3b3b4a" }];

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_.85fr]">
      <Card>
        <CardHeader>
          <CardTitle>Top Niches</CardTitle>
          <span className="text-xs text-slate-400">Monthly report breakdown</span>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.length === 0 ? (
            <div className="rounded-md bg-white/[0.035] p-5 text-center text-sm text-slate-400">No niches yet</div>
          ) : data.map((item) => (
            <div key={item.id ?? item.label} className="grid grid-cols-[38px_1fr_44px] items-center gap-3">
              <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-md" style={{ background: item.color }}>
                {item.iconImage ? <img src={item.iconImage} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-bold">{item.icon}</span>}
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold">{item.label}</span>
                  <span className="text-xs text-slate-400">{item.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, item.value)}%`, background: item.color }} />
                </div>
              </div>
              <span className="text-right text-xs font-semibold text-slate-300">{item.value}%</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{metric}</CardTitle>
          <RangeSwitch ranges={["CCU", "Revenue", "Winstreak", "Overall"]} activeRange={metric} onRangeChange={(range) => setMetric(range as NicheMetric)} />
        </CardHeader>
        <CardContent className="grid h-full min-h-[220px] grid-cols-[1fr_140px] items-center gap-3">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={donutData} innerRadius={58} outerRadius={94} dataKey="value" stroke="none">
                {donutData.map((entry) => <Cell key={entry.id ?? entry.label} fill={entry.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3 text-sm">
            {data.map((niche) => (
              <div key={niche.id ?? niche.label} className="grid grid-cols-[10px_1fr_34px] items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: niche.color }} />
                <span className="truncate text-slate-300">{niche.label}</span>
                <span className="text-right">{niche.value}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RevenueListRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between rounded-md px-3 py-2 text-sm", highlight ? "bg-emerald-500/10" : "bg-white/[0.035]")}>
      <span className="truncate text-slate-300">{label}</span>
      <span className={cn("ml-3 shrink-0 font-semibold", highlight ? "text-emerald-300" : "text-white")}>{value}</span>
    </div>
  );
}

function RevenueMetric({ label, value, size = "normal" }: { label: string; value: string; size?: "normal" | "large" }) {
  return (
    <Card>
      <CardContent className={cn("p-4", size === "large" && "min-h-[112px]")}>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className={cn("mt-2 font-semibold text-white", size === "large" ? "text-3xl" : "text-xl")}>{value}</p>
      </CardContent>
    </Card>
  );
}

function GamesView({ games, snapshots, revenueSnapshots, onAddGame }: { games: GameCard[]; snapshots: CcuSnapshot[]; revenueSnapshots: RevenueSnapshots; onAddGame: () => void }) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Games</CardTitle>
          <span className="text-sm text-slate-400">{games.length} tracked</span>
        </CardHeader>
        <CardContent className="grid justify-center gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {games.map((game) => {
            const peakCcu = Math.max(game.ccu, ...snapshots.map((snapshot) => snapshot.players));
            const revenue = gameRevenueStats(game, revenueSnapshots);
            return (
              <div key={game.id} className="w-full max-w-[360px] overflow-hidden rounded-lg bg-white/[0.035]">
                <GameOverviewCard game={game} rank={games.findIndex((rankedGame) => rankedGame.id === game.id) + 1} onEdit={() => undefined} onDelete={() => undefined} readonly />
                <div className="space-y-2 p-4 text-center">
                  <GameStat label="Peak CCU" value={formatNumber(peakCcu)} />
                  <GameStat label="AVG Revenue / day" value={formatUsd(revenue.average)} />
                  <GameStat label="Highest Earning Day" value={revenue.highest.key === "N/A" ? "N/A" : `${revenue.highest.key} · ${formatUsd(revenue.highest.revenue)}`} />
                  <GameStat label="Date of Creation" value={gameCreatedDate(game)} />
                </div>
              </div>
            );
          })}
          <button
            className="grid h-[154px] w-full max-w-[360px] place-items-center rounded-md border border-dashed border-slate-600/50 text-slate-300 transition hover:border-purple-400 hover:bg-purple-500/5 hover:text-white"
            onClick={onAddGame}
            type="button"
          >
            <Plus className="h-8 w-8 rounded-full border border-slate-600 p-1" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function GameStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/20 px-3 py-2">
      <p className="truncate text-sm text-slate-300"><span className="font-semibold text-slate-500">{label}:</span> <span className="font-semibold text-white">{value}</span></p>
    </div>
  );
}

function AllAlertsDialog({ alerts, now, onClose }: { alerts: AlertItem[]; now: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-2xl rounded-lg p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">All Alerts</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {alerts.length === 0 ? (
            <div className="rounded-md bg-white/[0.035] p-6 text-center text-sm text-slate-400">No alerts yet</div>
          ) : alerts.map((alert) => (
            <div key={alert.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-md bg-white/[0.035] p-3">
              <img src={alertIcons.find((icon) => icon.medal === alert.medal)?.icon} alt="" className="h-10 w-10 object-contain" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{alert.title}</p>
                <p className="truncate text-xs text-slate-400">{alert.body}</p>
              </div>
              <span className="text-xs text-slate-500">{formatAlertTime(alert, now)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DarkMetricIcon({ type }: { type: "players" | "visits" | "games" }) {
  const src = type === "players" ? "/icons/users.png" : type === "visits" ? "/icons/visits.png" : "/icons/games.png";

  return (
    <img src={src} alt="" className="h-7 w-7 object-contain drop-shadow-[0_0_5px_rgba(139,92,246,0.28)]" />
  );
}

function GameOverviewCard({ game, rank, onEdit, onDelete, readonly = false }: { game: GameCard; rank?: number; onEdit: () => void; onDelete: () => void; readonly?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(menuRef, menuOpen, () => setMenuOpen(false));

  return (
    <div className="group relative h-[154px] overflow-hidden rounded-md bg-[#100f25] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:ring-purple-400/70">
      <a href={game.link} target="_blank" rel="noreferrer" className="absolute inset-0">
        <img src={game.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.04)_0%,rgba(0,0,0,.2)_42%,rgba(0,0,0,.86)_100%)]" />
      </a>
      {rank && rank <= 3 ? <RankBadge rank={rank} /> : null}
      {!readonly ? <div ref={menuRef}>
        <button type="button" aria-label="Game options" onClick={() => setMenuOpen((open) => !open)} className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-md bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/70 group-hover:opacity-100 data-[open=true]:opacity-100" data-open={menuOpen}>
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-2 top-11 z-30 w-28 overflow-hidden rounded-md bg-[#111126] py-1 text-sm shadow-2xl ring-1 ring-white/10">
          <button type="button" onClick={onEdit} className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-200 hover:bg-white/10">
            <Edit3 className="h-3.5 w-3.5" /> Edit
          </button>
          <button type="button" onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-300 hover:bg-red-500/10">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          </div>
        ) : null}
      </div> : null}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 p-3">
        <p className="truncate text-sm font-semibold drop-shadow">{game.title}</p>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold">
          <span className="truncate text-slate-200/90">{game.groupName}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-slate-100">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            {formatNumber(game.ccu)} Online
          </span>
        </div>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles = rank === 1
    ? "bg-yellow-400/90 text-yellow-950"
    : rank === 2
      ? "bg-slate-300/90 text-slate-900"
      : "bg-orange-500/90 text-orange-950";

  return (
    <span className={cn("absolute right-2 top-2 z-10 rounded-md px-2 py-1 text-xs font-extrabold shadow-lg", styles)}>
      #{rank}
    </span>
  );
}

function NicheRow({ item, onEdit, onDelete }: { item: Niche; onEdit: () => void; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(menuRef, menuOpen, () => setMenuOpen(false));
  return (
    <div className="group/niche relative grid grid-cols-[32px_1fr_36px_28px] items-center gap-3 text-sm">
      <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-md text-[10px] font-bold" style={{ background: item.color }}>
        {item.iconImage ? <img src={item.iconImage} alt="" className="h-full w-full object-cover" /> : item.icon}
      </span>
      <div>
        <div className="mb-2 flex justify-between"><span>{item.label}</span></div>
        <div className="h-1 rounded-full bg-white/6"><div className="h-1 rounded-full" style={{ width: `${Math.min(100, item.value)}%`, background: item.color }} /></div>
      </div>
      <span className="text-right text-slate-300">{item.value}%</span>
      <div ref={menuRef}>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 opacity-0 transition hover:bg-white/5 hover:text-white group-hover/niche:opacity-100 data-[open=true]:opacity-100" data-open={menuOpen} aria-label="Niche options">
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-8 z-20 w-28 overflow-hidden rounded-md bg-[#111126] py-1 text-sm shadow-2xl ring-1 ring-white/10">
          <button type="button" onClick={onEdit} className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-200 hover:bg-white/10"><Edit3 className="h-3.5 w-3.5" /> Edit</button>
          <button type="button" onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-300 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GameDialog({ game, niches, onClose, onSubmit }: { game?: GameCard; niches: Niche[]; onClose: () => void; onSubmit: (game: GameCard) => void }) {
  const [name, setName] = useState(game?.title ?? "");
  const [link, setLink] = useState(game?.link ?? "");
  const [groupName, setGroupName] = useState(game?.groupName ?? "");
  const [arpdau, setArpdau] = useState(game?.arpdau ?? "");
  const [nicheId, setNicheId] = useState(game?.nicheId ?? niches[0]?.id ?? "");
  const [thumbnail, setThumbnail] = useState(game?.thumbnail ?? "");
  const [error, setError] = useState("");

  function handleThumbnail(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Upload an image file for the thumbnail.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setThumbnail(String(reader.result));
      setError("");
    };
    reader.readAsDataURL(file);
  }

  async function fetchCcu(parsedLink: string) {
    try {
      const response = await fetch("/api/roblox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: parsedLink })
      });
      if (!response.ok) return { ccu: game?.ccu ?? 0, visits: game?.visits ?? 0, groupName: game?.groupName ?? groupName, universeId: game?.universeId, createdAt: game?.createdAt };
      return (await response.json()) as { ccu: number; visits: number; groupName?: string; universeId?: number; createdAt?: string };
    } catch {
      return { ccu: game?.ccu ?? 0, visits: game?.visits ?? 0, groupName: game?.groupName ?? groupName, universeId: game?.universeId, createdAt: game?.createdAt };
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !link.trim() || !groupName.trim() || !thumbnail || !arpdau.trim()) {
      setError("Game name, game link, group name, ARPDAU, and thumbnail are required.");
      return;
    }

    let parsedLink: string;
    try {
      parsedLink = new URL(link).toString();
    } catch {
      setError("Enter a valid game link, including https://.");
      return;
    }

    const live = await fetchCcu(parsedLink);
    onSubmit({
      id: game?.id ?? crypto.randomUUID(),
      title: name.trim(),
      link: parsedLink,
      thumbnail,
      groupName: live.groupName ?? groupName.trim(),
      arpdau: arpdau.trim(),
      ccu: live.ccu,
      visits: live.visits,
      addedAt: game?.addedAt ?? dateKey(new Date()),
      createdAt: live.createdAt ?? game?.createdAt,
      universeId: live.universeId,
      nicheId,
      online: true
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="glass-panel w-full max-w-md rounded-lg p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">{game ? "Edit Game" : "Add Game"}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <InputField label="Game name" value={name} onChange={setName} placeholder="Paint To Hide!" />
        <InputField label="Game link" value={link} onChange={setLink} placeholder="https://www.roblox.com/games/..." />
        <InputField label="Group name" value={groupName} onChange={setGroupName} placeholder="Your Roblox group" />
        <InputField label="ARPDAU" value={arpdau} onChange={setArpdau} placeholder="Average Robux per visit" />
        <label className="mb-4 block">
          <span className="mb-2 block text-xs font-medium text-slate-300">Niche</span>
          <select value={nicheId} onChange={(event) => setNicheId(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-[#0d0d20] px-3 text-sm outline-none transition focus:border-purple-400">
            <option value="">No niche</option>
            {niches.map((niche) => <option key={niche.id ?? niche.label} value={niche.id}>{niche.label}</option>)}
          </select>
        </label>

        <label className="mb-4 block">
          <span className="mb-2 block text-xs font-medium text-slate-300">Thumbnail</span>
          <div className="grid min-h-[130px] cursor-pointer place-items-center overflow-hidden rounded-md border border-dashed border-white/15 bg-white/[0.035] text-center transition hover:border-purple-400">
            {thumbnail ? <img src={thumbnail} alt="" className="h-full max-h-[180px] w-full object-cover" /> : <span className="flex flex-col items-center gap-2 text-sm text-slate-400"><Upload className="h-6 w-6" />Upload thumbnail</span>}
            <input type="file" accept="image/*" className="sr-only" onChange={handleThumbnail} />
          </div>
        </label>

        {error ? <p className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{game ? "Save" : "Add Game"}</Button>
        </div>
      </form>
    </div>
  );
}

function NicheDialog({ niche, onClose, onSubmit }: { niche?: Niche; onClose: () => void; onSubmit: (niche: Niche) => void }) {
  const [name, setName] = useState(niche?.label ?? "");
  const [icon, setIcon] = useState(niche?.icon ?? "");
  const [iconImage, setIconImage] = useState(niche?.iconImage ?? "");
  const [color, setColor] = useState(niche?.color ?? "#8b5cff");
  const [error, setError] = useState("");

  function handleIconUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Upload a PNG or image file for the niche icon.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setIconImage(String(reader.result));
      setError("");
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !iconImage) {
      setError("Niche name and icon image are required.");
      return;
    }
    onSubmit({
      id: niche?.id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: name.trim(),
      icon: icon.trim() || name.trim().slice(0, 3),
      iconImage,
      value: niche?.value ?? 10,
      color
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="glass-panel w-full max-w-sm rounded-lg p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">{niche ? "Edit Niche" : "Add Niche"}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <InputField label="Name" value={name} onChange={setName} placeholder="Simulator" />
        <label className="mb-4 block">
          <span className="mb-2 block text-xs font-medium text-slate-300">Color</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-10 w-12 cursor-pointer rounded-md border border-white/10 bg-white/[0.04] p-1"
            />
            <div className="grid h-10 flex-1 place-items-center rounded-md border border-white/10 text-xs font-semibold" style={{ background: color }}>
              {icon || "ICON"}
            </div>
          </div>
        </label>
        <label className="mb-4 block">
          <span className="mb-2 block text-xs font-medium text-slate-300">PNG icon</span>
          <div className="grid min-h-[104px] cursor-pointer place-items-center overflow-hidden rounded-md border border-dashed border-white/15 bg-white/[0.035] text-center transition hover:border-purple-400">
            {iconImage ? (
              <img src={iconImage} alt="" className="h-16 w-16 rounded-md object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-sm text-slate-400">
                <Upload className="h-6 w-6" />
                Upload PNG icon
              </span>
            )}
            <input type="file" accept="image/png,image/*" className="sr-only" onChange={handleIconUpload} />
          </div>
        </label>
        {error ? <p className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{niche ? "Save" : "Add"}</Button>
        </div>
      </form>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="mb-4 block">
      <span className="mb-2 block text-xs font-medium text-slate-300">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition focus:border-purple-400" placeholder={placeholder} />
    </label>
  );
}

function ServerField({ ccu }: { ccu: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const servers = useMemo(() => {
    const count = Math.max(1, Math.ceil(ccu / 1000));
    return Array.from({ length: Math.min(24, count) }, (_, index) => ({
      index,
      phase: (index * 0.73) % (Math.PI * 2)
    }));
  }, [ccu]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0;
    let animation = 0;

    const draw = () => {
      const width = canvas.clientWidth || 580;
      const height = canvas.clientHeight || 156;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const bg = context.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "rgba(19, 17, 43, 0.18)");
      bg.addColorStop(0.5, "rgba(35, 25, 80, 0.25)");
      bg.addColorStop(1, "rgba(7, 10, 24, 0.08)");
      context.fillStyle = bg;
      context.fillRect(0, 0, width, height);

      const hazeOne = context.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.48, width * 0.45);
      hazeOne.addColorStop(0, "rgba(121, 74, 255, 0.24)");
      hazeOne.addColorStop(1, "rgba(123, 76, 255, 0)");
      context.fillStyle = hazeOne;
      context.fillRect(0, 0, width, height);

      const columns = Math.ceil(Math.sqrt(servers.length * 2.2));
      const rows = Math.ceil(servers.length / columns);
      const cellW = width / Math.max(1, columns);
      const cellH = height / Math.max(1, rows);
      const positions = servers.map((server) => {
        const row = Math.floor(server.index / columns);
        const rowStart = row * columns;
        const rowCount = Math.min(columns, servers.length - rowStart);
        const column = server.index - rowStart;
        const rowWidth = rowCount * cellW;
        const rowOffset = (width - rowWidth) / 2;
        return {
          ...server,
          x: rowOffset + cellW * column + cellW / 2,
          y: cellH * row + cellH / 2
        };
      });

      positions.forEach((from, index) => {
        const to = positions[(index + 1) % positions.length];
        if (!to || positions.length === 1) return;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.strokeStyle = "rgba(130, 92, 255, 0.16)";
        context.lineWidth = 1;
        context.stroke();

        const progress = (frame * 0.01 + index * 0.19) % 1;
        const packetX = from.x + (to.x - from.x) * progress;
        const packetY = from.y + (to.y - from.y) * progress;
        context.beginPath();
        context.arc(packetX, packetY, 2, 0, Math.PI * 2);
        context.fillStyle = "rgba(118, 255, 198, 0.85)";
        context.shadowColor = "rgba(118, 255, 198, 0.8)";
        context.shadowBlur = 8;
        context.fill();
        context.shadowBlur = 0;
      });

      positions.forEach((server) => {
        const pulse = (Math.sin(frame * 0.035 + server.phase) + 1) / 2;
        const w = Math.min(58, Math.max(42, cellW * 0.38));
        const h = 28;
        const x = server.x - w / 2;
        const y = server.y - h / 2;

        context.beginPath();
        context.roundRect(x, y, w, h, 6);
        context.fillStyle = "rgba(17, 18, 40, 0.88)";
        context.strokeStyle = `rgba(140, 92, 255, ${0.32 + pulse * 0.32})`;
        context.lineWidth = 1.2;
        context.shadowColor = "rgba(122, 73, 255, 0.45)";
        context.shadowBlur = 8 + pulse * 10;
        context.fill();
        context.stroke();
        context.shadowBlur = 0;

        for (let i = 0; i < 3; i += 1) {
          context.fillStyle = i === 0 ? "rgba(118, 255, 198, 0.9)" : "rgba(136, 148, 176, 0.72)";
          context.fillRect(x + 9 + i * 9, y + 9, 4, 4);
        }

        context.fillStyle = "rgba(95, 102, 139, 0.5)";
        context.fillRect(x + 9, y + 18, w - 18, 2);
        context.beginPath();
        context.arc(x + w - 11, y + 11, 3 + pulse * 1.6, 0, Math.PI * 2);
        context.fillStyle = "rgba(118, 255, 198, 0.75)";
        context.fill();
      });

      frame += 1;
      animation = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(animation);
  }, [ccu, servers]);

  return <canvas ref={canvasRef} className="h-[156px] w-full rounded-md" aria-label="Live game servers" />;
}

function TrendCard({
  title,
  value,
  color,
  dataKey,
  data,
  money = false,
  ranges,
  activeRange,
  onRangeChange
}: {
  title: string;
  value: ReactNode;
  color: string;
  dataKey: "players" | "revenue";
  data: DashboardData["timeline"];
  money?: boolean;
  ranges?: readonly string[];
  activeRange?: string;
  onRangeChange?: (range: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>{title}</CardTitle>
        <div className="flex items-center gap-3">
          {ranges ? <RangeSwitch ranges={ranges} activeRange={activeRange ?? ranges[0]} onRangeChange={onRangeChange ?? (() => undefined)} /> : null}
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[175px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 6, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${dataKey}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical horizontal={false} stroke="rgba(255,255,255,0.16)" strokeDasharray="3 5" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#85849c", fontSize: 12 }} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#85849c", fontSize: 12 }} tickFormatter={(v) => money ? formatUsd(Number(v)) : `${Number(v) / 1000}K`} />
              <Tooltip contentStyle={{ background: "#101025", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} />
              <Area
                style={{ filter: `drop-shadow(0 0 6px ${hexToRgba(color, 0.5)})` }}
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={4}
                fill={`url(#grad-${dataKey})`}
                dot={false}
                activeDot={{ r: 5, fill: color }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function RangeSwitch({ ranges, activeRange, onRangeChange }: { ranges: readonly string[]; activeRange: string; onRangeChange: (range: string) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(menuRef, open, () => setOpen(false));

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-7 items-center gap-2 rounded-md bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
      >
        {activeRange}
        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-30 w-24 overflow-hidden rounded-md bg-[#111126] py-1 text-sm shadow-2xl ring-1 ring-white/10">
          {ranges.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => {
                onRangeChange(range);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-2 text-left text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white",
                activeRange === range && "text-purple-300"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
