import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DB_PATH ?? "data/daybook.db" },
} satisfies Config;
