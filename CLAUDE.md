# GameOps Dashboard (Project Raw)

Revenue and operations dashboard for the owner's Roblox games, including
"+1 Open Sea for Treasure". Repo: github.com/floppadev12/dashboard (PUBLIC).

## Stack
Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3, Recharts, lucide-react,
Prisma 6 + PostgreSQL (optional). Hosted on Railway (project `humorous-dream`, service
`dashboard`), NOT Vercel. Auto-deploys on push to `main`. Env vars live in Railway → Variables.

## How it works
- `components/dashboard/dashboard.tsx` is the whole UI (Overview, Games, Revenue,
  monthly report pages, niches, alerts, medals). Keep its existing design and style.
- Games are added in the UI with a Roblox link. `/api/roblox` looks up universe ID,
  CCU and visits from public Roblox APIs.
- State (games, niches, snapshots, alerts) is saved to localStorage and, if
  `DATABASE_URL` is set, to the `AppState` table via `/api/state`.

## Real revenue (added)
- `lib/roblox-analytics.ts` calls Roblox's official Open Cloud Analytics Query API
  (beta): POST `https://apis.roblox.com/analytics-query-api/v1/universes/{id}/metrics`
  with metric `DailyRevenue`, granularity `OneDay`; polls `path` while `done` is false.
  Days with no sales are omitted (treat as 0). Days are UTC.
- `/api/revenue?universeIds=1,2` returns Robux per day per universe (400 days, 10 min cache).
- In `dashboard.tsx`, `dayRevenue()` uses real Robux × 0.0038 (DevEx USD) when a game has
  real data, otherwise the old estimate (visit delta × ARPDAU × 0.0038).
- Auth: `ROBLOX_API_KEY` (one key, all games) or `ROBLOX_API_KEYS` JSON per universe.
  Keys must have only `universe-analytics` → `universe.analytics:read`.
- `/api/revenue` also returns `allTime`: each game's all-time Robux (1460 days, granularity
  `None`) broken down by `RevenueSource`. The Revenue page's "All time earnings" and
  "Highest Earning Games" use it. Roblox has no separate Creator Rewards metric; it only
  counts if it shows up as a `RevenueSource`.

## Other additions
- `middleware.ts`: Basic-auth password (`DASHBOARD_PASSWORD`) for everything except
  `/api/discord` and `/api/cron`.
- Daily Discord report: `lib/daily-report-timer.ts`, started from `instrumentation.ts`, checks
  every 30 min and posts once per new day Roblox reports (about 2 days behind) to
  `DISCORD_WEBHOOK_URL`. Last posted day is kept in `AppState`. `/api/cron/daily-report`
  (Bearer `CRON_SECRET`) posts it again on demand.
- Creator Rewards: no Roblox API. Real days are saved in `AppState` key
  `gameops-dashboard-creator-rewards` (game id → day → Robux; never commit them, the repo is
  public). `lib/creator-rewards.ts` learns rewards as a share of sales from the nearest 14
  entered days and estimates other days. Revenue everywhere = sales + Creator Rewards.
- `/api/discord`: `/revenue` slash command (Ed25519 signature check, only
  `DISCORD_ALLOWED_USER_IDS`, ephemeral replies, deferred via `after()`).
  Register with `npm run discord:register`.
- `lib/report.ts`: builds the Discord embed; games come from the DB `AppState` games or
  `ROBLOX_UNIVERSE_IDS`.
- `vercel-build` script runs `prisma db push` only if `DATABASE_URL` exists.

## Rules
- NEVER commit API keys, tokens, passwords or `.env*` files. The repo is public.
- Never use `.ROBLOSECURITY` cookies or unofficial Roblox endpoints. Official APIs only.
- Run `npm run build` before committing; fix TypeScript errors.
- The owner prefers simple, step-by-step explanations.

## Status
The real-revenue / Discord / password version builds cleanly (`npm run build`, no
TypeScript errors). In production the dashboard returns 503 until `DASHBOARD_PASSWORD`
is set on Railway.
