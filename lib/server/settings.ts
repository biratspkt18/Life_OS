import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";
import { DEFAULT_SETTINGS, type Settings } from "../types";

/** Read settings, seeding the single row with defaults on first run. */
export function getSettings(): Settings {
  const row = db.select().from(settings).where(eq(settings.id, "app")).get();
  if (!row) {
    db.insert(settings).values({ id: "app", data: DEFAULT_SETTINGS }).run();
    return DEFAULT_SETTINGS;
  }
  // Merge over defaults so new fields appear for older rows.
  return { ...DEFAULT_SETTINGS, ...row.data, id: "app" };
}

/** Patch settings; returns the merged result. */
export function saveSettings(patch: Partial<Settings>): Settings {
  const next: Settings = { ...getSettings(), ...patch, id: "app" };
  db.insert(settings)
    .values({ id: "app", data: next })
    .onConflictDoUpdate({ target: settings.id, set: { data: next } })
    .run();
  return next;
}
