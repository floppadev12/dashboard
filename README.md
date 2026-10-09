# GameOps Dashboard

Next.js + TypeScript + Tailwind CSS + Recharts, with Prisma/PostgreSQL.

New in this version:

- **Real revenue** from Roblox's official Analytics API, replacing the visits × ARPDAU estimate
  for every game with a Roblox link. Games without data keep the estimate.
- **Password protection** for the whole dashboard.
- **Daily Discord report** with yesterday's revenue per game.
- **`/revenue` Discord command** (yesterday, last 7 days, last 30 days).

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in what you need
npm run dev
```

## Roblox API key

At https://create.roblox.com/dashboard/credentials create one key:

1. Add the **universe-analytics** system with only **universe.analytics:read**.
2. Select all your games.
3. Put it in `ROBLOX_API_KEY`.

Never commit keys. This repo is public; keys go only in `.env.local` and Vercel settings.

## Deploy on Vercel

1. Sign in at vercel.com with GitHub and import `floppadev12/dashboard`.
2. Optional but recommended: Storage → create a Postgres database and connect it
   (sets `DATABASE_URL`). Tables are created automatically on deploy.
3. Add `ROBLOX_API_KEY`, `DASHBOARD_PASSWORD`, `CRON_SECRET`, `DISCORD_WEBHOOK_URL`, `DASHBOARD_URL`.
4. Deploy. Every push to `main` redeploys automatically.

## Discord

Daily report: Channel settings → Integrations → Webhooks → New Webhook → copy URL into
`DISCORD_WEBHOOK_URL`. It posts every day around 07:00 UTC (`vercel.json`).

`/revenue` command:
1. Create an app at https://discord.com/developers/applications.
2. Set `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, and your user ID in
   `DISCORD_ALLOWED_USER_IDS`. Redeploy.
3. Interactions Endpoint URL: `https://YOUR-APP.vercel.app/api/discord`
4. Run once: `DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... npm run discord:register`
5. Invite it: OAuth2 → URL Generator → scope `applications.commands`.
