// On Vercel: create/update the database tables if a database is connected.
import { execSync } from "node:child_process";
if (process.env.DATABASE_URL) {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
} else {
  console.log("No DATABASE_URL set, skipping database setup (the dashboard will save to the browser instead).");
}
