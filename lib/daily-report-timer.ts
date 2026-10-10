import { prisma } from "@/lib/prisma";
import { sendWebhook } from "@/lib/discord";
import { buildRevenueReport } from "@/lib/report";
import { isRobloxConfigured } from "@/lib/roblox-analytics";

// Posts the revenue report to Discord once for every new day Roblox reports.
// Runs inside the server itself, so no separate cron service is needed on Railway.
const STATE_KEY = "gameops-dashboard-last-discord-report-day";
const CHECK_MS = 30 * 60_000;
let lastDayInMemory = "";
let started = false;

async function lastPostedDay() {
  if (!process.env.DATABASE_URL) return lastDayInMemory;
  try {
    const row = await prisma.appState.findUnique({ where: { key: STATE_KEY } });
    return typeof row?.value === "string" ? row.value : lastDayInMemory;
  } catch {
    return lastDayInMemory;
  }
}

async function saveLastPostedDay(day: string) {
  lastDayInMemory = day;
  if (!process.env.DATABASE_URL) return;
  try {
    await prisma.appState.upsert({ where: { key: STATE_KEY }, update: { value: day }, create: { key: STATE_KEY, value: day } });
  } catch {
    // The in-memory copy still prevents a repeat until the next restart.
  }
}

/** Posts the newest day's report if it has not been posted yet (or always, with `force`). */
export async function postDailyReport(force = false) {
  if (!process.env.DISCORD_WEBHOOK_URL) return { posted: false, reason: "DISCORD_WEBHOOK_URL isn't set." };
  if (!isRobloxConfigured()) return { posted: false, reason: "No Roblox API key is set." };

  const { latestDay, embed } = await buildRevenueReport(1);
  if (!latestDay) return { posted: false, reason: "Roblox has no revenue data yet." };
  if (!force && latestDay <= (await lastPostedDay())) return { posted: false, reason: `${latestDay} was already posted.` };

  await sendWebhook({ username: "Project Raw", embeds: [embed] });
  await saveLastPostedDay(latestDay);
  return { posted: true, day: latestDay };
}

export function startDailyReportTimer() {
  if (started) return;
  started = true;
  const tick = () => {
    postDailyReport().catch((error) => console.error("Daily Discord report failed:", error));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, CHECK_MS);
}
