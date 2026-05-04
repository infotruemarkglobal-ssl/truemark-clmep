import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";

// Ping the database every 4 minutes so Neon's compute never reaches its
// 5-minute inactivity threshold and suspends (which causes a 5–20 s cold start).
export const dbKeepalive = inngest.createFunction(
  {
    id: "db-keepalive",
    name: "Database Keep-Alive Ping",
    triggers: [{ cron: "*/4 * * * *" }],
  },
  async () => {
    await db.$executeRaw`SELECT 1`;
  },
);
