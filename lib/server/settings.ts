import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";
import { DEFAULT_SETTINGS, type Settings } from "../types";

/** Read a user's settings, seeding their row with defaults on first run. */
export function getSettings(userId: string): Settings {
  const row = db.select().from(settings).where(eq(settings.userId, userId)).get();
  if (!row) {
    db.insert(settings).values({ userId, data: DEFAULT_SETTINGS }).run();
    return DEFAULT_SETTINGS;
  }
  // Merge over defaults so new fields appear for older rows.
  return { ...DEFAULT_SETTINGS, ...row.data, id: "app" };
}

/** Patch a user's settings; returns the merged result. */
export function saveSettings(userId: string, patch: Partial<Settings>): Settings {
  const next: Settings = { ...getSettings(userId), ...patch, id: "app" };
  db.insert(settings)
    .values({ userId, data: next })
    .onConflictDoUpdate({ target: settings.userId, set: { data: next } })
    .run();
  return next;
}
