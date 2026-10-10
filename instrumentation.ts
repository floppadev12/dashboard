// Runs once when the server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { startDailyReportTimer } = await import("./lib/daily-report-timer");
    startDailyReportTimer();
  }
}
