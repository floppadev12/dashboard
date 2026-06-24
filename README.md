# GameOps Dashboard

Next.js + TypeScript + Tailwind CSS + shadcn/ui-style primitives + Recharts, with a Node API route and Prisma/PostgreSQL schema.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The dashboard renders from typed seed data by default. Add a real PostgreSQL `DATABASE_URL`, run `npm run prisma:migrate`, and replace the API fallback with Prisma queries when you are ready to persist data.
